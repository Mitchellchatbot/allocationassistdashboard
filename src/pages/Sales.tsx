import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFilteredData } from "@/hooks/use-filtered-data";
import { Phone, Mail, Clock, ArrowRight } from "lucide-react";

const Sales = () => {
  const { pipeline, sales, recruiters, stageConversion } = useFilteredData();

  return (
    <DashboardLayout title="Sales & Pipeline" subtitle="Doctor placement pipeline and recruiter performance">
      <Card className="mb-5 shadow-sm border-border/50">
        <CardHeader className="pb-1 pt-4 px-4">
          <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Pipeline Overview</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto">
            {pipeline.map((stage, i) => (
              <div key={stage.stage} className="flex items-center gap-1.5">
                <div className="rounded-lg border p-3 text-center min-w-[110px] hover:shadow-md hover:scale-[1.02] transition-all duration-200">
                  <div className="h-1.5 rounded-full mb-2" style={{ backgroundColor: stage.color }} />
                  <p className="text-[10px] text-muted-foreground mb-0.5">{stage.stage}</p>
                  <p className="text-lg font-semibold text-foreground tabular-nums">{stage.count}</p>
                </div>
                {i < pipeline.length - 1 && <ArrowRight className="h-3 w-3 text-border shrink-0" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
        <Card className="shadow-sm border-border/50 hover:shadow-md transition-shadow">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Performance</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {[
              { label: "Placements", val: sales.dealsClosed },
              { label: "Conversion Rate", val: `${sales.conversionRate}%` },
              { label: "Avg Processing Time", val: sales.avgCycleTime },
            ].map(m => (
              <div key={m.label} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors">
                <span className="text-[11px] text-muted-foreground">{m.label}</span>
                <span className="text-[15px] font-semibold text-foreground tabular-nums">{m.val}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/50 hover:shadow-md transition-shadow">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Outbound Activity</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {[
              { icon: Phone, label: "Outbound Calls", val: sales.outboundCalls.toLocaleString(), color: "text-primary" },
              { icon: Mail, label: "Emails Sent", val: sales.emailsSent.toLocaleString(), color: "text-info" },
              { icon: Clock, label: "Follow-ups Pending", val: sales.followUpsPending.toString(), color: "text-warning" },
            ].map(m => (
              <div key={m.label} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors">
                <m.icon className={`h-4 w-4 ${m.color}`} />
                <div className="flex-1">
                  <p className="text-[10px] text-muted-foreground">{m.label}</p>
                  <p className="text-[15px] font-semibold tabular-nums">{m.val}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/50 hover:shadow-md transition-shadow md:col-span-2 lg:col-span-1">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Stage Conversion</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2.5">
            {stageConversion.map(s => (
              <div key={s.stage}>
                <div className="flex justify-between mb-1">
                  <span className="text-[11px] text-foreground">{s.stage}</span>
                  <span className="text-[11px] font-medium text-primary tabular-nums">{s.rate}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${s.rate}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm border-border/50">
        <CardHeader className="pb-1 pt-4 px-4">
          <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
            Top Recruiters {recruiters.length === 0 && <span className="text-muted-foreground/50 normal-case font-normal">— no data for selected region</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="overflow-x-auto -mx-4 px-4">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[10px] uppercase tracking-wide h-8">Name</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide h-8 hidden sm:table-cell">Region</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Doctors</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Placements</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right hidden md:table-cell">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recruiters.map(rep => (
                  <TableRow key={rep.name} className="hover:bg-muted/30">
                    <TableCell className="py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[9px] font-bold">
                          {rep.name.split(" ").map(n => n[0]).join("")}
                        </div>
                        <div>
                          <p className="text-[12px] font-medium">{rep.name}</p>
                          <p className="text-[10px] text-muted-foreground">{rep.role}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-2.5 text-[11px] hidden sm:table-cell">{rep.region}</TableCell>
                    <TableCell className="py-2.5 text-[12px] text-right tabular-nums">{rep.doctors}</TableCell>
                    <TableCell className="py-2.5 text-[12px] text-right font-medium tabular-nums">{rep.placements}</TableCell>
                    <TableCell className="py-2.5 text-[12px] text-right tabular-nums hidden md:table-cell">{rep.revenue}</TableCell>
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

export default Sales;
