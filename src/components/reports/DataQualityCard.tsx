/**
 * Data-quality fix-it queue for the reports. Surfaces the small set of things
 * that keep the numbers from being fully clean — mainly hospital cells that
 * couldn't be assigned a region — so the imported backlog tidies up over time.
 * Only renders when there's something to fix.
 */
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { usePlacementAttempts } from "@/hooks/use-placement-attempts";
import { resolveHospitalRegion } from "@/lib/hospital-region";

export function DataQualityCard() {
  const { data: all = [] } = usePlacementAttempts();

  const m = useMemo(() => {
    const unclassified = new Map<string, number>();
    const doctors = new Set<string>();
    let unlinked = 0;
    for (const p of all) {
      if (!resolveHospitalRegion(p.hospital_name).country) {
        unclassified.set(p.hospital_name, (unclassified.get(p.hospital_name) ?? 0) + 1);
      }
      if (!doctors.has(p.doctor_id)) {
        doctors.add(p.doctor_id);
        if (p.doctor_id.startsWith("csv:")) unlinked++;
      }
    }
    const unclassifiedRows = [...unclassified].sort((a, b) => b[1] - a[1]);
    return {
      unclassifiedRows,
      unclassifiedTotal: unclassifiedRows.reduce((s, [, n]) => s + n, 0),
      unlinked,
      total: all.length,
    };
  }, [all]);

  if (m.unclassifiedRows.length === 0) return null;   // nothing to fix

  return (
    <Card className="border-amber-200 bg-amber-50/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" /> Data quality
        </CardTitle>
        <CardDescription className="text-[11px]">
          These hospital names have no region yet, so their {m.unclassifiedTotal} placement{m.unclassifiedTotal === 1 ? "" : "s"} fall under "Unknown" in the region breakdown. Send these to your dev to map — everything else still counts everywhere.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-1.5">
          {m.unclassifiedRows.map(([name, n]) => (
            <span key={name} className="text-[11px] rounded-md border border-amber-200 bg-white px-2 py-0.5 text-slate-700">
              {name || "(blank)"} <span className="font-semibold text-amber-700">{n}</span>
            </span>
          ))}
        </div>
        {m.unlinked > 0 && (
          <div className="mt-3 pt-2 border-t border-amber-200/60 text-[10.5px] text-muted-foreground">
            Note: {m.unlinked.toLocaleString()} imported doctors aren't linked to a Zoho record (expected for the historical backlog — they still count in every report; new markings link automatically).
          </div>
        )}
      </CardContent>
    </Card>
  );
}
