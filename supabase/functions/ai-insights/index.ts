/**
 * ai-insights — Supabase Edge Function
 *
 * Full-context AI assistant. Passes ALL leads (with rich fields), ALL deals,
 * contracts, recruiter stats, and live page data (e.g. Meta Ads) to Claude.
 * Claude has a 200K token context — we use it fully so it can answer any question.
 */

import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// ── Types ─────────────────────────────────────────────────────────────────────

type Lead = Record<string, unknown>;
type Deal = {
  Stage: string; Amount: number; Deal_Name: string;
  Closing_Date: string; Lead_Source: string; Owner?: { name?: string };
};
type Contract = Record<string, unknown>;

// ── Page metadata ─────────────────────────────────────────────────────────────

const PAGE_LABELS: Record<string, string> = {
  '/':               'Dashboard (Overview)',
  '/sales':          'Sales Tracker',
  '/marketing':      'Marketing',
  '/leads-pipeline': 'Doctor Progress',
  '/team':           'Team Performance',
  '/finance':        'Finance',
  '/operations':     'Operations & Roadmap',
  '/meta-ads':       'Meta Ads',
  '/contracts':      'Contracts',
  '/settings':       'Settings',
};

const PAGE_FOCUS: Record<string, string> = {
  '/':               'Summarise overall pipeline health, top KPIs, and the most urgent items across all areas.',
  '/sales':          'Focus on recruiter performance — lead ownership, contact rates, high-priority follow-ups, and pipeline progress per recruiter.',
  '/marketing':      'Focus on lead sources and channel performance — which sources bring the most and best-quality doctors.',
  '/leads-pipeline': 'Focus on individual doctor progress — which stage each is at, license status (DOH/DHA/MOH), and bottlenecks.',
  '/team':           'Focus on recruiter workload — who has the most leads, highest contact rate, and most high-priority follow-ups.',
  '/finance':        'Focus on revenue and deal stages — Closed Won revenue, open pipeline value, and deal progression.',
  '/operations':     'Focus on the license pipeline (DOH/DHA/MOH status) and operational bottlenecks in the recruitment process.',
  '/meta-ads':       'Focus on Meta advertising performance — spend, CPL, campaign ROI, top-performing ads. Prioritise the Meta Ads data section.',
  '/contracts':      'Focus on contract status, parties, values, and upcoming renewals using the Contracts data below.',
};

// ── Data loaders ──────────────────────────────────────────────────────────────

async function loadZohoCache(): Promise<{ leads: Lead[]; deals: Deal[] }> {
  const { data, error } = await supabase
    .from('zoho_cache')
    .select('data')
    .eq('id', 1)
    .single();
  if (error || !data?.data) return { leads: [], deals: [] };
  return {
    leads: (data.data.leads ?? []) as Lead[],
    deals: (data.data.deals ?? []) as Deal[],
  };
}

async function loadContracts(): Promise<Contract[]> {
  const { data } = await supabase
    .from('contracts')
    .select('id, doctor_name, hospital_name, status, contract_value, start_date, end_date, specialty, created_at')
    .order('created_at', { ascending: false })
    .limit(150);
  return data ?? [];
}

// ── Filter detection ──────────────────────────────────────────────────────────

const STATUS_KEYWORDS: Record<string, string> = {
  'unqualified leads': 'Unqualified Leads', 'unqualified': 'Unqualified Leads',
  'initial call done': 'Initial Call Done', 'initial call': 'Initial Call Done',
  'new application': 'New Application',
  'follow-up scheduled': 'Follow-up Scheduled', 'follow-up': 'Follow-up Scheduled', 'follow up': 'Follow-up Scheduled',
  'high priority': 'High Priority',
  'not interested': 'Not Interested',
  'screening': 'Screening',
  'qualified': 'Qualified',
  'placed': 'Placed',
  'hired': 'Hired',
};

function detectStatus(msgs: string[]): string | null {
  for (const msg of msgs) {
    const q = msg.toLowerCase();
    for (const [kw, status] of Object.entries(STATUS_KEYWORDS)) {
      if (q.includes(kw)) return status;
    }
  }
  return null;
}

