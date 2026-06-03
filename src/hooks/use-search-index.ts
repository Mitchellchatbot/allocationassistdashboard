import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useZohoData, displaySource } from "@/hooks/use-zoho-data";
import { useChannelEconomics } from "@/hooks/use-channel-economics";
import { useMarketingExpenses } from "@/hooks/use-marketing-expenses";
import { supabase } from "@/lib/supabase";
import { useHospitals } from "@/hooks/use-hospitals";
import { useVacancies } from "@/hooks/use-vacancies";
import { useScheduledBatches } from "@/hooks/use-scheduled-batches";
import { useDoctorSpecialties } from "@/hooks/use-doctor-specialties";
import { useNotifications } from "@/hooks/use-notifications";
import { useDoctorProfiles } from "@/hooks/use-doctor-profiles";
import { useAutomationFlowRuns } from "@/hooks/use-automation-flows";
import { FLOW_DEFINITIONS } from "@/lib/automation-flows";

/**
 * Aggregates EVERY searchable entity in the dashboard into one flat list that
 * UniversalSearch fuzzy-matches against. Each entity carries a `kind` that
 * shows up as a colored badge in the search result row so the user can tell
 * at a glance whether a hit is a doctor, a vacancy, a flow run, a template,
 * a hospital, a page, etc.
 *
 * Order in this file follows the same logical grouping as the sidebar so the
 * search dialog mirrors the team's mental model.
 */

export type SearchKind =
  | "Metric"
  | "Lead"
  | "Doctor"
  | "Profile"
  | "Placement"
  | "Deal"
  | "Vacancy"
  | "Hospital"
  | "Flow"
  | "Batch"
  | "Template"
  | "Specialty"
  | "Notification"
  | "Channel"
  | "Recruiter"
  | "Campaign"
  | "Transaction"
  | "Page";

export interface SearchEntity {
  id:        string;
  kind:      SearchKind;
  label:     string;
  sublabel?: string;
  keywords:  string;
  route:     string;
}

// ── Pages ──────────────────────────────────────────────────────────────────
const PAGES: SearchEntity[] = [
  { id: "page:dashboard",       kind: "Page", label: "Dashboard",        sublabel: "Overview", route: "/", keywords: "home overview kpi summary" },

  // Hospital Introduction Department
  { id: "page:doctor-profiles", kind: "Page", label: "Doctor Profiles",  sublabel: "Build the doctor profile sent to hospitals", route: "/doctor-profiles", keywords: "doctors profiles cv hospital introduction generation" },
  { id: "page:automations",     kind: "Page", label: "Automations",      sublabel: "Phase 1 email flows + run timeline", route: "/automations", keywords: "automations flows emails onboarding shortlist interview contract relocation payment" },
  { id: "page:vacancies",       kind: "Page", label: "Vacancies",        sublabel: "Open hospital roles + auto-match", route: "/vacancies", keywords: "vacancies open roles hospitals match" },
  { id: "page:batches",         kind: "Page", label: "Batch Sends",      sublabel: "Daily duo, Tuesday top 15, specialty rotation", route: "/batches", keywords: "batches send recurring daily tuesday rotation" },
  { id: "page:reports",         kind: "Page", label: "Reports",          sublabel: "KPIs, team breakdown, hospital health", route: "/reports", keywords: "reports analytics kpi metrics hospital health team" },

  // Sales
  { id: "page:sales",           kind: "Page", label: "Sales Tracker",    sublabel: "Recruiter performance", route: "/sales", keywords: "recruiters team conversion pipeline" },
  { id: "page:leads",           kind: "Page", label: "Doctor Progress",  sublabel: "Pipeline by stage", route: "/leads-pipeline", keywords: "leads pipeline doctors progress stages" },
  { id: "page:follow-ups",      kind: "Page", label: "Follow-ups",       sublabel: "Pending follow-ups", route: "/follow-ups", keywords: "tasks reminders calls" },
  { id: "page:calls",           kind: "Page", label: "Calls",            sublabel: "Fathom-recorded calls", route: "/calls", keywords: "calls fathom transcripts conversations" },
  { id: "page:contracts",       kind: "Page", label: "Contract Builder", sublabel: "Generate + send Service Agreements", route: "/contracts", keywords: "contracts agreements legal boldsign signature" },

  // Growth
  { id: "page:marketing",       kind: "Page", label: "Marketing",        sublabel: "Channel performance", route: "/marketing", keywords: "channels sources cpl cpqa cpa" },
  { id: "page:meta-ads",        kind: "Page", label: "Meta Ads",         sublabel: "Facebook & Instagram", route: "/meta-ads", keywords: "facebook instagram fb ig ads campaigns spend" },
  { id: "page:team",            kind: "Page", label: "Team Performance", sublabel: "Recruiters", route: "/team", keywords: "team recruiters performance" },
  { id: "page:finance",         kind: "Page", label: "Finance",          sublabel: "Spend & revenue", route: "/finance", keywords: "money cost expenses revenue transactions roi" },

  // Admin
  { id: "page:import-bulk",     kind: "Page", label: "Bulk Import",      sublabel: "Paste CSV exports from Ammar's sheets", route: "/import-bulk", keywords: "bulk import csv hospitals vacancies unavailable templates source overrides" },
  { id: "page:connections",     kind: "Page", label: "Connections",      sublabel: "Live Google Sheets sync", route: "/connections", keywords: "connections google sheets live sync automatic" },
  { id: "page:import",          kind: "Page", label: "Import Data",      sublabel: "Call log import", route: "/import", keywords: "import data csv call logs" },
  { id: "page:settings",        kind: "Page", label: "Settings",         sublabel: "Users & integrations", route: "/settings", keywords: "config users admin integrations" },
];

