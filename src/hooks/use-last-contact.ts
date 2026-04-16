import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// Strip "Dr.", "Prof." and normalize for fuzzy matching
function normName(n: string) {
  return (n ?? "")
    .replace(/^(dr\.?|prof\.?)\s*/i, "")
    .toLowerCase()
    .trim();
}

// Format a session_date string ("11/2", "04/01/2025", etc.) into a readable label
function formatSessionDate(raw: string): string {
  if (!raw) return "—";

  // Try dd/mm/yyyy
  const parts = raw.split("/");
  if (parts.length === 3) {
    const [d, m, y] = parts;
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    if (!isNaN(dt.getTime())) {
      return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
    }
  }

  // Try d/m (no year) — assume current year
  if (parts.length === 2) {
    const [d, m] = parts;
    const dt = new Date(new Date().getFullYear(), Number(m) - 1, Number(d));
    if (!isNaN(dt.getTime())) {
      return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    }
  }

  return raw; // fallback: show as-is
}

// How many days ago (for colour coding)
function daysSince(raw: string): number | null {
  const parts = raw.split("/");
  if (parts.length < 2) return null;
  const [d, m, y] = parts;
  const year = parts.length === 3 ? Number(y) : new Date().getFullYear();
  const dt = new Date(year, Number(m) - 1, Number(d));
  if (isNaN(dt.getTime())) return null;
  return Math.floor((Date.now() - dt.getTime()) / 86_400_000);
}

export interface LastContactInfo {
  dateLabel: string;
  daysSince: number | null;
}

export function useLastContact() {
  return useQuery<Map<string, LastContactInfo>>({
    queryKey: ["last-contact"],
    queryFn: async () => {
      // Fetch all sessions — just name + date, paginated
      const PAGE = 1000;
      const latest = new Map<string, string>(); // normName → raw session_date
      let from = 0;

      while (true) {
        const { data, error } = await supabase
          .from("doctor_sessions")
          .select("doctor_name, session_date")
          .range(from, from + PAGE - 1);

        if (error) throw error;
        const rows = data ?? [];

        for (const row of rows) {
          const key = normName(row.doctor_name);
          if (!key) continue;
          const existing = latest.get(key);
          // Keep the latest date — compare raw strings lexicographically for yyyy/mm/dd,
          // or just overwrite (since we order by created_at below, last write wins)
          if (!existing || row.session_date > existing) {
            latest.set(key, row.session_date ?? "");
          }
        }

        if (rows.length < PAGE) break;
        from += PAGE;
        if (from > 50_000) break;
      }

      // Convert to LastContactInfo map
      const result = new Map<string, LastContactInfo>();
      for (const [key, raw] of latest) {
        result.set(key, { dateLabel: formatSessionDate(raw), daysSince: daysSince(raw) });
      }
      return result;
    },
    staleTime: 10 * 60 * 1000,
    gcTime:    30 * 60 * 1000,
  });
}
