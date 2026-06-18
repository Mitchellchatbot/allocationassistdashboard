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

// ── Static system reference ─────────────────────────────────────────────
// Plain-English description of every page, flow, action, and term in the
// dashboard. Cached with the rest of the system prompt (ephemeral cache)
// so the AI can answer "how do I do X" / "what does this button do"
// questions without us paying tokens for the same text on every request.
//
// Whenever a new page or flow ships, update this — the AI's "manual"
// stays accurate with one edit.
const SYSTEM_REFERENCE = `
=== SYSTEM REFERENCE: HOW THE DASHBOARD WORKS ===

WHO USES IT
- HI (Hospital Introduction) team — 4 people: Rodaina Thabit, Mohamed Othman, Sohaila Mohamed, Ishak Boulaat. They move doctors from "applied" to "joined hospital".
- Sales team — talks to incoming leads. Logs calls, qualifies, hands over to HI.
- Admins — operations leadership. See everything.
- Workers — narrow sales-tracker view only.

ROLE-BASED ACCESS
- hi_member: lands on /my-workspace. Pages allowed: /, /my-workspace, /automations, /doctor-profiles, /vacancies, /batches, /reports.
- admin: every page.
- sales: dashboard + sales + marketing + leads-pipeline + team + calls.
- worker: only /worker.
- finance: dashboard + /finance.

PAGES
- /                  Dashboard. Top KPIs, lead funnel, channel breakdown, pending-actions card.
- /my-workspace      HI team member's home base. Tasks assigned to them, their doctors, their vacancies, recent activity, scoped notifications. Default landing for hi_member role.
- /automations       The 6 HI flows (Onboarding was removed 2026-06-03 — Sales now sends the intake email from Zoho directly on lead→Doctor-on-Board conversion). "Flow" tabs show active runs per flow. "Queues" admin tab surfaces every active run sitting at a manual-action stage. "Hospitals", "Templates", "Default Flow Editor" tabs configure the engine.
- /doctor-profiles   Editor for doctor profile records — bio, specialty, license info, CV upload. Profile completion % drives readiness to send. CV parsing happens via Claude. Per-doctor "Lifecycle" timeline + "Vacancy Matches" panel underneath the profile editor.
- /vacancies         Open hospital roles with priority (high/medium/low). Click any row to see matching candidates in TWO tabs: "Onboarded doctors" (auto-scored from the ~1k AA roster) and "Leads" (manually filled by Sales — empty until Sales links them via Sales Pipeline).
- /batches           Recurring sends, COUNTRY-SCOPED (Ammar 2026-06-03): each batch picks ONE country (UAE / Saudi Arabia / Qatar / Oman / Kuwait / Bahrain) and only sends to hospitals in that country. Kinds: Daily duo (Mon-Fri, 2 profiles), Tuesday top 15, Specialty of the day (Wed-Fri). Rotation cycles the ~67 canonical specialties from the AA website.
- /reports           HI KPIs per team member, weekly + monthly recap (Shortlisted / Interviewed / Offered / Signed / Joined trending — counted PER (doctor, hospital) attempt, not per doctor), Placements table (per-(doctor, hospital) row; replaces Ammar's "Hammad" sheet; bulk-import-from-CSV button + 'New placement' picker pulls doctors from Zoho; 45-day payment clock), Per-doctor table, Hospital relationship health.
- /contracts         Build + send contracts to doctors via BoldSign. Real recipients (not test mode).
- /sales             Sales tracker with recruiter performance + lead pipeline + SLA breach indicators.
- /leads-pipeline    Per-doctor stage view across the full pipeline. License status (DOH/DHA/MOH). Click "Link to vacancy" in expanded row to attach to an open role.
- /marketing         Channel attribution (Meta / Website / LinkedIn / Referrals / etc.). Meta override cross-references emails to fix XXXX → Meta mis-tagging.
- /meta-ads          Live Facebook Marketing API: spend, CPL, campaign ROI.
- /finance           Revenue tracker — Closed Won deals, pipeline value, deal stages.
- /team              Recruiter workload — who has the most leads + contact rate + high-priority follow-ups.
- /connections       Wire Google Sheets / Excel files to dashboard tables. Pulls every hour via tick-scheduler.
- /import-bulk       One-shot CSV imports for the 6 sheet types.
- /settings          User management — invite users, set roles, set allowed pages.

THE 6 ACTIVE AUTOMATION FLOWS (Onboarding removed 2026-06-03)
1. profile_sent — fires when team clicks "Send Profile" on a doctor. Each hospital recipient gets the magazine-style email with a tokenised "View full profile" link to /shared-profile/<token> (90-day, revocable, view-count tracked). Also notifies the doctor. 7-day wait, then flagged. If hospital reply is classified as "shortlisted" the team sees a yellow SUGGESTION card on the run — they confirm manually (Ammar 2026-06-03: hospitals rarely write "shortlisted" — usually a phone call).
2. shortlist — fires when team clicks "Mark shortlisted" on the suggestion card OR triggers manually. Sends shortlist-confirmation email to the doctor.
3. interview — fires when team logs interview confirmed (with date/time/format). Sends combined tips + confirmation email to the doctor. 72h post-interview, system flags a chase reminder.
4. contract_signing — fires when offer is extended. Opens Contract Builder (BoldSign envelope). When the doctor signs, boldsign-webhook auto-fires the relocation flow. Per Ammar: the actual offer is hospital↔doctor — HI tracks the milestones (offered_at / signed_at / start_date / joined_at) on the Placements tab in Reports.
5. relocation — fires after contract signed. Team picks the doctor's city → system pulls the city-specific guide URL from relocation_articles table and embeds it as a prominent CTA in the email.
6. second_payment — fires +15d after joining_date is logged. Reminder cadence: 25 working days, day-before-due, weekly post-due until paid (escalates to FINAL letter). 45-day clock: invoice is due 45d after joined_at — surfaced on Placements as a per-row pill (Paid / N days left / Due in 15d / Overdue).

KEY ACTIONS / BUTTONS
- "New batch" (Batches): creates a new daily/Tuesday/specialty batch and immediately swaps into the doctor-picker. Auto-pick top N ranks by readiness (CV uploaded, license info, recency).
- "Resend" (Batches, past sends): re-fires the same batch to the same hospitals. Asks for confirmation.
- "Cancel" (Batches, draft): deletes the batch outright. Tick-scheduler won't fire it.
- "Send Profile" (Automations): 3-step wizard — pick doctor → select hospital(s) → preview → send. Multi-hospital uses BCC.
- "Hospital replied?" (Run detail sheet, profile_sent): paste the hospital's reply text. Claude classifies (shortlisted / declined / wants more info / proposing interview times). For "shortlisted" the run is NOT auto-advanced — instead a yellow SUGGESTION card appears with "Mark shortlisted" / "Not shortlisted" buttons (Ammar 2026-06-03: most shortlists happen by phone, classifier is just a hint).
- "Mark shortlisted" (Run detail sheet, on suggestion card): manually confirms hospital interest. Completes profile_sent, creates shortlist run, fires shortlist confirmation email to the doctor.
- "Edit milestones" (Placements row): opens a date-picker dialog for shortlisted_at / interviewed_at / offered_at / signed_at / start_date / joined_at / paid_at + placement hospital. Replaces Ammar's external "Hammad" sheet entirely.
- "Pick city" (Run detail sheet, relocation): chooses which city's relocation guide to send.
- "Reassign" (Run detail sheet, queue rows): dropdown with the 4 HI members + Unassigned. Updates assigned_to and logs a note in the timeline.
- "Link to vacancy" (Leads Pipeline expanded row): attach this lead to an open vacancy. Inserts into vacancy_lead_links so HI sees the candidate.
- "Sync now" (Connections row): force-re-pull a Google Sheet immediately, ignoring the cadence.
- "Connect Google" (Connections): OAuth flow that grants Sheets + Drive read access. Once connected, sheets can be wired via the searchable picker.
- "Run scheduler" (Automations header): manually fires the same job pg_cron runs every 5 min. Useful when you've just made a change and want to see it advance immediately.

GLOSSARY
- "stale" — an active flow run with no event in 7+ days. Surfaced in PendingActionsCard / My Workspace.
- "assigned_to" — who's responsible for the next action on a run. Auto-derived from the hospital's owner_email when the run is created, falls back to created_by. Editable via Reassign.
- "created_by" — who started the run. Never changes once set.
- "doctors on the way" — signed but not joined yet. Per-doctor reminders + weekly digest (in progress).
- "active runs" — status = 'active'. The run is in flight; tick-scheduler may still advance it.
- "queue" — UI view of runs at a manual-action stage. Distinct from flow tab, which shows all runs for that flow.
- "Mine / All team" toggle (Queues) — defaults to "Mine" for hi_member, "All" for admins.
- "Daily duo" — Mon-Fri 10:30 AM COUNTRY-SCOPED batch: 2 doctors → all hospitals in the chosen country (UAE / KSA / Qatar / Oman / Kuwait / Bahrain) via BCC. Create one batch per country per day.
- "Specialty of the day" — Wed-Fri batch rotating through ~67 canonical specialties from the AA website list (cursor auto-advances after each send). Replaces the old Zoho-bucketed list Ammar called "very wrong".
- "Canonical specialty" — every Zoho free-text specialty resolves to one of ~135 entries via groupSpecialty(). Sub-specialties roll up to a parent (e.g. "Retinal Specialist" → Ophthalmology; "Pediatric Cardiology" → Cardiology). The scorer uses this for fuzzy matching when doctor.speciality and vacancy.specialty don't match exactly.
- "Hospital health score" — 0–100 number per hospital. Warming = trending up. Cooling = trending down. Triggers relationship-health flags in Reports.
- "Placements" — Reports section replacing Ammar's "Hammad" Google sheet. Per-(doctor, hospital) attempts (one doctor at 4 hospitals = 4 rows). Stored in placement_attempts table; NOT connected to Zoho. CSV import handles the weekly multi-section format. Click any row to edit milestones; 45-day-clock pill counts down from joined_at.
- "Shared profile token" — every profile_sent send mints a 90-day token at /shared-profile/<token>. View-count and last-viewed are tracked on shared_profile_tokens so the team sees whether a hospital opened the link. Tokens can be revoked.
- "Test recipient override" — MAIL_TEST_RECIPIENT_OVERRIDE env var on send-batch + send-flow-email. Comma-separated; routes test sends to the configured test inbox (first → To, rest → Cc). Ammar is no longer CC'd (he left the team — stripped in code even if still listed in the env var). Contracts via BoldSign do NOT honor the override — they go to real doctors.

NAVIGATION TIPS
- Cmd/Ctrl+K opens Universal Search across all entities (doctors, vacancies, flows, hospitals, batches, templates, pages).
- Floating AI button (bottom right) opens this assistant. Closes via the X in the panel header.
- Sidebar groups: Overview, Hospital Introduction, Sales, Growth, Admin. Each header is collapsible; HI/Admin collapsed by default.
- The user is on the page: ${`{currentPage}`}. Tailor answers to that page when possible.

WHEN USERS ASK "HOW DO I..."
- Answer concretely: "Go to /vacancies, click the row, hit 'Link to vacancy' in the candidates panel."
- Reference exact button labels, not paraphrases.
- If a feature isn't built yet, say so plainly and point at the closest existing affordance.
- If access is gated by role, mention it: "Only admins see this — you're on hi_member."
`;

