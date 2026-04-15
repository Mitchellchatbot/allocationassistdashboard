import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFilteredData } from "@/hooks/use-filtered-data";
import { Trophy } from "lucide-react";
import { ChannelIcon } from "@/components/ChannelIcon";
import { WorkerAnalyticsPanel } from "@/components/WorkerAnalyticsPanel";

const statusColors: Record<string, string> = {
  active:    "bg-success/10 text-success",
  completed: "bg-secondary text-muted-foreground",
  paused:    "bg-warning/10 text-warning",
};

const TeamPerformance = () => {
  const { recruiters, campaigns } = useFilteredData();
  const hasAnyCampaignData = campaigns.some(c => c.doctors > 0 || (c as { spend?: number }).spend > 0);

  return (
    <DashboardLayout title="Team Performance" subtitle="See how each recruiter is performing and track active campaigns">
      <Card className="mb-5 shadow-sm border-border/50">
        <CardHeader className="pb-1 pt-4 px-4">
          <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
            Top Performing Recruiters
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
                  <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Leads Managed</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Contacted</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right hidden md:table-cell">Conv. Rate</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right hidden lg:table-cell">Performance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recruiters.map((m, i) => {
                  const conversionRate = (m as { conversionRate?: number }).conversionRate ?? 0;
                  const contacted      = (m as { contacted?: number }).contacted ?? 0;
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
                          conversionRate >= 5 ? 'text-success' :
                          conversionRate >= 2 ? 'text-primary' :
                          'text-warning'
                        }`}>
                          {conversionRate}%
                        </span>
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
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

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

      {/* ── Worker Activity ─────────────────────────────────────── */}
      <WorkerAnalyticsPanel />
    </DashboardLayout>
  );
};

export default TeamPerformance;
