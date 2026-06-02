import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTableSubscription } from "@/lib/realtime-registry";

export type SheetTargetKind =
  | "hospitals"
  | "vacancies"
  | "unavailable_doctors"
  | "placements"
  | "source_overrides"
  | "hospital_templates"
  | "custom_table";

export type SheetAuthMode = "public_csv" | "service_account";

export interface SheetConnection {
  id:               string;
  label:            string;
  sheet_url:        string;
  csv_url:          string;
  target_kind:      SheetTargetKind;
  auth_mode:        SheetAuthMode;
  sheet_id:         string | null;
  tab_gid:          string | null;
  active:           boolean;
  schedule_minutes: number;
  last_synced_at:   string | null;
  last_error:       string | null;
  last_summary:     { created?: number; updated?: number; skipped?: number; unmatched?: number } | null;
  target_table:     string | null;
  key_column:       string | null;
  column_map:       Record<string, string> | null;
  created_by:       string | null;
  created_at:       string;
  updated_at:       string;
}

const KEY = ["sheet-connections"] as const;

export function useSheetConnections() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<SheetConnection[]> => {
      const { data, error } = await supabase
        .from("sheet_connections")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SheetConnection[];
    },
    staleTime: 30_000,
  });

  useTableSubscription("sheet_connections", useCallback(() => {
    qc.invalidateQueries({ queryKey: KEY });
  }, [qc]));

  return q;
}

export interface CreateSheetConnectionInput {
  label:            string;
  sheet_url:        string;
  target_kind:      SheetTargetKind;
  auth_mode:        SheetAuthMode;
  schedule_minutes?: number;
  /** Only set when target_kind === "custom_table". */
  target_table?:    string | null;
  key_column?:      string | null;
  column_map?:      Record<string, string> | null;
}

