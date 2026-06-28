import { cn } from "@/lib/utils";

/**
 * SearchFilterChips — Amir #6. Shared toggle-chip strip for the sent-history
 * filters, used by both UniversalSearch (⌘K) and the Past Sent page so the chip
 * set + active styling stay identical.
 */
export type SentChip = "all" | "1st" | "2nd" | "top15" | "specialty" | "individual";

export const SENT_CHIPS: { key: SentChip; label: string }[] = [
  { key: "all",        label: "All" },
  { key: "1st",        label: "1st profile" },
  { key: "2nd",        label: "2nd profile" },
  { key: "top15",      label: "Top 15" },
  { key: "specialty",  label: "Daily specialty" },
  { key: "individual", label: "Individual" },
];

/** Does a sent record's (sentKind, slot) satisfy the active chip? */
export function chipMatches(chip: SentChip, sentKind?: string, slot?: string): boolean {
  switch (chip) {
    case "all":        return true;
    case "1st":        return slot === "1st profile";
    case "2nd":        return slot === "2nd profile";
    case "top15":      return sentKind === "tuesday_top_15";
    case "specialty":  return sentKind === "specialty_of_day";
    case "individual": return sentKind === "individual";
    default:           return true;
  }
}

export function SearchFilterChips({
  active, onChange, counts, className,
}: {
  active: SentChip;
  onChange: (c: SentChip) => void;
  counts?: Partial<Record<SentChip, number>>;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1.5 flex-wrap", className)}>
      {SENT_CHIPS.map(c => {
        const n = counts?.[c.key];
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onChange(c.key)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
              active === c.key
                ? "bg-teal-600 text-white border-teal-600"
                : "bg-white text-slate-600 border-slate-200 hover:border-teal-300 hover:text-teal-700",
            )}
          >
            {c.label}
            {typeof n === "number" && <span className={cn("tabular-nums", active === c.key ? "text-teal-100" : "text-slate-400")}>{n}</span>}
          </button>
        );
      })}
    </div>
  );
}
