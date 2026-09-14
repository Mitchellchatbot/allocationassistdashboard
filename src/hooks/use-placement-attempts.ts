/**
 * Per-(doctor, hospital) placement journey.
 *
 * Replaces the per-doctor read path that used to come out of
 * doctor_lifecycle. The CSV from Ammar's Hammad sheet shows the same
 * doctor at multiple hospitals (e.g. Anas Saleh shortlisted at four
 * hospitals on the same day) — the per-doctor model couldn't represent
 * that, so a new table was added in 20260603000013_placement_attempts.sql.
 *
 * Mutations: useUpsertPlacementAttempt, useDeletePlacementAttempt.
 * Inserts via this hook trigger the DB sync that updates the parent
 * doctor_lifecycle row (earliest join/sign/paid date wins).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { ensureSecondPaymentRun } from "@/hooks/use-doctor-lifecycle";

export interface PlacementAttempt {
  id:               string;
  doctor_id:        string;
  doctor_name:      string;
  doctor_specialty: string | null;
  hospital_id:      string | null;
  hospital_name:    string;
  shortlisted_at:   string | null;
  interviewed_at:   string | null;
  offered_at:       string | null;
  signed_at:        string | null;
  start_date:       string | null;
  joined_at:        string | null;
  relocated_at:     string | null;
  paid_at:          string | null;
  notes:            string | null;
  source:           string;
  created_by:       string | null;
  created_at:       string;
  updated_at:       string;
}

const KEY = ["placement-attempts"] as const;

export function usePlacementAttempts() {
  return useQuery<PlacementAttempt[]>({
    queryKey: KEY,
    queryFn: async () => {
      // Supabase API gateway has a hard 1000-row cap that .limit() can't
      // override (the cap is enforced server-side regardless of client
      // request). Paginate via .range() in 1000-row pages until we've
      // pulled everything. ~12 months of CSV history at ~300/month
      // = ~3.6k rows so 4 round-trips, still well under a second.
      const PAGE = 1000;
      const all: PlacementAttempt[] = [];
      const seen = new Set<string>();
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("placement_attempts")
          .select("*")
          // `id` breaks ties: updated_at alone is not unique, so rows sharing a
          // timestamp can reshuffle between page requests and be fetched twice.
          .order("updated_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const batch = (data ?? []) as PlacementAttempt[];
        // A write landing mid-pagination reorders later pages, so a row can
        // still arrive twice even with a stable sort.
        for (const row of batch) if (!seen.has(row.id)) { seen.add(row.id); all.push(row); }
        if (batch.length < PAGE) break;     // last page reached
        if (all.length >= 50_000) break;    // sanity stop — shouldn't hit this
      }
      return all;
    },
    staleTime: 30_000,
  });
}

/** Group attempts by doctor for views that want the per-doctor rollup
 *  (e.g. "this doctor has 4 active attempts"). */
export function groupAttemptsByDoctor(attempts: PlacementAttempt[]): Record<string, PlacementAttempt[]> {
  const m: Record<string, PlacementAttempt[]> = {};
  for (const a of attempts) {
    if (!m[a.doctor_id]) m[a.doctor_id] = [];
    m[a.doctor_id].push(a);
  }
  return m;
}

export interface UpsertAttemptInput {
  id?:              string;
  doctor_id:        string;
  doctor_name:      string;
  doctor_specialty?: string | null;
  hospital_id?:     string | null;
  hospital_name:    string;
  shortlisted_at?:  string | null;
  interviewed_at?:  string | null;
  offered_at?:      string | null;
  signed_at?:       string | null;
  start_date?:      string | null;
  joined_at?:       string | null;
  paid_at?:         string | null;
  notes?:           string | null;
  source?:          string;
}

