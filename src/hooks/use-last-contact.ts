import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// Strip "Dr.", "Prof." and normalize for fuzzy matching
function normName(n: string) {
  return (n ?? "")
    .replace(/^(dr\.?|prof\.?)\s*/i, "")
    .toLowerCase()
    .trim();
}

// Parse a date string that might be:
//   dd/mm/yyyy  →  2025/04/01  (convert for reliable comparison)
//   d/m         →  current year
//   d Mon       →  "11 Apr"
//   ISO         →  2025-04-01
// Returns a sortable ISO-like string "YYYY-MM-DD" or null
function toSortable(raw: string): string | null {
  if (!raw) return null;

  // dd/mm/yyyy
  const parts = raw.split("/");
  if (parts.length === 3) {
    const [d, m, y] = parts;
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    if (!isNaN(dt.getTime())) {
      return dt.toISOString().slice(0, 10); // YYYY-MM-DD
    }
  }
  // d/m (no year) — assume current year
  if (parts.length === 2) {
    const [d, m] = parts;
    const dt = new Date(new Date().getFullYear(), Number(m) - 1, Number(d));
    if (!isNaN(dt.getTime())) {
      return dt.toISOString().slice(0, 10);
    }
  }

  // ISO YYYY-MM-DD or ISO timestamp
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10);
  }

  // d Mon  or  Mon d  — e.g. "11 Apr" or "Apr-11"
  const monthNames: Record<string, number> = {
    jan:1,feb:2,mar:3,apr:4,may:5,jun:6,
    jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,
  };
  const m2 = raw.match(/^(\d{1,2})[\s\-\/]([A-Za-z]{3})/);
  if (m2) {
    const mo = monthNames[m2[2].toLowerCase()];
    if (mo) {
      const dt = new Date(new Date().getFullYear(), mo - 1, Number(m2[1]));
      return dt.toISOString().slice(0, 10);
    }
  }
  const m3 = raw.match(/^([A-Za-z]{3})[\s\-\/](\d{1,2})/);
  if (m3) {
    const mo = monthNames[m3[1].toLowerCase()];
    if (mo) {
      const dt = new Date(new Date().getFullYear(), mo - 1, Number(m3[2]));
      return dt.toISOString().slice(0, 10);
    }
  }

  return null;
}

// Format a raw date string into a readable label
function formatDate(raw: string): string {
  if (!raw) return "—";
  const sortable = toSortable(raw);
  if (!sortable) return raw;
  const dt = new Date(sortable + "T00:00:00");
  if (isNaN(dt.getTime())) return raw;
  return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
}

// How many days ago
function daysSinceDate(raw: string): number | null {
  const sortable = toSortable(raw);
  if (!sortable) return null;
  const dt = new Date(sortable + "T00:00:00");
  if (isNaN(dt.getTime())) return null;
  return Math.floor((Date.now() - dt.getTime()) / 86_400_000);
}

// Build alternate lookup keys: normalized full name, last-name-only, first-name-only
function nameKeys(normalized: string): string[] {
  const words = normalized.split(/\s+/).filter(Boolean);
  const keys = new Set<string>();
  keys.add(normalized);
  if (words.length >= 2) {
    keys.add(words[words.length - 1]); // last name only
    keys.add(words[0]);                // first name only
  }
  return [...keys];
}

export interface LastContactInfo {
  dateLabel: string;
  daysSince: number | null;
}

async function fetchAllRows(
  table: string,
  nameCol: string,
  dateCol: string,
  latest: Map<string, string>,
) {
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(`${nameCol}, ${dateCol}`)
      .not(nameCol, "is", null)
      .not(dateCol, "is", null)
      .neq(nameCol, "")
      .neq(dateCol, "")
      .range(from, from + PAGE - 1);

    if (error) break; // don't throw — just skip this table if it errors
    const rows = data ?? [];

    for (const row of rows) {
      const rawName: string = row[nameCol] ?? "";
      const rawDate: string = row[dateCol] ?? "";
      const key = normName(rawName);
      if (!key) continue;

      const sortable = toSortable(rawDate);
      if (!sortable) continue;

      const existing = latest.get(key);
      if (!existing || sortable > existing) {
        // Store "YYYY-MM-DD|originalRaw" so we can format the original
        latest.set(key, sortable + "|" + rawDate);
      }
    }

    if (rows.length < PAGE) break;
    from += PAGE;
    if (from > 50_000) break;
  }
}

export function useLastContact() {
  return useQuery<Map<string, LastContactInfo>>({
    queryKey: ["last-contact"],
    queryFn: async () => {
      // latest: normName → "YYYY-MM-DD|originalRaw"
      const latest = new Map<string, string>();

      await Promise.all([
        fetchAllRows("doctor_sessions", "doctor_name", "session_date", latest),
        fetchAllRows("call_log",        "doctor_name", "call_date",    latest),
      ]);

      // Build result map — include BOTH exact key AND short-name keys
      const result = new Map<string, LastContactInfo>();
      for (const [key, combined] of latest) {
        const [, rawDate] = combined.split("|").length >= 2
          ? [combined.split("|")[0], combined.split("|").slice(1).join("|")]
          : [combined, combined];
        const info: LastContactInfo = {
          dateLabel: formatDate(rawDate),
          daysSince: daysSinceDate(rawDate),
        };
        // Register under all name variants
        for (const k of nameKeys(key)) {
          if (!result.has(k)) result.set(k, info); // don't overwrite longer key with shorter
        }
        result.set(key, info); // always set full key
      }
      return result;
    },
    staleTime: 10 * 60 * 1000,
    gcTime:    30 * 60 * 1000,
  });
}
