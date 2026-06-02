import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface DriveFile {
  id:           string;
  name:         string;
  mimeType:     string;
  modifiedTime: string;
  webViewLink:  string;
  iconLink?:    string;
}

const SHEET_MIME = "application/vnd.google-apps.spreadsheet";

export function isGoogleSheetMime(mime: string): boolean {
  return mime === SHEET_MIME;
}

/** Friendly label for the file's type ("Sheet" vs "Excel"). */
export function driveFileKind(mime: string): "sheet" | "excel" {
  return mime === SHEET_MIME ? "sheet" : "excel";
}

export function useDriveFiles(enabled = true) {
  return useQuery({
    queryKey: ["drive-files"],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<DriveFile[]> => {
      const { data, error } = await supabase.functions.invoke("drive-list-files", { method: "GET" });
      if (error) throw new Error(error.message ?? "Failed to list Drive files");
      if (data?.error) throw new Error(data.error);
      return (data?.files ?? []) as DriveFile[];
    },
  });
}
