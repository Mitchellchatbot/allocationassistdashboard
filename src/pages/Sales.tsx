import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { pipelineStages, salesMetrics, topSalesReps, stageConversion } from "@/lib/mock-data";
import { Phone, Mail, Clock, ArrowRight } from "lucide-react";

const Sales = () => {
  return (
    <DashboardLayout title="Sales" subtitle="Pipeline and sales team performance">
      {/* Pipeline */}
      <Card className="mb-6 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Pipeline Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {pipelineStages.map((stage, i) => (
              <div key={stage.stage} className="flex items-center gap-2">
                <div className="flex-1 min-w-[140px] rounded-lg border p-4 text-center hover:shadow-md transition-shadow">
                  <div className="h-1.5 rounded-full mb-3" style={{ backgroundColor: stage.color }} />
                  <p className="text-xs text-muted-foreground mb-1">{stage.stage}</p>
                  <p className="text-xl font-display font-bold text-foreground">{stage.count}</p>
                  <p className="text-xs text-muted-foreground mt-1">{stage.value}</p>
                </div>
                {i < pipelineStages.length - 1 && (
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Key Sales Metrics */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Sales Performance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
              <span className="text-xs text-muted-foreground">Deals Closed (Month)</span>
              <span className="text-lg font-display font-bold text-foreground">{salesMetrics.dealsClosed}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
              <span className="text-xs text-muted-foreground">Conversion Rate</span>
              <span className="text-lg font-display font-bold text-primary">{salesMetrics.conversionRate}%</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
              <span className="text-xs text-muted-foreground">Avg Cycle Time</span>
              <span className="text-lg font-display font-bold text-foreground">{salesMetrics.avgCycleTime}</span>
            </div>
          </CardContent>
        </Card>

        {/* Outbound Activity */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Outbound Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
              <Phone className="h-4 w-4 text-primary" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Outbound Calls</p>
                <p className="text-lg font-display font-bold">{salesMetrics.outboundCalls.toLocaleString()}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
              <Mail className="h-4 w-4 text-info" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Emails Sent</p>
                <p className="text-lg font-display font-bold">{salesMetrics.emailsSent.toLocaleString()}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
              <Clock className="h-4 w-4 text-warning" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Follow-ups Pending</p>
                <p className="text-lg font-display font-bold text-warning">{salesMetrics.followUpsPending}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stage Conversion */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Conversion by Stage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stageConversion.map((s) => (
              <div key={s.stage}>
                <div className="flex justify-between mb-1">
                  <span className="text-xs text-foreground">{s.stage}</span>
                  <span className="text-xs font-medium text-primary">{s.rate}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${s.rate}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Top Reps Table */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Top Sales Representatives</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Name</TableHead>
                <TableHead className="text-xs text-right">Deals</TableHead>
                <TableHead className="text-xs text-right">Revenue</TableHead>
                <TableHead className="text-xs text-right">Conversion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topSalesReps.map((rep) => (
                <TableRow key={rep.name}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">
                        {rep.avatar}
                      </div>
                      <span className="text-sm font-medium">{rep.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">{rep.deals}</TableCell>
                  <TableCell className="text-right text-sm">{rep.revenue}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary" className="text-xs">{rep.conversion}%</Badge>
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

export default Sales;
