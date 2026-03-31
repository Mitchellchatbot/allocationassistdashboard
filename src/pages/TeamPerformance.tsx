import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFilteredData } from "@/hooks/use-filtered-data";
import { Trophy } from "lucide-react";

const statusColors = {
  active: "bg-success/10 text-success",
  completed: "bg-secondary text-muted-foreground",
  paused: "bg-warning/10 text-warning",
};

const TeamPerformance = () => {
  const { recruiters, campaigns } = useFilteredData();

  return (
    <DashboardLayout title="Team Performance" subtitle="See how each recruiter is performing and track active campaigns">
      <Card className="mb-5 shadow-sm border-border/50">
        <CardHeader className="pb-1 pt-4 px-4">
          <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
            Top Performing Recruiters {recruiters.length === 0 && <span className="text-muted-foreground/50 normal-case font-normal">— no data for selected region</span>}
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
                  <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Doctors Managed</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Successfully Placed</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right hidden md:table-cell">Revenue Earned</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right hidden lg:table-cell">Performance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recruiters.map((m, i) => (
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
                          {m.name.split(" ").map(n => n[0]).join("")}
                        </div>
                        <div>
                          <p className="text-[12px] font-medium">{m.name}</p>
                          <p className="text-[10px] text-muted-foreground">{m.role}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-[11px] py-2.5 hidden sm:table-cell">{m.region}</TableCell>
                    <TableCell className="text-[12px] text-right py-2.5 tabular-nums">{m.doctors}</TableCell>
                    <TableCell className="text-[12px] text-right font-medium py-2.5 tabular-nums">{m.placements}</TableCell>
                    <TableCell className="text-[12px] text-right py-2.5 tabular-nums hidden md:table-cell">{m.revenue}</TableCell>
                    <TableCell className="text-right py-2.5 hidden lg:table-cell">
                      <div className="flex items-center justify-end gap-1.5">
                        <div className="w-14 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${m.score}%` }} />
                        </div>
                        <span className="text-[10px] font-medium tabular-nums w-5 text-right">{m.score}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm border-border/50">
        <CardHeader className="pb-1 pt-4 px-4">
          <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Active Campaigns</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="overflow-x-auto -mx-4 px-4">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[10px] uppercase tracking-wide h-8">Campaign Name</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide h-8 hidden sm:table-cell">Channel</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Doctors Reached</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right hidden sm:table-cell">Amount Spent</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide h-8">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map(c => (
                  <TableRow key={c.name} className="hover:bg-muted/30">
                    <TableCell className="text-[12px] font-medium py-2.5">{c.name}</TableCell>
                    <TableCell className="text-[11px] text-muted-foreground py-2.5 hidden sm:table-cell">{c.channel}</TableCell>
                    <TableCell className="text-[12px] text-right py-2.5 tabular-nums">{c.doctors}</TableCell>
                    <TableCell className="text-[12px] text-right py-2.5 tabular-nums hidden sm:table-cell">${c.spend.toLocaleString()}</TableCell>
                    <TableCell className="py-2.5">
                      <Badge variant="outline" className={`text-[9px] capitalize ${statusColors[c.status]}`}>{c.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
};

export default TeamPerformance;
