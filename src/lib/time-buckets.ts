/**
 * Time-bucketing helpers shared by the Finance digest and Sales trend views.
 * Buckets a date into a day / week (Mon-start) / month and produces a stable,
 * sortable key plus a short human label.
 */
export type Granularity = "day" | "week" | "month";

export const GRANULARITIES: { value: Granularity; label: string }[] = [
  { value: "day",   label: "Daily"   },
  { value: "week",  label: "Weekly"  },
  { value: "month", label: "Monthly" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** Monday-start week containing `d`. */
function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - dow);
  return x;
}

/** Stable, lexicographically-sortable key for the bucket a date falls in. */
export function bucketKey(d: Date, g: Granularity): string {
  if (g === "month") return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const base = g === "week" ? startOfWeek(d) : d;
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`;
}

/** Short human label for a bucket key. */
export function bucketLabel(key: string, g: Granularity): string {
  const parts = key.split("-").map(Number);
  if (g === "month") return `${MONTHS[parts[1] - 1]} '${String(parts[0]).slice(2)}`;
  const [, m, day] = parts;
  return g === "week" ? `${MONTHS[m - 1]} ${day}` : `${MONTHS[m - 1]} ${day}`;
}

/** Parse a Zoho/ISO timestamp safely → Date, or null when missing/invalid.
 *  Date-only strings ("YYYY-MM-DD") are built from LOCAL parts — otherwise
 *  new Date("YYYY-MM-DD") is UTC-midnight and bucketKey()'s local getDate()/
 *  getMonth() rolls back a day (and can roll back a month) in negative-offset
 *  timezones. Full timestamps (with a time component) keep native parsing. */
export function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const d = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
