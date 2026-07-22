/**
 * Phase 6 — Recurring batch sends + specialty rotation hooks.
 *
 *   useScheduledBatches()       — every batch row, with realtime updates
 *   useSpecialtyRotation()      — singleton queue + cursor for specialty_of_day
 *   useUpsertBatch / useUpdateBatch / useCancelBatch
 *   useSendBatchNow             — invokes the send-batch edge function
 *   useUpdateSpecialtyRotation  — edits the queue
 */
import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTableSubscription } from "@/lib/realtime-registry";
import type { EmailAttachment } from "@/lib/email-attachments";

export type BatchKind   = "daily_duo" | "tuesday_top_15" | "specialty_of_day";
export type BatchStatus = "draft" | "sent" | "cancelled" | "failed";

/** Recurrence rule for a scheduled batch (Amir #5). */
export interface BatchRecurrence {
  freq:     "none" | "weekly";
  weekdays?: number[];   // 0=Sun … 6=Sat (for weekly)
  until?:   string | null;
}

/** Invoke an edge function but never wait forever. supabase.functions.invoke
 *  has no built-in timeout, so a cold start or a dropped connection could
 *  leave the UI spinning indefinitely (the "Building… stuck for 2 minutes"
 *  case). If it overruns, reject so the caller can surface an error + let the
 *  user retry. The underlying request is abandoned, not cancelled — harmless. */
async function invokeWithTimeout<T>(name: string, body: unknown, ms = 60_000): Promise<{ data: T | null; error: unknown }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("The email service didn't respond in time. Please try again.")), ms);
  });
  try {
    return await Promise.race([
      supabase.functions.invoke(name, { body }) as Promise<{ data: T | null; error: unknown }>,
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** supabase.functions.invoke throws a generic "Edge Function returned a non-2xx
 *  status code" and hides the function's OWN message in the response body. Dig
 *  it out so the UI shows the real reason — e.g. "No hospitals in Oman with a
 *  recruiter email…" instead of an opaque status error. */
async function fnErrorMessage(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const b = (await ctx.json()) as { error?: string; detail?: string } | null;
      if (b?.error) return b.detail ? `${b.error} — ${b.detail}` : b.error;
    } catch { /* body wasn't JSON — fall through */ }
  }
  const m = (error as { message?: string } | null)?.message;
  return m && !/non-2xx/i.test(m) ? m : fallback;
}

export interface ScheduledBatch {
  id:               string;
  kind:             BatchKind;
  scheduled_for:    string;             // ISO date
  scheduled_at_time: string | null;     // "HH:MM" Gulf time (Amir #5)
  timezone:         string | null;      // default Asia/Dubai
  recurrence:       BatchRecurrence | null;
  next_run_at:      string | null;
  specialty:        string | null;
  // ISO-or-display country name (UAE / Saudi Arabia / Qatar / Oman / etc).
  // When set, send-batch filters hospitals to those whose country matches.
  // Null = all hospitals (legacy / broadcast). Ammar 2026-06-03 spec is
  // that going forward every batch picks a country at create time.
  country:          string | null;
  /** Subject framing (Hasan 2026-07-20): 'recap' → "This weeks available doctors
   *  - Allocation Assist Platform - Excited to work in <city>"; 'specialty' →
   *  "<Specialty> available - … Excited to work in <city>"; null → legacy
   *  template subject. <city> = the recipient hospital's city. */
  header_mode:      "recap" | "specialty" | null;
  /** When true, the batch also emails each queued doctor a "working opportunity"
   *  note listing the hospitals it's recommending them to (with photos). */
  include_doctor_email: boolean;
  status:           BatchStatus;
  doctor_ids:       string[];
  /** Daily Duo only — one profile-card image URL per queued doctor, aligned to
   *  doctor_ids order. Generated client-side (html2canvas) when the duo is
   *  built, so the scheduled send can embed two individual profile images (like
   *  Profile Sent) instead of the combined table. [] = not prepared → send-batch
   *  falls back to the card/table render. */
  doctor_card_image_urls: string[];
  // CVs / logbooks attached to this batch's hospital email. Persisted on the
  // row so the scheduler (which sends server-side, no UI) carries them too.
  // send-batch forwards { filename, path } to Resend. Defaults to [].
  attachments:      EmailAttachment[];
  /** Recruiter emails EXCLUDED from this batch (unchecked in the preview).
   *  Persisted so a scheduled fire drops them too; send-batch reads it. []=none. */
  excluded_emails:  string[];
  hospital_count:   number | null;
  sent_at:          string | null;
  sent_message_id:  string | null;
  error:            string | null;
  notes:            string | null;
  created_by:       string | null;
  created_at:       string;
  updated_at:       string;
}

export interface SpecialtyRotation {
  id:                  number;
  queue:               string[];
  /** Persisted cursor at the anchor date. Read this when you want to
   *  edit the anchor; for "what specialty is today" use `effective_cursor_index`. */
  cursor_index:        number;
  /** Calendar date at which `cursor_index` was last set explicitly
   *  (queue edit OR Advance click). The displayed cursor auto-walks
   *  forward from here, one step per calendar day. */
  cursor_anchor_at:    string;
  /** Derived: today's pick. Computed client-side as
   *  (cursor_index + days_since_anchor) mod queue.length. */
  effective_cursor_index: number;
  last_sent_specialty: string | null;
  last_sent_at:        string | null;
  updated_at:          string;
}

/** Whole calendar days between two ISO timestamps, both pinned to UTC
 *  midnight so DST and timezone drift can't make the count flap by ±1. */
function calendarDaysBetween(from: string, to: Date): number {
  const a = new Date(from);
  const aUtc = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const bUtc = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.max(0, Math.floor((bUtc - aUtc) / 86_400_000));
}

const BATCHES_KEY  = ["scheduled-batches"] as const;
const ROTATION_KEY = ["specialty-rotation"] as const;

export function useScheduledBatches() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: BATCHES_KEY,
    queryFn: async (): Promise<ScheduledBatch[]> => {
      const { data, error } = await supabase
        .from("scheduled_batch_sends")
        .select("*")
        .order("scheduled_for", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as ScheduledBatch[];
    },
    staleTime: 30_000,
  });

  useTableSubscription("scheduled_batch_sends", useCallback(() => {
    qc.invalidateQueries({ queryKey: BATCHES_KEY });
  }, [qc]));

  return q;
}