function detectRecruiter(msgs: string[], leads: Lead[]): string | null {
  const names = [...new Set(
    leads.map(l => ((l.Owner as Record<string, string>)?.name ?? '')).filter(Boolean)
  )];
  for (const msg of msgs) {
    const q = msg.toLowerCase();
    for (const name of names) {
      if (q.includes(name.toLowerCase())) return name;
    }
  }
  return null;
}

interface DateRange { from: Date; to: Date; label: string }

function detectDateRange(msgs: string[]): DateRange | null {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const q = Math.floor(m / 3);
  for (const msg of msgs) {
    const text = msg.toLowerCase();
    if (text.includes('this quarter') || text.includes(`q${q + 1}`))
      return { from: new Date(y, q * 3, 1), to: new Date(y, q * 3 + 3, 0, 23, 59, 59), label: `Q${q + 1} ${y}` };
    if (text.includes('last quarter')) {
      const pq = q === 0 ? 3 : q - 1; const py = q === 0 ? y - 1 : y;
      return { from: new Date(py, pq * 3, 1), to: new Date(py, pq * 3 + 3, 0, 23, 59, 59), label: `Q${pq + 1} ${py}` };
    }
    if (text.includes('this month'))
      return { from: new Date(y, m, 1), to: new Date(y, m + 1, 0, 23, 59, 59), label: now.toLocaleString('default', { month: 'long', year: 'numeric' }) };
    if (text.includes('last month')) {
      const pm = m === 0 ? 11 : m - 1; const py = m === 0 ? y - 1 : y;
      return { from: new Date(py, pm, 1), to: new Date(py, pm + 1, 0, 23, 59, 59), label: new Date(py, pm, 1).toLocaleString('default', { month: 'long', year: 'numeric' }) };
    }
    if (text.includes('this year'))
      return { from: new Date(y, 0, 1), to: new Date(y, 11, 31, 23, 59, 59), label: String(y) };
  }
  return null;
}

// ── Aggregation ───────────────────────────────────────────────────────────────

function topN(counts: Record<string, number>, n = 10): Record<string, number> {
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n));
}

function aggregate(leads: Lead[]) {
  const bySource: Record<string, number> = {};
  const byRecruiter: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const bySpecialty: Record<string, number> = {};
  for (const l of leads) {
    const src = (l.Lead_Source as string) ?? 'Unknown';
    const rec = ((l.Owner as Record<string, string>)?.name) ?? 'Unknown';
    const st  = (l.Lead_Status as string) ?? 'Unknown';
    const sp  = ((l.Specialty ?? l.Specialty_New) as string | undefined) ?? 'Unknown';
    bySource[src]    = (bySource[src]    ?? 0) + 1;
    byRecruiter[rec] = (byRecruiter[rec] ?? 0) + 1;
    byStatus[st]     = (byStatus[st]     ?? 0) + 1;
    bySpecialty[sp]  = (bySpecialty[sp]  ?? 0) + 1;
  }
  return { total: leads.length, bySource: topN(bySource), byRecruiter: topN(byRecruiter), byStatus: topN(byStatus), bySpecialty: topN(bySpecialty) };
}

function buildRecruiterStats(leads: Lead[]) {
  const stats: Record<string, { total: number; contacted: number; highPriority: number; placed: number }> = {};
  for (const l of leads) {
    const rec    = ((l.Owner as Record<string, string>)?.name) ?? 'Unknown';
    const status = (l.Lead_Status as string) ?? '';
    if (!stats[rec]) stats[rec] = { total: 0, contacted: 0, highPriority: 0, placed: 0 };
    stats[rec].total++;
    if (status && status !== 'New Application' && status !== 'Unqualified Leads') stats[rec].contacted++;
    if (status === 'High Priority') stats[rec].highPriority++;
    if (status === 'Placed' || status === 'Hired') stats[rec].placed++;
  }
  return Object.entries(stats)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 15)
    .map(([name, s]) => ({
      name, total: s.total, contacted: s.contacted,
      contactRate: s.total > 0 ? Math.round((s.contacted / s.total) * 100) : 0,
      highPriority: s.highPriority, placed: s.placed,
    }));
}