const PAGE_LABELS: Record<string, string> = {
  '/':                 'Dashboard (Overview)',
  '/my-workspace':     'My Workspace',
  '/sales':            'Sales Tracker',
  '/marketing':        'Marketing',
  '/leads-pipeline':   'Doctor Progress',
  '/team':             'Team Performance',
  '/finance':          'Finance',
  '/operations':       'Operations & Roadmap',
  '/meta-ads':         'Meta Ads',
  '/contracts':        'Contracts',
  '/settings':         'Settings',
  '/automations':      'Automations (HI flows)',
  '/doctor-profiles':  'Doctor Profiles',
  '/vacancies':        'Vacancies',
  '/batches':          'Batch Sends',
  '/reports':          'HI Reports',
};

const PAGE_FOCUS: Record<string, string> = {
  '/':                 'Summarise overall pipeline health, top KPIs, and the most urgent items across all areas.',
  '/my-workspace':     'Focus on what is assigned to the current HI team member — tasks waiting, doctors they own, vacancies they own, recent activity. Use the HI WORKFLOW section.',
  '/sales':            'Focus on recruiter performance — lead ownership, contact rates, high-priority follow-ups, and pipeline progress per recruiter.',
  '/marketing':        'Focus on lead sources and channel performance — which sources bring the most and best-quality doctors.',
  '/leads-pipeline':   'Focus on individual doctor progress — which stage each is at, license status (DOH/DHA/MOH), and bottlenecks.',
  '/team':             'Focus on recruiter workload — who has the most leads, highest contact rate, and most high-priority follow-ups.',
  '/finance':          'Focus on revenue and deal stages — Closed Won revenue, open pipeline value, and deal progression.',
  '/operations':       'Focus on the license pipeline (DOH/DHA/MOH status) and operational bottlenecks in the recruitment process.',
  '/meta-ads':         'Focus on Meta advertising performance — spend, CPL, campaign ROI, top-performing ads. Prioritise the Meta Ads data section.',
  '/contracts':        'Focus on contract status, parties, values, and upcoming renewals using the Contracts data below.',
  '/automations':      'Focus on active flow runs across the 7 HI automation flows — what is stuck, what is overdue, what is pending team action. Use the HI WORKFLOW section.',
  '/doctor-profiles':  'Focus on doctor profile completeness, CV upload status, and which doctors are ready to be sent to hospitals. Use the HI WORKFLOW section.',
  '/vacancies':        'Focus on open vacancies by priority, days open, and which doctors match each. Use the HI WORKFLOW section.',
  '/batches':          'Focus on recurring batch sends — Daily duo, Tuesday top 15, Specialty of the day. Recent history and what is queued. Use the HI WORKFLOW section.',
  '/reports':          'Focus on HI team KPIs per member + hospital relationship health. Use the HI WORKFLOW section.',
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

// ── Hospital Introduction workflow data ─────────────────────────────────
// These power the AI's awareness of the automation engine — what's stuck,
// who owns what, which hospitals are warming, what's in the send queue.

interface FlowRun {
  id: string; flow_key: string; doctor_name: string | null;
  hospital: string | null; current_stage: string; status: string;
  started_at: string; last_event_at: string; completed_at: string | null;
  created_by: string | null; assigned_to: string | null;
}

interface Vacancy {
  id: string; hospital_name: string; specialty: string;
  priority: string; status: string; opened_at: string;
  opened_by: string | null; city: string | null;
}

interface BatchSend {
  id: string; kind: string; status: string;
  scheduled_for: string; specialty: string | null;
  doctor_ids: string[] | null; hospital_count: number | null;
  sent_at: string | null; created_by: string | null;
}

interface NotificationRow {
  id: string; kind: string; title: string;
  related_run_id: string | null; related_vacancy_id: string | null;
  for_user: string | null; read_at: string | null;
  created_at: string;
}

interface HospitalRow {
  name: string; city: string | null; country: string | null;
  active: boolean | null; owner_email: string | null;
  health_score: number | null; primary_recruiter_email: string | null;
}

interface DoctorLifecycle {
  doctor_id: string; doctor_name: string | null;
  signed_at: string | null; joined_at: string | null;
  approved_at: string | null; paid_at: string | null;
  unavailable: boolean | null;
}

async function loadFlowRuns(): Promise<FlowRun[]> {
  const { data } = await supabase
    .from('automation_flow_runs')
    .select('id, flow_key, doctor_name, hospital, current_stage, status, started_at, last_event_at, completed_at, created_by, assigned_to')
    .order('last_event_at', { ascending: false })
    .limit(500);
  return (data ?? []) as FlowRun[];
}

async function loadVacancies(): Promise<Vacancy[]> {
  const { data } = await supabase
    .from('vacancies')
    .select('id, hospital_name, specialty, priority, status, opened_at, opened_by, city')
    .order('opened_at', { ascending: false })
    .limit(200);
  return (data ?? []) as Vacancy[];
}

async function loadBatchSends(): Promise<BatchSend[]> {
  const { data } = await supabase
    .from('scheduled_batch_sends')
    .select('id, kind, status, scheduled_for, specialty, doctor_ids, hospital_count, sent_at, created_by')
    .order('scheduled_for', { ascending: false })
    .limit(60);
  return (data ?? []) as BatchSend[];
}

async function loadOpenNotifications(): Promise<NotificationRow[]> {
  const { data } = await supabase
    .from('notifications')
    .select('id, kind, title, related_run_id, related_vacancy_id, for_user, read_at, created_at')
    .is('dismissed_at', null)
    .order('created_at', { ascending: false })
    .limit(200);
  return (data ?? []) as NotificationRow[];
}

async function loadHospitalsSummary(): Promise<HospitalRow[]> {
  const { data } = await supabase
    .from('hospitals')
    .select('name, city, country, active, owner_email, health_score, primary_recruiter_email')
    .order('updated_at', { ascending: false })
    .limit(300);
  return (data ?? []) as HospitalRow[];
}

async function loadDoctorLifecycles(): Promise<DoctorLifecycle[]> {
  const { data } = await supabase
    .from('doctor_lifecycle')
    .select('doctor_id, doctor_name, signed_at, joined_at, approved_at, paid_at, unavailable')
    .order('updated_at', { ascending: false })
    .limit(300);
  return (data ?? []) as DoctorLifecycle[];
}

// Newer entities added so the AI has visibility into everything the team
// actually touches day-to-day — not just the Zoho mirror.

interface FormResponseRow {
  id: string; form_id: string; respondent_email: string | null;
  doctor_id: string | null; outreach_status: string | null;
  outreach_owner: string | null; next_followup_at: string | null;
  submitted_at: string;
}

interface WpCandidateRow {
  id: number; full_name: string | null; email: string | null;
  phone: string | null; specialty: string | null; subspecialty: string | null;
  years_experience: number | null; current_location: string | null;
  status: string | null; doctor_id: string | null;
  wp_link: string | null;
}

interface CallLogRow {
  id: string; call_date: string; doctor_name: string | null;
  doctor_email: string | null; status: string | null;
  qualifications: string | null; specialty: string | null;
  years_experience: number | null;
}

interface PlacementRow {
  id: string; doctor_name: string | null; hospital_name: string | null;
  specialty: string | null; shortlisted_at: string | null;
  interviewed_at: string | null; offered_at: string | null;
  signed_at: string | null; start_date: string | null;
  joined_at: string | null; paid_at: string | null;
}

interface VacancyLinkRow {
  vacancy_id: string; lead_id: string | null;
  doctor_name: string | null; linked_at: string;
}

async function loadFormResponses(): Promise<FormResponseRow[]> {
  const { data } = await supabase
    .from('form_responses')
    .select('id, form_id, respondent_email, doctor_id, outreach_status, outreach_owner, next_followup_at, submitted_at')
    .order('submitted_at', { ascending: false })
    .limit(400);
  return (data ?? []) as FormResponseRow[];
}

async function loadWpCandidates(): Promise<WpCandidateRow[]> {
  const { data } = await supabase
    .from('wordpress_candidates')
    .select('id, full_name, email, phone, specialty, subspecialty, years_experience, current_location, status, doctor_id, wp_link')
    .order('wp_modified', { ascending: false, nullsFirst: false })
    .limit(500);
  return (data ?? []) as WpCandidateRow[];
}

async function loadRecentCalls(): Promise<CallLogRow[]> {
  const { data } = await supabase
    .from('call_log')
    .select('id, call_date, doctor_name, doctor_email, status, qualifications, specialty, years_experience')
    .order('call_date', { ascending: false })
    .limit(200);
  return (data ?? []) as CallLogRow[];
}

async function loadPlacements(): Promise<PlacementRow[]> {
  const { data } = await supabase
    .from('placement_attempts')
    .select('id, doctor_name, hospital_name, specialty, shortlisted_at, interviewed_at, offered_at, signed_at, start_date, joined_at, paid_at')
    .order('updated_at', { ascending: false })
    .limit(200);
  return (data ?? []) as PlacementRow[];
}

async function loadVacancyLinks(): Promise<VacancyLinkRow[]> {
  const { data } = await supabase
    .from('vacancy_lead_links')
    .select('vacancy_id, lead_id, doctor_name, linked_at')
    .order('linked_at', { ascending: false })
    .limit(300);
  return (data ?? []) as VacancyLinkRow[];
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

// ── Portal digest ────────────────────────────────────────────────────────────
// A structured executive summary across the WHOLE portal, built from the same
// full snapshot the chat assistant uses. On-demand (one Claude call per click).
const DIGEST_SECTIONS = ['metrics', 'pipeline', 'marketing', 'operations', 'attention'] as const;

async function runPortalDigest(contextBlock: string): Promise<Response> {
  const jsonResp = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  const prompt = `You are the chief-of-staff for Allocation Assist, a company that places UK/Western-trained doctors into Gulf (UAE, Saudi, Qatar) hospital jobs. Below is a full snapshot of the ENTIRE portal right now — lead pipeline, recruiter performance, deals/revenue, the license pipeline, contracts, the Hospital Introduction workflow, ads, and more.

Write a concise executive DIGEST of what's going on across the whole business — the things a founder should know at a glance. Be specific: cite real numbers, recruiter names, hospitals, deal stages, and amounts from the data. Skip anything generic that would be true of any business.

Respond with ONLY a JSON object (no markdown, no code fences) of exactly this shape:
{
  "headline": "2-3 sentence plain-English state of the business right now",
  "metrics": ["the handful of numbers that matter most this moment — each a short 'Label: value' string"],
  "pipeline": ["lead + recruitment pipeline: volume, qualified vs converted, who's performing, where leads stall"],
  "marketing": ["ad spend / lead-source / channel observations — what's working vs not"],
  "operations": ["hospital introductions, contracts, placements, doctors on board, licensing progress"],
  "attention": ["what needs attention RIGHT NOW — risks, stalled deals, failures, overdue follow-ups, anything off"]
}
Each array: 2-6 short, specific bullet strings (one sentence each). Use an empty array for a section with nothing real to say. Output JSON only.

=== PORTAL SNAPSHOT ===
${contextBlock}`;

  try {
    const msg = await anthropic.messages.create({
      model:      'claude-opus-4-6',
      max_tokens: 4000,
      messages:   [{ role: 'user', content: prompt }],
    });
    const raw = msg.content.map(c => (c.type === 'text' ? c.text : '')).join('').trim();
    let cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const first = cleaned.indexOf('{');
    const last  = cleaned.lastIndexOf('}');
    if (first >= 0 && last > first) cleaned = cleaned.slice(first, last + 1);

    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const out: Record<string, unknown> = {
      ok:       true,
      headline: typeof parsed.headline === 'string' ? parsed.headline.trim() : '',
    };
    for (const k of DIGEST_SECTIONS) {
      out[k] = Array.isArray(parsed[k])
        ? (parsed[k] as unknown[]).map(x => String(x).trim()).filter(Boolean).slice(0, 8)
        : [];
    }
    return jsonResp(out);
  } catch (e) {
    console.error('[ai-insights digest] failed:', (e as Error).message);
    return jsonResp({ ok: false, reason: `Digest failed: ${(e as Error).message}` }, 502);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  let body: {
    messages?:    Array<{ role: string; content: string }>;
    currentPage?: string;
    pageData?:    Record<string, unknown> | null;
    mode?:        string;
  } = {};
  try { body = await req.json(); } catch { /* use defaults */ }

  const incoming    = body.messages    ?? [];
  const currentPage = body.currentPage ?? '/';
  const pageData    = body.pageData    ?? null;
  const mode        = body.mode        ?? 'chat';

  const pageLabel = PAGE_LABELS[currentPage] ?? currentPage;
  const pageFocus = PAGE_FOCUS[currentPage]  ?? 'Answer the user\'s question using the data below.';

  const userTexts = [...incoming].reverse()
    .filter(m => m.role === 'user')
    .map(m => m.content);

  // ── Load all data in parallel ─────────────────────────────────────────────
  const [
    { leads: allLeads, deals: allDeals },
    contracts,
    flowRuns,
    vacancies,
    batches,
    notifications,
    hospitals,
    lifecycles,
    formResponses,
    wpCandidates,
    recentCalls,
    placements,
    vacancyLinks,
  ] = await Promise.all([
    loadZohoCache(),
    loadContracts(),
    loadFlowRuns(),
    loadVacancies(),
    loadBatchSends(),
    loadOpenNotifications(),
    loadHospitalsSummary(),
    loadDoctorLifecycles(),
    loadFormResponses(),
    loadWpCandidates(),
    loadRecentCalls(),
    loadPlacements(),
    loadVacancyLinks(),
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

  // ── Hospital Introduction workflow summary ──────────────────────────────
  // Compact text rep of every signal that drives the HI module so the AI
  // can answer questions like:
  //   "Who has the most stale runs?"
  //   "Which hospitals are warming?"
  //   "What's in the next batch send?"
  //   "How many doctors need a city picked?"
  // Reuse the outer `now` (Date) declared above for monthly counts —
  // JS coerces Date to ms in arithmetic so `now - ms` works.
  const active   = flowRuns.filter(r => r.status === 'active');
  const completed = flowRuns.filter(r => r.status === 'completed');
  const failed   = flowRuns.filter(r => r.status === 'failed');
  const stale    = active.filter(r => now - new Date(r.last_event_at).getTime() > 7 * 86_400_000);

  // Per-flow breakdown
  const byFlow: Record<string, { active: number; stale: number; completed: number; failed: number }> = {};
  for (const r of flowRuns) {
    const k = r.flow_key;
    if (!byFlow[k]) byFlow[k] = { active: 0, stale: 0, completed: 0, failed: 0 };
    if (r.status === 'active')    byFlow[k].active++;
    if (r.status === 'completed') byFlow[k].completed++;
    if (r.status === 'failed')    byFlow[k].failed++;
  }
  for (const r of stale) byFlow[r.flow_key].stale++;

  // Per HI team member
  const HI_ROSTER = [
    { name: 'Rodaina Thabit',  email: 'rodaina@allocationassist.com' },
    { name: 'Mohamed Othman',  email: 'mohamed.othman@allocationassist.com' },
    { name: 'Sohaila Mohamed', email: 'sohaila@allocationassist.com' },
    { name: 'Ishak Boulaat',   email: 'ishak@allocationassist.com' },
  ];
  const perMember = HI_ROSTER.map(m => {
    const mine = active.filter(r => (r.assigned_to ?? '').toLowerCase() === m.email);
    const mineStale = mine.filter(r => now - new Date(r.last_event_at).getTime() > 7 * 86_400_000);
    const mineHospitals = hospitals.filter(h => (h.owner_email ?? '').toLowerCase() === m.email).length;
    const myVacancies = vacancies.filter(v =>
      v.status === 'open' && (v.opened_by ?? '').toLowerCase() === m.email
    ).length;
    return { name: m.name, active: mine.length, stale: mineStale.length, hospitals: mineHospitals, openVacancies: myVacancies };
  });

  // Vacancy stats
  const openVacancies = vacancies.filter(v => v.status === 'open');
  const vacByPriority = {
    high:   openVacancies.filter(v => v.priority === 'high').length,
    medium: openVacancies.filter(v => v.priority === 'medium').length,
    low:    openVacancies.filter(v => v.priority === 'low').length,
  };
  const staleVacancies = openVacancies.filter(v => now - new Date(v.opened_at).getTime() > 7 * 86_400_000);

  // Batch send stats
  const today = new Date().toISOString().slice(0, 10);
  const upcomingBatches = batches.filter(b => b.scheduled_for >= today && b.status !== 'cancelled');
  const sentBatches     = batches.filter(b => b.status === 'sent');
  const draftBatches    = batches.filter(b => b.status === 'draft');

  // Notification stats
  const unreadNotifs = notifications.filter(n => !n.read_at);
  const notifByKind: Record<string, number> = {};
  for (const n of notifications) notifByKind[n.kind] = (notifByKind[n.kind] ?? 0) + 1;

  // Hospital stats
  const activeHospitals   = hospitals.filter(h => h.active !== false);
  const pausedHospitals   = hospitals.filter(h => h.active === false);
  const withRecruiter     = hospitals.filter(h => !!h.primary_recruiter_email).length;
  const topHealth = hospitals
    .filter(h => h.health_score != null)
    .sort((a, b) => (b.health_score ?? 0) - (a.health_score ?? 0))
    .slice(0, 5);
  const bottomHealth = hospitals
    .filter(h => h.health_score != null)
    .sort((a, b) => (a.health_score ?? 0) - (b.health_score ?? 0))
    .slice(0, 5);

  // Lifecycle: signed-not-joined, joined-not-approved counters
  const signedNotJoined = lifecycles.filter(l => l.signed_at && !l.joined_at).length;
  const joinedNotApproved = lifecycles.filter(l => l.joined_at && !l.approved_at).length;
  const unavailableCount = lifecycles.filter(l => l.unavailable).length;

  // ── New entity rollups ─────────────────────────────────────────────────
  const formByStatus: Record<string, number> = {};
  for (const fr of formResponses) {
    const k = fr.outreach_status ?? 'new';
    formByStatus[k] = (formByStatus[k] ?? 0) + 1;
  }
  const formsLinkedToDoctor   = formResponses.filter(f => !!f.doctor_id).length;
  const formsAwaitingFollowup = formResponses.filter(f => f.next_followup_at && new Date(f.next_followup_at!).getTime() < now).length;

  const wpByStatus: Record<string, number> = {};
  for (const c of wpCandidates) {
    const k = c.status ?? 'unknown';
    wpByStatus[k] = (wpByStatus[k] ?? 0) + 1;
  }
  const wpUnlinked = wpCandidates.filter(c => !c.doctor_id).length;

  const callByStatus: Record<string, number> = {};
  for (const c of recentCalls) {
    const k = (c.status ?? '—').toLowerCase();
    callByStatus[k] = (callByStatus[k] ?? 0) + 1;
  }
  const highPotentialCalls = recentCalls.filter(c => (c.status ?? '').toLowerCase() === 'high potential').length;
  const declinedCalls       = recentCalls.filter(c => (c.status ?? '').toLowerCase() === 'declined').length;

  // Placements 45-day clock buckets
  const placementsPaid       = placements.filter(p => !!p.paid_at).length;
  const placementsAwaitingPayment = placements.filter(p => p.joined_at && !p.paid_at).length;
  const placementsOverdue    = placements.filter(p => {
    if (!p.joined_at || p.paid_at) return false;
    const due = new Date(p.joined_at).getTime() + 45 * 86_400_000;
    return now > due;
  }).length;

  const vacanciesWithCandidates = new Set(vacancyLinks.map(v => v.vacancy_id)).size;

  // Compact text rep — kept tight so we don't blow the token budget.
  const FLOW_LABELS: Record<string, string> = {
    onboarding:       'Onboarding (welcome + form)',
    profile_sent:     'Profile sent to hospital',
    shortlist:        'Shortlist confirmation',
    interview:        'Interview tips + confirmation',
    contract_signing: 'Contract signing (BoldSign)',
    relocation:       'Relocation guide + attestation',
    second_payment:   'Second payment invoice + reminders',
  };

  const hiWorkflowText = [
    '=== HI WORKFLOW: AUTOMATION FLOWS ===',
    `Total runs tracked: ${flowRuns.length} (${active.length} active, ${completed.length} completed, ${failed.length} failed, ${stale.length} stale 7d+)`,
    '',
    'Per-flow breakdown — flow | active | stale | completed | failed:',
    ...Object.entries(byFlow).map(([k, s]) =>
      `  ${FLOW_LABELS[k] ?? k} | ${s.active} | ${s.stale} | ${s.completed} | ${s.failed}`),
    '',
    '=== HI TEAM ASSIGNMENT ===',
    'name | active runs | stale 7d+ | hospitals owned | open vacancies owned',
    ...perMember.map(m => `  ${m.name} | ${m.active} | ${m.stale} | ${m.hospitals} | ${m.openVacancies}`),
    '',
    '=== ACTIVE RUNS NEEDING ATTENTION (top 30 by oldest activity) ===',
    'doctor | hospital | flow | stage | days_since | assigned_to',
    ...active
      .sort((a, b) => new Date(a.last_event_at).getTime() - new Date(b.last_event_at).getTime())
      .slice(0, 30)
      .map(r => {
        const days = Math.floor((now - new Date(r.last_event_at).getTime()) / 86_400_000);
        return `  ${r.doctor_name ?? '—'} | ${r.hospital ?? '—'} | ${r.flow_key} | ${r.current_stage} | ${days}d | ${r.assigned_to ?? 'unassigned'}`;
      }),
    '',
    '=== VACANCIES ===',
    `Open: ${openVacancies.length} (${vacByPriority.high} high, ${vacByPriority.medium} medium, ${vacByPriority.low} low). Stale 7d+: ${staleVacancies.length}.`,
    'hospital | specialty | priority | days_open | city',
    ...openVacancies.slice(0, 25).map(v => {
      const days = Math.floor((now - new Date(v.opened_at).getTime()) / 86_400_000);
      return `  ${v.hospital_name} | ${v.specialty} | ${v.priority} | ${days}d | ${v.city ?? '—'}`;
    }),
    '',
    '=== BATCH SENDS ===',
    `Total: ${batches.length}. Upcoming: ${upcomingBatches.length}. Sent: ${sentBatches.length}. Drafts: ${draftBatches.length}.`,
    'date | kind | status | doctors | hospitals | specialty',
    ...batches.slice(0, 15).map(b =>
      `  ${b.scheduled_for} | ${b.kind} | ${b.status} | ${b.doctor_ids?.length ?? 0} | ${b.hospital_count ?? '—'} | ${b.specialty ?? '—'}`),
    '',
    '=== NOTIFICATIONS ===',
    `Open: ${notifications.length} (${unreadNotifs.length} unread). By kind: ${Object.entries(notifByKind).map(([k, n]) => `${k}=${n}`).join(', ')}.`,
    '',
    '=== HOSPITALS ===',
    `Total tracked: ${hospitals.length}. Active: ${activeHospitals.length}. Paused: ${pausedHospitals.length}. With recruiter email: ${withRecruiter}.`,
    'Top 5 by health score: ' + (topHealth.length > 0
      ? topHealth.map(h => `${h.name} (${h.health_score})`).join(', ')
      : '(no scores yet)'),
    'Bottom 5 by health score: ' + (bottomHealth.length > 0
      ? bottomHealth.map(h => `${h.name} (${h.health_score})`).join(', ')
      : '(no scores yet)'),
    '',
    '=== DOCTOR LIFECYCLE ===',
    `Signed but not joined yet: ${signedNotJoined}. Joined but not approved: ${joinedNotApproved}. Marked unavailable: ${unavailableCount}.`,
    '',
    '=== FORM SUBMISSIONS ===',
    `Total recent: ${formResponses.length} (last 400). Linked to Zoho doctor: ${formsLinkedToDoctor}. Follow-up overdue: ${formsAwaitingFollowup}.`,
    `By outreach status: ${Object.entries(formByStatus).map(([k, n]) => `${k}=${n}`).join(', ')}.`,
    '',
    '=== WORDPRESS CANDIDATES (doctor profiles published on the website) ===',
    `Total mirrored: ${wpCandidates.length}. Unlinked from Zoho: ${wpUnlinked}.`,
    `By status: ${Object.entries(wpByStatus).map(([k, n]) => `${k}=${n}`).join(', ')}.`,
    '',
    '=== CALL LOG (recent sales calls) ===',
    `Recent calls tracked: ${recentCalls.length}. High potential: ${highPotentialCalls}. Declined: ${declinedCalls}.`,
    `By status: ${Object.entries(callByStatus).map(([k, n]) => `${k}=${n}`).join(', ')}.`,
    '',
    '=== PLACEMENTS (per-doctor, per-hospital attempts) ===',
    `Tracked: ${placements.length}. Paid: ${placementsPaid}. Awaiting 45-day payment: ${placementsAwaitingPayment}. Overdue: ${placementsOverdue}.`,
    '',
    '=== VACANCY LINKS (leads attached to open roles) ===',
    `Total links: ${vacancyLinks.length}. Distinct vacancies with at least one candidate: ${vacanciesWithCandidates}.`,
  ].join('\n');

  const contextBlock = [
    // Static manual first — Anthropic's prompt cache treats the full
    // systemText as one block, so placing the reference up top keeps the
    // dynamic data below where it belongs while everything still benefits
    // from the same cache.
    SYSTEM_REFERENCE.replace('{currentPage}', pageLabel),
    '',
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

    '',
    hiWorkflowText,

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

  // ── Digest mode ───────────────────────────────────────────────────────────
  // Same full-portal snapshot, but instead of an interactive chat we return a
  // single structured "what's going on everywhere" executive summary.
  if (mode === 'digest') {
    return await runPortalDigest(contextBlock);
  }

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

How-to questions / confused users — when the user asks "how do I…", "what does this button do", "where do I find X", or sounds lost:
- Use the SYSTEM REFERENCE section as your manual. It documents every page, flow, button label, glossary term, and role-based access rule.
- Answer concretely with exact button labels and page paths. Example: "Go to /vacancies, open the row, click Link to vacancy."
- If a feature is gated by role, mention it. Example: "Only admins see /settings — you're on hi_member."
- If a feature doesn't exist yet, say so plainly and point at the closest existing affordance.
- For procedural questions, give numbered steps (1, 2, 3) — not prose paragraphs.
- Keep how-to answers short. Most should fit in 3–6 lines.

Hospital Introduction (HI) workflow context — when the question is about
automations, vacancies, batches, hospital relationships, or "what's waiting":
- The HI module has 7 flows: onboarding → profile_sent → shortlist → interview → contract_signing → relocation → second_payment.
- "Stale" means an active flow run with no event for 7+ days — flag these as needing attention.
- The 4 HI team members are Rodaina Thabit, Mohamed Othman, Sohaila Mohamed, Ishak Boulaat. Use HI TEAM ASSIGNMENT for workload questions.
- "Active runs needing attention" shows the oldest 30 — use these for "what's stuck" / "what needs a chase" questions.
- For vacancy questions: prioritise high-priority + stale (>7d) ones; mention which doctors might match if data supports it.
- For batch send questions: the kinds are daily_duo (Mon-Fri, 2 doctors), tuesday_top_15 (15 doctors mixed), specialty_of_day (Wed-Fri, rotates ~60 specialties).
- For hospital health: top/bottom 5 by health_score live in the HI WORKFLOW section. A "cooling" hospital = dropping score over time; "warming" = rising.
- "Doctors on the way" = signed but not yet joined (HI WORKFLOW > DOCTOR LIFECYCLE).

CHARTS: When visualising distribution, comparison, or trends include ONE chart after your text:
<chart type="TYPE" title="TITLE">VALID_JSON</chart>
- bar:  {"labels":["A","B"],"values":[10,20]}
- pie:  {"labels":["A","B"],"values":[10,20]}
- line: {"labels":["Jan","Feb"],"series":[{"name":"Leads","values":[10,20]}]}
Only include a chart when it genuinely adds value.

AGENTIC ACTIONS — you are not just a chat, you can SERVE BUTTONS the user can
click to perform operations. Emit ZERO or more action proposals at the END of
your response (after charts, never inline mid-sentence) using:

<action type="TYPE" label="BUTTON LABEL" params='VALID_JSON'>One-line rationale shown above the button.</action>

The client renders each as a confirmation button. Clicking it performs the
operation against the live data. Suggest actions when the user's question
implies a follow-up the dashboard can perform; do NOT suggest actions for
purely informational questions.

Supported types + required params:
- goto             params: {"path":"/vacancies?status=open"}                   — DRIVES NAVIGATION: auto-fires 1.2s after appearing, user can hit "Stay" to cancel. Use this whenever the user's intent is "take me to X" / "open X" / "show me X" / "go to X" — they're asking to be transported, not asking a question. Use ONLY ONE per response. Path must be a real route (see PAGES list above).
- navigate         params: {"path":"/vacancies?status=open"}                   — same effect but renders as a button the user clicks. Use this for "you might want to look at X" suggestions where you're not certain the user wants to leave.
- search           params: {"query":"radiology"}                               — open Universal Search prefilled.
- open_doctor      params: {"doctorId":"lead:1234"}                            — open doctor in Doctors → Progress filtered to them.
- open_vacancy     params: {"vacancyId":"abc-uuid"}                            — open the vacancy detail sheet.
- open_run         params: {"runId":"abc-uuid"}                                — open an automation_flow_run in its sheet.
- update_lead_status   params: {"zohoId":"...", "newStatus":"Initial Call Done"}  — change Zoho Lead_Status. Choices listed in glossary.
- reassign_run     params: {"runId":"...", "toEmail":"rodaina@allocationassist.com"} — reassign an active flow run.
- mark_shortlisted params: {"runId":"..."}                                     — confirm a hospital reply suggestion, advance profile_sent.
- send_profile     params: {"doctorId":"lead:1234"}                            — open the Send Profile dialog pre-selected to that doctor.
- link_to_vacancy  params: {"leadId":"...","vacancyId":"..."}                  — insert into vacancy_lead_links.
- create_wp_profile params: {"responseId":"form-response-uuid"}                — open the Create WP Profile review dialog for a JotForm submission.
- mark_vacancy_status params: {"vacancyId":"...","status":"filled|closed|open"} — change vacancy status.
- update_outreach  params: {"responseId":"...","status":"contacted|qualified|unqualified|closed"} — set a form response's outreach status.

RULES for actions:
1. Always include a short rationale between the open and close tags — what the
   click will do, in one line, plain English.
2. Use IDs from the data above. Never invent UUIDs.
3. Prefer the smallest action that moves the user forward. Don't propose 6
   buttons; 1–3 is the sweet spot.
4. If the user is just asking "what" or "how many", DON'T propose actions —
   they want a number, not a click.
5. Pick goto vs navigate carefully:
   - User said "take me to / open / show me / go to / jump to / where is" → goto (auto-fires).
   - User said "tell me / what / how many / who / which" → answer with text first,
     then OPTIONALLY a navigate button for follow-up. Never goto.
   - When in doubt about whether they want to leave the current page, prefer
     navigate over goto.
   - Maximum one goto per response. Multiple goto actions race each other and
     confuse the user.

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