export function useUpsertPlacementAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertAttemptInput): Promise<PlacementAttempt> => {
      const { data: sess } = await supabase.auth.getSession();
      const createdBy = sess.session?.user.email ?? null;
      const payload = {
        ...(input.id ? { id: input.id } : {}),
        doctor_id:        input.doctor_id,
        doctor_name:      input.doctor_name,
        doctor_specialty: input.doctor_specialty ?? null,
        hospital_id:      input.hospital_id ?? null,
        hospital_name:    input.hospital_name,
        shortlisted_at:   input.shortlisted_at ?? null,
        interviewed_at:   input.interviewed_at ?? null,
        offered_at:       input.offered_at ?? null,
        signed_at:        input.signed_at ?? null,
        start_date:       input.start_date ?? null,
        joined_at:        input.joined_at ?? null,
        paid_at:          input.paid_at ?? null,
        notes:            input.notes ?? null,
        source:           input.source ?? "manual",
        created_by:       createdBy,
        updated_at:       new Date().toISOString(),
      };
      // Upsert on the (doctor_id, hospital_name) unique key so calling
      // this with the same pair updates the existing row in place.
      const { data, error } = await supabase
        .from("placement_attempts")
        .upsert(payload, { onConflict: input.id ? "id" : "doctor_id,hospital_name" })
        .select("*")
        .single();
      if (error) throw error;

      // Side effect: when joined_at lands (newly or updated), make sure
      // the Second Payment flow run exists for this doctor. The DB
      // trigger already syncs doctor_lifecycle.joined_at; this matches
      // what useMarkLifecycle.mark_joined used to do TS-side (creates
      // the flow run that drives the 45-day invoice clock).
      if (input.joined_at) {
        try {
          await ensureSecondPaymentRun(input.doctor_id, input.doctor_name, input.joined_at);
        } catch (e) {
          // Non-fatal — the placement save succeeded. Surface in the
          // console for debugging; don't break the UI.
          console.warn("[useUpsertPlacementAttempt] ensureSecondPaymentRun failed (non-fatal):", e);
        }
      }
      return data as PlacementAttempt;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["doctor-lifecycles"] });
      qc.invalidateQueries({ queryKey: ["placements"] });           // legacy key from B1
      qc.invalidateQueries({ queryKey: ["recap-lifecycles"] });
      qc.invalidateQueries({ queryKey: ["search-placements"] });
    },
  });
}

/** The five milestones the /processing tracker marks. */
export type MilestoneColumn =
  | "shortlisted_at" | "interviewed_at" | "offered_at" | "signed_at" | "joined_at";

/**
 * Set (or clear) ONE milestone date on an existing attempt.
 *
 * Deliberately not useUpsertPlacementAttempt: that one rebuilds the whole
 * row (so omitted dates get nulled) and fires the Second Payment flow when
 * joined_at lands. /processing is a marking-only surface — it must never
 * send an email or wipe a sibling date.
 */
export function useMarkPlacementMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, column, date }: { id: string; column: MilestoneColumn; date: string | null }) => {
      const { error } = await supabase
        .from("placement_attempts")
        .update({ [column]: date, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["doctor-lifecycles"] });
      qc.invalidateQueries({ queryKey: ["placements"] });
      qc.invalidateQueries({ queryKey: ["recap-lifecycles"] });
      qc.invalidateQueries({ queryKey: ["search-placements"] });
    },
  });
}

export function useDeletePlacementAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("placement_attempts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["placements"] });
    },
  });
}

/** Bulk-insert path used by the CSV importer. Skips rows that already
 *  exist for the same (doctor_id, hospital_name) pair instead of
 *  overwriting — manual edits should win over a re-import. */