function buildDealStats(deals: Deal[]) {
  const closedWon  = deals.filter(d => d.Stage === 'Closed Won');
  const closedLost = deals.filter(d => d.Stage === 'Closed Lost');
  const open       = deals.filter(d => d.Stage !== 'Closed Won' && d.Stage !== 'Closed Lost');
  const byStage: Record<string, number> = {};
  for (const d of deals) byStage[d.Stage] = (byStage[d.Stage] ?? 0) + 1;
  return {
    total: deals.length,
    closedWon: closedWon.length,
    closedLost: closedLost.length,
    openDeals: open.length,
    totalRevenueAED: closedWon.reduce((s, d) => s + (d.Amount ?? 0), 0),
    pipelineValueAED: open.reduce((s, d) => s + (d.Amount ?? 0), 0),
    byStage,
  };
}

function buildLicenseStats(leads: Lead[]) {
  const cnt = (field: string, val: string) =>
    leads.filter(l => (l[field] as string ?? '').toLowerCase() === val.toLowerCase()).length;
  return {
    DOH: { yes: cnt('Has_DOH', 'Yes'), inProgress: cnt('Has_DOH', 'In Progress'), no: cnt('Has_DOH', 'No') },
    DHA: { yes: cnt('Has_DHA', 'Yes'), inProgress: cnt('Has_DHA', 'In Progress'), no: cnt('Has_DHA', 'No') },
    MOH: { yes: cnt('Has_MOH', 'Yes'), inProgress: cnt('Has_MOH', 'In Progress'), no: cnt('Has_MOH', 'No') },
  };
}

/** Compact one-liner per lead — includes all key fields */
function leadCompact(l: Lead): string {
  const name  = ((l.Full_Name ?? `${l.First_Name ?? ''} ${l.Last_Name ?? ''}`.trim()) as string) || 'Unknown';
  const rec   = ((l.Owner as Record<string, string>)?.name) ?? '—';
  const sp    = ((l.Specialty ?? l.Specialty_New) as string | undefined) ?? '—';
  const src   = (l.Lead_Source as string)   ?? '—';
  const st    = (l.Lead_Status as string)   ?? '—';
  const nat   = (l.Nationality as string | undefined) ?? '—';
  const dt    = ((l.Created_Time as string) ?? '').slice(0, 10) || '—';
  const doh   = (l.Has_DOH as string | undefined)?.charAt(0) ?? '?';
  const dha   = (l.Has_DHA as string | undefined)?.charAt(0) ?? '?';
  const moh   = (l.Has_MOH as string | undefined)?.charAt(0) ?? '?';
  return `${name} | ${sp} | ${st} | ${rec} | ${src} | ${nat} | ${dt} | D${doh}/A${dha}/M${moh}`;
}

