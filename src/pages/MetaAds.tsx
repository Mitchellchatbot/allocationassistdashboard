import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMetaLeadsStats, useMetaLeadsRecent, type GroupedStat } from "@/hooks/use-meta-leads-stats";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Megaphone, Globe, Loader2, TrendingUp, ChevronDown } from "lucide-react";
import { useState } from "react";

const COLORS = [
  "hsl(170,55%,45%)",
  "hsl(210,75%,52%)",
  "hsl(340,70%,55%)",
  "hsl(38,92%,50%)",
  "hsl(270,60%,55%)",
  "hsl(158,50%,42%)",
  "hsl(0,65%,55%)",
  "hsl(200,80%,48%)",
  "hsl(50,85%,50%)",
  "hsl(290,55%,52%)",
];

const tip = {
  backgroundColor: "#fff",
  border: "1px solid hsl(220,14%,90%)",
  borderRadius: "8px",
  fontSize: "11px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  padding: "8px 12px",
};

function KpiTile({ icon: Icon, label, value, sub }: {
  icon: React.ElementType; label: string; value: string; sub?: string;
}) {
  return (
    <Card className="shadow-sm border-kpi/60 bg-kpi hover:shadow-md hover:scale-[1.01] transition-all duration-200">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1.5">
          <Icon className="h-4 w-4 text-primary" />
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
        </div>
        <p className="text-[22px] font-semibold text-foreground tabular-nums leading-none">{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function HBarChart({ data, color, height = 260 }: { data: GroupedStat[]; color: string; height?: number }) {
  if (data.length === 0) return <p className="text-[11px] text-muted-foreground text-center py-12">No data for this period</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" barCategoryGap="20%">
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,92%)" />
        <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)" />
        <YAxis
          dataKey="label"
          type="category"
          fontSize={9}
          tickLine={false}
          axisLine={false}
          width={130}
          stroke="hsl(220,10%,55%)"
          tickFormatter={(v: string) => v.length > 22 ? v.slice(0, 22) + "…" : v}
        />
        <Tooltip contentStyle={tip} formatter={(v: number) => [v.toLocaleString(), "Leads"]} />
        <Bar dataKey="count" fill={color} radius={[0, 4, 4, 0]} name="Leads" />
      </BarChart>
    </ResponsiveContainer>
  );
}

function RankList({ items, total }: { items: GroupedStat[]; total: number }) {
  if (items.length === 0) return <p className="text-[11px] text-muted-foreground py-6 text-center">No data for this period</p>;
  return (
    <div className="space-y-2.5">
      {items.map((r, i) => {
        const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
        return (
          <div key={r.label} className="flex items-center gap-3">
            <span className="text-[10px] text-muted-foreground w-4 tabular-nums shrink-0">{i + 1}</span>
            <span className="text-[11px] font-medium flex-1 truncate" title={r.label}>{r.label}</span>
            <div className="w-28 h-1.5 bg-secondary rounded-full overflow-hidden shrink-0">
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[10px] text-muted-foreground w-6 text-right shrink-0">{pct}%</span>
            <span className="text-[12px] font-semibold tabular-nums w-10 text-right shrink-0">{r.count.toLocaleString()}</span>
          </div>
        );
      })}
    </div>
  );
}

const PRESETS = [
  { label: "Last 7 Days",   value: "last_7d"      },
  { label: "Last 30 Days",  value: "last_30d"     },
  { label: "This Month",    value: "this_month"   },
  { label: "This Quarter",  value: "this_quarter" },
];