export function useBulkInsertPlacementAttempts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: UpsertAttemptInput[]) => {
      if (rows.length === 0) return { inserted: 0, skipped: 0 };
      const { data: sess } = await supabase.auth.getSession();
      const createdBy = sess.session?.user.email ?? null;
      const payload = rows.map(r => ({
        doctor_id:        r.doctor_id,
        doctor_name:      r.doctor_name,
        doctor_specialty: r.doctor_specialty ?? null,
        hospital_id:      r.hospital_id ?? null,
        hospital_name:    r.hospital_name,
        shortlisted_at:   r.shortlisted_at ?? null,
        interviewed_at:   r.interviewed_at ?? null,
        offered_at:       r.offered_at ?? null,
        signed_at:        r.signed_at ?? null,
        start_date:       r.start_date ?? null,
        joined_at:        r.joined_at ?? null,
        paid_at:          r.paid_at ?? null,
        notes:            r.notes ?? null,
        source:           r.source ?? "csv_import",
        created_by:       createdBy,
      }));
      // ignoreDuplicates honours the unique (doctor_id, hospital_name)
      // index — re-importing the same CSV is safe.
      const { data, error } = await supabase
        .from("placement_attempts")
        .upsert(payload, { onConflict: "doctor_id,hospital_name", ignoreDuplicates: true })
        .select("id");
      if (error) throw error;

      // Fire Second Payment flow for every row that landed with a
      // joined_at — same side effect as the single-row upsert. Sequential
      // (not Promise.all) so a 300-row import doesn't slam the function.
      for (const r of rows) {
        if (!r.joined_at) continue;
        try {
          await ensureSecondPaymentRun(r.doctor_id, r.doctor_name, r.joined_at);
        } catch (e) {
          console.warn("[useBulkInsertPlacementAttempts] ensureSecondPaymentRun failed for", r.doctor_id, e);
        }
      }
      return { inserted: data?.length ?? 0, skipped: rows.length - (data?.length ?? 0) };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["doctor-lifecycles"] });
      qc.invalidateQueries({ queryKey: ["placements"] });
      qc.invalidateQueries({ queryKey: ["recap-lifecycles"] });
    },
  });
}

export const MILESTONE_COLUMNS = [
  "shortlisted_at", "interviewed_at", "offered_at", "signed_at", "start_date", "joined_at",
] as const;

export type MilestoneColumn = typeof MILESTONE_COLUMNS[number];

export interface MergePlan {
  inserts: UpsertAttemptInput[];
  /** Existing row id → the full merged milestone set to write. */
  updates: Array<{ id: string; row: PlacementAttempt; merged: Record<MilestoneColumn, string | null>; filled: MilestoneColumn[]; notes: string | null }>;
  /** Parsed rows that matched an existing row and added nothing new. */
  unchanged: number;
}

const mergeKey = (doctorId: string, hospital: string) =>
  `${doctorId}|${hospital.toLowerCase().replace(/\s*-\s*/g, "-").replace(/\s+/g, " ").trim()}`;

/** Earliest date wins: a doctor shortlisted in July and again in August is one
 *  journey, and the July date is when it actually happened. */
const earlier = (a: string | null, b: string | null) =>
  a && b ? (a < b ? a : b) : (a ?? b);

const joinNotes = (a: string | null | undefined, b: string | null | undefined) => {
  const parts = [...(a ?? "").split(" · "), ...(b ?? "").split(" · ")].map(s => s.trim()).filter(Boolean);
  return parts.length ? [...new Set(parts)].join(" · ") : null;
};

/**
 * Work out what an import would change, without touching the database.
 *
 * The monthly sheets overlap — the same (doctor, hospital) shows up week after
 * week as it moves through the stages — so parsed rows are collapsed into one
 * journey each, and an existing row only ever gains dates it was missing. A
 * date already in the database is never overwritten by a later sheet.
 */
