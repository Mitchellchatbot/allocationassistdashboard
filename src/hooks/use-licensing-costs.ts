/**
 * Per-doctor licensing-spend ledger (doctor_licensing_costs). Tracks money
 * spent getting a doctor licensed out of their first invoice — UK->UAE license
 * conversion, DataFlow, etc. — which Zoho has no field for. Keyed by the AA
 * doctor_id (`dob:<zohoId>`). Amounts are AED. Receipts (optional) live in the
 * private `licensing-receipts` bucket.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const BUCKET = "licensing-receipts";

export interface LicensingCost {
  id:           string;
  doctor_id:    string | null;
  doctor_name:  string | null;
  description:  string;
  amount_aed:   number;
  spent_on:     string | null;
  receipt_path: string | null;
  receipt_name: string | null;
  notes:        string | null;
  created_at:   string;
  updated_at:   string;
  created_by:   string | null;
  // Import fields (null on legacy manual rows).
  customer_name_raw?: string | null;
  officer?:           string | null;
  other_currency?:    string | null;
  card_used?:         string | null;
  source?:            string | null;   // 'manual' | 'csv_import'
  status?:            string | null;   // 'matched' | 'unmatched' | 'ignored'
  match_confidence?:  string | null;
}

const KEY = (doctorId: string | null) => ["licensing-costs", doctorId ?? "_"] as const;

export function useLicensingCosts(doctorId: string | null) {
  return useQuery({
    queryKey: KEY(doctorId),
    enabled: !!doctorId,
    queryFn: async (): Promise<LicensingCost[]> => {
      if (!doctorId) return [];
      const { data, error } = await supabase
        .from("doctor_licensing_costs")
        .select("*")
        .eq("doctor_id", doctorId)
        .order("spent_on", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LicensingCost[];
    },
    staleTime: 30_000,
  });
}

export interface LicensingCostInput {
  id?:          string;
  doctor_id:    string;
  doctor_name?: string | null;
  description:  string;
  amount_aed:   number;
  spent_on?:    string | null;
  receipt_path?: string | null;
  receipt_name?: string | null;
  notes?:       string | null;
}

/** Upload a receipt file to the private bucket. Returns the stored path. */
export async function uploadLicensingReceipt(doctorId: string, file: File): Promise<{ path: string; name: string }> {
  const safeDoctor = doctorId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const path = `${safeDoctor}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) throw error;
  return { path, name: file.name };
}

/** Signed URL for viewing a receipt (the bucket is private). */
export async function getReceiptUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export function useUpsertLicensingCost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: LicensingCostInput): Promise<LicensingCost> => {
      const { data: userData } = await supabase.auth.getUser();
      const row = {
        ...input,
        updated_at: new Date().toISOString(),
        ...(input.id ? {} : { created_by: userData.user?.email ?? null }),
      };
      const { data, error } = await supabase
        .from("doctor_licensing_costs")
        .upsert(row)
        .select("*")
        .single();
      if (error) throw error;
      return data as LicensingCost;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: KEY(row.doctor_id) });
    },
  });
}

// ── Reconciliation: imported licensing rows whose Customer Name didn't match a
//    doctor (doctor_id NULL, status 'unmatched'). Grouped by the raw name so the
//    reviewer assigns a doctor once and it applies to every row for that person.

export interface UnmatchedLicensingGroup {
  name:      string;             // customer_name_raw
  ids:       string[];           // all unmatched row ids for this name
  count:     number;
  totalAed:  number;
  purposes:  string[];           // distinct descriptions (sample)
  months:    string[];           // distinct YYYY-MM
  officer:   string | null;
}

export function useUnmatchedLicensing() {
  return useQuery({
    queryKey: ["licensing-unmatched"],
    queryFn: async (): Promise<UnmatchedLicensingGroup[]> => {
      const { data, error } = await supabase
        .from("doctor_licensing_costs")
        .select("id, customer_name_raw, description, amount_aed, spent_on, officer")
        .is("doctor_id", null)
        .eq("status", "unmatched")
        .limit(5000);
      if (error) throw error;
      const groups = new Map<string, UnmatchedLicensingGroup>();
      for (const r of (data ?? []) as Array<Record<string, unknown>>) {
        const name = (r.customer_name_raw as string) || "(no name)";
        let g = groups.get(name);
        if (!g) { g = { name, ids: [], count: 0, totalAed: 0, purposes: [], months: [], officer: (r.officer as string) ?? null }; groups.set(name, g); }
        g.ids.push(r.id as string);
        g.count++;
        g.totalAed += Number(r.amount_aed) || 0;
        const d = r.description as string; if (d && !g.purposes.includes(d) && g.purposes.length < 4) g.purposes.push(d);
        const m = (r.spent_on as string)?.slice(0, 7); if (m && !g.months.includes(m)) g.months.push(m);
      }
      return [...groups.values()].sort((a, b) => b.count - a.count || b.totalAed - a.totalAed);
    },
    staleTime: 30_000,
  });
}

/** Assign a doctor to every unmatched row for one name → they flow into that
 *  doctor's ledger. */
export function useResolveLicensing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, doctorId, doctorName }: { ids: string[]; doctorId: string; doctorName: string }) => {
      const { error } = await supabase
        .from("doctor_licensing_costs")
        .update({ doctor_id: doctorId, doctor_name: doctorName, status: "matched", updated_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["licensing-unmatched"] });
      qc.invalidateQueries({ queryKey: KEY(vars.doctorId) });
    },
  });
}

/** Mark rows as ignored (not a doctor / can't be placed) so they leave the queue. */
export function useIgnoreLicensing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids }: { ids: string[] }) => {
      const { error } = await supabase
        .from("doctor_licensing_costs")
        .update({ status: "ignored", updated_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["licensing-unmatched"] }),
  });
}

export function useDeleteLicensingCost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, receiptPath }: { id: string; doctorId: string; receiptPath: string | null }) => {
      if (receiptPath) await supabase.storage.from(BUCKET).remove([receiptPath]).catch(() => {});
      const { error } = await supabase.from("doctor_licensing_costs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: KEY(vars.doctorId) });
    },
  });
}
