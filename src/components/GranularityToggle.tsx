import { GRANULARITIES, type Granularity } from "@/lib/time-buckets";

/** Daily / Weekly / Monthly segmented toggle, shared by the Finance digest
 *  and Sales trend views. */
export function GranularityToggle({ value, onChange }: {
  value: Granularity;
  onChange: (g: Granularity) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-border/60 overflow-hidden text-[10px] font-medium shrink-0">
      {GRANULARITIES.map(g => (
        <button
          key={g.value}
          type="button"
          onClick={() => onChange(g.value)}
          className={`px-3 py-1 transition-colors ${
            value === g.value ? "bg-primary text-white" : "bg-card text-muted-foreground hover:bg-muted/40"
          }`}
        >
          {g.label}
        </button>
      ))}
    </div>
  );
}