export function planPlacementImport(rows: UpsertAttemptInput[], existing: PlacementAttempt[]): MergePlan {
  const collapsed = new Map<string, UpsertAttemptInput>();
  for (const r of rows) {
    const k = mergeKey(r.doctor_id, r.hospital_name);
    const prev = collapsed.get(k);
    if (!prev) { collapsed.set(k, { ...r }); continue; }
    for (const c of MILESTONE_COLUMNS) prev[c] = earlier(prev[c] ?? null, r[c] ?? null);
    prev.notes = joinNotes(prev.notes, r.notes);
    prev.doctor_specialty ??= r.doctor_specialty;
    prev.hospital_id ??= r.hospital_id;
  }

  const byKey = new Map<string, PlacementAttempt>();
  for (const a of existing) {
    const k = mergeKey(a.doctor_id, a.hospital_name);
    if (!byKey.has(k)) byKey.set(k, a);
  }

  const plan: MergePlan = { inserts: [], updates: [], unchanged: 0 };
  for (const [k, r] of collapsed) {
    const hit = byKey.get(k);
    if (!hit) { plan.inserts.push(r); continue; }
    const merged = {} as Record<MilestoneColumn, string | null>;
    const filled: MilestoneColumn[] = [];
    for (const c of MILESTONE_COLUMNS) {
      const incoming = r[c] ?? null;
      merged[c] = hit[c] ?? incoming;
      if (!hit[c] && incoming) filled.push(c);
    }
    const notes = joinNotes(hit.notes, r.notes);
    if (!filled.length && notes === hit.notes) { plan.unchanged++; continue; }
    plan.updates.push({ id: hit.id, row: hit, merged, filled, notes });
  }
  return plan;
}

/**
 * Apply a MergePlan. Deliberately does NOT call ensureSecondPaymentRun the way
 * useBulkInsertPlacementAttempts does: this path backfills historical sheets,
 * and a months-old join date must not kick off a live payment email.
 */
export function useApplyPlacementImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (plan: MergePlan) => {
      const { data: sess } = await supabase.auth.getSession();
      const createdBy = sess.session?.user.email ?? null;
      const CHUNK = 500;

      let inserted = 0;
      for (let i = 0; i < plan.inserts.length; i += CHUNK) {
        const payload = plan.inserts.slice(i, i + CHUNK).map(r => ({
          doctor_id:        r.doctor_id,
          doctor_name:      r.doctor_name,
          doctor_specialty: r.doctor_specialty ?? null,
          hospital_id:      r.hospital_id ?? null,
          hospital_name:    r.hospital_name,
          shortlisted_at:   r.shortlisted_at ?? null,
          interviewed_at:   r.interviewed_at ?? null,
          offered_at:       r.offered_at ?? null,
          signed_at:        r.signed_at ?? null,
          start_date:       r.start_date ?? null,
          joined_at:        r.joined_at ?? null,
          notes:            r.notes ?? null,
          source:           r.source ?? "csv_import",
          created_by:       createdBy,
        }));
        const { data, error } = await supabase
          .from("placement_attempts")
          .upsert(payload, { onConflict: "doctor_id,hospital_name", ignoreDuplicates: true })
          .select("id");
        if (error) throw error;
        inserted += data?.length ?? 0;
      }

      let updated = 0;
      for (let i = 0; i < plan.updates.length; i += CHUNK) {
        // An upsert is an INSERT that falls back to UPDATE, so Postgres builds the
        // whole candidate row before it looks at the conflict — the NOT NULL
        // identity columns must be present even though only milestones change.
        // Every object also carries the same keys, because PostgREST nulls out
        // columns that are missing from some rows of a batch.
        const payload = plan.updates.slice(i, i + CHUNK).map(u => ({
          id:            u.id,
          doctor_id:     u.row.doctor_id,
          doctor_name:   u.row.doctor_name,
          hospital_name: u.row.hospital_name,
          ...u.merged,
          notes:         u.notes,
        }));
        const { data, error } = await supabase
          .from("placement_attempts")
          .upsert(payload, { onConflict: "id" })
          .select("id");
        if (error) throw error;
        updated += data?.length ?? 0;
      }

      return { inserted, updated, unchanged: plan.unchanged };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["doctor-lifecycles"] });
      qc.invalidateQueries({ queryKey: ["placements"] });
      qc.invalidateQueries({ queryKey: ["recap-lifecycles"] });
    },
  });
}