export function useSpecialtyRotation() {
  return useQuery({
    queryKey: ROTATION_KEY,
    queryFn: async (): Promise<SpecialtyRotation> => {
      const { data, error } = await supabase
        .from("specialty_rotation_state")
        .select("*")
        .eq("id", 1)
        .single();
      if (error) throw error;
      const row = data as Omit<SpecialtyRotation, "effective_cursor_index">;
      // Derive today's pick from the anchor. The DB cursor only moves
      // when the team explicitly advances or edits — the day-to-day
      // walk is a render-time computation, so the UI updates every
      // calendar day without any cron / write.
      const queueLen = Math.max(1, row.queue?.length ?? 0);
      const daysSince = row.cursor_anchor_at ? calendarDaysBetween(row.cursor_anchor_at, new Date()) : 0;
      const effective_cursor_index = ((row.cursor_index % queueLen) + (daysSince % queueLen) + queueLen) % queueLen;
      return { ...row, effective_cursor_index };
    },
    // Refetch every 5 minutes so a long-open tab eventually catches a
    // day-rollover even without a navigation. Day boundaries happen at
    // midnight; the user might have the dashboard open across them.
    staleTime:   5  * 60_000,
    refetchInterval: 15 * 60_000,
  });
}

export interface UpsertBatchInput {
  id?:            string;
  kind:           BatchKind;
  scheduled_for:  string;
  scheduled_at_time?: string | null;
  timezone?:      string | null;
  recurrence?:    BatchRecurrence | null;
  specialty?:     string | null;
  country?:       string | null;
  header_mode?:   "recap" | "specialty" | null;
  include_doctor_email?: boolean;
  doctor_ids?:    string[];
  notes?:         string | null;
  excluded_emails?: string[];
}

