import { useMemo } from "react";
import { useScheduledBatches, type BatchKind } from "@/hooks/use-scheduled-batches";
import { useAutomationFlowRuns } from "@/hooks/use-automation-flows";
import { useZohoData } from "@/hooks/use-zoho-data";

/**
 * use-sent-history — Amir #6. Derives a flat "who was sent in what, and when"
 * list from data already in the react-query cache (scheduled_batch_sends +
 * automation_flow_runs), resolving Zoho lead:/dob: ids to doctor names. Single
 * source of truth shared by the ⌘K search index and the Past Sent page. Pure
 * client-side — no edge function, no migration — so it works in npm run dev as
 * soon as any 'sent' batch or profile_sent run exists in the DB.
 */

export type SentKind = BatchKind | "individual";

export interface SentRecord {
  id:         string;          // stable key
  doctorId:   string | null;
  doctorName: string;
  specialty:  string | null;
  sentKind:   SentKind;        // daily_duo | tuesday_top_15 | specialty_of_day | individual
  slot:       string;          // "1st profile" | "2nd profile" | "top 15 · #3" | "daily specialty" | "individual"
  hospital:   string | null;   // batches go to all hospitals; individual sends name one
  country:    string | null;
  sentAt:     string | null;   // ISO
  source:     "batch" | "flow";
  refId:      string;          // batchId or runId
  route:      string;          // where to open it
}

/** Human label for a batch kind. */
export const SENT_KIND_LABEL: Record<SentKind, string> = {
  daily_duo:        "Daily duo",
  tuesday_top_15:   "Tuesday top 15",
  specialty_of_day: "Specialty of the day",
  individual:       "Individual send",
};

/** Slot label for a doctor's position within a batch. */
function slotLabel(kind: BatchKind, i: number): string {
  if (kind === "daily_duo") return i === 0 ? "1st profile" : i === 1 ? "2nd profile" : `profile #${i + 1}`;
  if (kind === "tuesday_top_15") return `top 15 · #${i + 1}`;
  return "daily specialty";
}

export interface SentSummary {
  count:    number;
  last:     SentRecord | null;
}

export function useSentHistory(): {
  records: SentRecord[];
  byDoctor: Map<string, SentSummary>;
} {
  const { data: batches = [] } = useScheduledBatches();
  const { data: runs = [] }    = useAutomationFlowRuns();
  const { data: zoho }         = useZohoData();

  return useMemo(() => {
    // useZohoData() is typed `unknown` project-wide; cast to the rows we read.
    const z = zoho as { rawLeads?: Array<Record<string, unknown>>; rawDoctorsOnBoard?: Array<Record<string, unknown>> } | undefined;
    const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
    // Resolve prefixed Zoho ids (lead:/dob:) → display name + specialty.
    const nameOf = new Map<string, { name: string; specialty: string | null }>();
    for (const d of z?.rawDoctorsOnBoard ?? []) {
      const name = (str(d.Full_Name) || `${str(d.First_Name)} ${str(d.Last_Name)}`).trim();
      if (d.id) nameOf.set(`dob:${str(d.id)}`, { name, specialty: str(d.Specialty_New) || str(d.Speciality) || null });
    }
    for (const l of z?.rawLeads ?? []) {
      const name = (str(l.Full_Name) || `${str(l.First_Name)} ${str(l.Last_Name)}`).trim();
      if (l.id) nameOf.set(`lead:${str(l.id)}`, { name, specialty: str(l.Specialty_New) || str(l.Specialty) || null });
    }

    const records: SentRecord[] = [];

    // ── Batch sends (status sent) → one record per (doctor, batch) ──────────
    for (const b of batches) {
      if (b.status !== "sent") continue;
      (b.doctor_ids ?? []).forEach((did, i) => {
        const resolved = nameOf.get(did);
        records.push({
          id:         `sent:batch:${b.id}:${i}`,
          doctorId:   did,
          doctorName: resolved?.name ?? did,
          specialty:  b.specialty ?? resolved?.specialty ?? null,
          sentKind:   b.kind,
          slot:       slotLabel(b.kind, i),
          hospital:   null,
          country:    b.country ?? null,
          sentAt:     b.sent_at,
          source:     "batch",
          refId:      b.id,
          route:      "/batches",
        });
      });
    }

    // ── Individual profile sends (Flow 2) ──────────────────────────────────
    for (const r of runs) {
      if (r.flow_key !== "profile_sent") continue;
      const resolved = r.doctor_id ? nameOf.get(r.doctor_id) : undefined;
      records.push({
        id:         `sent:run:${r.id}`,
        doctorId:   r.doctor_id,
        doctorName: r.doctor_name || resolved?.name || "—",
        specialty:  (r.metadata?.doctor_speciality as string | undefined) ?? resolved?.specialty ?? null,
        sentKind:   "individual",
        slot:       "individual",
        hospital:   r.hospital,
        country:    null,
        sentAt:     r.last_event_at ?? r.started_at ?? null,
        source:     "flow",
        refId:      r.id,
        route:      `/automations?flow=profile_sent`,
      });
    }

    // Newest first.
    records.sort((a, b) => (b.sentAt ?? "").localeCompare(a.sentAt ?? ""));

    // Per-doctor summary for the "already sent N×" pill in search.
    const byDoctor = new Map<string, SentSummary>();
    for (const rec of records) {
      if (!rec.doctorId) continue;
      const cur = byDoctor.get(rec.doctorId) ?? { count: 0, last: null };
      cur.count += 1;
      if (!cur.last || (rec.sentAt ?? "") > (cur.last.sentAt ?? "")) cur.last = rec;
      byDoctor.set(rec.doctorId, cur);
    }

    return { records, byDoctor };
  }, [batches, runs, zoho]);
}