const METRICS: SearchEntity[] = [
  // Marketing
  { id: "metric:leads-by-source",     kind: "Metric", label: "Leads by Source",            sublabel: "Marketing · which channels generate doctors",      route: "/marketing", keywords: "channel source acquisition where leads come from origin breakdown distribution" },
  { id: "metric:cpl",                  kind: "Metric", label: "Cost Per Lead (by channel)", sublabel: "Marketing · CPL per source",                       route: "/marketing", keywords: "cost per lead cpl spend efficiency channel acquisition cost" },
  { id: "metric:cpql",                 kind: "Metric", label: "Cost Per Qualified Lead",    sublabel: "Marketing · CPQL per channel",                     route: "/marketing", keywords: "cost per qualified cpq cpqa qualified lead efficiency" },
  { id: "metric:cost-per-conversion",  kind: "Metric", label: "Cost Per Conversion",        sublabel: "Marketing · cost per converted lead",              route: "/marketing", keywords: "cost per conversion cpc placement cost roi efficiency" },
  { id: "metric:conversion-rate",      kind: "Metric", label: "Conversion Rate by Channel", sublabel: "Marketing · lead → sale rate",                     route: "/marketing", keywords: "conversion rate lead to sale qualified to converted percentage" },
  { id: "metric:qualified-leads",      kind: "Metric", label: "Qualified Leads",            sublabel: "Marketing · how many leads qualify",               route: "/marketing", keywords: "qualified leads qualification rate qualifying initial sales call" },
  { id: "metric:qualification-rate",   kind: "Metric", label: "Qualification Rate",         sublabel: "Marketing · % qualified",                          route: "/marketing", keywords: "qualification rate percentage funnel" },
  { id: "metric:contact-rate",         kind: "Metric", label: "Contact Rate by Channel",    sublabel: "Marketing · contacted vs uncontacted",             route: "/marketing", keywords: "contact rate contacted uncontacted reachable response" },
  { id: "metric:uncontacted",          kind: "Metric", label: "Uncontacted Leads",          sublabel: "Doctor Progress · leads never contacted",          route: "/leads-pipeline?stage=Not%20Contacted", keywords: "uncontacted not contacted no contact follow up needed waiting" },
  { id: "metric:best-channel",         kind: "Metric", label: "Best Channel",               sublabel: "Marketing · top performer by volume / CPL / CPQL", route: "/marketing", keywords: "best channel winner top top performing volume" },
  { id: "metric:campaign-winners",     kind: "Metric", label: "Campaign Winners",           sublabel: "Marketing · most qualified / lowest CPQL",         route: "/marketing", keywords: "best campaign top campaign most qualified lowest cost winner" },

  // Doctor / pipeline
  { id: "metric:doctor-pipeline",      kind: "Metric", label: "Doctor Pipeline",            sublabel: "Dashboard · funnel by stage",                      route: "/", keywords: "pipeline funnel stages doctors workflow" },
  { id: "metric:license-pipeline",     kind: "Metric", label: "License Pipeline (DOH/DHA/MOH)", sublabel: "Dashboard · license status counts",            route: "/", keywords: "license doh dha moh ministry of health authorization status" },
  { id: "metric:high-priority",        kind: "Metric", label: "High Priority Follow-ups",   sublabel: "Doctor Progress · urgent leads",                   route: "/leads-pipeline?stage=High%20Priority%20Follow%20up", keywords: "high priority follow up urgent need attention" },

  // Sales
  { id: "metric:recruiter-performance", kind: "Metric", label: "Recruiter Performance",     sublabel: "Team · contact rate, qualified, placed",           route: "/team", keywords: "recruiter performance sales rep team workload contact rate placed" },
  { id: "metric:total-leads",          kind: "Metric", label: "Total Leads Managed",        sublabel: "Sales · all leads in pipeline",                    route: "/sales", keywords: "total leads count all leads volume managed" },
  { id: "metric:closed-revenue",       kind: "Metric", label: "Pipeline Value",             sublabel: "Dashboard · open deals value",                     route: "/", keywords: "pipeline value open deals weighted closed won revenue placement" },

  // Finance
  { id: "metric:total-spend",          kind: "Metric", label: "Total Marketing Spend",      sublabel: "Finance · spend in period",                        route: "/finance", keywords: "total spend marketing budget expenses cost" },
  { id: "metric:transactions",         kind: "Metric", label: "All Transactions",           sublabel: "Finance · sortable expense list",                  route: "/finance", keywords: "transactions expenses receipts payments sortable" },
  { id: "metric:revenue",              kind: "Metric", label: "Placement Revenue",          sublabel: "Finance · Closed Won deals",                       route: "/finance", keywords: "revenue closed won placement income money earned" },
  { id: "metric:roi",                  kind: "Metric", label: "Return on Investment (ROI)", sublabel: "Finance · revenue vs spend",                       route: "/finance", keywords: "roi return on investment efficiency profit ratio" },
  { id: "metric:roas",                 kind: "Metric", label: "ROAS",                       sublabel: "Finance · return on ad spend",                     route: "/finance", keywords: "roas return on ad spend efficiency ads" },
  { id: "metric:cost-per-placement",   kind: "Metric", label: "Cost Per Placement",         sublabel: "Finance / Meta Ads · spend ÷ placements",          route: "/finance", keywords: "cost per placement cpp placed deals" },

  // Meta Ads
  { id: "metric:impressions",          kind: "Metric", label: "Impressions",                sublabel: "Meta Ads · total ad views",                        route: "/meta-ads", keywords: "impressions views meta facebook instagram ad reach exposure" },
  { id: "metric:reach",                kind: "Metric", label: "Reach",                      sublabel: "Meta Ads · unique people who saw ads",             route: "/meta-ads", keywords: "reach unique people audience size meta facebook" },
  { id: "metric:clicks",               kind: "Metric", label: "Link Clicks",                sublabel: "Meta Ads · CTR & click volume",                    route: "/meta-ads", keywords: "clicks link clicks ctr click through rate" },
  { id: "metric:ctr",                  kind: "Metric", label: "CTR (Click-Through Rate)",   sublabel: "Meta Ads · clicks ÷ impressions",                  route: "/meta-ads", keywords: "ctr click through rate engagement" },
  { id: "metric:cpm",                  kind: "Metric", label: "CPM",                        sublabel: "Meta Ads · cost per 1000 impressions",             route: "/meta-ads", keywords: "cpm cost per thousand mille impressions" },
  { id: "metric:frequency",            kind: "Metric", label: "Frequency",                  sublabel: "Meta Ads · average impressions per person",        route: "/meta-ads", keywords: "frequency saturation repeat exposure ad fatigue" },
  { id: "metric:top-ads",              kind: "Metric", label: "Top Ads by Leads",           sublabel: "Meta Ads · best performing ad creatives",          route: "/meta-ads", keywords: "top ads best ads creatives performance leads" },
  { id: "metric:ad-spend-by-platform", kind: "Metric", label: "Spend by Platform",          sublabel: "Meta Ads · Facebook vs Instagram",                 route: "/meta-ads", keywords: "platform facebook instagram audience network spend split" },
  { id: "metric:age-gender",           kind: "Metric", label: "Impressions by Age & Gender", sublabel: "Meta Ads · demographic breakdown",                route: "/meta-ads", keywords: "demographics age gender male female audience" },
  { id: "metric:actions",              kind: "Metric", label: "Actions & Conversions",      sublabel: "Meta Ads · all tracked events",                    route: "/meta-ads", keywords: "actions conversions purchases events pixel" },
  { id: "metric:meta-leads",           kind: "Metric", label: "Leads from Forms",           sublabel: "Meta Ads · form submissions in Supabase",          route: "/meta-ads", keywords: "form leads supabase submissions lead form" },

  // Hospital Introduction
  { id: "metric:doctors-on-the-way",   kind: "Metric", label: "Doctors on the way",         sublabel: "Reports · signed but not yet joined",              route: "/reports", keywords: "doctors on the way signed joined chase weekly reminder" },
  { id: "metric:hospital-health",      kind: "Metric", label: "Hospital Relationship Health", sublabel: "Reports · per-hospital score 0-100",             route: "/reports", keywords: "hospital health relationship warming cooling stalled score interaction" },
  { id: "metric:team-breakdown",       kind: "Metric", label: "Team Breakdown",             sublabel: "Reports · per-team-member metrics",                route: "/reports", keywords: "team member rodina mohammed breakdown shortlisted interviews offered" },
  { id: "metric:weekly-trend",         kind: "Metric", label: "Weekly Trend",               sublabel: "Reports · shortlist/interview/sign cadence",       route: "/reports", keywords: "weekly trend cadence chart shortlists interviews signs" },
];