export function useUpsertBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertBatchInput): Promise<ScheduledBatch> => {
      const { data: sess } = await supabase.auth.getSession();
      const createdBy = sess.session?.user.email ?? null;
      const payload = {
        ...(input.id ? { id: input.id } : {}),
        kind:          input.kind,
        scheduled_for: input.scheduled_for,
        ...(input.scheduled_at_time !== undefined ? { scheduled_at_time: input.scheduled_at_time } : {}),
        ...(input.timezone   !== undefined ? { timezone: input.timezone } : {}),
        ...(input.recurrence !== undefined ? { recurrence: input.recurrence } : {}),
        specialty:     input.specialty ?? null,
        country:       input.country   ?? null,
        ...(input.header_mode !== undefined ? { header_mode: input.header_mode } : {}),
        doctor_ids:    input.doctor_ids ?? [],
        notes:         input.notes ?? null,
        ...(input.excluded_emails !== undefined ? { excluded_emails: input.excluded_emails } : {}),
        created_by:    createdBy,
        updated_at:    new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from("scheduled_batch_sends")
        .upsert(payload, { onConflict: "id" })
        .select("*")
        .single();
      // Throw a real Error — a raw PostgrestError object stringifies to
      // "[object Object]", hiding the actual cause (e.g. a unique-violation).
      if (error) throw new Error(error.message || error.details || error.hint || "Batch upsert failed");
      return data as ScheduledBatch;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: BATCHES_KEY }),
  });
}

export function useUpdateBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ScheduledBatch> }): Promise<ScheduledBatch> => {
      const { data, error } = await supabase
        .from("scheduled_batch_sends")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw new Error(error.message || error.details || error.hint || "Batch update failed");
      return data as ScheduledBatch;
    },
    // Optimistic: patch the cached row immediately so attachment chips, queued
    // doctors and reorders appear/disappear instantly instead of waiting a DB
    // round-trip (matches the in-memory feel of the Send Profile flow). Roll
    // back on error; reconcile on settle.
    onMutate: async ({ id, patch }: { id: string; patch: Partial<ScheduledBatch> }) => {
      await qc.cancelQueries({ queryKey: BATCHES_KEY });
      const prev = qc.getQueryData<ScheduledBatch[]>(BATCHES_KEY);
      if (prev) {
        qc.setQueryData<ScheduledBatch[]>(BATCHES_KEY, prev.map(b => b.id === id ? { ...b, ...patch } : b));
      }
      return { prev };
    },
    onError: (_e, _vars, ctx) => {
      const c = ctx as { prev?: ScheduledBatch[] } | undefined;
      if (c?.prev) qc.setQueryData(BATCHES_KEY, c.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: BATCHES_KEY }),
  });
}

export function useCancelBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<{ id: string }> => {
      // Cancel = delete. A cancelled draft was never sent, so there's no
      // audit value in keeping the row around — and leaving it in "Past
      // sends" was the source of "I cancelled but it's still there" confusion.
      // The send-batch + tick-scheduler functions already reject non-draft
      // status, so there's no race window where a deleted batch can still
      // fire. .select().single() forces Supabase to throw if 0 rows match.
      const { data, error } = await supabase
        .from("scheduled_batch_sends")
        .delete()
        .eq("id", id)
        .select("id")
        .single();
      if (error) throw error;
      if (!data) throw new Error("Cancel touched 0 rows — does the batch still exist?");
      return data;
    },
    // Optimistic removal — row disappears from the list instantly.
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: BATCHES_KEY });
      const prev = qc.getQueryData<ScheduledBatch[]>(BATCHES_KEY);
      if (prev) {
        qc.setQueryData<ScheduledBatch[]>(BATCHES_KEY, prev.filter(b => b.id !== id));
      }
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(BATCHES_KEY, ctx.prev);  // rollback
    },
    onSettled: () => qc.invalidateQueries({ queryKey: BATCHES_KEY }),
  });
}

