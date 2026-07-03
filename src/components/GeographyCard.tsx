import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Globe, GraduationCap, X, MousePointerClick } from "lucide-react";
import { InfoIcon } from "@/components/InfoIcon";
import { useFilteredData } from "@/hooks/use-filtered-data";
import { normaliseCountry, type ZohoLead, type ZohoDoctorOnBoard } from "@/hooks/use-zoho-data";
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
};

type Mode = "qualified" | "dob";
type Row = ZohoLead | ZohoDoctorOnBoard;

/** Group rows by canonical training country, keeping the actual rows. */
function rowsByCountry<T extends { Country_of_Specialty_training: string | null }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const c = normaliseCountry(r.Country_of_Specialty_training);
    if (!c) continue;
    const arr = m.get(c);
    if (arr) arr.push(r); else m.set(c, [r]);
  }
  return m;
}

const fullName = (r: Row) => (r.Full_Name || [r.First_Name, r.Last_Name].filter(Boolean).join(" ") || "—").replace(/^\s*Dr\.?\s+/i, "");

/**
 * "Where they're coming from" — a world choropleth (darker = more) of qualified
 * leads and Doctors on Board by country of specialty training, with a ranked
 * top-countries list. Click a country (on the map or the list) to see the people
 * from there in a table, for whichever dataset is toggled.
 */
export function GeographyCard() {
  const { filteredLeads, filteredDoB } = useFilteredData();
  const [mode, setMode] = useState<Mode>("qualified");
  const [selected, setSelected] = useState<string | null>(null); // canonical country

  const data = useMemo(() => ({
    qualified: rowsByCountry(filteredLeads.filter(l => QUALIFIED.has(l.Lead_Status))),
    dob:       rowsByCountry(filteredDoB),
  }), [filteredLeads, filteredDoB]);

  const active = mode === "qualified" ? data.qualified : data.dob;

  // Map fill values keyed by GeoJSON name + a reverse map so a map click resolves
  // back to our canonical country.
  const { mapValues, geoToCanonical } = useMemo(() => {
    const mv = new Map<string, number>();
    const g2c = new Map<string, string>();
    for (const [country, rows] of active) {
      const geo = COUNTRY_TO_GEO[country] ?? country;
      mv.set(geo, (mv.get(geo) ?? 0) + rows.length);
      g2c.set(geo, country);
    }
    return { mapValues: mv, geoToCanonical: g2c };
  }, [active]);

  const ranked = useMemo(() => [...active.entries()].sort((a, b) => b[1].length - a[1].length), [active]);
  const total = useMemo(() => ranked.reduce((s, [, rows]) => s + rows.length, 0), [ranked]);

  // Reset the selection when switching datasets (a country may not exist in both).
  useEffect(() => { setSelected(null); }, [mode]);

  const selectedRows = selected ? (active.get(selected) ?? []) : [];
  const label = mode === "qualified" ? "qualified leads" : "Doctors on Board";
  const countOf = (m: Map<string, Row[]>) => [...m.values()].reduce((s, r) => s + r.length, 0);

  return (
    <Card className="shadow-sm border-border/50">
      <CardHeader className="pb-2 pt-4 px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-[13px] font-semibold text-foreground flex items-center gap-1.5">
            <Globe className="h-4 w-4 text-teal-600" /> Where they're coming from
            <InfoIcon meaning="Qualified leads and Doctors on Board by country of specialty training. Darker = more. Click a country to list the people from there." source="Zoho CRM (Country of Specialty Training)." />
          </CardTitle>
          <div className="inline-flex h-8 rounded-md border border-border/60 overflow-hidden text-[11px] font-medium">
            {([
              { v: "qualified", label: "Qualified leads", count: countOf(data.qualified) },
              { v: "dob",       label: "Doctors on Board", count: countOf(data.dob) },
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
          <span className="text-muted-foreground/60">· <MousePointerClick className="h-3 w-3 inline" /> click a country to list them</span>
        </p>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-5 items-start">
          <WorldChoropleth
            values={mapValues}
            formatValue={n => `${n.toLocaleString()} ${label}`}
            selectedKey={selected ? (COUNTRY_TO_GEO[selected] ?? selected) : null}
            onSelect={geo => setSelected(geoToCanonical.get(geo) ?? geo)}
          />
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Top countries</div>
            {ranked.length === 0 ? (
              <div className="text-[12px] text-muted-foreground py-4">No data for this period.</div>
            ) : (
              <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1">
                {ranked.slice(0, 20).map(([country, rows], i) => {
                  const pct = ranked[0][1].length > 0 ? (rows.length / ranked[0][1].length) * 100 : 0;
                  const isSel = selected === country;
                  return (
                    <button
                      key={country}
                      type="button"
                      onClick={() => setSelected(isSel ? null : country)}
                      className={cn("flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors", isSel ? "bg-teal-50 ring-1 ring-teal-200" : "hover:bg-muted/50")}
                    >
                      <span className="w-4 text-right text-[10px] tabular-nums text-muted-foreground shrink-0">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[12px] text-foreground truncate">{country}</span>
                          <span className="text-[12px] font-semibold tabular-nums text-teal-700 shrink-0">{rows.length.toLocaleString()}</span>
                        </div>
                        <div className="h-1 rounded-full bg-muted overflow-hidden mt-0.5">
                          <div className="h-full rounded-full bg-teal-500/70" style={{ width: `${Math.max(pct, 3)}%` }} />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Selected-country people table */}
        {selected && (
          <div className="mt-4 rounded-xl border border-border/50 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2 bg-muted/40 border-b border-border/50">
              <Globe className="h-3.5 w-3.5 text-teal-600 shrink-0" />
              <span className="text-[12px] font-semibold">{selected}</span>
              <span className="text-[11px] text-muted-foreground">· {selectedRows.length} {label}</span>
              <button type="button" onClick={() => setSelected(null)} className="ml-auto text-muted-foreground hover:text-foreground" title="Close">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="max-h-[340px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 px-4 font-medium">Name</th>
                    <th className="py-2 px-3 font-medium">Specialty</th>
                    <th className="py-2 px-3 font-medium">{mode === "qualified" ? "Status" : "Hospital"}</th>
                    <th className="py-2 px-3 font-medium hidden sm:table-cell">Consultant</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRows.slice(0, 300).map((r, idx) => {
                    const specialty = (r as ZohoLead).Specialty_New || (r as ZohoLead).Specialty || (r as ZohoDoctorOnBoard).Speciality || "—";
                    const third = mode === "qualified"
                      ? (r as ZohoLead).Lead_Status || "—"
                      : (r as ZohoDoctorOnBoard).Account_Name?.name || "—";
                    return (
                      <tr key={r.id ?? idx} className="border-b border-border/30 hover:bg-muted/30">
                        <td className="py-2 px-4 text-[12.5px] font-medium text-foreground">{fullName(r)}</td>
                        <td className="py-2 px-3 text-[12px] text-muted-foreground">{specialty}</td>
                        <td className="py-2 px-3 text-[12px] text-muted-foreground">{third}</td>
                        <td className="py-2 px-3 text-[12px] text-muted-foreground hidden sm:table-cell">{r.Owner?.name ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {selectedRows.length > 300 && <div className="py-2 text-center text-[11px] text-muted-foreground">Showing 300 of {selectedRows.length}.</div>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
