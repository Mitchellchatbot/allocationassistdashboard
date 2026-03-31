import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { topRecruiters, campaignPerformance } from "@/lib/mock-data";
import { Trophy } from "lucide-react";

const statusColors = {
  active: "bg-success/10 text-success",
  completed: "bg-secondary text-muted-foreground",
  paused: "bg-warning/10 text-warning",
};

const TeamPerformance = () => (
  <DashboardLayout title="Team" subtitle="Recruiter leaderboard and campaign tracking">
    <Card className="mb-5 shadow-sm border-border/50">
      <CardHeader className="pb-1 pt-4 px-4">
        <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Recruiter Leaderboard</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-[10px] uppercase tracking-wide h-8 w-8">#</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wide h-8">Name</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wide h-8">Region</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Doctors</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Placements</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Revenue</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Score</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {topRecruiters.map((m, i) => (
              <TableRow key={m.name}>
                <TableCell className="py-2">
                  {i < 3 ? (
                    <Trophy className={`h-3.5 w-3.5 ${i === 0 ? "text-warning" : i === 1 ? "text-muted-foreground" : "text-orange-400"}`} />
                  ) : (
                    <span className="text-[11px] text-muted-foreground">{i + 1}</span>
                  )}
                </TableCell>
                <TableCell className="py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[9px] font-bold">
                      {m.name.split(" ").map(n => n[0]).join("")}
                    </div>
                    <div>
                      <p className="text-[12px] font-medium">{m.name}</p>
                      <p className="text-[10px] text-muted-foreground">{m.role}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-[11px] py-2">{m.region}</TableCell>
                <TableCell className="text-[12px] text-right py-2 tabular-nums">{m.doctors}</TableCell>
                <TableCell className="text-[12px] text-right font-medium py-2 tabular-nums">{m.placements}</TableCell>
                <TableCell className="text-[12px] text-right py-2 tabular-nums">{m.revenue}</TableCell>
                <TableCell className="text-right py-2">
                  <div className="flex items-center justify-end gap-1.5">
                    <div className="w-12 h-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${m.score}%` }} />
                    </div>
                    <span className="text-[10px] font-medium tabular-nums w-5 text-right">{m.score}</span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <Card className="shadow-sm border-border/50">
      <CardHeader className="pb-1 pt-4 px-4">
        <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Campaigns</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-[10px] uppercase tracking-wide h-8">Campaign</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wide h-8">Channel</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Doctors</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Spend</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wide h-8">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaignPerformance.map(c => (
              <TableRow key={c.name}>
                <TableCell className="text-[12px] font-medium py-2">{c.name}</TableCell>
                <TableCell className="text-[11px] text-muted-foreground py-2">{c.channel}</TableCell>
                <TableCell className="text-[12px] text-right py-2 tabular-nums">{c.doctors}</TableCell>
                <TableCell className="text-[12px] text-right py-2 tabular-nums">${c.spend.toLocaleString()}</TableCell>
                <TableCell className="py-2">
                  <Badge variant="outline" className={`text-[9px] capitalize ${statusColors[c.status]}`}>{c.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </DashboardLayout>
);

export default TeamPerformance;
