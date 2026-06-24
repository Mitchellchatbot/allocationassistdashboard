/**
 * Per-doctor "dossier" lookups for the Doctors → Overview tab. Each is keyed by
 * the AA prefixed doctor_id (`dob:<zohoId>`), the same key form_responses /
 * cv_uploads carry (stamped via the lookup_doctor_id_by_email RPC). Queries are
 * `enabled` only when a doctorId is passed, so they fire lazily — the Overview
 * mounts a detail component (and thus these hooks) only when a row is expanded.
 */
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { FormResponse } from "@/hooks/use-forms";
import type { CvUpload } from "@/hooks/use-cv-uploads";
import { REVENUE_PER_CONVERSION_AED } from "@/lib/revenue";

/** All form responses linked to a doctor, newest first. */
export function useDoctorFormResponses(doctorId: string | null) {
  return useQuery({
    queryKey: ["doctor-dossier", "forms", doctorId ?? "_"],
    enabled: !!doctorId,
    queryFn: async (): Promise<FormResponse[]> => {
      if (!doctorId) return [];
      const { data, error } = await supabase
        .from("form_responses")
        .select("*")
        .eq("doctor_id", doctorId)
        .order("submitted_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as FormResponse[];
    },
    staleTime: 60_000,
  });
}

/** All CV-upload rows for a doctor, newest first. The latest with
 *  status="extracted" carries the parsed CV fields in `extracted_data`. */
export function useDoctorCvUploads(doctorId: string | null) {
  return useQuery({
    queryKey: ["doctor-dossier", "cv", doctorId ?? "_"],
    enabled: !!doctorId,
    queryFn: async (): Promise<CvUpload[]> => {
      if (!doctorId) return [];
      const { data, error } = await supabase
        .from("cv_uploads")
        .select("*")
        .eq("doctor_id", doctorId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as CvUpload[];
    },
    staleTime: 60_000,
  });
}

export interface BooksInvoice {
  date: string; number: string; customer: string; customerId: string;
  total: number; balance: number; status: string;
}

/** Normalise a doctor / invoice-customer name for matching — drops a title
 *  prefix ("Dr", "Dr.", "Prof"…) and collapses spaces. Shared so the Overview,
 *  Marketing and Dashboard all match the same way. */
export function normalizeDoctorName(n: string | null | undefined): string {
  return (n ?? "").toLowerCase()
    .replace(/^\s*(dr|doctor|prof|professor|mr|mrs|ms|miss)\.?\s+/i, "")
    .replace(/\s+/g, " ").trim();
}

/** Actual revenue per converted doctor, from Zoho Books invoices (a doctor can
 *  have several). Used to replace the flat conversions×fee estimate with real
 *  money across Marketing / Dashboard. `revenueForDoctor` returns the doctor's
 *  total invoiced amount, falling back to the flat estimate when they have no
 *  matched invoice yet (so not-yet-billed conversions aren't zeroed out). */
export function useDoctorRevenue() {
  const { data: invoices = [], isSuccess } = useBooksInvoices();
  return useMemo(() => {
    const byName = new Map<string, number>();
    for (const i of invoices) {
      const k = normalizeDoctorName(i.customer);
      if (!k) continue;
      byName.set(k, (byName.get(k) ?? 0) + i.total);
    }
    return {
      byName,
      ready: isSuccess,
      isInvoiced: (name: string | null | undefined) => (byName.get(normalizeDoctorName(name)) ?? 0) > 0,
      /** Actual invoiced total, or the flat estimate when not invoiced. */
      revenueForDoctor: (name: string | null | undefined): number => {
        const actual = byName.get(normalizeDoctorName(name));
        return actual != null && actual > 0 ? actual : REVENUE_PER_CONVERSION_AED;
      },
    };
  }, [invoices, isSuccess]);
}

/** All Zoho Books invoices (customer = the doctor billed). Fetched once and
 *  matched to each doctor by name in the Overview. */
export function useBooksInvoices() {
  return useQuery({
    queryKey: ["books-invoices"],
    queryFn: async (): Promise<BooksInvoice[]> => {
      const { data, error } = await supabase.functions.invoke("zoho-books", { body: { action: "invoices" } });
      if (error) throw new Error((error as { message?: string })?.message ?? "Couldn't load invoices.");
      const res = data as { ok?: boolean; invoices?: BooksInvoice[] };
      return res?.invoices ?? [];
    },
    staleTime: 10 * 60_000,
  });
}

/** On-demand: analyze a doctor's CV PDF (their website cv_url) via Claude. The
 *  edge function parses it, persists a cv_uploads row + fills empty profile
 *  fields, and returns the extracted data. We invalidate the CV query so the
 *  Overview re-renders with the freshly-parsed result. */
export function useAnalyzeCv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { cvUrl: string; doctorId: string; doctorName?: string }) => {
      const { data, error } = await supabase.functions.invoke("cv-analyze-url", {
        body: { cv_url: input.cvUrl, doctor_id: input.doctorId, doctor_name: input.doctorName },
      });
      if (error) throw new Error((error as { message?: string })?.message ?? "Analysis failed.");
      const res = data as { ok?: boolean; error?: string; extracted?: Record<string, unknown> };
      if (!res?.ok) throw new Error(res?.error ?? "Analysis failed.");
      return res.extracted ?? {};
    },
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ["doctor-dossier", "cv", input.doctorId] });
    },
  });
}
