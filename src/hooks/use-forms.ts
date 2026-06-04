/**
 * Forms infrastructure — read + write hooks for the /forms page.
 *
 * useForms()              — all registered forms (paginated; tiny so 1 page typically).
 * useFormResponses(id)    — responses for one form, paginated to handle high-volume forms.
 * useCreateForm()         — register a new Typeform / external form.
 * useUpdateForm()         — edit name / description / active.
 * useDeleteForm()         — hard delete (cascades responses).
 *
 * Pagination uses .range() in 1000-row pages — Supabase's API caps
 * server-side at 1000 regardless of .limit().
 */
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useCallback } from "react";
import { useTableSubscription } from "@/lib/realtime-registry";

export interface Form {
  id:                string;
  name:              string;
  description:       string | null;
  form_type:         string;
  provider:          string;
  /** Typeform's form id (from URL). NULL for Elementor / generic
   *  webhook sources that don't have a provider-side stable id. */
  provider_form_id:  string | null;
  webhook_secret:    string | null;
  public_url:        string | null;
  /** Typeform Personal Access Token — required for historical sync.
   *  Stored encrypted at the Postgres-row level by Supabase. */
  api_token:         string | null;
  response_count:    number;
  last_response_at:  string | null;
  active:            boolean;
  created_by:        string | null;
  created_at:        string;
  updated_at:        string;
}

export interface FormResponse {
  id:                    string;
  form_id:               string;
  provider_response_id:  string;
  submitted_at:          string;
  raw_payload:           Record<string, unknown>;
  answers:               Record<string, string>;
  respondent_name:       string | null;
  respondent_email:      string | null;
  doctor_id:             string | null;
  created_at:            string;
}

const FORMS_KEY = ["forms"] as const;
const RESP_KEY  = (formId: string | null) => ["form-responses", formId ?? "_"] as const;

async function fetchAllPaginated<T>(table: string, order: { col: string; ascending?: boolean }, eq?: { col: string; val: string }): Promise<T[]> {
  const PAGE = 1000;
  const all: T[] = [];
  for (let from = 0; from < 50_000; from += PAGE) {
    let q = supabase.from(table).select("*").order(order.col, { ascending: order.ascending ?? false });
    if (eq) q = q.eq(eq.col, eq.val);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as T[];
    all.push(...batch);
    if (batch.length < PAGE) break;
  }
  return all;
}

export function useForms() {
  const qc = useQueryClient();
  const q = useQuery<Form[]>({
    queryKey: FORMS_KEY,
    queryFn:  () => fetchAllPaginated<Form>("forms", { col: "updated_at" }),
    staleTime: 30_000,
  });
  useTableSubscription("forms", useCallback(() => {
    qc.invalidateQueries({ queryKey: FORMS_KEY });
  }, [qc]));
  return q;
}

export function useFormResponses(formId: string | null) {
  const qc = useQueryClient();
  const q = useQuery<FormResponse[]>({
    queryKey: RESP_KEY(formId),
    enabled:  !!formId,
    queryFn: () => formId ? fetchAllPaginated<FormResponse>("form_responses", { col: "submitted_at" }, { col: "form_id", val: formId }) : Promise.resolve([]),
    staleTime: 15_000,
  });
  useTableSubscription("form_responses", useCallback(() => {
    if (formId) qc.invalidateQueries({ queryKey: RESP_KEY(formId) });
  }, [qc, formId]));
  return q;
}

// ─── server-side paginated + searchable hook ──────────────────────────

export interface FormResponseFilters {
  search?:     string;             // matched against search_text (ILIKE)
  date?:       "7d" | "30d" | "90d" | "all";
  link?:       "all" | "linked" | "unlinked";
  sort?:       "newest" | "oldest";
}

/** Page sizes. First page is big so the user sees a lot at once, then
 *  smaller incremental pages keep subsequent scroll responsive. */
export const FORM_RESPONSES_FIRST_PAGE  = 200;
export const FORM_RESPONSES_NEXT_PAGE   = 50;

const RESP_INF_KEY = (formId: string | null, f: FormResponseFilters) =>
  ["form-responses-infinite", formId ?? "_", f.search ?? "", f.date ?? "all", f.link ?? "all", f.sort ?? "newest"] as const;

/** Paginated + filterable response feed for one form. All filters
 *  including the search query are pushed down to PostgREST so we
 *  never load the full table client-side (~17k rows on the busy form
 *  was the slowness the team was hitting). Returns the standard
 *  useInfiniteQuery shape — call .fetchNextPage() from a sentinel. */
