/**
 * ai-insights — Supabase Edge Function
 *
 * Queries zoho_cache directly (no embeddings needed for structured queries).
 * Detects status, date range, recruiter, source filters from the conversation,
 * computes aggregate stats server-side, and streams a concise Claude response.
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

// ── Lead loader ───────────────────────────────────────────────────────────────

async function fetchAllLeads(): Promise<Lead[]> {
  const { data, error } = await supabase
    .from('zoho_cache')
    .select('data')
    .eq('id', 1)
    .single();

  if (error || !data?.data?.leads) return [];
  return data.data.leads as Lead[];
}

// ── Filter detection ──────────────────────────────────────────────────────────

const STATUS_KEYWORDS: Record<string, string> = {
  'unqualified leads':    'Unqualified Leads',
  'unqualified':          'Unqualified Leads',
  'initial call done':    'Initial Call Done',
  'initial call':         'Initial Call Done',
  'new application':      'New Application',
  'follow-up scheduled':  'Follow-up Scheduled',
  'follow-up':            'Follow-up Scheduled',
  'follow up':            'Follow-up Scheduled',
  'high priority':        'High Priority',
  'not interested':       'Not Interested',
  'screening':            'Screening',
  'qualified':            'Qualified',
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

interface DateRange { from: Date; to: Date; label: string }

function detectDateRange(msgs: string[]): DateRange | null {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-indexed
  const q = Math.floor(m / 3);

  for (const msg of msgs) {
    const text = msg.toLowerCase();

    if (text.includes('this quarter') || text.includes(`q${q + 1}`)) {
      return {
        from:  new Date(y, q * 3, 1),
        to:    new Date(y, q * 3 + 3, 0, 23, 59, 59),
        label: `Q${q + 1} ${y}`,
      };
    }
    if (text.includes('last quarter')) {
      const pq = q === 0 ? 3 : q - 1;
      const py = q === 0 ? y - 1 : y;
      return {
        from:  new Date(py, pq * 3, 1),
        to:    new Date(py, pq * 3 + 3, 0, 23, 59, 59),
        label: `Q${pq + 1} ${py}`,
      };
    }
    if (text.includes('this month')) {
      return {
        from:  new Date(y, m, 1),
        to:    new Date(y, m + 1, 0, 23, 59, 59),
        label: now.toLocaleString('default', { month: 'long', year: 'numeric' }),
      };
    }
    if (text.includes('last month')) {
      const pm = m === 0 ? 11 : m - 1;
      const py = m === 0 ? y - 1 : y;
      return {
        from:  new Date(py, pm, 1),
        to:    new Date(py, pm + 1, 0, 23, 59, 59),
        label: new Date(py, pm, 1).toLocaleString('default', { month: 'long', year: 'numeric' }),
      };
    }
    if (text.includes('this year')) {
      return {
        from:  new Date(y, 0, 1),
        to:    new Date(y, 11, 31, 23, 59, 59),
        label: String(y),
      };
    }
  }
  return null;
}

// ── Aggregation ───────────────────────────────────────────────────────────────

function topN(counts: Record<string, number>, n = 10): Record<string, number> {
  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n)
  );
}

function aggregate(leads: Lead[]) {
  const bySource: Record<string, number>    = {};
  const byRecruiter: Record<string, number> = {};
  const byStatus: Record<string, number>    = {};
  const bySpecialty: Record<string, number> = {};

  for (const l of leads) {
    const src = (l.Lead_Source as string)                                    ?? 'Unknown';
    const rec = ((l.Owner as Record<string, string>)?.name)                  ?? 'Unknown';
    const st  = (l.Lead_Status as string)                                    ?? 'Unknown';
    const sp  = ((l.Specialty ?? l.Specialty_New) as string | undefined)     ?? 'Unknown';

    bySource[src]       = (bySource[src]       ?? 0) + 1;
    byRecruiter[rec]    = (byRecruiter[rec]    ?? 0) + 1;
    byStatus[st]        = (byStatus[st]        ?? 0) + 1;
    bySpecialty[sp]     = (bySpecialty[sp]     ?? 0) + 1;
  }

  return {
    total:        leads.length,
    bySource:     topN(bySource),
    byRecruiter:  topN(byRecruiter),
    byStatus:     topN(byStatus),
    bySpecialty:  topN(bySpecialty),
  };
}

function leadSummary(l: Lead): string {
  const name = ((l.Full_Name ?? `${l.First_Name ?? ''} ${l.Last_Name ?? ''}`.trim()) as string) || 'Unknown';
  const rec  = ((l.Owner as Record<string, string>)?.name) ?? '—';
  const sp   = ((l.Specialty ?? l.Specialty_New) as string | undefined) ?? '—';
  const src  = (l.Lead_Source as string) ?? '—';
  const st   = (l.Lead_Status as string) ?? '—';
  const dt   = ((l.Created_Time as string) ?? '').slice(0, 10) || '—';
  return `${name} | ${sp} | ${src} | ${st} | ${rec} | ${dt}`;
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  let body: { messages?: Array<{ role: string; content: string }> } = {};
  try { body = await req.json(); } catch { /* use defaults */ }

  const incoming = body.messages ?? [] as Array<{ role: string; content: string }>;

  // Collect all user message text for filter detection (most recent first)
  const userTexts = [...incoming].reverse()
    .filter(m => m.role === 'user')
    .map(m => m.content);

  const detectedStatus    = detectStatus(userTexts);
  const detectedDateRange = detectDateRange(userTexts);

  // ── Load & filter leads ───────────────────────────────────────────────────
  const allLeads = await fetchAllLeads();

  let filtered = allLeads;

  if (detectedStatus) {
    filtered = filtered.filter(l => l.Lead_Status === detectedStatus);
  }

  if (detectedDateRange) {
    filtered = filtered.filter(l => {
      const ct = l.Created_Time as string | undefined;
      if (!ct) return false;
      const d = new Date(ct);
      return d >= detectedDateRange.from && d <= detectedDateRange.to;
    });
  }

  // ── Build context for Claude ──────────────────────────────────────────────
  const stats  = aggregate(filtered);
  const sample = filtered.slice(0, 100);

  // Monthly lead counts over the last 12 months (for line charts)
  const now = new Date();
  const monthlyMap: Record<string, number> = {};
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthlyMap[key] = 0;
  }
  for (const l of allLeads) {
    const ct = (l.Created_Time as string | undefined)?.slice(0, 7);
    if (ct && ct in monthlyMap) monthlyMap[ct] = (monthlyMap[ct] ?? 0) + 1;
  }
  const monthlySeries = Object.entries(monthlyMap)
    .map(([month, count]) => ({ month, count }));

  const filterDesc = [
    detectedStatus    ? `status = "${detectedStatus}"`            : null,
    detectedDateRange ? `date range = ${detectedDateRange.label}` : null,
  ].filter(Boolean).join(', ') || 'all leads (no filter)';

  const contextBlock =
    `FILTER APPLIED: ${filterDesc}\n` +
    `TOTAL MATCHING LEADS: ${filtered.length} of ${allLeads.length}\n\n` +
    `AGGREGATE STATS (for matching leads):\n${JSON.stringify(stats, null, 2)}\n\n` +
    `MONTHLY NEW LEADS (last 12 months, all leads):\n${JSON.stringify(monthlySeries)}\n\n` +
    `SAMPLE RECORDS (first ${sample.length} of ${filtered.length}):\n` +
    'Name | Specialty | Source | Status | Recruiter | Created\n' +
    sample.map(leadSummary).join('\n');

  // ── System prompt ─────────────────────────────────────────────────────────
  const systemText =
    `You are a concise AI assistant for AllocationAssist, a doctor recruitment company placing international doctors into UAE hospitals via Zoho CRM.

Rules:
- Use markdown formatting: **bold** key numbers and terms, bullet lists for multiple items, ## headers for distinct sections if needed.
- Keep responses SHORT. 2–4 sentences for simple questions. For lists, max 8 items.
- Use exact numbers from the data provided. Compute percentages yourself when asked.
- Never say you don't have the data — the zoho_cache is the live database.

CHARTS: When a question is about distribution, comparison, or trends, include ONE chart after your text using exactly this format (no spaces inside the tags):
<chart type="TYPE" title="TITLE">VALID_JSON</chart>

Chart types and their JSON schemas:
- bar:  {"labels":["A","B","C"],"values":[10,20,30]}
- pie:  {"labels":["A","B","C"],"values":[10,20,30]}
- line: {"labels":["Jan","Feb","Mar"],"series":[{"name":"Leads","values":[10,20,30]}]}

Line charts support multiple series: add more objects to the series array.
Use bar for comparisons, pie for proportions, line for trends over time.
Only include a chart when it genuinely adds value. Never invent data — use only numbers from the context below.

${contextBlock}`;

  const systemContent = [{
    type:          'text' as const,
    text:          systemText,
    cache_control: { type: 'ephemeral' as const },
  }];

  // ── Messages ──────────────────────────────────────────────────────────────
  const apiMessages: Array<{ role: 'user' | 'assistant'; content: string }> =
    incoming.length === 0
      ? [{
          role:    'user',
          content: 'Give me exactly 5 insights the recruitment team should act on today. ' +
                   'Focus on: where leads are getting stuck, which channels are performing best, ' +
                   'high-priority follow-ups, recruiter workload, and pipeline anomalies. ' +
                   'Number each insight 1–5. One or two sentences each.',
        }]
      : incoming.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  // ── Stream ────────────────────────────────────────────────────────────────
  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        const stream = anthropic.messages.stream({
          model:      'claude-opus-4-6',
          max_tokens: 1200,
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
