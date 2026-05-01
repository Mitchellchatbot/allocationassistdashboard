import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type ContractStatus = "sent" | "viewed" | "signed" | "declined" | "expired" | "failed";

export interface ContractSendRow {
  id:                   string;
  boldsign_document_id: string;
  zoho_lead_id:         string;
  doctor_email:         string;
  doctor_name:          string;
  status:               ContractStatus;
  signed_at:            string | null;
  zoho_contact_id:      string | null;
  zoho_error:           string | null;
  created_at:           string;
  updated_at:           string;
}

const CONTRACT_ACTIVITY_KEY = ["contract-activity"] as const;

async function fetchContractActivity(): Promise<ContractSendRow[]> {
  const { data, error } = await supabase
    .from("contract_sends")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as ContractSendRow[];
}

/**
 * Subscribes to contract_sends so newly-signed contracts appear without a
 * page reload. Returns the raw rows + an `onSigned` callback consumers can
 * use to fire a toast / notification when a row's status flips to "signed".
 */
export function useContractActivity(opts?: { onSigned?: (row: ContractSendRow) => void }) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: CONTRACT_ACTIVITY_KEY,
    queryFn:  fetchContractActivity,
    staleTime: 30_000,
  });

  // Track the previous status of each row so we only fire onSigned exactly
  // once per row when it transitions from non-signed → signed (avoids
  // re-firing on every refetch).
  const [prevStatuses, setPrevStatuses] = useState<Record<string, ContractStatus>>({});

  useEffect(() => {
    if (!query.data) return;
    const next: Record<string, ContractStatus> = {};
    for (const row of query.data) {
      next[row.id] = row.status;
      const prev = prevStatuses[row.id];
      if (prev && prev !== "signed" && row.status === "signed" && opts?.onSigned) {
        opts.onSigned(row);
      }
    }
    // Only update if something actually changed — prevents render loop.
    const changed = Object.keys(next).length !== Object.keys(prevStatuses).length
      || Object.entries(next).some(([k, v]) => prevStatuses[k] !== v);
    if (changed) setPrevStatuses(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  // Realtime: any insert/update on contract_sends → invalidate the query so
  // we refetch and the effect above can compare statuses + fire onSigned.
  useEffect(() => {
    const channel = supabase
      .channel("contract_sends_activity")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "contract_sends" },
        () => { qc.invalidateQueries({ queryKey: CONTRACT_ACTIVITY_KEY }); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  return query;
}

/** Build the BoldSign tracking URL (read-only viewer in BoldSign's app). */
export function boldsignTrackingUrl(documentId: string): string {
  return `https://app.boldsign.com/document/${documentId}`;
}

/**
 * Triggers a browser download of a contract PDF by hitting the
 * boldsign-download Edge Function and saving the response as a file. Works
 * for both signed (final, watermarked, audit-trail-stamped) and in-progress
 * documents — BoldSign returns whichever the document currently is.
 */
export async function downloadContractPdf(row: ContractSendRow): Promise<void> {
  const filename = `${row.doctor_name.replace(/[^a-z0-9 \-_.]/gi, "_")} — Service Agreement.pdf`;
  const { data, error } = await supabase.functions.invoke("boldsign-download", {
    body: { documentId: row.boldsign_document_id, filename },
  });
  if (error) throw new Error(error.message ?? "Download failed");
  // supabase.functions.invoke returns `data` as a Blob when the response is
  // application/pdf. If it falls back to base64 / string for some reason,
  // wrap it in a Blob so URL.createObjectURL works either way.
  const blob = data instanceof Blob ? data : new Blob([data as ArrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
