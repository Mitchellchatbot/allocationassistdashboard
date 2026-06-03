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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
      const resp = data as { ok: boolean; error?: string; fetched: number; inserted: number; skipped: number };
      if (!resp.ok) throw new Error(resp.error ?? "Sync failed");
      return resp;
    },
    onSuccess: (_, formId) => {
      qc.invalidateQueries({ queryKey: RESP_KEY(formId) });
      qc.invalidateQueries({ queryKey: FORMS_KEY });
    },
  });
}
