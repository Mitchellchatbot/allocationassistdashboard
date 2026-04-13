import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFilteredData } from "@/hooks/use-filtered-data";
import { Phone, Mail, Clock, ArrowRight } from "lucide-react";

const Sales = () => {
  const { pipeline, sales, recruiters, stageConversion } = useFilteredData();

  return (
    <DashboardLayout title="Sales Tracker" subtitle="See where doctors are in the process and how recruiters are performing">

      {/* Pipeline flow */}
      <Card className="mb-5 shadow-sm border-border/50">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-[14px] font-semibold text-foreground">Doctor Pipeline</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <div className="flex flex-wrap items-center gap-2">
            {pipeline.map((stage, i) => (
              <div key={stage.stage} className="flex items-center gap-2">
                <div className="rounded-xl border border-border/60 bg-card px-4 py-3 text-center min-w-[100px] hover:border-primary/40 hover:shadow-sm transition-all duration-200">
                  <div className="h-1 rounded-full mb-2.5 w-8 mx-auto" style={{ backgroundColor: stage.color }} />
                  <p className="text-[12px] text-muted-foreground mb-1">{stage.stage}</p>
                  <p className="text-[22px] font-semibold text-foreground tabular-nums leading-none">{stage.count}</p>
                </div>
                {i < pipeline.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-border shrink-0" />}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">

        {/* Key Numbers */}
        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-[14px] font-semibold text-foreground">Key Numbers</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="divide-y divide-border/50">
              {[
                { label: "Doctors Placed", val: sales.dealsClosed },
                { label: "Success Rate", val: `${sales.conversionRate}%` },
                { label: "Avg. Time to Place", val: sales.avgCycleTime },
              ].map(m => (
                <div key={m.label} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <span className="text-[13px] text-muted-foreground">{m.label}</span>
                  <span className="text-[18px] font-semibold text-foreground tabular-nums">{m.val}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Team Outreach */}
        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-[14px] font-semibold text-foreground">Team Outreach</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="divide-y divide-border/50">
              {[
                { icon: Phone, label: "Calls Made", val: sales.outboundCalls.toLocaleString(), color: "text-primary" },
                { icon: Mail, label: "Emails Sent", val: sales.emailsSent.toLocaleString(), color: "text-info" },
                { icon: Clock, label: "Follow-ups Needed", val: sales.followUpsPending.toString(), color: "text-warning" },
              ].map(m => (
                <div key={m.label} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <m.icon className={`h-4 w-4 shrink-0 ${m.color}`} />
                  <span className="text-[13px] text-muted-foreground flex-1">{m.label}</span>
                  <span className="text-[18px] font-semibold text-foreground tabular-nums">{m.val}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Conversion rates */}
        <Card className="shadow-sm border-border/50 md:col-span-2 lg:col-span-1">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-[14px] font-semibold text-foreground">Conversion at Each Step</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-4">
            {stageConversion.map(s => (
              <div key={s.stage}>
                <div className="flex justify-between mb-1.5">
                  <span className="text-[13px] text-foreground">{s.stage}</span>
                  <span className="text-[13px] font-semibold text-primary tabular-nums">{s.rate}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${s.rate}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Recruiters table */}
      <Card className="shadow-sm border-border/50">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-[14px] font-semibold text-foreground">
            Top Recruiters
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <div className="overflow-x-auto -mx-5 px-5">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border/50">
                  <TableHead className="text-[12px] font-medium text-muted-foreground h-9">Name</TableHead>
                  <TableHead className="text-[12px] font-medium text-muted-foreground h-9 hidden sm:table-cell">Region</TableHead>
                  <TableHead className="text-[12px] font-medium text-muted-foreground h-9 text-right">Managed</TableHead>
                  <TableHead className="text-[12px] font-medium text-muted-foreground h-9 text-right">Placed</TableHead>
                  <TableHead className="text-[12px] font-medium text-muted-foreground h-9 text-right hidden md:table-cell">Calls</TableHead>
                  <TableHead className="text-[12px] font-medium text-muted-foreground h-9 text-right hidden md:table-cell">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recruiters.map(rep => (
                  <TableRow key={rep.name} className="hover:bg-muted/30 border-border/40">
                    <TableCell className="py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-semibold shrink-0">
                          {rep.name.split(" ").map(n => n[0]).join("")}
                        </div>
                        <div>
                          <p className="text-[13px] font-medium">{rep.name}</p>
                          <p className="text-[11px] text-muted-foreground">{rep.role}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-[13px] hidden sm:table-cell">{rep.region}</TableCell>
                    <TableCell className="py-3 text-[13px] text-right tabular-nums">{rep.doctors}</TableCell>
                    <TableCell className="py-3 text-[13px] text-right font-semibold tabular-nums text-primary">{rep.placements}</TableCell>
                    <TableCell className="py-3 text-[13px] text-right tabular-nums hidden md:table-cell">{(rep as { calls?: number }).calls ?? '—'}</TableCell>
                    <TableCell className="py-3 text-[13px] text-right tabular-nums hidden md:table-cell">{rep.revenue}</TableCell>
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
