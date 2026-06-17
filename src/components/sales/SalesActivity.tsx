/**
 * SalesActivity — the "what's actually happening" section for the Sales page.
 * Three useful views the old page lacked:
 *   1. Pipeline trend — new leads + conversions over time (Daily/Weekly/Monthly).
 *   2. Lead sources — where leads come from and how many qualify.
 *   3. Recent conversions — the latest Doctors-on-Board.
 * All from the same windowed Zoho data the KPIs use.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFilteredData } from "@/hooks/use-filtered-data";
import { useZohoData } from "@/hooks/use-zoho-data";
import { useFilters } from "@/lib/filters";
import { GranularityToggle } from "@/components/GranularityToggle";
import { bucketKey, bucketLabel, parseDate, type Granularity } from "@/lib/time-buckets";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { TrendingUp, PieChart, UserCheck } from "lucide-react";

// Mirrors the qualified definition used across Sales / attribution.
const QUALIFIED = new Set(["Initial Sales Call Completed", "High Priority Follow up"]);
const SRC_COLORS = ["#14b8a6", "#0ea5e9", "#f59e0b", "#ec4899", "#8b5cf6", "#22c55e", "#fb7185", "#64748b"];

function fmtDate(s: string | null | undefined): string {
  const d = parseDate(s);
  return d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—";
}

export function SalesActivity() {
  const { filteredLeads } = useFilteredData();
  const { data: zoho } = useZohoData();
  const { dateRange } = useFilters();
  const [gran, setGran] = useState<Granularity>("week");

  const fromMs = dateRange.from.getTime();
  const toMs   = dateRange.to.getTime() + 86_400_000;

  // Conversions (Doctors on Board) inside the window.
  const conversions = useMemo(() => {
    return (zoho?.rawDoctorsOnBoard ?? []).filter(d => {
      const t = parseDate(d.Created_Time)?.getTime();
      return t != null && t >= fromMs && t < toMs;
    });
  }, [zoho, fromMs, toMs]);

  // Trend — new leads + conversions per bucket.
  const trend = useMemo(() => {
    const map = new Map<string, { key: string; leads: number; conversions: number }>();
    const get = (k: string) => {
      let r = map.get(k);
      if (!r) { r = { key: k, leads: 0, conversions: 0 }; map.set(k, r); }
      return r;
    };
    for (const l of filteredLeads) { const d = parseDate(l.Created_Time); if (d) get(bucketKey(d, gran)).leads++; }
    for (const c of conversions)   { const d = parseDate(c.Created_Time); if (d) get(bucketKey(d, gran)).conversions++; }
    return [...map.values()].sort((a, b) => a.key.localeCompare(b.key))
      .map(r => ({ ...r, label: bucketLabel(r.key, gran) }));
  }, [filteredLeads, conversions, gran]);

  // Lead sources — leads + qualified per source.
  const sources = useMemo(() => {
    const map = new Map<string, { source: string; leads: number; qualified: number }>();
    for (const l of filteredLeads) {
      const s = (l.Lead_Source || "Unknown").trim() || "Unknown";
      const cur = map.get(s) ?? { source: s, leads: 0, qualified: 0 };
      cur.leads++;
      if (QUALIFIED.has(l.Lead_Status)) cur.qualified++;
      map.set(s, cur);
    }
    return [...map.values()].sort((a, b) => b.leads - a.leads).slice(0, 8);
  }, [filteredLeads]);

  const recent = useMemo(() =>
    conversions.slice()
      .sort((a, b) => (parseDate(b.Created_Time)?.getTime() ?? 0) - (parseDate(a.Created_Time)?.getTime() ?? 0))
      .slice(0, 8),
    [conversions]);

  const maxSrc = sources[0]?.leads ?? 1;

  return (
    <div className="space-y-5 mb-5">
      {/* ── Pipeline trend ── */}
      <Card className="shadow-sm border-border/50">
        <CardHeader className="pb-2 pt-4 px-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-[13px] font-semibold text-foreground flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-primary" /> Pipeline Trend
              </CardTitle>
              <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                {filteredLeads.length.toLocaleString()} new leads · {conversions.length.toLocaleString()} conversions in this period
              </p>
            </div>
            <GranularityToggle value={gran} onChange={setGran} />
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {trend.length === 0 ? (
            <p className="text-[12px] text-muted-foreground py-8 text-center">No leads or conversions in this period.</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <ComposedChart data={trend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} iconType="circle" />
                <Bar dataKey="leads" name="New leads" fill="#0ea5e9" radius={[3, 3, 0, 0]} barSize={gran === "day" ? 6 : 16} />
                <Line dataKey="conversions" name="Conversions" stroke="#14b8a6" strokeWidth={2.5} dot={{ r: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── Lead sources ── */}
        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-[13px] font-semibold text-foreground flex items-center gap-1.5">
              <PieChart className="h-3.5 w-3.5 text-primary" /> Lead Sources
            </CardTitle>
            <p className="text-[11px] text-muted-foreground/80 mt-0.5">Where leads came from · qualified rate</p>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-3">
            {sources.length === 0 ? (
              <p className="text-[12px] text-muted-foreground py-4 text-center">No leads in this period.</p>
            ) : sources.map((s, i) => (
              <div key={s.source}>
                <div className="flex items-center justify-between mb-0.5 text-[12px]">
                  <span className="truncate max-w-[200px] font-medium">{s.source}</span>
                  <span className="tabular-nums text-muted-foreground">
                    <span className="font-semibold text-foreground">{s.leads.toLocaleString()}</span> leads
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(s.leads / maxSrc) * 100}%`, backgroundColor: SRC_COLORS[i % SRC_COLORS.length] }} />
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {s.qualified} qualified · {s.leads > 0 ? Math.round((s.qualified / s.leads) * 100) : 0}% rate
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* ── Recent conversions ── */}
        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-[13px] font-semibold text-foreground flex items-center gap-1.5">
              <UserCheck className="h-3.5 w-3.5 text-emerald-600" /> Recent Conversions
            </CardTitle>
            <p className="text-[11px] text-muted-foreground/80 mt-0.5">Latest doctors marked on board</p>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            {recent.length === 0 ? (
              <p className="text-[12px] text-muted-foreground py-4 text-center">No conversions in this period.</p>
            ) : (
              <ul className="divide-y divide-border/40">
                {recent.map((c, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium truncate">{c.Full_Name || "Unknown"}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {c.Owner?.name || "—"}{c.Specialty ? ` · ${c.Specialty}` : ""}
                      </p>
                    </div>
                    <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{fmtDate(c.Created_Time)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
