import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { pipelineLeads, workflowStages } from "@/lib/mock-data";
import { ArrowRight, AlertTriangle, CheckCircle, Clock } from "lucide-react";

const statusConfig = {
  "on-track": { label: "On Track", className: "bg-success/10 text-success border-success/20", icon: CheckCircle },
  "at-risk": { label: "At Risk", className: "bg-warning/10 text-warning border-warning/20", icon: Clock },
  "delayed": { label: "Delayed", className: "bg-destructive/10 text-destructive border-destructive/20", icon: AlertTriangle },
};

const LeadsPipeline = () => {
  return (
    <DashboardLayout title="Leads Pipeline" subtitle="Track leads through the placement workflow">
      {/* Workflow Tracker */}
      <Card className="mb-6 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Workflow Tracker</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            {workflowStages.map((stage, i) => (
              <div key={stage.name} className="flex items-center gap-2">
                <div className="rounded-lg border-2 border-primary/30 bg-primary/5 px-4 py-3 text-center min-w-[120px]">
                  <p className="text-lg font-display font-bold text-foreground">{stage.count}</p>
                  <p className="text-[10px] text-muted-foreground">{stage.name}</p>
                </div>
                {i < workflowStages.length - 1 && (
                  <ArrowRight className="h-4 w-4 text-primary/40 shrink-0" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Pipeline Table */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">All Leads</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">ID</TableHead>
                <TableHead className="text-xs">Name</TableHead>
                <TableHead className="text-xs">Specialty</TableHead>
                <TableHead className="text-xs">Stage</TableHead>
                <TableHead className="text-xs">Country</TableHead>
                <TableHead className="text-xs">Assigned To</TableHead>
                <TableHead className="text-xs text-right">Days in Stage</TableHead>
                <TableHead className="text-xs">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pipelineLeads.map((lead) => {
                const status = statusConfig[lead.status];
                const StatusIcon = status.icon;
                return (
                  <TableRow key={lead.id}>
                    <TableCell className="text-xs font-mono text-muted-foreground">{lead.id}</TableCell>
                    <TableCell className="text-sm font-medium">{lead.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{lead.specialty}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{lead.stage}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{lead.country}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{lead.assignedTo}</TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      {lead.daysInStage}
                    </TableCell>
                    <TableCell>
                      <div className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${status.className}`}>
                        <StatusIcon className="h-3 w-3" />
                        {status.label}
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
};

export default LeadsPipeline;