export function useCreateSheetConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateSheetConnectionInput): Promise<SheetConnection> => {
      const { data: sess } = await supabase.auth.getSession();
      const createdBy = sess.session?.user.email ?? null;
      const parsed = extractSheetIds(input.sheet_url);
      if (!parsed) throw new Error("Couldn't parse that URL. Paste a Google Sheets share link.");
      const csvUrl = normalizeSheetUrl(input.sheet_url) ?? "";
      const { data, error } = await supabase
        .from("sheet_connections")
        .insert({
          label:            input.label.trim() || "(unnamed)",
          sheet_url:        input.sheet_url.trim(),
          csv_url:          csvUrl,
          sheet_id:         parsed.sheetId,
          tab_gid:          parsed.gid,
          target_kind:      input.target_kind,
          auth_mode:        input.auth_mode,
          schedule_minutes: input.schedule_minutes ?? 60,
          target_table:     input.target_table ?? null,
          key_column:       input.key_column ?? null,
          column_map:       input.column_map ?? null,
          created_by:       createdBy,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as SheetConnection;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Parse a Google Sheets or Drive file URL into { sheetId, gid }. Returns
 *  null when the URL isn't a recognised Google asset. Supports:
 *    - /spreadsheets/d/<id>/edit#gid=<gid>
 *    - /spreadsheets/d/e/<id>/pub  (published)
 *    - /file/d/<id>/view           (uploaded .xlsx in Drive)
 *    - /open?id=<id>               (older share link)
 */
export function extractSheetIds(raw: string): { sheetId: string; gid: string | null } | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (!/google\.com$/i.test(u.hostname) && !/googleusercontent\.com$/i.test(u.hostname)) return null;
    // /spreadsheets/d/<id> or /spreadsheets/d/e/<id>
    let m = u.pathname.match(/\/spreadsheets\/d\/(?:e\/)?([^/]+)/);
    // /file/d/<id>   (Drive file — usually an uploaded Excel)
    if (!m) m = u.pathname.match(/\/file\/d\/([^/]+)/);
    let id: string | null = m ? m[1] : null;
    // /open?id=<id> (legacy share URL)
    if (!id) id = u.searchParams.get("id");
    if (!id) return null;
    let gid: string | null = u.searchParams.get("gid");
    if (!gid && u.hash) {
      const hashMatch = u.hash.match(/gid=(\d+)/);
      if (hashMatch) gid = hashMatch[1];
    }
    return { sheetId: id, gid };
  } catch { return null; }
}

export function useUpdateSheetConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<SheetConnection> }): Promise<SheetConnection> => {
      // Re-normalise the URL if the caller updated sheet_url.
      const merged: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
      if (patch.sheet_url) {
        const csvUrl = normalizeSheetUrl(patch.sheet_url);
        if (!csvUrl) throw new Error("Couldn't parse that URL.");
        merged.csv_url = csvUrl;
      }
      const { data, error } = await supabase
        .from("sheet_connections")
        .update(merged)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as SheetConnection;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteSheetConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from("sheet_connections").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Dry-run preview — fetch the CSV and have the parser count actionable rows
 *  without writing anything. Used by the create dialog. */
export async function previewSheetConnection(
  sheetUrl: string,
  targetKind: SheetTargetKind,
  authMode: SheetAuthMode,
): Promise<{ rows: number; sample: string[] } | { error: string }> {
  const parsed = extractSheetIds(sheetUrl);
  const csvUrl = normalizeSheetUrl(sheetUrl);
  if (!parsed && !csvUrl) return { error: "URL doesn't look like a Google Sheet." };
  try {
    const { data, error } = await supabase.functions.invoke("sheets-sync", {
      body: {
        preview: {
          csv_url:     csvUrl ?? "",
          target_kind: targetKind,
          auth_mode:   authMode,
          sheet_id:    parsed?.sheetId ?? null,
          tab_gid:     parsed?.gid ?? null,
        },
      },
    });
    if (error) throw error;
    const res = data as { ok: boolean; summary?: { rows: number; sample: string[] }; error?: string };
    if (!res.ok) return { error: res.error ?? "Preview failed" };
    return res.summary ?? { rows: 0, sample: [] };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Fetch only the header row of a sheet for the column-mapping UI. */
export async function fetchSheetHeaders(
  sheetUrl: string,
  authMode: SheetAuthMode,
): Promise<{ headers: string[] } | { error: string }> {
  const parsed = extractSheetIds(sheetUrl);
  const csvUrl = normalizeSheetUrl(sheetUrl);
  if (!parsed && !csvUrl) return { error: "URL doesn't look like a Google Sheet." };
  try {
    const { data, error } = await supabase.functions.invoke("sheets-sync", {
      body: {
        preview: {
          csv_url:     csvUrl ?? "",
          target_kind: "custom_table",
          auth_mode:   authMode,
          sheet_id:    parsed?.sheetId ?? null,
          tab_gid:     parsed?.gid ?? null,
          headers_only: true,
        },
      },
    });
    if (error) throw error;
    const res = data as { ok: boolean; headers?: string[]; error?: string };
    if (!res.ok) return { error: res.error ?? "Fetch failed" };
    return { headers: res.headers ?? [] };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export function useSyncSheetConnectionNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<{ ok: boolean; summary?: { created: number; updated: number; skipped: number; unmatched?: number }; error?: string }> => {
      const { data, error } = await supabase.functions.invoke("sheets-sync", { body: { connection_id: id } });
      if (error) throw error;
      const res = data as { ok: boolean; summary?: { created: number; updated: number; skipped: number; unmatched?: number }; error?: string };
      if (!res.ok) throw new Error(res.error ?? "sheets-sync failed");
      return res;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Turn a pasted Google Sheets URL into the `/export?format=csv` URL the
 *  edge function fetches. Supports the three common share forms:
 *    https://docs.google.com/spreadsheets/d/<id>/edit#gid=<gid>
 *    https://docs.google.com/spreadsheets/d/e/<pub-id>/pub?output=csv (already CSV — passthrough)
 *    https://docs.google.com/spreadsheets/d/<id>/edit?usp=sharing
 *  Returns null if the URL doesn't look like a Google Sheets one. */
export function normalizeSheetUrl(raw: string): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (!/google\.com$/i.test(u.hostname) && !/googleusercontent\.com$/i.test(u.hostname)) {
      // Allow raw CSV URLs from any host as long as they look like CSV.
      if (s.includes("output=csv") || s.endsWith(".csv")) return s;
      return null;
    }
    // Already a CSV-publishing URL → use as-is
    if (u.searchParams.get("output") === "csv") return s;
    // /spreadsheets/d/<id>/...
    const dMatch = u.pathname.match(/\/spreadsheets\/d\/(?:e\/)?([^/]+)/);
    if (!dMatch) return null;
    const id = dMatch[1];
    // gid for the specific tab — try hash (#gid=N), then ?gid=N. Default 0.
    let gid = u.searchParams.get("gid");
    if (!gid && u.hash) {
      const hashMatch = u.hash.match(/gid=(\d+)/);
      if (hashMatch) gid = hashMatch[1];
    }
    const params = new URLSearchParams({ format: "csv" });
    if (gid) params.set("gid", gid);
    return `https://docs.google.com/spreadsheets/d/${id}/export?${params.toString()}`;
  } catch {
    return null;
  }
}
