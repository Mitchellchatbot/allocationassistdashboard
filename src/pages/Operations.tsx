import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { operationalHealth, roadmapPhases, bottlenecks } from "@/lib/mock-data";
import { AlertTriangle, CheckCircle, Clock, Circle } from "lucide-react";

const severityConfig = {
  high: { className: "bg-destructive/10 text-destructive border-destructive/20", icon: AlertTriangle },
  medium: { className: "bg-warning/10 text-warning border-warning/20", icon: Clock },
  low: { className: "bg-info/10 text-info border-info/20", icon: Circle },
};

const phaseStatusConfig = {
  "in-progress": { label: "In Progress", className: "bg-primary/10 text-primary" },
  "upcoming": { label: "Upcoming", className: "bg-warning/10 text-warning" },
  "planned": { label: "Planned", className: "bg-secondary text-muted-foreground" },
};

const Operations = () => (
  <DashboardLayout title="Operations" subtitle="Organizational health, roadmap progress, and bottlenecks">
    {/* Operational Health */}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
      {operationalHealth.map(m => {
        const pct = m.unit === "hrs" ? Math.max(0, 100 - (m.value / m.target) * 100) : (m.value / m.target) * 100;
        const isGood = pct >= 60;
        return (
          <Card key={m.metric} className="shadow-sm border-border/50">
            <CardContent className="p-4">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2">{m.metric}</p>
              <div className="flex items-end gap-1 mb-2">
                <span className="text-[22px] font-semibold text-foreground tabular-nums leading-none">{m.value}{m.unit}</span>
                <span className="text-[10px] text-muted-foreground mb-0.5">/ {m.target}{m.unit}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${isGood ? "bg-success" : "bg-warning"}`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>

    {/* Roadmap */}
    <Card className="mb-5 shadow-sm border-border/50">
      <CardHeader className="pb-1 pt-4 px-4">
        <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Transformation Roadmap</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {roadmapPhases.map(phase => {
            const ps = phaseStatusConfig[phase.status];
            return (
              <div key={phase.phase} className="rounded-lg border p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-[13px] font-semibold text-foreground">{phase.phase}</h3>
                    <p className="text-[10px] text-muted-foreground">{phase.timeline}</p>
                  </div>
                  <Badge variant="outline" className={`text-[9px] ${ps.className}`}>{ps.label}</Badge>
                </div>
                {phase.progress > 0 && (
                  <div className="mb-3">
                    <div className="flex justify-between mb-0.5">
                      <span className="text-[10px] text-muted-foreground">Progress</span>
                      <span className="text-[10px] font-medium text-foreground tabular-nums">{phase.progress}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${phase.progress}%` }} />
                    </div>
                  </div>
                )}
                <div className="space-y-1.5">
                  {phase.items.map(item => (
                    <div key={item.task} className="flex items-start gap-2">
                      {item.done ? (
                        <CheckCircle className="h-3 w-3 text-success mt-0.5 shrink-0" />
                      ) : (
                        <Circle className="h-3 w-3 text-muted-foreground/40 mt-0.5 shrink-0" />
                      )}
                      <span className={`text-[11px] leading-tight ${item.done ? "text-muted-foreground line-through" : "text-foreground"}`}>
                        {item.task}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>

    {/* Bottlenecks */}
    <Card className="shadow-sm border-border/50">
      <CardHeader className="pb-1 pt-4 px-4">
        <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Active Bottlenecks</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="space-y-2">
          {bottlenecks.map(b => {
            const sev = severityConfig[b.severity];
            const SevIcon = sev.icon;
            return (
              <div key={b.area} className={`flex items-center gap-3 p-3 rounded-lg border ${sev.className}`}>
                <SevIcon className="h-4 w-4 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium">{b.area}</p>
                  <p className="text-[10px] opacity-70">{b.detail}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[12px] font-semibold tabular-nums">{b.avgDelay}</p>
                  <p className="text-[9px] opacity-60">{b.affected} doctors affected</p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  </DashboardLayout>
);

export default Operations;
