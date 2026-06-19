import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { SectionDateRange } from "@/components/SectionDateRange";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFilteredData } from "@/hooks/use-filtered-data";
import { useWeeklySales } from "@/hooks/use-weekly-sales";
import { useWorkerEntries } from "@/hooks/use-worker-entries";
import { useFilters } from "@/lib/filters";
import { SALES_TEAM, firstNameKey } from "@/lib/sales-team";
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

  // The board is exactly the active sales team — Abraham, Asser, Asim
  // (Ammar 2026-06-10: "leave only [them], remove the rest of us"). Each
  // rep's CALL count is their Zoho call activity (recruiter.calls = outbound
  // Zoho Calls by owner, date-filtered) — NOT the manual weekly_sales CSV.
  // That's the "count the activities from Zoho" fix. Leads / contacted /
  // conversion come from their Zoho lead ownership; Full/Good calls remain a
  // weekly_sales quality overlay when present.
  const rows = useMemo(() => {
    return SALES_TEAM.map(rep => {
      const recruiter = recruiters.find(r => firstNameKey(r.name) === rep.firstName) as
        | { name: string; calls?: number; doctors?: number; contacted?: number; conversionRate?: number; score?: number }
        | undefined;
      const sales = salesByFirst.get(rep.firstName);
      return {
        key:            rep.firstName,
        name:           recruiter?.name ?? rep.name,
        zohoCalls:      recruiter?.calls ?? 0,
        leads:          recruiter?.doctors ?? 0,
        contacted:      recruiter?.contacted ?? 0,
        conversionRate: recruiter?.conversionRate ?? 0,
        score:          recruiter?.score ?? 0,
        sales,
      };
    });
  }, [recruiters, salesByFirst]);

  // Chart the same three reps; headline series is Zoho call activity.
  const chartData = rows.map(r => ({
    name:               r.name,
    "Calls (Zoho)":     r.zohoCalls,
    "Full Sales Calls": r.sales?.full_sales_calls ?? 0,
    "Good Calls":       r.sales?.good_calls ?? 0,
  }));

  return (
    <DashboardLayout title="Team Performance" subtitle="See how each sales consultant is performing and track active campaigns" docSlug="growth/team-performance">
      <SectionDateRange />

      {/* ── Recruiter table ─────────────────────────────────────────── */}
      <Card className="mb-5 shadow-sm border-border/50" data-tour="team-leaderboard">
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
                  <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Calls</TableHead>
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
                {rows.map((r, i) => (
                  <TableRow key={r.key} className="hover:bg-muted/30">
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
                          {r.name.split(" ").map((n: string) => n[0]).join("")}
                        </div>
                        <div>
                          <p className="text-[12px] font-medium">{r.name}</p>
                          <p className="text-[10px] text-muted-foreground">Sales</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-[11px] py-2.5 hidden sm:table-cell">GCC</TableCell>

                    {/* Calls — Zoho call activity (outbound Calls logged by this owner) */}
                    <TableCell className="text-[12px] text-right py-2.5 tabular-nums">
                      <span className="flex items-center justify-end gap-1 font-semibold">
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        {r.zohoCalls}
                      </span>
                    </TableCell>

                    <TableCell className="text-[12px] text-right py-2.5 tabular-nums">{r.leads}</TableCell>
                    <TableCell className="text-[12px] text-right py-2.5 tabular-nums">{r.contacted}</TableCell>
                    <TableCell className="text-right py-2.5 hidden md:table-cell">
                      <span className={`text-[12px] font-semibold tabular-nums ${
                        r.conversionRate >= 40 ? 'text-success' :
                        r.conversionRate >= 20 ? 'text-primary' :
                        'text-warning'
                      }`}>
                        {r.conversionRate}%
                      </span>
                    </TableCell>

                    {/* Weekly-sales quality overlay (manual CSV upload) */}
                    <TableCell className="text-[12px] text-right py-2.5 tabular-nums hidden lg:table-cell">
                      {salesLoading ? (
                        <div className="h-3 w-8 rounded bg-muted animate-pulse ml-auto" />
                      ) : r.sales ? (
                        <span className="flex items-center justify-end gap-1">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          {r.sales.full_sales_calls}
                        </span>
                      ) : <span className="text-muted-foreground/40">—</span>}
                    </TableCell>
                    <TableCell className="text-[12px] text-right py-2.5 tabular-nums hidden lg:table-cell">
                      {salesLoading ? (
                        <div className="h-3 w-8 rounded bg-muted animate-pulse ml-auto" />
                      ) : r.sales ? (
                        <span className="flex items-center justify-end gap-1">
                          <ThumbsUp className="h-3 w-3 text-muted-foreground" />
                          {r.sales.good_calls}
                        </span>
                      ) : <span className="text-muted-foreground/40">—</span>}
                    </TableCell>
                    <TableCell className="text-right py-2.5 hidden xl:table-cell">
                      {salesLoading ? (
                        <div className="h-3 w-10 rounded bg-muted animate-pulse ml-auto" />
                      ) : r.sales ? (
                        <span className={`text-[12px] font-semibold tabular-nums ${
                          r.sales.good_call_rate >= 50 ? 'text-success' :
                          r.sales.good_call_rate >= 30 ? 'text-primary' :
                          'text-warning'
                        }`}>
                          {r.sales.good_call_rate}%
                        </span>
                      ) : <span className="text-muted-foreground/40 text-[12px]">—</span>}
                    </TableCell>

                    <TableCell className="text-right py-2.5 hidden lg:table-cell">
                      <div className="flex items-center justify-end gap-1.5">
                        <div className="w-14 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, r.score)}%` }} />
                        </div>
                        <span className="text-[10px] font-medium tabular-nums w-5 text-right">{r.score}</span>
                      </div>
                    </TableCell>
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
                <Bar dataKey="Calls (Zoho)" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
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