export function useSendBatchNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: string | {
        batchId: string; force?: boolean;
        // Edits from the preview, shipped verbatim by send-batch instead of
        // re-rendering the template. Omit/blank → template version is sent.
        subjectOverride?: string; htmlOverride?: string; textOverride?: string;
        // Same, for the optional doctor "working opportunity" email.
        doctorSubjectOverride?: string; doctorHtmlOverride?: string;
        // Extra CC / BCC from the preview, added on top of the hospital BCC list.
        ccOverride?: string[]; bccOverride?: string[];
        // Recruiter emails to DROP from this send (hospitals unchecked in the preview).
        excludeOverride?: string[];
      },
    ): Promise<{ ok: boolean; bcc_count?: number; doctor_count?: number; message_id?: string; error?: string }> => {
      // Accept either a bare id (legacy callers) or an object with a force
      // flag (used by the Resend button to re-fire an already-sent batch).
      const batchId = typeof input === "string" ? input : input.batchId;
      const force   = typeof input === "string" ? false  : !!input.force;
      const overrides = typeof input === "string" ? {} : {
        ...(input.subjectOverride ? { subject_override: input.subjectOverride } : {}),
        ...(input.htmlOverride    ? { html_override:    input.htmlOverride }    : {}),
        ...(input.textOverride    ? { text_override:    input.textOverride }    : {}),
        ...(input.doctorSubjectOverride ? { doctor_subject_override: input.doctorSubjectOverride } : {}),
        ...(input.doctorHtmlOverride    ? { doctor_html_override:    input.doctorHtmlOverride }    : {}),
        ...(input.ccOverride?.length  ? { cc_override:  input.ccOverride }  : {}),
        ...(input.bccOverride?.length ? { bcc_override: input.bccOverride } : {}),
        ...(input.excludeOverride?.length ? { exclude_override: input.excludeOverride } : {}),
      };
      const { data, error } = await invokeWithTimeout<{ ok: boolean; bcc_count?: number; doctor_count?: number; message_id?: string; error?: string }>(
        "send-batch", { batch_id: batchId, force, ...overrides }, 90_000);
      if (error) throw new Error(await fnErrorMessage(error, "send-batch failed"));
      const res = data as { ok: boolean; bcc_count?: number; doctor_count?: number; message_id?: string; error?: string };
      if (!res.ok) throw new Error(res.error ?? "send-batch failed");
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BATCHES_KEY });
      qc.invalidateQueries({ queryKey: ROTATION_KEY });
    },
  });
}

/** Build the batch email WITHOUT sending it (send-batch `dry_run`), so the
 *  user can preview exactly what hospitals will receive before firing.
 *  Returns the rendered subject + HTML + the BCC recipient count. */
export interface BatchDoctorPreview { included: boolean; subject: string; html: string; text: string; recipient_count: number }
export interface BatchPreviewResult { subject: string; html: string; text: string; from: string; bcc_count: number; doctor_email?: BatchDoctorPreview }
export function useBatchPreview() {
  return useMutation({
    mutationFn: async (input: string | { batchId: string; force?: boolean }): Promise<BatchPreviewResult> => {
      const batchId = typeof input === "string" ? input : input.batchId;
      const force   = typeof input === "string" ? false  : !!input.force;
      const { data, error } = await invokeWithTimeout<{ ok: boolean; preview?: Omit<BatchPreviewResult, "doctor_email">; doctor_email?: BatchDoctorPreview; error?: string }>(
        "send-batch", { batch_id: batchId, dry_run: true, force }, 60_000);
      if (error) throw new Error(await fnErrorMessage(error, "Preview failed"));
      const res = data as { ok: boolean; preview?: Omit<BatchPreviewResult, "doctor_email">; doctor_email?: BatchDoctorPreview; error?: string };
      if (!res.ok || !res.preview) throw new Error(res.error ?? "Preview failed");
      return { ...res.preview, doctor_email: res.doctor_email };
    },
  });
}

export function useUpdateSpecialtyRotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: { queue?: string[]; cursor_index?: number }): Promise<SpecialtyRotation> => {
      // Any explicit edit to the cursor or queue re-anchors at today so
      // the daily-walk math restarts from "now". Without this, clicking
      // Advance once but viewing the page a week later would jump 8
      // specialties forward (1 manual + 7 derived).
      const stamp = { ...patch, updated_at: new Date().toISOString(), cursor_anchor_at: new Date().toISOString() };
      const { data, error } = await supabase
        .from("specialty_rotation_state")
        .update(stamp)
        .eq("id", 1)
        .select("*")
        .single();
      if (error) throw error;
      return data as SpecialtyRotation;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ROTATION_KEY }),
  });
}