const MetaAds = () => {
  const [preset, setPreset] = useState("last_30d");
  const [page, setPage]     = useState(0);
  const { data, isLoading } = useMetaLeadsStats(preset);
  const { data: recentData, isLoading: recentLoading } = useMetaLeadsRecent(preset, page);

  const total       = data?.total        ?? 0;
  const withUtm     = data?.withUtm      ?? 0;
  const byCreative  = data?.byCreative   ?? [];
  const byCampaign  = data?.byCampaign   ?? [];
  const byPlatform  = data?.byPlatform   ?? [];
  const byLocation  = data?.byLocation   ?? [];
  const bySpeciality = data?.bySpeciality ?? [];

  const trackedPct = total > 0 ? Math.round((withUtm / total) * 100) : 0;

  return (
    <DashboardLayout
      title="Meta Leads"
      subtitle="Ad creative and campaign performance from lead form submissions"
    >
      {/* Date preset selector */}
      <div className="flex gap-1.5 mb-5 flex-wrap">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => { setPreset(p.value); setPage(0); }}
            className={`px-3 py-1 rounded-md text-[11px] font-medium transition-colors border ${
              preset === p.value
                ? "bg-primary text-white border-primary"
                : "bg-card text-muted-foreground border-border/50 hover:bg-secondary"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-[12px]">Loading leads data…</span>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <KpiTile icon={Users}       label="Total Leads"       value={total.toLocaleString()} sub="in selected period" />
            <KpiTile icon={TrendingUp}  label="Tracked via Ads"   value={withUtm.toLocaleString()} sub={`${trackedPct}% have UTM data`} />
            <KpiTile icon={Megaphone}   label="Campaigns"         value={byCampaign.length > 0 ? byCampaign.length.toString() : "—"} sub={byCampaign[0]?.label ? byCampaign[0].label.slice(0, 30) + (byCampaign[0].label.length > 30 ? "…" : "") : undefined} />
            <KpiTile icon={Globe}       label="Top Country"       value={byLocation[0]?.label ?? "—"} sub={byLocation[0] ? `${byLocation[0].count.toLocaleString()} leads` : undefined} />
          </div>

          {/* Creative performance — the main section */}
          <Card className="mb-4 shadow-sm border-border/50">
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
                Top Ad Creatives by Leads
                {byCreative.length > 0 && <span className="ml-2 normal-case font-normal text-muted-foreground/50">({byCreative.length} creatives)</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <RankList items={byCreative.slice(0, 15)} total={withUtm} />
            </CardContent>
          </Card>

          {/* Campaign + Platform row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {/* Campaigns */}
            <Card className="shadow-sm border-border/50 flex flex-col">
              <CardHeader className="pb-1 pt-4 px-4 shrink-0">
                <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Leads by Campaign</CardTitle>
              </CardHeader>
              <CardContent className="px-2 sm:px-4 pb-4 flex-1">
                <HBarChart data={byCampaign.slice(0, 8)} color="hsl(170,55%,45%)" height={300} />
              </CardContent>
            </Card>

            {/* Platform */}
            <Card className="shadow-sm border-border/50 flex flex-col">
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Platform (utm_source)</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 flex-1 flex items-center justify-center">
                {byPlatform.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground text-center py-6">No platform data</p>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={byPlatform} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={90} innerRadius={40} paddingAngle={2}>
                        {byPlatform.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={tip} formatter={(v: number) => [v.toLocaleString(), ""]} />
                      <Legend iconSize={8} iconType="circle" formatter={(v) => <span style={{ fontSize: 10 }}>{v}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Origin + Specialty */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <Card className="shadow-sm border-border/50">
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Leads by Country</CardTitle>
              </CardHeader>
              <CardContent className="px-2 sm:px-4 pb-4">
                <HBarChart data={byLocation.slice(0, 10)} color="hsl(210,75%,52%)" />
              </CardContent>
            </Card>

            <Card className="shadow-sm border-border/50">
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
                  Top Specialities
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <RankList items={bySpeciality.slice(0, 10)} total={total} />
              </CardContent>
            </Card>
          </div>

          {/* Recent Leads Table */}
          <Card className="shadow-sm border-border/50">
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
                Recent Lead Submissions
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {recentLoading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span className="text-[11px]">Loading…</span>
                </div>
              ) : !recentData?.rows.length ? (
                <p className="text-[11px] text-muted-foreground text-center py-8">No submissions in this period</p>
              ) : (
                <>
                  <div className="overflow-x-auto -mx-4 px-4">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-[10px] uppercase tracking-wide h-8">Name</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wide h-8 hidden sm:table-cell">Profession</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wide h-8 hidden md:table-cell">Speciality</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wide h-8 hidden sm:table-cell">Country</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right hidden lg:table-cell">Salary (USD)</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wide h-8 hidden md:table-cell">Campaign</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wide h-8 hidden lg:table-cell">Source</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Submitted</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recentData.rows.map((lead) => {
                          const name    = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "—";
                          const country = lead.country || lead.location || "—";
                          const date    = lead.submitted_at
                            ? new Date(lead.submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" })
                            : "—";
                          return (
                            <TableRow key={lead.id} className="hover:bg-muted/30">
                              <TableCell className="py-2">
                                <div className="flex items-center gap-2">
                                  <div className="h-6 w-6 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[8px] font-bold">
                                    {(lead.first_name?.[0] ?? "") + (lead.last_name?.[0] ?? "")}
                                  </div>
                                  <span className="text-[12px] font-medium">{name}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-[11px] py-2 hidden sm:table-cell text-muted-foreground">{lead.profession || "—"}</TableCell>
                              <TableCell className="text-[11px] py-2 hidden md:table-cell text-muted-foreground">{lead.speciality || "—"}</TableCell>
                              <TableCell className="text-[11px] py-2 hidden sm:table-cell text-muted-foreground">{country}</TableCell>
                              <TableCell className="text-[11px] py-2 hidden lg:table-cell text-right tabular-nums">{lead.monthly_salary || "—"}</TableCell>
                              <TableCell className="text-[11px] py-2 hidden md:table-cell text-muted-foreground max-w-[140px] truncate" title={lead.utm_campaign}>{lead.utm_campaign || "—"}</TableCell>
                              <TableCell className="text-[11px] py-2 hidden lg:table-cell">
                                {lead.utm_source ? (
                                  <span className="rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[9px] font-medium capitalize">{lead.utm_source}</span>
                                ) : "—"}
                              </TableCell>
                              <TableCell className="text-[11px] py-2 text-right text-muted-foreground tabular-nums">{date}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  {recentData.hasMore && (
                    <div className="flex justify-center mt-4">
                      <button
                        onClick={() => setPage(p => p + 1)}
                        className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ChevronDown className="h-3.5 w-3.5" /> Load more
                      </button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </DashboardLayout>
  );
};

export default MetaAds;
