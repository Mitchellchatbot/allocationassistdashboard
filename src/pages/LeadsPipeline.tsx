import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { pipelineDoctors, workflowStages } from "@/lib/mock-data";
import { ArrowRight, AlertTriangle, CheckCircle, Clock } from "lucide-react";

const statusConfig = {
  "on-track": { label: "On Track", className: "bg-success/10 text-success border-success/20", icon: CheckCircle },
  "at-risk": { label: "At Risk", className: "bg-warning/10 text-warning border-warning/20", icon: Clock },
  "delayed": { label: "Delayed", className: "bg-destructive/10 text-destructive border-destructive/20", icon: AlertTriangle },
};

const LeadsPipeline = () => (
  <DashboardLayout title="Doctor Pipeline" subtitle="Track doctors through the placement workflow">
    {/* Workflow */}
    <Card className="mb-5 shadow-sm border-border/50">
      <CardHeader className="pb-1 pt-4 px-4">
        <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Workflow Tracker</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {workflowStages.map((stage, i) => (
            <div key={stage.name} className="flex items-center gap-1.5">
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-center min-w-[100px]">
                <p className="text-lg font-semibold text-foreground tabular-nums">{stage.count}</p>
                <p className="text-[9px] text-muted-foreground leading-tight">{stage.name}</p>
              </div>
              {i < workflowStages.length - 1 && <ArrowRight className="h-3 w-3 text-primary/30 shrink-0" />}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>

    {/* Doctor Table */}
    <Card className="shadow-sm border-border/50">
      <CardHeader className="pb-1 pt-4 px-4">
        <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">All Doctors in Pipeline</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-[10px] uppercase tracking-wide h-8">ID</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wide h-8">Doctor</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wide h-8">Specialty</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wide h-8">Stage</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wide h-8">Route</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wide h-8">License</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wide h-8">Assigned</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Days</TableHead>
              <TableHead className="text-[10px] uppercase tracking-wide h-8">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pipelineDoctors.map(doc => {
              const st = statusConfig[doc.status];
              const StIcon = st.icon;
              return (
                <TableRow key={doc.id}>
                  <TableCell className="text-[10px] font-mono text-muted-foreground py-2">{doc.id}</TableCell>
                  <TableCell className="text-[12px] font-medium py-2">{doc.name}</TableCell>
                  <TableCell className="text-[11px] text-muted-foreground py-2">{doc.specialty}</TableCell>
                  <TableCell className="py-2">
                    <Badge variant="outline" className="text-[9px] font-medium">{doc.stage}</Badge>
                  </TableCell>
                  <TableCell className="text-[10px] text-muted-foreground py-2">{doc.origin} → {doc.destination}</TableCell>
                  <TableCell className="text-[10px] font-medium py-2">{doc.license}</TableCell>
                  <TableCell className="text-[11px] text-muted-foreground py-2">{doc.assignedTo}</TableCell>
                  <TableCell className="text-[12px] text-right font-medium py-2 tabular-nums">{doc.daysInStage}</TableCell>
                  <TableCell className="py-2">
                    <div className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${st.className}`}>
                      <StIcon className="h-2.5 w-2.5" />{st.label}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </DashboardLayout>
);

export default LeadsPipeline;
