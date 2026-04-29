/**
 * useZohoData — fetches Leads + Deals + Calls + Accounts from Zoho CRM
 * and aggregates them into the shape the dashboard needs.
 *
 * Real field names confirmed from live API:
 *   Leads:    Full_Name, Lead_Status, Lead_Source, Owner{name}, Specialty,
 *             Specialty_New, Country_of_Specialty_training, Created_Time,
 *             Has_DOH, Has_DHA, Has_MOH, License, Recruiter, Age, Prime_Classification
 *   Deals:    Deal_Name, Stage, Amount, Owner{name}, Closing_Date, Lead_Source, Created_Time
 *   Calls:    Subject, Call_Type, Call_Status, Owner{name}, Created_Time
 *   Accounts: Account_Name, Industry, Owner{name}  (partner hospitals)
 *   Emails:   BLOCKED — Zoho token lacks email scope
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { zohoFetchAll, zohoGetEmailCounts, zohoSync } from '@/lib/zoho';
import { supabase } from '@/lib/supabase';

const CACHE_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

// ── Zoho field types ─────────────────────────────────────────────────────────

export interface ZohoLead {
  id: string;
  Full_Name: string;
  First_Name: string;
  Last_Name: string;
  Email: string | null;
  Phone: string | null;
  Mobile: string | null;
  Lead_Status: string;
  Lead_Source: string | null;
  Owner: { name: string; email: string };
  Specialty: string | null;
  Specialty_New: string | null;
  Country_of_Specialty_training: string | null;
  Created_Time: string;
  Has_DOH: string | null;
  Has_DHA: string | null;
  Has_MOH: string | null;
  License: string | null;
  Recruiter: string | null;
  Age: number | null;
  Prime_Classification: string | null;
}

export interface ZohoDeal {
  id: string;
  Deal_Name: string;
  Stage: string;
  Amount: number;
  Owner: { name: string; email: string };
  Closing_Date: string;
  Lead_Source: string | null;
  Created_Time: string;
}

export interface ZohoCall {
  id: string;
  Subject: string | null;
  Call_Type: string;   // "Outbound" | "Inbound" | "Missed"
  Call_Status: string;
  Owner: { name: string; email: string };
  Created_Time: string;
}

export interface ZohoAccount {
  id: string;
  Account_Name: string;
  Industry: string | null;
  Owner: { name: string; email: string };
}

export interface ZohoCampaign {
  id: string;
  Campaign_Name: string;
  Type: string | null;
  Status: string | null;
  Start_Date: string | null;
  End_Date: string | null;
  Budgeted_Cost: number | null;
  Actual_Cost: number | null;
  Owner: { name: string; email: string };
}

// "Doctors on Board" — the standard Zoho Contacts module renamed in this org.
// One row per actually-placed doctor. SOLE source of truth for conversions.
// Email/Phone/Mobile fields drive cross-reference to meta_leads and to the
// Lead module — most DoB rows have no Lead_Source set, so identity-based
// matching gives us much stronger attribution than Lead_Source alone.
export interface ZohoDoctorOnBoard {
  id: string;
  Full_Name: string | null;
  First_Name: string | null;
  Last_Name: string | null;
  Email: string | null;
  Phone: string | null;
  Mobile: string | null;
  Specialty: string | null;
  Specialty_Details: string | null;
  Lead_Source: string | null;
  Owner: { name: string; email: string } | null;
  Account_Name: { name: string; id: string } | null;   // linked Hospital
  Created_Time: string;
  Modified_Time: string | null;
}

// ── Aggregation helpers ───────────────────────────────────────────────────────

function countBy<T>(arr: T[], key: (item: T) => string): Record<string, number> {
  return arr.reduce((acc, item) => {
    const k = key(item) ?? 'Unknown';
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

function sumBy<T>(arr: T[], key: (item: T) => number): number {
  return arr.reduce((s, item) => s + (key(item) ?? 0), 0);
}

function formatRelativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diffMs / 60_000);
  const hrs   = Math.floor(diffMs / 3_600_000);
  const days  = Math.floor(diffMs / 86_400_000);
  if (mins < 60)  return `${mins} min ago`;
  if (hrs  < 24)  return `${hrs} hr${hrs > 1 ? 's' : ''} ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7)   return `${days} days ago`;
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// Maps Zoho Lead_Status → a friendly pipeline label
const STATUS_LABEL: Record<string, string> = {
  'Not Contacted':               'New Application',
  'Attempted to Contact':        'Screening',
  'Initial Sales Call Completed': 'Initial Call Done',
  'Contact in Future':           'Follow-up Scheduled',
  'High Priority Follow up':     'High Priority',
  'Unqualified Leads':           'Unqualified',
  'Not Interested':              'Not Interested',
};

// Colours for pipeline stage bars (matches existing dashboard palette)
const STAGE_COLORS: Record<string, string> = {
  'New Application':      'hsl(210, 75%, 52%)',
  'Screening':            'hsl(170, 55%, 45%)',
  'Initial Call Done':    'hsl(38, 88%, 50%)',
  'Follow-up Scheduled':  'hsl(280, 50%, 52%)',
  'High Priority':        'hsl(340, 60%, 52%)',
  'Unqualified':          'hsl(220, 9%, 60%)',
  'Not Interested':       'hsl(0, 60%, 55%)',
  // Deal stages
  'Qualification':        'hsl(210, 75%, 52%)',
  'Needs Analysis':       'hsl(170, 55%, 45%)',
  'Value Proposition':    'hsl(38, 88%, 50%)',
  'Proposal/Price Quote': 'hsl(280, 50%, 52%)',
  'Closed Won':           'hsl(142, 70%, 40%)',
  'Closed Lost':          'hsl(0, 60%, 55%)',
};

// Aggressive normalization — merges variants and pushes junk/empty values
// into a single "Undefined" bucket so the Marketing grid can hide them with
// one toggle.
export function displaySource(src: string | null): string {
  if (!src) return 'Undefined';
  const s = src.trim().toLowerCase();

  // Junk / test entries — empty, all-x, common nulls, single chars
  if (!s || /^x+$/i.test(s) || s === 'none' || s === 'null' || s === 'n/a' || s.length < 2) {
    return 'Undefined';
  }

  // Meta = Facebook + Instagram (single channel; both owned by Meta)
  if (s.includes('instagram') || s === 'ig')   return 'Meta';
  if (s.includes('facebook') || s === 'fb' || s === 'meta') return 'Meta';

  // Website / SEO / ChatGPT — all rolled into one organic-web channel
  if (s.includes('landing page'))              return 'Landing Page';
  if (s.includes('website') || s.includes('seo') || s === 'organic'
      || s.includes('chatgpt') || s.includes('gpt') || s.includes('openai'))
    return 'Website / SEO';

  // Paid ads
  if (s.includes('google') && s.includes('ad')) return 'Google Ads';
  if (s.includes('tiktok')) return 'TikTok';

  // Social / professional
  if (s.includes('linkedin') || s.includes('linked in')) return 'LinkedIn';
  if (s.includes('whatsapp')) return 'WhatsApp';

  // Referral / word of mouth — covers "Referral", "Reference", "Word of mouth"
  if (s.includes('referral') || s.includes('referrer')
      || s === 'reference' || s.startsWith('reference')
      || s.includes('word of mouth')) return 'Referrals';

  // Agencies / external job boards
  if (s.includes('go hire') || s.includes('gohire')) return 'Go Hire';
  if (s.includes('naukri')) return 'Naukri Gulf';
  if (s === 'indeed' || s.startsWith('indeed')) return 'Indeed';
  if (s === 'jobsoid' || s.startsWith('jobsoid')) return 'Jobsoid';
  if (s === 'bmj ads' || s.startsWith('bmj')) return 'BMJ Ads';

  // NHS Website is a UK referral source, not organic web
  if (s.includes('nhs')) return 'Referrals';

  // Fallback: Title Case the raw value
  return src.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
}


// ── Normalisation helpers ─────────────────────────────────────────────────────

/** Title-cases a string and collapses extra whitespace. */
function toTitleCase(s: string): string {
  return s.trim().replace(/\s+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** Normalises Lead_Status — handles casing variants and common typos.
 *  Order matters: more-specific checks come before broad substring checks. */
function normaliseStatus(raw: string | null | undefined): string {
  if (!raw) return 'Not Contacted';
  const s = raw.trim().toLowerCase();

  // ── Not Contacted ─────────────────────────────────────────────────────────
  if (s === 'not contacted' || s === 'not_contacted' || s === 'new'
      || s === 'new lead' || s === 'new application' || s === 'open'
      || s === 'pending' || s === 'untouched')
    return 'Not Contacted';

  // ── Attempted to Contact (includes "no answer" variants) ──────────────────
  // Check BEFORE the broad 'not interested' block so 'no answer' ≠ 'not interested'
  if (s === 'attempted to contact' || s === 'attempted contact'
      || s === 'no answer'   || s === 'no reply'   || s === 'no response'
      || s === 'left voicemail' || s === 'voicemail' || s === 'left message'
      || s === 'busy'        || s === 'ringing'    || s === 'unanswered'
      || s === 'call back'   || s === 'callback'   || s === 'try again'
      || (s.includes('attempted') && !s.includes('not'))
      || s.includes('no answer') || s.includes('no reply')
      || s.includes('left voicemail') || s.includes('left message'))
    return 'Attempted to Contact';

  // ── Initial Sales Call Completed ──────────────────────────────────────────
  if (s.includes('initial sales call') || s.includes('initial call')
      || s === 'call completed' || s === 'call done' || s === 'connected'
      || s === 'spoke to'      || s === 'reached')
    return 'Initial Sales Call Completed';

  // ── Contact in Future ─────────────────────────────────────────────────────
  // Use exact/prefix checks — avoid broad 'future' substring (can match other statuses)
  if (s === 'contact in future' || s === 'follow up' || s === 'follow-up'
      || s === 'scheduled'      || s === 'call scheduled'
      || s.startsWith('contact in future'))
    return 'Contact in Future';

  // ── High Priority Follow up ───────────────────────────────────────────────
  if (s.includes('high priority') || s === 'hot' || s === 'urgent' || s === 'priority')
    return 'High Priority Follow up';

  // ── Unqualified Leads ─────────────────────────────────────────────────────
  if (s.includes('unqualified') || s === 'junk' || s === 'spam'
      || s === 'test' || s === 'duplicate' || s === 'invalid')
    return 'Unqualified Leads';

  // ── Not Interested ────────────────────────────────────────────────────────
  // No bare 'no' — too broad and would catch 'no answer', 'no reply' etc.
  if (s.includes('not interested') || s === 'rejected' || s === 'declined'
      || s === 'lost'   || s === 'dead'    || s === 'closed lost'
      || s === 'opt out' || s === 'opted out' || s === 'unsubscribed'
      || s === 'inactive')
    return 'Not Interested';

  // Return original title-cased if no match found
  return toTitleCase(raw);
}

/** Normalises a person's name — trims, collapses spaces, title-cases. */
function normaliseName(raw: string | null | undefined): string {
  if (!raw) return 'Unknown';
  return toTitleCase(raw);
}

/** Normalises specialty names — collapses variants. */
function normaliseSpecialty(raw: string | null | undefined): string {
  if (!raw) return null as unknown as string;
  const s = raw.trim().toLowerCase();
  if (s.includes('general') && s.includes('pract')) return 'General Practitioner';
  if (s.includes('general') && s.includes('surg')) return 'General Surgery';
  if (s.includes('paediat') || s.includes('pediatr')) return 'Paediatrics';
  if (s.includes('obstet') || s.includes('gynae') || s.includes('gyneco')) return 'OB/GYN';
  if (s.includes('cardio')) return 'Cardiology';
  if (s.includes('ortho')) return 'Orthopaedics';
  if (s.includes('anaesth') || s.includes('anesthes')) return 'Anaesthesiology';
  if (s.includes('radio') || s.includes('imaging')) return 'Radiology';
  if (s.includes('emergency') || s === 'er' || s === 'a&e') return 'Emergency Medicine';
  if (s.includes('internal med')) return 'Internal Medicine';
  if (s.includes('dermat')) return 'Dermatology';
  if (s.includes('psychiat')) return 'Psychiatry';
  if (s.includes('neurol')) return 'Neurology';
  if (s.includes('ophthal') || s.includes('eye')) return 'Ophthalmology';
  if (s.includes('ent') || s.includes('otolaryn')) return 'ENT';
  if (s.includes('oncol')) return 'Oncology';
  if (s.includes('urol')) return 'Urology';
  if (s.includes('nephrol')) return 'Nephrology';
  if (s.includes('gastro')) return 'Gastroenterology';
  if (s.includes('pulmon') || s.includes('respirat') || s.includes('chest')) return 'Pulmonology';
  return toTitleCase(raw);
}

/** Normalises country names — maps variants to a single canonical name. */
function normaliseCountry(raw: string | null | undefined): string {
  if (!raw) return null as unknown as string;
  const s = raw.trim().toLowerCase();
  if (s.includes('egypt') || s === 'eg') return 'Egypt';
  if (s.includes('saudi') || s === 'ksa' || s === 'sa') return 'Saudi Arabia';
  if (s === 'uae' || s.includes('united arab') || s === 'dubai' || s === 'abu dhabi') return 'UAE';
  if (s.includes('jordan') || s === 'jo') return 'Jordan';
  if (s.includes('lebanon') || s === 'lb') return 'Lebanon';
  if (s.includes('syria') || s === 'sy') return 'Syria';
  if (s.includes('iraq') || s === 'iq') return 'Iraq';
  if (s.includes('sudan') || s === 'sd') return 'Sudan';
  if (s.includes('morocco') || s === 'ma') return 'Morocco';
  if (s.includes('tunisia') || s === 'tn') return 'Tunisia';
  if (s.includes('libya') || s === 'ly') return 'Libya';
  if (s.includes('pakistan') || s === 'pk') return 'Pakistan';
  if (s.includes('india') || s === 'in') return 'India';
  if (s.includes('philippines') || s === 'ph' || s.includes('filipino')) return 'Philippines';
  if (s.includes('uk') || s.includes('united kingdom') || s.includes('britain')) return 'United Kingdom';
  if (s.includes('usa') || s.includes('united states') || s === 'us' || s === 'america') return 'United States';
  return toTitleCase(raw);
}

/** Applies all normalisation to a raw Zoho lead before aggregation. */
function normaliseLead(l: ZohoLead): ZohoLead {
  return {
    ...l,
    Lead_Status:   normaliseStatus(l.Lead_Status),
    Full_Name:     normaliseName(l.Full_Name || `${l.First_Name ?? ''} ${l.Last_Name ?? ''}`.trim()),
    First_Name:    l.First_Name ? toTitleCase(l.First_Name) : l.First_Name,
    Last_Name:     l.Last_Name  ? toTitleCase(l.Last_Name)  : l.Last_Name,
    Owner:         { ...l.Owner, name: normaliseName(l.Owner?.name) },
    Specialty:     normaliseSpecialty(l.Specialty ?? l.Specialty_New),
    Specialty_New: normaliseSpecialty(l.Specialty_New),
    Country_of_Specialty_training: normaliseCountry(l.Country_of_Specialty_training),
    Lead_Source:   l.Lead_Source?.trim() || null,
  };
}

// ── Main aggregation ──────────────────────────────────────────────────────────

export function aggregateZohoData(
  leads: ZohoLead[],
  deals: ZohoDeal[],
  calls: ZohoCall[],
  accounts: ZohoAccount[],
  campaigns: ZohoCampaign[],
  emailData: { total: number; bySender: Record<string, number>; sampled: number },
  doctorsOnBoard: ZohoDoctorOnBoard[] = [],
) {
  // ── Normalise all leads before any aggregation ────────────────────────────
  leads = leads.map(normaliseLead);

  // ── Status sets ───────────────────────────────────────────────────────────
  const activeStatuses = new Set([
    'Not Contacted', 'Attempted to Contact', 'Initial Sales Call Completed',
    'Contact in Future', 'High Priority Follow up',
  ]);
  const unqualifiedStatuses = new Set(['Unqualified Leads', 'Not Interested']);

  // CRITICAL: Qualified = Initial Sales Call Completed + High Priority Follow up
  // ONLY. Closed Won is tracked separately as a placement (Deals.Closed Won),
  // not a "qualified lead" stage. Contact in Future / Not Contacted / Attempted
  // are earlier funnel stages and not qualified. This matches Ammar's manual
  // tally so cost-per-qualified numbers reflect reality.
  const qualifiedStatusSet = new Set([
    'Initial Sales Call Completed',
    'High Priority Follow up',
  ]);
  const qualifiedLeads = leads.filter(l => qualifiedStatusSet.has(l.Lead_Status));
  const activeLeads    = leads.filter(l => activeStatuses.has(l.Lead_Status));

  // Log unique deal stages so we can confirm the exact Zoho stage names
  console.log('[deals] unique stages:', [...new Set(deals.map(d => d.Stage))]);
  // Log unique lead statuses with counts so we can see every Lead_Status in use
  const leadStatusCounts = leads.reduce<Record<string, number>>((acc, l) => {
    const s = l.Lead_Status ?? '(empty)';
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});
  console.log('[leads] unique statuses:',
    Object.entries(leadStatusCounts).sort((a, b) => b[1] - a[1])
  );

  const closedWon      = deals.filter(d => d.Stage === 'Closed Won');
  const closedLost     = deals.filter(d => d.Stage === 'Closed Lost');
  const openDeals      = deals.filter(d => d.Stage !== 'Closed Won' && d.Stage !== 'Closed Lost');
  const totalRevenue   = sumBy(closedWon, d => d.Amount);

  // ── Pipeline value — weighted by stage probability ───────────────────────
  const stageProb: Record<string, number> = {
    'Qualification':        0.10,
    'Needs Analysis':       0.25,
    'Value Proposition':    0.40,
    'Identify Decision Makers': 0.50,
    'Proposal/Price Quote': 0.65,
    'Negotiation/Review':   0.80,
    'Closed Won':           1.00,
    'Closed Lost':          0.00,
  };
  const openPipelineValue = sumBy(openDeals, d => d.Amount);
  const weightedPipelineValue = openDeals.reduce((sum, d) => {
    const p = stageProb[d.Stage] ?? 0.30;
    return sum + (d.Amount ?? 0) * p;
  }, 0);

  // ── Conversion rate ──────────────────────────────────────────────────────
  // SOLE source of truth: every row in the Zoho `Doctors on Board` module
  // (api_name `Contacts`) is one converted doctor. Lead-status proxies have
  // been removed.
  const convertedCount = doctorsOnBoard.length;
  const leadConversionRate = leads.length > 0
    ? parseFloat(((convertedCount / leads.length) * 100).toFixed(2))
    : 0;

  const conversionRate = leads.length > 0
    ? (closedWon.length / leads.length) * 100
    : 0;
  const qualificationRate = leads.length > 0
    ? (qualifiedLeads.length / leads.length) * 100
    : 0;

  // ── Avg time to place (Created_Time → Closing_Date on Closed Won deals) ──
  const wonWithDates = closedWon.filter(d => d.Created_Time && d.Closing_Date);
  const avgCycleDays = wonWithDates.length > 0
    ? Math.round(
        wonWithDates.reduce((sum, d) => {
          const ms = new Date(d.Closing_Date).getTime() - new Date(d.Created_Time).getTime();
          return sum + ms / 86_400_000;
        }, 0) / wonWithDates.length
      )
    : 0;
  const avgCycleTime = avgCycleDays > 0 ? `${avgCycleDays} days` : '—';

  // When there are no Closed Won deals, fall back to avg age of active leads
  const avgActiveLeadDays = activeLeads.length > 0
    ? Math.round(activeLeads.reduce((sum, l) => sum + (Date.now() - new Date(l.Created_Time).getTime()) / 86_400_000, 0) / activeLeads.length)
    : 0;
  const avgTimeDisplay  = wonWithDates.length > 0 ? avgCycleTime : avgActiveLeadDays > 0 ? `${avgActiveLeadDays} days` : '—';
  const avgTimePeriod   = wonWithDates.length > 0
    ? `${wonWithDates.length} closed-won deals`
    : `avg age across ${activeLeads.length.toLocaleString()} active leads`;

  // ── Period-over-period deltas (last 30 days vs previous 30 days) ─────────
  const now = Date.now();
  const DAY = 86_400_000;
  const period1Start = now - 30 * DAY;   // last 30 days
  const period2Start = now - 60 * DAY;   // 30 days before that

  const leadsPrev    = leads.filter(l => {
    const t = new Date(l.Created_Time).getTime();
    return t >= period2Start && t < period1Start;
  }).length;
  const qualifiedCurrent = leads.filter(l => {
    return new Date(l.Created_Time).getTime() >= period1Start && qualifiedStatusSet.has(l.Lead_Status);
  }).length;
  const qualifiedPrev = leads.filter(l => {
    const t = new Date(l.Created_Time).getTime();
    return t >= period2Start && t < period1Start && qualifiedStatusSet.has(l.Lead_Status);
  }).length;

  const revenueCurrent = sumBy(closedWon.filter(d => new Date(d.Closing_Date).getTime() >= period1Start), d => d.Amount);
  const revenuePrev    = sumBy(
    closedWon.filter(d => {
      const t = new Date(d.Closing_Date).getTime();
      return t >= period2Start && t < period1Start;
    }),
    d => d.Amount
  );

  const pctDelta = (curr: number, prev: number): number => {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return +(((curr - prev) / prev) * 100).toFixed(1);
  };

  // ── KPI cards ─────────────────────────────────────────────────────────────
  const fmtAED = (v: number) =>
    v >= 1_000_000 ? `AED ${(v / 1_000_000).toFixed(2)}M`
    : v >= 1000    ? `AED ${(v / 1000).toFixed(0)}K`
    : `AED ${Math.round(v)}`;

  const kpis = [
    {
      label:  'Qualified Active',
      value:  qualifiedLeads.filter(l => activeStatuses.has(l.Lead_Status)).length.toLocaleString(),
      change: pctDelta(qualifiedCurrent, qualifiedPrev),
      period: 'vs prior 30 days',
      icon:   'users' as const,
    },
    {
      label:  'Lead → Conversion',
      value:  `${leadConversionRate}%`,
      change: 0,
      period: `${convertedCount.toLocaleString()} converted / ${leads.length.toLocaleString()} leads`,
      icon:   'check' as const,
    },
    {
      label:  'Pipeline Value',
      value:  fmtAED(openPipelineValue),
      change: 0,
      period: `weighted ${fmtAED(weightedPipelineValue)} · ${openDeals.length} open deals`,
      icon:   'dollar' as const,
    },
    {
      label:  'Qualified Leads',
      value:  qualifiedLeads.length.toLocaleString(),
      change: pctDelta(qualifiedCurrent, qualifiedPrev),
      period: `${qualifiedLeads.length.toLocaleString()} of ${leads.length.toLocaleString()} leads in period`,
      icon:   'check' as const,
    },
    {
      label:  'Avg. Time to Place',
      value:  avgTimeDisplay,
      change: 0,
      period: avgTimePeriod,
      icon:   'clock' as const,
    },
    {
      label:  'Qualification Rate',
      value:  `${qualificationRate.toFixed(0)}%`,
      change: pctDelta(qualificationRate, qualifiedPrev / Math.max(leadsPrev, 1) * 100),
      period: `${qualifiedLeads.length.toLocaleString()} qualified / ${leads.length.toLocaleString()}`,
      icon:   'file' as const,
    },
  ];

  // ── Pipeline funnel (leads by status) ────────────────────────────────────
  const statusCounts = countBy(leads, l => STATUS_LABEL[l.Lead_Status] ?? l.Lead_Status);
  const totalLeads   = leads.length;
  const placementFunnel = Object.entries(statusCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([stage, count]) => ({
      stage,
      count,
      pct: parseFloat(((count / totalLeads) * 100).toFixed(1)),
    }));

  // ── Pipeline stage bars (for Sales page) ─────────────────────────────────
  const pipelineStages = Object.entries(statusCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([stage, count]) => ({
      stage,
      count,
      color: STAGE_COLORS[stage] ?? 'hsl(210, 75%, 52%)',
    }));

  // Deal stages
  const dealStageCounts = countBy(deals, d => d.Stage);
  const dealStages = Object.entries(dealStageCounts).map(([stage, count]) => ({
    stage,
    count,
    color: STAGE_COLORS[stage] ?? 'hsl(210, 75%, 52%)',
  }));

  // ── Workflow stages (same data as pipeline, different shape) ──────────────
  const workflow = pipelineStages.map(s => ({ name: s.stage, count: s.count }));

  // ── Real stage conversion rates ───────────────────────────────────────────
  const contacted      = leads.filter(l => l.Lead_Status !== 'Not Contacted'
    && l.Lead_Status !== 'Unqualified Leads'
    && l.Lead_Status !== 'Not Interested').length;
  const callCompleted  = leads.filter(l =>
    l.Lead_Status === 'Initial Sales Call Completed'
    || l.Lead_Status === 'High Priority Follow up').length;

  const highPriority = leads.filter(l => l.Lead_Status === 'High Priority Follow up').length;

  const stageConversion = [
    {
      stage: 'Applied → Contacted',
      rate: activeLeads.length > 0 ? parseFloat(((contacted / activeLeads.length) * 100).toFixed(1)) : 0,
    },
    {
      stage: 'Contacted → Initial Call',
      rate: contacted > 0 ? parseFloat(((callCompleted / contacted) * 100).toFixed(1)) : 0,
    },
    {
      stage: 'Initial Call → High Priority',
      rate: callCompleted > 0 ? parseFloat(((highPriority / callCompleted) * 100).toFixed(1)) : 0,
    },
    {
      stage: 'Leads → Deals',
      rate: totalLeads > 0 ? parseFloat(((deals.length / totalLeads) * 100).toFixed(1)) : 0,
    },
    {
      stage: 'Overall Conversion',
      rate: totalLeads > 0 ? parseFloat(((callCompleted / totalLeads) * 100).toFixed(1)) : 0,
    },
  ];

  // Debug: log unique Lead_Source values so we can verify channel coverage.
  // (Facebook + Instagram are now merged into "Meta" via displaySource.)
  const rawSources = leads.map(l => l.Lead_Source).filter(Boolean);
  console.log('[ZohoData] raw Lead_Source values (sample 20):', [...new Set(rawSources)].slice(0, 20));

  // Cross-module audit: every unique Lead_Source value across Leads + DoB,
  // with row counts, sorted by total. The "metaSuspect" column highlights
  // anything that smells like Facebook / Instagram / Meta — useful for
  // discovering legacy / API-written values that aren't in Zoho's picklist.
  const sourceCounts = new Map<string, { leads: number; dob: number }>();
  for (const l of leads) {
    const k = (l.Lead_Source ?? '(null)').trim() || '(empty)';
    const cur = sourceCounts.get(k) ?? { leads: 0, dob: 0 };
    cur.leads++;
    sourceCounts.set(k, cur);
  }
  for (const d of doctorsOnBoard ?? []) {
    const k = ((d as { Lead_Source?: string | null }).Lead_Source ?? '(null)').toString().trim() || '(empty)';
    const cur = sourceCounts.get(k) ?? { leads: 0, dob: 0 };
    cur.dob++;
    sourceCounts.set(k, cur);
  }
  const META_RX = /(facebook|instagram|insta|^fb$|^ig$|meta|messenger|whatsapp)/i;
  const allSourcesAudit = Array.from(sourceCounts.entries())
    .map(([rawValue, c]) => ({
      rawValue,
      leads: c.leads,
      dob: c.dob,
      total: c.leads + c.dob,
      metaSuspect: META_RX.test(rawValue) ? 'YES' : '',
      normalizedTo: displaySource(rawValue === '(null)' || rawValue === '(empty)' ? null : rawValue),
    }))
    .sort((a, b) => b.total - a.total);
  console.log('[ZohoData] all Lead_Source values across Leads + DoB:');
  console.table(allSourcesAudit);
  const metaSuspects = allSourcesAudit.filter(r => r.metaSuspect === 'YES');
  console.log(`[ZohoData] Meta-suspect raw values (${metaSuspects.length}):`);
  console.table(metaSuspects);

  // Hunt for "Doctors Onboarded" / "Converted Doctor" — it isn't in Lead_Status
  // or Deal Stage, so dump Prime_Classification + any other custom-ish field
  // that might be carrying it. If it shows up here, we wire it; if nothing
  // matches, the field hasn't been added to the synced field list yet.
  const primeVals = [...new Set(leads.map(l => (l as { Prime_Classification?: string }).Prime_Classification).filter(Boolean))];
  console.log('[ZohoData] unique Prime_Classification values:', primeVals);

  // ── Source / channel performance ─────────────────────────────────────────
  const sourceGroups = countBy(leads, l => displaySource(l.Lead_Source));
  const channels = Object.entries(sourceGroups)
    .sort((a, b) => b[1] - a[1])
    .map(([channel, doctors]) => {
      const channelDeals = closedWon.filter(d => displaySource(d.Lead_Source) === channel);
      return { channel, doctors, placed: channelDeals.length, cost: 0, cpa: 0 };
    });

  // ── Marketing channel metrics ─────────────────────────────────────────────
  const marketing = channels.map(c => ({
    channel: c.channel,
    doctors: c.doctors,
    placements: c.placed,
    spend: 0,   // Campaigns module not available
    cpa: 0,
    roi: 0,
  }));

  // ── Recruiter performance (built from lead owners, not deals) ────────────
  const outboundCalls    = calls.filter(c => c.Call_Type === 'Outbound');
  const callsByRecruiter = countBy(outboundCalls, c => c.Owner?.name ?? 'Unknown');

  const leadsByOwner: Record<string, ZohoLead[]> = {};
  leads.forEach(l => {
    const name = l.Owner?.name ?? 'Unknown';
    if (!leadsByOwner[name]) leadsByOwner[name] = [];
    leadsByOwner[name].push(l);
  });

  // Per-recruiter "converted" still uses Lead_Status (DoB has no recruiter
   // attribution). Mirrors the old convertedStatuses set we removed when DoB
   // became the company-wide conversion source.
  const convertedStatuses = new Set([
    'Contact in Future',
    'High Priority Follow up',
    'High Priority Follow-up',
    'Closed Won',
  ]);

  const recruiters = Object.entries(leadsByOwner)
    .filter(([name]) => name !== 'Unknown')
    .map(([name, rLeads]) => {
      const rActiveLeads   = rLeads.filter(l => activeStatuses.has(l.Lead_Status));
      const contacted      = rActiveLeads.filter(l => l.Lead_Status !== 'Not Contacted').length;
      const highPri        = rLeads.filter(l => l.Lead_Status === 'High Priority Follow up').length;
      const contactRate    = rActiveLeads.length > 0 ? Math.round((contacted / rActiveLeads.length) * 100) : 0;
      const converted      = rLeads.filter(l => convertedStatuses.has(l.Lead_Status)).length;
      const conversionRate = rLeads.length > 0
        ? parseFloat(((converted / rLeads.length) * 100).toFixed(1))
        : 0;
      return {
        name,
        region:         'GCC',
        doctors:        rLeads.length,
        contacted,
        contactRate,
        converted,
        conversionRate,
        highPriority:   highPri,
        placements:     0,
        revenue:        'N/A',
        calls:          callsByRecruiter[name] ?? 0,
        emails:         emailData.bySender[name] ?? 0,
        score:          conversionRate,
      };
    })
    .sort((a, b) => b.conversionRate - a.conversionRate);

  // ── Leads over time (group by month of Created_Time) ─────────────────────
  const monthBuckets: Record<string, { doctors: number; qualified: number }> = {};
  leads.forEach(l => {
    if (!l.Created_Time) return;                   // skip leads with no timestamp
    const d = new Date(l.Created_Time);
    if (isNaN(d.getTime())) return;                // skip leads with invalid timestamp
    const key = d.toLocaleString('default', { month: 'short', year: '2-digit' });
    if (!monthBuckets[key]) monthBuckets[key] = { doctors: 0, qualified: 0 };
    monthBuckets[key].doctors++;
    if (activeStatuses.has(l.Lead_Status)) monthBuckets[key].qualified++;
  });

  const placedPerMonth = countBy(
    closedWon,
    d => {
      const dt = new Date(d.Closing_Date);
      return dt.toLocaleString('default', { month: 'short', year: '2-digit' });
    }
  );

  const leadsOverTime = Object.entries(monthBuckets)
    .sort((a, b) => new Date('1 ' + a[0]).getTime() - new Date('1 ' + b[0]).getTime())
    .slice(-9)
    .map(([month, vals]) => ({
      month:     month.split(' ')[0],
      doctors:   vals.doctors,
      qualified: vals.qualified,
      placed:    placedPerMonth[month] ?? 0,
    }));

  // ── Finance KPIs ──────────────────────────────────────────────────────────
  const financeMetrics = [
    { label: 'Marketing Spend',      value: 'N/A',                icon: 'dollar' as const, change: 0, period: 'Campaigns module N/A' },
    { label: 'Placement Revenue',    value: fmtAED(totalRevenue), icon: 'dollar' as const, change: 0, period: 'Closed Won deals'      },
    { label: 'Cost per Placement',   value: 'N/A',                icon: 'dollar' as const, change: 0, period: 'needs spend data'      },
    { label: 'Return on Investment', value: 'N/A',                icon: 'dollar' as const, change: 0, period: 'needs spend data'      },
  ];

  // ── Sales metrics ─────────────────────────────────────────────────────────
  // emailsSent is sampled from the 30 most recently contacted leads — real but approximate
  const sales = {
    // Metrics relevant to a recruitment outsourcing company
    totalLeadsManaged: leads.length,
    activeInPipeline:  activeLeads.length,
    contactedRate:     activeLeads.length > 0
      ? parseFloat(((contacted / activeLeads.length) * 100).toFixed(1))
      : 0,
    outboundCalls:     outboundCalls.length,
    emailsSent:        emailData.total,
    followUpsPending:  leads.filter(l => l.Lead_Status === 'High Priority Follow up').length,
    // Kept for backward compat but not meaningful without Deals usage
    dealsClosed:       closedWon.length,
    conversionRate:    deals.length > 0
      ? parseFloat(((closedWon.length / deals.length) * 100).toFixed(1))
      : 0,
    avgCycleTime,
  };

  // ── Real recent activity (most recent calls) ──────────────────────────────
  const recentActivity = calls
    .filter(c => c.Created_Time)
    .sort((a, b) => new Date(b.Created_Time).getTime() - new Date(a.Created_Time).getTime())
    .slice(0, 7)
    .map(c => ({
      action: c.Call_Type === 'Outbound'
        ? 'Outbound call made'
        : c.Call_Type === 'Inbound'
          ? 'Inbound call received'
          : 'Missed call',
      detail: c.Subject || `${c.Call_Status} — by ${c.Owner?.name ?? 'Unknown'}`,
      time:   formatRelativeTime(c.Created_Time),
      type:   (c.Call_Type === 'Missed' ? 'alert' : c.Call_Type === 'Inbound' ? 'lead' : 'interview') as
              'lead' | 'placement' | 'license' | 'alert' | 'interview' | 'document' | 'partnership',
    }));

  // ── Real bottlenecks from Zoho data ──────────────────────────────────────
  const highPriorityLeads  = leads.filter(l => l.Lead_Status === 'High Priority Follow up');
  const noResponseLeads    = leads.filter(l => l.Lead_Status === 'Attempted to Contact');
  const uncontactedLeads   = leads.filter(l => l.Lead_Status === 'Not Contacted');
  const inProgressLicense  = leads.filter(
    l => l.Has_DOH === 'In Progress' || l.Has_DHA === 'In Progress' || l.Has_MOH === 'In Progress'
  );

  function severity(count: number): 'high' | 'medium' | 'low' {
    return count > 20 ? 'high' : count > 5 ? 'medium' : 'low';
  }

  const bottlenecks = [
    {
      area:     'High Priority Follow-ups',
      severity: severity(highPriorityLeads.length),
      avgDelay: '—',
      affected: highPriorityLeads.length,
      detail:   'Leads flagged for urgent follow-up by recruiter',
      leads:    highPriorityLeads,
    },
    {
      area:     'License Applications In Progress',
      severity: severity(inProgressLicense.length),
      avgDelay: 'Ongoing',
      affected: inProgressLicense.length,
      detail:   'Doctors waiting on DOH / DHA / MOH license approval',
      leads:    inProgressLicense,
    },
    {
      area:     'Contact Attempts — No Response',
      severity: severity(noResponseLeads.length),
      avgDelay: '—',
      affected: noResponseLeads.length,
      detail:   'Recruiter attempted contact but doctor has not responded',
      leads:    noResponseLeads,
    },
    {
      area:     'New Applications — Not Yet Contacted',
      severity: severity(uncontactedLeads.length),
      avgDelay: '—',
      affected: uncontactedLeads.length,
      detail:   'Fresh leads that no recruiter has reached out to yet',
      leads:    uncontactedLeads,
    },
  ].filter(b => b.affected > 0) as Array<{
    area: string;
    severity: 'high' | 'medium' | 'low';
    avgDelay: string;
    affected: number;
    detail: string;
    leads: ZohoLead[];
  }>;

  // ── License pipeline overview ─────────────────────────────────────────────
  const dohLeads = { yes: leads.filter(l => l.Has_DOH === 'Yes'), inProgress: leads.filter(l => l.Has_DOH === 'In Progress'), no: leads.filter(l => l.Has_DOH === 'No') };
  const dhaLeads = { yes: leads.filter(l => l.Has_DHA === 'Yes'), inProgress: leads.filter(l => l.Has_DHA === 'In Progress'), no: leads.filter(l => l.Has_DHA === 'No') };
  const mohLeads = { yes: leads.filter(l => l.Has_MOH === 'Yes'), inProgress: leads.filter(l => l.Has_MOH === 'In Progress'), no: leads.filter(l => l.Has_MOH === 'No') };
  const licenseOverview = { doh: dohLeads, dha: dhaLeads, moh: mohLeads };

  // ── Real alerts derived from Zoho data (replaces hardcoded notifications) ──
  const thirtyDaysAgo = Date.now() - 30 * 86_400_000;
  const staleUncontacted = leads.filter(l => l.Lead_Status === 'Not Contacted' && new Date(l.Created_Time).getTime() < thirtyDaysAgo);
  const alerts: Array<{ type: 'warning' | 'info' | 'success'; message: string }> = [];
  if (highPriorityLeads.length > 0) alerts.push({ type: 'warning', message: `${highPriorityLeads.length} doctors need urgent follow-up` });
  if (inProgressLicense.length > 0) alerts.push({ type: 'info', message: `${inProgressLicense.length} license applications currently in progress` });
  if (staleUncontacted.length > 0) alerts.push({ type: 'warning', message: `${staleUncontacted.length} leads uncontacted for over 30 days` });
  if (noResponseLeads.length > 0) alerts.push({ type: 'info', message: `${noResponseLeads.length} contact attempts with no response yet` });

  // ── Real campaigns from Zoho Campaigns module ─────────────────────────────
  const zohoStatusMap: Record<string, 'active' | 'completed' | 'paused'> = {
    'Active':    'active',
    'Inactive':  'paused',
    'Completed': 'completed',
    'Planning':  'paused',
  };

  const campaignsList = campaigns
    .slice(0, 20)   // show 20 most recent
    .map(c => ({
      name:    c.Campaign_Name.length > 65
        ? c.Campaign_Name.slice(0, 62) + '…'
        : c.Campaign_Name,
      channel: 'Email Marketing',
      doctors: 0,               // no reach stats stored in Zoho CRM
      spend:   c.Actual_Cost ?? c.Budgeted_Cost ?? 0,
      status:  zohoStatusMap[c.Status ?? ''] ?? 'active',
    }));

  // ── Raw data (passed through for downstream filtering) ───────────────────
  const rawLeads = leads;
  const rawDeals = deals;
  const rawCalls = calls;
  const rawAccounts = accounts;
  const rawCampaigns = campaigns;

  return {
    kpis,
    leadsOverTime,
    placementFunnel,
    pipelineStages,
    dealStages,
    channels,
    marketing,
    recruiters,
    sales,
    financeMetrics,
    stageConversion,
    recentActivity,
    workflow,
    bottlenecks,
    totalLeads,
    activeLeads:    activeLeads.length,
    qualifiedLeads: qualifiedLeads.length,
    unqualifiedLeads: leads.length - qualifiedLeads.length,
    qualificationRate: +qualificationRate.toFixed(1),
    closedWon:      closedWon.length,
    closedLost:     closedLost.length,
    openDeals:      openDeals.length,
    totalRevenue,
    openPipelineValue,
    weightedPipelineValue,
    conversionRate: +conversionRate.toFixed(2),
    partnerHospitals: accounts.length,
    campaignsList,
    licenseOverview,
    alerts,
    rawLeads,
    rawDeals,
    rawCalls,
    rawAccounts,
    rawCampaigns,
  };
}

// ── React Query hook ─────────────────────────────────────────────────────────

const LEAD_FIELDS = [
  'Full_Name', 'First_Name', 'Last_Name', 'Lead_Status', 'Lead_Source',
  'Owner', 'Specialty', 'Specialty_New', 'Country_of_Specialty_training',
  'Created_Time', 'Has_DOH', 'Has_DHA', 'Has_MOH', 'License',
  'Recruiter', 'Age', 'Prime_Classification',
];

const DEAL_FIELDS = [
  'Deal_Name', 'Stage', 'Amount', 'Owner', 'Closing_Date', 'Lead_Source', 'Created_Time',
];

const CALL_FIELDS = [
  'Subject', 'Call_Type', 'Call_Status', 'Owner', 'Created_Time',
];

const ACCOUNT_FIELDS = [
  'Account_Name', 'Industry', 'Owner',
];

const CAMPAIGN_FIELDS = [
  'Campaign_Name', 'Type', 'Status', 'Start_Date', 'End_Date',
  'Budgeted_Cost', 'Actual_Cost', 'Owner',
];

function parseCacheRow(row: { data: unknown; synced_at: string }) {
  const { leads, deals, calls, accounts, campaigns, doctorsOnBoard, emailData } = row.data as {
    leads: ZohoLead[]; deals: ZohoDeal[]; calls: ZohoCall[];
    accounts: ZohoAccount[]; campaigns: ZohoCampaign[];
    doctorsOnBoard?: ZohoDoctorOnBoard[];
    emailData?: { total: number; bySender: Record<string, number>; sampled: number };
  };
  // Quick visibility for the new module — print Lead_Source distribution as
  // a table, with the normalized channel each value resolves to.
  // Pass the RAW value (including null) through displaySource so the log
  // matches what the rest of the dashboard sees.
  const dobBuckets = new Map<string, { rawSamples: Set<string>; count: number; normalized: string }>();
  for (const d of doctorsOnBoard ?? []) {
    const raw = (d as { Lead_Source?: string | null }).Lead_Source ?? null;
    const normalized = displaySource(raw);
    const cur = dobBuckets.get(normalized) ?? { rawSamples: new Set<string>(), count: 0, normalized };
    cur.count++;
    cur.rawSamples.add(raw === null ? "(null)" : raw);
    dobBuckets.set(normalized, cur);
  }
  console.log(`[ZohoData] doctorsOnBoard rows: ${doctorsOnBoard?.length ?? 0}`);
  const dobTable = Array.from(dobBuckets.values())
    .sort((a, b) => b.count - a.count)
    .map(r => ({ channel: r.normalized, count: r.count, rawValues: [...r.rawSamples].slice(0, 4).join(", ") }));
  console.table(dobTable);
  console.log(`[ZohoData] doctorsOnBoard rows attributed to Meta: ${dobBuckets.get("Meta")?.count ?? 0}`);

  // FULL audit: every unique raw Lead_Source value in DoB with counts, so we
  // can reconcile against Zoho's picklist filter (which only sees current
  // picklist values, not legacy/API-written ones).
  const dobRawCounts: Record<string, number> = {};
  for (const d of doctorsOnBoard ?? []) {
    const raw = (d as { Lead_Source?: string | null }).Lead_Source;
    const key = raw === null || raw === undefined ? '(null)' : raw;
    dobRawCounts[key] = (dobRawCounts[key] ?? 0) + 1;
  }
  const dobRawTable = Object.entries(dobRawCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([rawValue, count]) => ({ rawValue, count, normalizedTo: displaySource(rawValue === '(null)' ? null : rawValue) }));
  console.log('[ZohoData] DoB Lead_Source — every unique raw value:');
  console.table(dobRawTable);
  const aggregated = aggregateZohoData(leads, deals, calls, accounts, campaigns,
    emailData ?? { total: 0, bySender: {} as Record<string, number>, sampled: 0 },
    doctorsOnBoard ?? []);
  const result = {
    ...aggregated,
    rawDoctorsOnBoard: doctorsOnBoard ?? [],
    syncedAt: row.synced_at,
  };
  console.log(`[ZohoData] parseCacheRow returning — rawLeads:${(result as { rawLeads?: unknown[] }).rawLeads?.length ?? 'MISSING'} keys:[${Object.keys(result).join(', ')}]`);
  return result;
}

export function useZohoData() {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['zoho-data'],
    queryFn: async () => {
      // The cache is split across TWO rows in zoho_cache (was hitting
      // statement-timeout when stored as one). Row 1 = leads, Row 2 = the rest.
      // Both rows share a synced_at; we merge them client-side before parsing.
      const fetchMerged = async (): Promise<{ data: unknown; synced_at: string } | null> => {
        const { data: rows, error } = await supabase
          .from('zoho_cache')
          .select('id, data, synced_at')
          .in('id', [1, 2]);
        if (error) console.warn('[ZohoData] cache fetch error:', error.message);
        if (!rows || rows.length === 0) {
          console.warn('[ZohoData] zoho_cache returned no rows for ids [1,2]');
          return null;
        }
        const merged: Record<string, unknown> = {};
        let synced = '';
        const seenIds: number[] = [];
        for (const r of rows as Array<{ id: number; data: Record<string, unknown>; synced_at: string }>) {
          seenIds.push(r.id);
          if (r.data) {
            const keys = Object.keys(r.data);
            const counts = Object.fromEntries(keys.map(k => [k, Array.isArray(r.data[k]) ? (r.data[k] as unknown[]).length : typeof r.data[k]]));
            console.log(`[ZohoData] cache row id=${r.id} synced=${r.synced_at} keys=`, counts);
            Object.assign(merged, r.data);
          }
          if (r.synced_at && r.synced_at > synced) synced = r.synced_at;
        }
        console.log(`[ZohoData] merged keys: ${Object.keys(merged).join(', ')} | rows: ${seenIds.join(', ')}`);
        if (!synced) return null;
        return { data: merged, synced_at: synced };
      };

      // ── Fast path: cache exists, return it ──
      const cached = await fetchMerged();
      if (cached) {
        const isStale = Date.now() - new Date(cached.synced_at).getTime() > CACHE_MAX_AGE_MS;
        if (isStale) {
          zohoSync()
            .then(() => queryClient.invalidateQueries({ queryKey: ['zoho-data'] }))
            .catch(() => {});
        }
        return parseCacheRow(cached);
      }

      // ── No cache: fire server-side sync, poll until both rows arrive ──
      zohoSync().catch(() => {});
      for (let i = 0; i < 20; i++) {
        await new Promise<void>(r => setTimeout(r, 3000));
        const poll = await fetchMerged();
        if (poll) return parseCacheRow(poll);
      }
      throw new Error('Initial Zoho sync timed out — try refreshing');
    },
    staleTime:            55 * 60 * 1000,
    gcTime:               4 * 60 * 60 * 1000,
    placeholderData:      (prev: unknown) => prev,
    retry:                2,
    retryDelay:           5_000,
    refetchOnWindowFocus: false,
  });
}
