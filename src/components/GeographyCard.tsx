import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Globe, GraduationCap } from "lucide-react";
import { InfoIcon } from "@/components/InfoIcon";
import { useFilteredData } from "@/hooks/use-filtered-data";
import { normaliseCountry } from "@/hooks/use-zoho-data";
import { WorldChoropleth } from "@/components/WorldChoropleth";
import { cn } from "@/lib/utils";

// Qualified = the canonical qualified statuses (same set the Sales KPIs use).
const QUALIFIED = new Set(["Initial Sales Call Completed", "High Priority Follow up"]);

// Our normalised country names → the GeoJSON's `properties.name`. Only a few
// differ; everything else matches by name already.
const COUNTRY_TO_GEO: Record<string, string> = {
  "UAE": "United Arab Emirates",
  "United States": "United States of America",
  "USA": "United States of America",
  "US": "United States of America",
  "UK": "United Kingdom",
  "Serbia": "Republic of Serbia",
  "Tanzania": "United Republic of Tanzania",
  "Bahamas": "The Bahamas",
  "Czechia": "Czech Republic",
  "Democratic Republic of Congo": "Democratic Republic of the Congo",
  "DR Congo": "Democratic Republic of the Congo",
  "Congo": "Republic of the Congo",
  "Ivory Coast": "Ivory Coast",
  "South Korea": "South Korea",
};

type Mode = "qualified" | "dob";

/** Aggregate rows by canonical training country → count. */
function countByCountry(rows: Array<{ Country_of_Specialty_training: string | null }>) {
  const m = new Map<string, number>();
  for (const r of rows) {
    const norm = normaliseCountry(r.Country_of_Specialty_training);
    if (!norm) continue;
    m.set(norm, (m.get(norm) ?? 0) + 1);
  }
  return m;
}

/**
 * "Where are they coming from" — a world choropleth (darker = more) of qualified
 * leads and Doctors on Board by their country of specialty training, with a
 * ranked top-countries list beside it. Self-contained: pulls its own data, so it
 * can be dropped on any page.
 */
export function GeographyCard() {
  const { filteredLeads, filteredDoB } = useFilteredData();
  const [mode, setMode] = useState<Mode>("qualified");

  const byCountry = useMemo(() => {
    const qualified = countByCountry(filteredLeads.filter(l => QUALIFIED.has(l.Lead_Status)));
    const dob = countByCountry(filteredDoB);
    return { qualified, dob };
  }, [filteredLeads, filteredDoB]);

  const active = mode === "qualified" ? byCountry.qualified : byCountry.dob;

  // Values keyed by GeoJSON name for the map.
  const mapValues = useMemo(() => {
    const m = new Map<string, number>();
    for (const [country, n] of active) m.set(COUNTRY_TO_GEO[country] ?? country, (m.get(COUNTRY_TO_GEO[country] ?? country) ?? 0) + n);
    return m;
  }, [active]);

  // Ranked list (canonical display names).
  const ranked = useMemo(() => [...active.entries()].sort((a, b) => b[1] - a[1]), [active]);
  const total = useMemo(() => ranked.reduce((s, [, n]) => s + n, 0), [ranked]);

  const label = mode === "qualified" ? "qualified leads" : "Doctors on Board";

  return (
    <Card className="shadow-sm border-border/50">
      <CardHeader className="pb-2 pt-4 px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-[13px] font-semibold text-foreground flex items-center gap-1.5">
            <Globe className="h-4 w-4 text-teal-600" /> Where they're coming from
            <InfoIcon meaning="Qualified leads and Doctors on Board by their country of specialty training. Darker = more. Toggle between the two datasets." source="Zoho CRM (Country of Specialty Training)." />
          </CardTitle>
          <div className="inline-flex h-8 rounded-md border border-border/60 overflow-hidden text-[11px] font-medium">
            {([
              { v: "qualified", label: "Qualified leads", count: byCountry.qualified.size ? [...byCountry.qualified.values()].reduce((a, b) => a + b, 0) : 0 },
              { v: "dob",       label: "Doctors on Board", count: byCountry.dob.size ? [...byCountry.dob.values()].reduce((a, b) => a + b, 0) : 0 },
            ] as const).map(opt => (
              <button
                key={opt.v}
                type="button"
                onClick={() => setMode(opt.v)}
                className={cn("flex items-center gap-1.5 px-2.5 transition-colors", mode === opt.v ? "bg-primary text-white" : "bg-card text-muted-foreground hover:bg-muted/40")}
              >
                {opt.label}
                <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums", mode === opt.v ? "bg-white/20 text-white" : "bg-muted text-muted-foreground")}>{opt.count.toLocaleString()}</span>
              </button>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground/80 mt-0.5 flex items-center gap-1">
          <GraduationCap className="h-3 w-3" /> by country of specialty training · {total.toLocaleString()} {label} across {ranked.length} countries
        </p>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-5 items-start">
          <WorldChoropleth
            values={mapValues}
            formatValue={n => `${n.toLocaleString()} ${label}`}
          />
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Top countries</div>
            {ranked.length === 0 ? (
              <div className="text-[12px] text-muted-foreground py-4">No data for this period.</div>
            ) : (
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                {ranked.slice(0, 15).map(([country, n], i) => {
                  const pct = total > 0 ? (n / ranked[0][1]) * 100 : 0;
                  return (
                    <div key={country} className="flex items-center gap-2">
                      <span className="w-4 text-right text-[10px] tabular-nums text-muted-foreground shrink-0">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[12px] text-foreground truncate">{country}</span>
                          <span className="text-[12px] font-semibold tabular-nums text-teal-700 shrink-0">{n.toLocaleString()}</span>
                        </div>
                        <div className="h-1 rounded-full bg-muted overflow-hidden mt-0.5">
                          <div className="h-full rounded-full bg-teal-500/70" style={{ width: `${Math.max(pct, 3)}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
