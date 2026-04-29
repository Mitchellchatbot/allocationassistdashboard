import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { SectionDateRange } from "@/components/SectionDateRange";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFilteredData } from "@/hooks/use-filtered-data";
import { useWeeklySales } from "@/hooks/use-weekly-sales";
import { useWorkerEntries } from "@/hooks/use-worker-entries";
import { useFilters } from "@/lib/filters";
import { useMemo } from "react";
import { Trophy, Phone, ThumbsUp } from "lucide-react";
import { ChannelIcon } from "@/components/ChannelIcon";
import { WorkerAnalyticsPanel } from "@/components/WorkerAnalyticsPanel";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

const statusColors: Record<string, string> = {
  active:    "bg-success/10 text-success",
  completed: "bg-secondary text-muted-foreground",
  paused:    "bg-warning/10 text-warning",
};

// Match weekly-sales member name to Zoho recruiter name by first word (case-insensitive)
function matchByFirstName(recruiterName: string, memberName: string) {
  const a = recruiterName.split(" ")[0].toLowerCase();
  const b = memberName.split(" ")[0].toLowerCase();
  return a === b;
}

const TeamPerformance = () => {
  const { recruiters, campaigns } = useFilteredData();
  const { data: salesData = [], isLoading: salesLoading } = useWeeklySales();
  const { data: allWorkerEntries = [] } = useWorkerEntries("all");
  const { dateRange } = useFilters();

  // Aggregate worker self-logged entries by worker email username, in the same period
  const workerLoggedByName = useMemo(() => {
    const fromISO = dateRange.from.toISOString().split("T")[0];
    const toISO   = dateRange.to.toISOString().split("T")[0];
    const map = new Map<string, { sales: number; good: number; closed: number }>();
    for (const e of allWorkerEntries) {
      if (!e.worker_email) continue;
      const d = e.call_date ?? "";
      if (d < fromISO || d > toISO) continue;
      const key = e.worker_email.split("@")[0].toLowerCase();
      const cur = map.get(key) ?? { sales: 0, good: 0, closed: 0 };
      if (e.call_type === "Sales Call") cur.sales++;
      if (e.call_type === "Good Call")  cur.good++;
      if (e.call_type === "Sale Closed") cur.closed++;
      map.set(key, cur);
    }
    return map;
  }, [allWorkerEntries, dateRange]);

  const hasAnyCampaignData = campaigns.some(c => c.doctors > 0 || (c as { spend?: number }).spend > 0);

  // Build a lookup: first name (lowercase) → sales summary, augmented with worker self-logged entries
  const salesByFirst = useMemo(() => {
    const map = new Map<string, typeof salesData[number]>();
    // Seed with weekly_sales rows
    for (const s of salesData) {
      const key = s.member_name.split(" ")[0].toLowerCase();
      map.set(key, { ...s });
    }
    // Add worker self-logged calls on top
    for (const [key, counts] of workerLoggedByName.entries()) {
      const existing = map.get(key);
      if (existing) {
        existing.full_sales_calls += counts.sales;
        existing.good_calls       += counts.good;
        existing.sales_count      += counts.closed;
        existing.good_call_rate   = existing.full_sales_calls > 0
          ? Math.round((existing.good_calls / existing.full_sales_calls) * 100)
          : 0;
      } else if (counts.sales + counts.good + counts.closed > 0) {
        map.set(key, {
          member_name:      key,
          full_sales_calls: counts.sales,
          good_calls:       counts.good,
          sales_count:      counts.closed,
          good_call_rate:   counts.sales > 0 ? Math.round((counts.good / counts.sales) * 100) : 0,
        });
      }
    }
    return map;
  }, [salesData, workerLoggedByName]);

  // Chart data: all members that have sales data (union of Zoho recruiters + weekly_sales members)
  const chartData = salesData.map(s => ({
    name:            s.member_name,
    "Full Sales Calls": s.full_sales_calls,
    "Good Calls":    s.good_calls,
    "Good Call Rate (%)": s.good_call_rate,
  }));

  return (
    <DashboardLayout title="Team Performance" subtitle="See how each sales consultant is performing and track active campaigns">
      <SectionDateRange />

      {/* ── Recruiter table ─────────────────────────────────────────── */}
      <Card className="mb-5 shadow-sm border-border/50">
        <CardHeader className="pb-1 pt-4 px-4">
          <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
            Top Performing Sales Consultants
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="overflow-x-auto -mx-4 px-4">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[10px] uppercase tracking-wide h-8 w-8">#</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide h-8">Name</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide h-8 hidden sm:table-cell">Region</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Leads</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Contacted</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right hidden md:table-cell">Conv. Rate</TableHead>
                  {/* Weekly sales columns */}
                  <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right hidden lg:table-cell">Full Calls</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right hidden lg:table-cell">Good Calls</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right hidden xl:table-cell">Good Call %</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right hidden lg:table-cell">Performance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recruiters.map((m, i) => {
                  const conversionRate = (m as { conversionRate?: number }).conversionRate ?? 0;
                  const contacted      = (m as { contacted?: number }).contacted ?? 0;
                  const sales = salesByFirst.get(m.name.split(" ")[0].toLowerCase());

                  return (
                    <TableRow key={m.name} className="hover:bg-muted/30">
                      <TableCell className="py-2.5">
                        {i < 3 ? (
                          <Trophy className={`h-3.5 w-3.5 ${i === 0 ? "text-warning" : i === 1 ? "text-muted-foreground" : "text-orange-400"}`} />
                        ) : (
                          <span className="text-[11px] text-muted-foreground">{i + 1}</span>
                        )}
                      </TableCell>
                      <TableCell className="py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[9px] font-bold">
                            {m.name.split(" ").map((n: string) => n[0]).join("")}
                          </div>
                          <div>
                            <p className="text-[12px] font-medium">{m.name}</p>
                            <p className="text-[10px] text-muted-foreground">{m.role}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-[11px] py-2.5 hidden sm:table-cell">{m.region}</TableCell>
                      <TableCell className="text-[12px] text-right py-2.5 tabular-nums">{m.doctors}</TableCell>
                      <TableCell className="text-[12px] text-right py-2.5 tabular-nums">{contacted}</TableCell>
                      <TableCell className="text-right py-2.5 hidden md:table-cell">
                        <span className={`text-[12px] font-semibold tabular-nums ${
                          conversionRate >= 40 ? 'text-success' :
                          conversionRate >= 20 ? 'text-primary' :
                          'text-warning'
                        }`}>
                          {conversionRate}%
                        </span>
                      </TableCell>

                      {/* Weekly sales data */}
                      <TableCell className="text-[12px] text-right py-2.5 tabular-nums hidden lg:table-cell">
                        {salesLoading ? (
                          <div className="h-3 w-8 rounded bg-muted animate-pulse ml-auto" />
                        ) : sales ? (
                          <span className="flex items-center justify-end gap-1">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            {sales.full_sales_calls}
                          </span>
                        ) : <span className="text-muted-foreground/40">—</span>}
                      </TableCell>
                      <TableCell className="text-[12px] text-right py-2.5 tabular-nums hidden lg:table-cell">
                        {salesLoading ? (
                          <div className="h-3 w-8 rounded bg-muted animate-pulse ml-auto" />
                        ) : sales ? (
                          <span className="flex items-center justify-end gap-1">
                            <ThumbsUp className="h-3 w-3 text-muted-foreground" />
                            {sales.good_calls}
                          </span>
                        ) : <span className="text-muted-foreground/40">—</span>}
                      </TableCell>
                      <TableCell className="text-right py-2.5 hidden xl:table-cell">
                        {salesLoading ? (
                          <div className="h-3 w-10 rounded bg-muted animate-pulse ml-auto" />
                        ) : sales ? (
                          <span className={`text-[12px] font-semibold tabular-nums ${
                            sales.good_call_rate >= 50 ? 'text-success' :
                            sales.good_call_rate >= 30 ? 'text-primary' :
                            'text-warning'
                          }`}>
                            {sales.good_call_rate}%
                          </span>
                        ) : <span className="text-muted-foreground/40 text-[12px]">—</span>}
                      </TableCell>

                      <TableCell className="text-right py-2.5 hidden lg:table-cell">
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="w-14 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${m.score}%` }} />
                          </div>
                          <span className="text-[10px] font-medium tabular-nums w-5 text-right">{m.score}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}

                {/* Show sales-only members not in Zoho recruiters */}
                {salesData
                  .filter(s => !recruiters.some(r => matchByFirstName(r.name, s.member_name)))
                  .map((s, i) => (
                    <TableRow key={`sales-only-${i}`} className="hover:bg-muted/30 opacity-70">
                      <TableCell className="py-2.5">
                        <span className="text-[11px] text-muted-foreground">{recruiters.length + i + 1}</span>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[9px] font-bold">
                            {s.member_name.split(" ").map(n => n[0]).join("")}
                          </div>
                          <div>
                            <p className="text-[12px] font-medium">{s.member_name}</p>
                            <p className="text-[10px] text-muted-foreground">Sales</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell" />
                      <TableCell className="text-right py-2.5 text-muted-foreground/40 text-[12px]">—</TableCell>
                      <TableCell className="text-right py-2.5 text-muted-foreground/40 text-[12px]">—</TableCell>
                      <TableCell className="text-right py-2.5 hidden md:table-cell text-muted-foreground/40 text-[12px]">—</TableCell>
                      <TableCell className="text-[12px] text-right py-2.5 tabular-nums hidden lg:table-cell">
                        <span className="flex items-center justify-end gap-1">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          {s.full_sales_calls}
                        </span>
                      </TableCell>
                      <TableCell className="text-[12px] text-right py-2.5 tabular-nums hidden lg:table-cell">
                        <span className="flex items-center justify-end gap-1">
                          <ThumbsUp className="h-3 w-3 text-muted-foreground" />
                          {s.good_calls}
                        </span>
                      </TableCell>
                      <TableCell className="text-right py-2.5 hidden xl:table-cell">
                        <span className={`text-[12px] font-semibold tabular-nums ${
                          s.good_call_rate >= 50 ? 'text-success' :
                          s.good_call_rate >= 30 ? 'text-primary' :
                          'text-warning'
                        }`}>
                          {s.good_call_rate}%
                        </span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell" />
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Call Volume Bar Chart ───────────────────────────────────── */}
      {salesLoading && (
        <Card className="mb-5 shadow-sm border-border/50">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
              Call Volume by Team Member
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="h-[260px] rounded-lg bg-muted/40 animate-pulse" />
          </CardContent>
        </Card>
      )}
      {!salesLoading && chartData.length > 0 && (
        <Card className="mb-5 shadow-sm border-border/50">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
              Call Volume by Team Member
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} barGap={4} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 11,
                    borderRadius: 8,
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--card))",
                    color: "hsl(var(--foreground))",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Bar dataKey="Full Sales Calls" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Good Calls" fill="hsl(var(--success, 142 76% 36%))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ── Active Campaigns ────────────────────────────────────────── */}
      <Card className="shadow-sm border-border/50">
        <CardHeader className="pb-1 pt-4 px-4">
          <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
            Active Campaigns
            {campaigns.length > 0 && <span className="ml-2 text-muted-foreground/50 normal-case font-normal">— {campaigns.length} campaigns</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {campaigns.length === 0 || !hasAnyCampaignData ? (
            <p className="text-[12px] text-muted-foreground text-center py-6">No campaign data available</p>
          ) : (
            <div className="overflow-x-auto -mx-4 px-4">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[10px] uppercase tracking-wide h-8">Campaign Name</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide h-8 hidden sm:table-cell">Channel</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Doctors Reached</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wide h-8">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map(c => (
                    <TableRow key={c.name} className="hover:bg-muted/30">
                      <TableCell className="text-[12px] font-medium py-2.5">{c.name}</TableCell>
                      <TableCell className="text-[11px] text-muted-foreground py-2.5 hidden sm:table-cell">
                        <div className="flex items-center gap-1.5">
                          <ChannelIcon channel={c.channel} size={12} />
                          {c.channel}
                        </div>
                      </TableCell>
                      <TableCell className="text-[12px] text-right py-2.5 tabular-nums">{c.doctors > 0 ? c.doctors : '—'}</TableCell>
                      <TableCell className="py-2.5">
                        <Badge variant="outline" className={`text-[9px] capitalize ${statusColors[c.status] ?? ''}`}>{c.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Worker Activity ─────────────────────────────────────────── */}
      <WorkerAnalyticsPanel />
    </DashboardLayout>
  );
};

export default TeamPerformance;