export function useFormResponsesInfinite(formId: string | null, filters: FormResponseFilters) {
  const qc = useQueryClient();
  const q = useInfiniteQuery({
    queryKey: RESP_INF_KEY(formId, filters),
    enabled:  !!formId,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      if (!formId) return { rows: [] as FormResponse[], nextOffset: null as number | null };
      // Variable page size — first page is 200, every page after is 50.
      const pageIndex = pageParam as number;
      const offset    = pageIndex === 0
        ? 0
        : FORM_RESPONSES_FIRST_PAGE + (pageIndex - 1) * FORM_RESPONSES_NEXT_PAGE;
      const limit     = pageIndex === 0 ? FORM_RESPONSES_FIRST_PAGE : FORM_RESPONSES_NEXT_PAGE;

      let query = supabase
        .from("form_responses")
        .select("*")
        .eq("form_id", formId)
        .order("submitted_at", { ascending: filters.sort === "oldest", nullsFirst: false });

      if (filters.date && filters.date !== "all") {
        const days = filters.date === "7d" ? 7 : filters.date === "30d" ? 30 : 90;
        const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
        query = query.gte("submitted_at", cutoff);
      }
      if (filters.link === "linked")   query = query.not("doctor_id", "is", null);
      if (filters.link === "unlinked") query = query.is("doctor_id", null);

      const term = filters.search?.trim().toLowerCase();
      if (term) {
        // search_text is built by the trigger from name + email + doctor_id
        // + every answer value, so a single ILIKE covers the whole row.
        query = query.ilike("search_text", `%${term}%`);
      }

      query = query.range(offset, offset + limit - 1);
      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []) as FormResponse[];
      // If we got a full page back, more might exist. We can't know
      // without a count query — over-asking by one isn't worth the round
      // trip, so we just assume more if the page filled.
      const nextOffset = rows.length === limit ? pageIndex + 1 : null;
      return { rows, nextOffset };
    },
    getNextPageParam: (last) => last.nextOffset,
    staleTime: 15_000,
  });

  // Realtime: any new row → invalidate the whole infinite cache for
  // this form. Cheap because the page only renders the loaded pages.
  useTableSubscription("form_responses", useCallback(() => {
    if (formId) qc.invalidateQueries({ queryKey: ["form-responses-infinite", formId] });
  }, [qc, formId]));

  return q;
}

/** Cheap per-form stat counters. Three server-side count queries —
 *  total, last-7-days, doctor-linked. Used by the KPI strip on /forms,
 *  which used to compute these client-side from the full response set. */
export function useFormStats(formId: string | null) {
  return useQuery({
    queryKey: ["form-stats", formId ?? "_"],
    enabled:  !!formId,
    queryFn: async () => {
      if (!formId) return { total: 0, last7d: 0, last30d: 0 };
      const cutoff7  = new Date(Date.now() - 7  * 86_400_000).toISOString();
      const cutoff30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const [totalRes, last7Res, last30Res] = await Promise.all([
        supabase.from("form_responses").select("id", { count: "exact", head: true }).eq("form_id", formId),
        supabase.from("form_responses").select("id", { count: "exact", head: true }).eq("form_id", formId).gte("submitted_at", cutoff7),
        supabase.from("form_responses").select("id", { count: "exact", head: true }).eq("form_id", formId).gte("submitted_at", cutoff30),
      ]);
      return {
        total:   totalRes.count   ?? 0,
        last7d:  last7Res.count   ?? 0,
        last30d: last30Res.count  ?? 0,
      };
    },
    staleTime: 60_000,
  });
}

export interface CreateFormInput {
  name:              string;
  description?:      string | null;
  form_type?:        string;
  provider?:         string;
  provider_form_id?: string | null;
  public_url?:       string | null;
  webhook_secret?:   string | null;
  api_token?:        string | null;
}

export function useCreateForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateFormInput): Promise<Form> => {
      const { data: sess } = await supabase.auth.getSession();
      const createdBy = sess.session?.user.email ?? null;
      const { data, error } = await supabase.from("forms").insert({
        name:              input.name,
        description:       input.description ?? null,
        form_type:         input.form_type ?? "custom",
        provider:          input.provider ?? "typeform",
        provider_form_id:  input.provider_form_id,
        public_url:        input.public_url ?? null,
        webhook_secret:    input.webhook_secret ?? null,
        created_by:        createdBy,
      }).select("*").single();
      if (error) throw error;
      return data as Form;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: FORMS_KEY }),
  });
}

export function useUpdateForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Form> }): Promise<Form> => {
      const { data, error } = await supabase.from("forms")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id).select("*").single();
      if (error) throw error;
      return data as Form;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: FORMS_KEY }),
  });
}

export function useDeleteForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("forms").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: FORMS_KEY }),
  });
}

/** Generate a strong random webhook secret (32 hex chars). Returned
 *  to the caller so they can show it to the user once + paste it into
 *  Typeform's webhook UI. */
export function generateWebhookSecret(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return Array.from(buf).map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Call the typeform-historical-sync edge function for a Typeform.
 *  Requires forms.api_token to be set on the row. Returns
 *  { fetched, inserted, skipped }. */
export function useSyncTypeformHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (formId: string) => {
      const { data, error } = await supabase.functions.invoke("typeform-historical-sync", {
        body: { form_id: formId },
      });
      if (error) throw error;
      const resp = data as { ok: boolean; error?: string; fetched: number; inserted: number; skipped: number; totalReported?: number };
      if (!resp.ok) throw new Error(resp.error ?? "Sync failed");
      return resp;
    },
    onSuccess: (_, formId) => {
      qc.invalidateQueries({ queryKey: RESP_KEY(formId) });
      qc.invalidateQueries({ queryKey: FORMS_KEY });
    },
  });
}