function dealRow(d: Deal): string {
  const owner = (d.Owner as Record<string, string> | undefined)?.name ?? '—';
  return `${d.Deal_Name} | ${d.Stage} | AED ${(d.Amount ?? 0).toLocaleString()} | ${d.Lead_Source ?? '—'} | ${owner} | ${d.Closing_Date?.slice(0, 10) ?? '—'}`;
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  let body: {
    messages?:    Array<{ role: string; content: string }>;
    currentPage?: string;
    pageData?:    Record<string, unknown> | null;
  } = {};
  try { body = await req.json(); } catch { /* use defaults */ }

  const incoming    = body.messages    ?? [];
  const currentPage = body.currentPage ?? '/';
  const pageData    = body.pageData    ?? null;

  const pageLabel = PAGE_LABELS[currentPage] ?? currentPage;
  const pageFocus = PAGE_FOCUS[currentPage]  ?? 'Answer the user\'s question using the data below.';

  const userTexts = [...incoming].reverse()
    .filter(m => m.role === 'user')
    .map(m => m.content);

  // ── Load all data in parallel ─────────────────────────────────────────────
  const [{ leads: allLeads, deals: allDeals }, contracts] = await Promise.all([
    loadZohoCache(),
    loadContracts(),
  ]);

  // ── Detect filters ────────────────────────────────────────────────────────
  const detectedStatus    = detectStatus(userTexts);
  const detectedRecruiter = detectRecruiter(userTexts, allLeads);
  const detectedDateRange = detectDateRange(userTexts);

  let filtered = allLeads;
  if (detectedStatus)    filtered = filtered.filter(l => l.Lead_Status === detectedStatus);
  if (detectedRecruiter) filtered = filtered.filter(l => ((l.Owner as Record<string, string>)?.name) === detectedRecruiter);
  if (detectedDateRange) {
    filtered = filtered.filter(l => {
      const ct = l.Created_Time as string | undefined;
      if (!ct) return false;
      const d = new Date(ct);
      return d >= detectedDateRange!.from && d <= detectedDateRange!.to;
    });
  }

  // ── Compute stats ─────────────────────────────────────────────────────────
  const stats          = aggregate(filtered);
  const recruiterStats = buildRecruiterStats(allLeads);
  const dealStats      = buildDealStats(allDeals);
  const licenseStats   = buildLicenseStats(allLeads);

  // Monthly lead counts (last 12 months, all leads)
  const now = new Date();
  const monthlyMap: Record<string, number> = {};
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthlyMap[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`] = 0;
  }
  for (const l of allLeads) {
    const ct = (l.Created_Time as string | undefined)?.slice(0, 7);
    if (ct && ct in monthlyMap) monthlyMap[ct] = (monthlyMap[ct] ?? 0) + 1;
  }
  const monthlySeries = Object.entries(monthlyMap).map(([month, count]) => ({ month, count }));

  const filterDesc = [
    detectedStatus    ? `status="${detectedStatus}"`          : null,
    detectedRecruiter ? `recruiter="${detectedRecruiter}"`    : null,
    detectedDateRange ? `date=${detectedDateRange.label}`     : null,
  ].filter(Boolean).join(', ') || 'all leads';

  // ── Build context ─────────────────────────────────────────────────────────
  // Cap leads at 500 to stay well within token limits (~10K tokens for leads)
  const CAP = 500;
  const capped    = filtered.slice(0, CAP);
  const truncated = filtered.length > CAP;
  const leadsText = capped.length === 0
    ? '(no leads match this filter)'
    : capped.map(leadCompact).join('\n');

  const contractsText = contracts.length === 0 ? '' : contracts.map(c =>
    `${c.doctor_name ?? '—'} | ${c.hospital_name ?? '—'} | ${c.status ?? '—'} | AED ${c.contract_value ?? 0} | ${c.specialty ?? '—'} | ${String(c.start_date ?? '—').slice(0, 10)} → ${String(c.end_date ?? '—').slice(0, 10)}`
  ).join('\n');

  const contextBlock = [
    `CURRENT PAGE: ${pageLabel}`,
    `PAGE FOCUS: ${pageFocus}`,
    '',
    `=== AGGREGATE STATS (${filtered.length} leads matched / filter: ${filterDesc}) ===`,
    JSON.stringify(stats, null, 2),
    '',
    `MONTHLY NEW LEADS — last 12 months (all ${allLeads.length} leads):`,
    JSON.stringify(monthlySeries),
    '',
    `=== RECRUITER PERFORMANCE ===`,
    'name | total | contacted | contactRate% | highPriority | placed',
    recruiterStats.map(r =>
      `${r.name} | ${r.total} | ${r.contacted} | ${r.contactRate}% | ${r.highPriority} HP | ${r.placed} placed`
    ).join('\n'),
    '',
    `=== DEALS (${allDeals.length} total) ===`,
    `Closed Won: ${dealStats.closedWon} deals, AED ${dealStats.totalRevenueAED.toLocaleString()} revenue`,
    `Open pipeline: ${dealStats.openDeals} deals, AED ${dealStats.pipelineValueAED.toLocaleString()}`,
    `By stage: ${JSON.stringify(dealStats.byStage)}`,
    '',
    `Deal_Name | Stage | AED Amount | Source | Owner | Closing_Date`,
    allDeals.map(dealRow).join('\n'),
    '',
    `=== LICENSE PIPELINE ===`,
    `DOH: ${licenseStats.DOH.yes} Yes / ${licenseStats.DOH.inProgress} In Progress / ${licenseStats.DOH.no} No`,
    `DHA: ${licenseStats.DHA.yes} Yes / ${licenseStats.DHA.inProgress} In Progress / ${licenseStats.DHA.no} No`,
    `MOH: ${licenseStats.MOH.yes} Yes / ${licenseStats.MOH.inProgress} In Progress / ${licenseStats.MOH.no} No`,

    ...(contractsText ? [
      '',
      `=== CONTRACTS (${contracts.length}) ===`,
      'doctor_name | hospital | status | value | specialty | start → end',
      contractsText,
    ] : []),

    ...(pageData ? [
      '',
      `=== META ADS (live Facebook Marketing API) ===`,
      JSON.stringify(pageData, null, 2),
    ] : []),

    '',
    `=== LEADS (${capped.length} of ${filtered.length}${truncated ? ` — showing first ${CAP}` : ''}) ===`,
    'Name | Specialty | Status | Recruiter | Source | Nationality | Created | D{DOH}/A{DHA}/M{MOH}',
    leadsText,
    ...(truncated ? [`\n(${filtered.length - CAP} more leads not shown — use more specific filters to narrow results)`] : []),
  ].join('\n');

  // ── System prompt ─────────────────────────────────────────────────────────
  const systemText =
    `You are a highly capable AI assistant for AllocationAssist, a doctor recruitment company placing international doctors into UAE hospitals (DOH=Dubai Health Authority area, DHA=Dubai Health Authority, MOH=Ministry of Health).

Rules:
- No emojis. Ever. Professional tone only.
- Use markdown: **bold** key numbers/names, bullet lists, ## headers for sections.
- Answer any question — you have the complete dataset. Look up specific doctors by name, filter by recruiter, specialty, status, license, nationality, etc.
- Be precise. Use exact numbers. Compute percentages yourself.
- The user is on the "${pageLabel}" page — lead with context relevant to that page.
- Always complete your response fully. Never cut off mid-sentence or mid-list.
- For specific doctor lookups: scan the ALL LEADS section for the exact record and report all available fields.
- For recruiter questions: use the RECRUITER PERFORMANCE table and the ALL LEADS section filtered by that recruiter.
- For financial questions: use the DEALS section.
- For license questions: combine LICENSE PIPELINE counts with individual lead records.

CHARTS: When visualising distribution, comparison, or trends include ONE chart after your text:
<chart type="TYPE" title="TITLE">VALID_JSON</chart>
- bar:  {"labels":["A","B"],"values":[10,20]}
- pie:  {"labels":["A","B"],"values":[10,20]}
- line: {"labels":["Jan","Feb"],"series":[{"name":"Leads","values":[10,20]}]}
Only include a chart when it genuinely adds value.

${contextBlock}`;

  const systemContent = [{
    type:          'text' as const,
    text:          systemText,
    cache_control: { type: 'ephemeral' as const },
  }];

  const apiMessages: Array<{ role: 'user' | 'assistant'; content: string }> =
    incoming.length === 0
      ? [{
          role:    'user',
          content: `I'm on the ${pageLabel} page. Give me 5 actionable insights most relevant to this page — what needs attention right now? Number each 1–5, one or two sentences each.`,
        }]
      : incoming.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  // ── Stream ────────────────────────────────────────────────────────────────
  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        const stream = anthropic.messages.stream({
          model:      'claude-opus-4-6',
          max_tokens: 3000,
          system:     systemContent,
          messages:   apiMessages,
        });
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(chunk.delta.text));
          }
        }
      } catch (err) {
        controller.enqueue(encoder.encode(`\n[Error: ${String(err)}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    status:  200,
    headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' },
  });
});