// ── Hook ───────────────────────────────────────────────────────────────────
export function useSearchIndex(): SearchEntity[] {
  const { data: zoho } = useZohoData();
  const channelEcon    = useChannelEconomics();
  const { byCategory } = useMarketingExpenses();
  const { data: hospitals = [] }   = useHospitals();
  const { data: vacancies = [] }   = useVacancies();
  const { data: batches   = [] }   = useScheduledBatches();
  const { data: profiles  = [] }   = useDoctorProfiles();
  const { data: runs      = [] }   = useAutomationFlowRuns();
  const specialties                 = useDoctorSpecialties();
  const { notifications }           = useNotifications();

  // Email templates aren't behind a hook yet — read directly via react-query
  // here so we don't need to wire a new file just for the search index.
  const { data: templates = [] } = useQuery({
    queryKey: ["search-email-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_templates")
        .select("key, name, flow_key, subject")
        .limit(200);
      if (error) throw error;
      return data as Array<{ key: string; name: string; flow_key: string | null; subject: string | null }>;
    },
    staleTime: 60_000,
  });

  // Placements — doctor_lifecycle rows with any milestone logged.
  // Indexed as a "Placement" kind so ⌘K results include them alongside
  // doctors, runs, vacancies. Route deep-links to the milestone editor.
  const { data: placements = [] } = useQuery({
    queryKey: ["search-placements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doctor_lifecycle")
        .select("doctor_id, doctor_name, placement_hospital_name, joined_at, signed_at, offered_at, shortlisted_at, paid_at")
        .or("joined_at.not.is.null,signed_at.not.is.null,offered_at.not.is.null,shortlisted_at.not.is.null")
        .limit(20_000);
      if (error) throw error;
      return (data ?? []) as Array<{
        doctor_id: string; doctor_name: string | null;
        placement_hospital_name: string | null;
        joined_at: string | null; signed_at: string | null;
        offered_at: string | null; shortlisted_at: string | null;
        paid_at: string | null;
      }>;
    },
    staleTime: 60_000,
  });

  return useMemo(() => {
    const out: SearchEntity[] = [...METRICS, ...PAGES];

    // ── Leads (Zoho leads) ───────────────────────────────────────────────
    for (const l of zoho?.rawLeads ?? []) {
      const name = (l.Full_Name || `${l.First_Name ?? ""} ${l.Last_Name ?? ""}`).trim();
      if (!name) continue;
      const specialty = (l.Specialty_New ?? l.Specialty ?? "").toString();
      const status    = (l.Lead_Status ?? "").toString();
      const recruiter = ((l.Owner as Record<string, string> | undefined)?.name) ?? "";
      const source    = displaySource(l.Lead_Source);
      out.push({
        id:       `lead:${l.id ?? name}`,
        kind:     "Lead",
        label:    name,
        sublabel: [specialty, status, recruiter].filter(Boolean).join(" · ") || undefined,
        keywords: `lead doctor zoho ${specialty} ${status} ${source} ${recruiter} ${l.Email ?? ""} ${l.Phone ?? ""} ${l.Mobile ?? ""} ${l.Nationality ?? ""} ${l.License ?? ""}`,
        route:    `/doctor-profiles?id=lead:${l.id}`,
      });
    }

    // ── Doctors on Board (Zoho DOB) ──────────────────────────────────────
    for (const d of zoho?.rawDoctorsOnBoard ?? []) {
      const name = (d.Full_Name || `${d.First_Name ?? ""} ${d.Last_Name ?? ""}`).trim();
      if (!name) continue;
      out.push({
        id:       `dob:${d.id ?? name}`,
        kind:     "Doctor",
        label:    name,
        sublabel: [(d.Specialty_New ?? d.Speciality) ?? "", d.Account_Name?.name ? `Hospital: ${d.Account_Name.name}` : ""].filter(Boolean).join(" · ") || "Doctor on Board",
        keywords: `doctor on board placed dob ${d.Specialty_New ?? d.Speciality ?? ""} ${d.Email ?? ""} ${d.Phone ?? ""} ${d.Mobile ?? ""} ${d.Account_Name?.name ?? ""}`,
        route:    `/doctor-profiles?id=dob:${d.id}`,
      });
    }

    // ── Doctor profiles (with CV data) ────────────────────────────────────
    // Surface profiles that are well-populated so the team can jump straight
    // to a profile they've worked on without going through the picker.
    for (const p of profiles) {
      if (!p.doctor_name) continue;
      out.push({
        id:       `profile:${p.doctor_id}`,
        kind:     "Profile",
        label:    p.doctor_name,
        sublabel: [p.title, p.nationality, p.country_training, p.years_experience ? `${p.years_experience}y exp` : null].filter(Boolean).join(" · ") || "Doctor profile",
        keywords: `profile cv ${p.title ?? ""} ${p.nationality ?? ""} ${p.country_training ?? ""} ${p.license ?? ""} ${p.area_of_interest ?? ""} ${p.bio ?? ""}`,
        route:    `/doctor-profiles?id=${encodeURIComponent(p.doctor_id)}`,
      });
    }

    // ── Placements (lifecycle milestones) ─────────────────────────────────
    for (const p of placements) {
      if (!p.doctor_id) continue;
      // Pick the latest milestone label for the sublabel preview so
      // the search result shows "Joined · Burjeel Royal · Apr 12" etc.
      const stage =
        p.paid_at        ? "Paid"        :
        p.joined_at      ? "Joined"      :
        p.signed_at      ? "Signed"      :
        p.offered_at     ? "Offered"     :
                           "Shortlisted";
      const latestDate = p.paid_at || p.joined_at || p.signed_at || p.offered_at || p.shortlisted_at;
      const sublabel = [stage, p.placement_hospital_name, latestDate ? new Date(latestDate).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null]
        .filter(Boolean).join(" · ");
      out.push({
        id:       `placement:${p.doctor_id}`,
        kind:     "Placement",
        label:    p.doctor_name ?? p.doctor_id,
        sublabel: sublabel || "Placement",
        keywords: `placement milestone ${stage.toLowerCase()} ${p.placement_hospital_name ?? ""} ${p.doctor_name ?? ""} joined signed offered shortlisted paid invoice`,
        route:    `/reports?placement=${encodeURIComponent(p.doctor_id)}`,
      });
    }

    // ── Active automation flow runs ───────────────────────────────────────
    for (const r of runs) {
      const flow  = FLOW_DEFINITIONS[r.flow_key];
      const stage = flow?.stages.find(s => s.key === r.current_stage);
      out.push({
        id:       `run:${r.id}`,
        kind:     "Flow",
        label:    `${r.doctor_name} · ${flow?.shortName ?? r.flow_key}`,
        sublabel: [stage?.label ?? r.current_stage, r.hospital, r.status].filter(Boolean).join(" · "),
        keywords: `flow run automation ${r.flow_key} ${r.current_stage} ${r.hospital ?? ""} ${r.status} ${r.doctor_name}`,
        route:    `/automations?flow=${r.flow_key}`,
      });
    }

    // ── Vacancies ─────────────────────────────────────────────────────────
    for (const v of vacancies) {
      out.push({
        id:       `vacancy:${v.id}`,
        kind:     "Vacancy",
        label:    `${v.hospital_name} · ${v.specialty}`,
        sublabel: `${v.priority.toUpperCase()} priority · ${v.status}${v.target_fill_days ? ` · target ${v.target_fill_days}d` : ""}`,
        keywords: `vacancy ${v.hospital_name} ${v.specialty} ${v.priority} ${v.status} ${v.notes ?? ""}`,
        route:    `/vacancies`,
      });
    }

    // ── Hospitals ─────────────────────────────────────────────────────────
    for (const h of hospitals) {
      out.push({
        id:       `hospital:${h.id}`,
        kind:     "Hospital",
        label:    h.name,
        sublabel: [h.city, h.country, h.primary_contact_name].filter(Boolean).join(" · ") || "Hospital",
        keywords: `hospital ${h.city ?? ""} ${h.country ?? ""} ${h.primary_recruiter_email ?? ""} ${h.primary_contact_name ?? ""} ${h.notes ?? ""}`,
        route:    `/automations?tab=hospitals`,
      });
    }

    // ── Batch sends ───────────────────────────────────────────────────────
    for (const b of batches) {
      const kindLabel = ({ daily_duo: "Daily duo", tuesday_top_15: "Tuesday top 15", specialty_of_day: "Specialty of the day" } as const)[b.kind] ?? b.kind;
      out.push({
        id:       `batch:${b.id}`,
        kind:     "Batch",
        label:    `${kindLabel} · ${b.scheduled_for}`,
        sublabel: `${b.status} · ${b.doctor_ids.length} doctors${b.specialty ? ` · ${b.specialty}` : ""}`,
        keywords: `batch send ${b.kind} ${b.scheduled_for} ${b.status} ${b.specialty ?? ""}`,
        route:    `/batches`,
      });
    }

    // ── Email templates ───────────────────────────────────────────────────
    for (const t of templates) {
      out.push({
        id:       `template:${t.key}`,
        kind:     "Template",
        label:    t.name || t.key,
        sublabel: t.subject ? `"${t.subject}"` : t.flow_key ?? "Email template",
        keywords: `template email ${t.key} ${t.flow_key ?? ""} ${t.subject ?? ""}`,
        route:    `/automations?tab=templates`,
      });
    }

    // ── Specialties ───────────────────────────────────────────────────────
    for (const s of specialties.slice(0, 80)) {
      out.push({
        id:       `specialty:${s.value}`,
        kind:     "Specialty",
        label:    s.value,
        sublabel: `${s.count} doctor${s.count === 1 ? "" : "s"}`,
        keywords: `specialty ${s.value}`,
        route:    `/leads-pipeline?specialty=${encodeURIComponent(s.value)}`,
      });
    }

    // ── Notifications (unread first) ──────────────────────────────────────
    for (const n of notifications.slice(0, 30)) {
      out.push({
        id:       `notif:${n.id}`,
        kind:     "Notification",
        label:    n.title,
        sublabel: n.body ?? n.kind,
        keywords: `notification ${n.kind} ${n.title} ${n.body ?? ""}`,
        route:    n.link_path ?? "/",
      });
    }

    // ── Deals ────────────────────────────────────────────────────────────
    for (const d of zoho?.rawDeals ?? []) {
      if (!d.Deal_Name) continue;
      out.push({
        id:       `deal:${d.id ?? d.Deal_Name}`,
        kind:     "Deal",
        label:    d.Deal_Name,
        sublabel: `${d.Stage ?? "—"} · AED ${(d.Amount ?? 0).toLocaleString()}`,
        keywords: `deal placement ${d.Stage ?? ""} ${d.Lead_Source ?? ""} closed won`,
        route:    "/finance",
      });
    }

    // ── Channels ─────────────────────────────────────────────────────────
    for (const c of channelEcon) {
      out.push({
        id:       `channel:${c.channel}`,
        kind:     "Channel",
        label:    c.channel,
        sublabel: `${c.leads.toLocaleString()} leads · ${c.qualified.toLocaleString()} qualified`,
        keywords: `channel source marketing ${c.channel}`,
        route:    `/leads-pipeline?source=${encodeURIComponent(c.channel)}`,
      });
    }

    // ── Recruiters ───────────────────────────────────────────────────────
    const recruiterCounts = new Map<string, number>();
    for (const l of zoho?.rawLeads ?? []) {
      const name = ((l.Owner as Record<string, string> | undefined)?.name) ?? "";
      if (!name) continue;
      recruiterCounts.set(name, (recruiterCounts.get(name) ?? 0) + 1);
    }
    for (const [name, count] of recruiterCounts) {
      out.push({
        id:       `recruiter:${name}`,
        kind:     "Recruiter",
        label:    name,
        sublabel: `${count.toLocaleString()} leads owned`,
        keywords: `recruiter sales rep team owner ${name}`,
        route:    `/leads-pipeline?recruiter=${encodeURIComponent(name)}`,
      });
    }

    // ── Marketing expense categories ─────────────────────────────────────
    for (const cat of byCategory.slice(0, 30)) {
      out.push({
        id:       `txncat:${cat.category}`,
        kind:     "Transaction",
        label:    cat.category,
        sublabel: `${cat.count} transactions · AED ${Math.round(cat.amount).toLocaleString()}`,
        keywords: `expense spend channel transaction ${cat.category}`,
        route:    "/finance",
      });
    }

    return out;
  // Intentionally pass primitives + arrays as deps so React-Query updates flow
  // through without triggering re-builds on unrelated state changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    zoho?.rawLeads, zoho?.rawDeals, zoho?.rawDoctorsOnBoard,
    channelEcon, byCategory,
    hospitals, vacancies, batches, templates, profiles, placements, runs, specialties, notifications,
  ]);
}

