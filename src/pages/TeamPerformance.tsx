import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { teamLeaderboard, campaignPerformance } from "@/lib/mock-data";
import { Trophy } from "lucide-react";

const campaignStatus = {
  active: "bg-success/10 text-success",
  completed: "bg-muted text-muted-foreground",
  paused: "bg-warning/10 text-warning",
};

const TeamPerformance = () => {
  return (
    <DashboardLayout title="Team Performance" subtitle="Leaderboard and campaign tracking">
      {/* Leaderboard */}
      <Card className="mb-6 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Sales Leaderboard</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs w-8">#</TableHead>
                <TableHead className="text-xs">Name</TableHead>
                <TableHead className="text-xs">Role</TableHead>
                <TableHead className="text-xs text-right">Calls</TableHead>
                <TableHead className="text-xs text-right">Deals</TableHead>
                <TableHead className="text-xs text-right">Revenue</TableHead>
                <TableHead className="text-xs text-right">Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teamLeaderboard.map((member, i) => (
                <TableRow key={member.name}>
                  <TableCell>
                    {i < 3 ? (
                      <Trophy className={`h-4 w-4 ${i === 0 ? "text-warning" : i === 1 ? "text-muted-foreground" : "text-orange-400"}`} />
                    ) : (
                      <span className="text-xs text-muted-foreground">{i + 1}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">
                        {member.name.split(" ").map(n => n[0]).join("")}
                      </div>
                      <span className="text-sm font-medium">{member.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{member.role}</TableCell>
                  <TableCell className="text-right text-sm">{member.calls}</TableCell>
                  <TableCell className="text-right text-sm font-medium">{member.deals}</TableCell>
                  <TableCell className="text-right text-sm">{member.revenue}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${member.score}%` }} />
                      </div>
                      <span className="text-xs font-medium w-6 text-right">{member.score}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Campaigns */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Campaign Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Campaign</TableHead>
                <TableHead className="text-xs">Channel</TableHead>
                <TableHead className="text-xs text-right">Leads</TableHead>
                <TableHead className="text-xs text-right">Spend</TableHead>
                <TableHead className="text-xs">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaignPerformance.map((c) => (
                <TableRow key={c.name}>
                  <TableCell className="text-sm font-medium">{c.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.channel}</TableCell>
                  <TableCell className="text-right text-sm">{c.leads}</TableCell>
                  <TableCell className="text-right text-sm">${c.spend.toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] capitalize ${campaignStatus[c.status]}`}>
                      {c.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
};

export default TeamPerformance;
