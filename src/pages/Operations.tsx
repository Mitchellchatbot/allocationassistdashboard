import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFilteredData } from "@/hooks/use-filtered-data";
import { AlertTriangle, Clock, Circle, RotateCcw, User, FileText } from "lucide-react";
import { useState } from "react";
import type { ZohoLead } from "@/hooks/use-zoho-data";

const severityConfig = {
  high:   { className: "bg-destructive/10 text-destructive border-destructive/20", accent: "border-destructive/40", icon: AlertTriangle },
  medium: { className: "bg-warning/10 text-warning border-warning/20",             accent: "border-warning/40",     icon: Clock },
  low:    { className: "bg-info/10 text-info border-info/20",                       accent: "border-info/40",        icon: Circle },
};

// ── Flip card for each bottleneck ─────────────────────────────────────────────

interface BottleneckCardProps {
  b: {
    area: string; severity: 'high' | 'medium' | 'low';
    avgDelay: string; affected: number; detail: string; leads: ZohoLead[];
  };
  flipped: boolean;
  onFlip: () => void;
}

function BottleneckCard({ b, flipped, onFlip }: BottleneckCardProps) {
  const sev = severityConfig[b.severity];
  const SevIcon = sev.icon;

  return (
    <div
      className="cursor-pointer select-none"
      style={{ perspective: '1200px', height: flipped ? '260px' : '64px', transition: 'height 0.45s cubic-bezier(0.4,0,0.2,1)' }}
      onClick={onFlip}
    >
      <div
        style={{
          transformStyle: 'preserve-3d',
          transition: 'transform 0.55s cubic-bezier(0.4,0,0.2,1)',
          transform: flipped ? 'rotateX(-180deg)' : 'rotateX(0deg)',
          position: 'relative',
          height: '100%',
        }}
      >
        {/* ── Front ── */}
        <div
          style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
          className={`absolute inset-0 flex items-center gap-3 px-4 rounded-xl border ${sev.className} shadow-sm transition-all duration-200 hover:shadow-md hover:scale-[1.015] hover:brightness-95`}
        >
          <SevIcon className="h-4 w-4 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold">{b.area}</p>
            <p className="text-[10px] opacity-70">{b.detail}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[20px] font-bold tabular-nums leading-none">{b.affected}</p>
            <p className="text-[9px] opacity-60">doctors affected</p>
          </div>
          <RotateCcw className="h-3 w-3 opacity-30 ml-1 shrink-0" />
        </div>

        {/* ── Back ── */}
        <div
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateX(180deg)',
          }}
          className={`absolute inset-0 rounded-xl border ${sev.accent} bg-card shadow-md flex flex-col overflow-hidden`}
        >
          <div className={`flex items-center justify-between px-4 py-2.5 border-b ${sev.className}`}>
            <div className="flex items-center gap-2">
              <SevIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="text-[11px] font-semibold">{b.area}</span>
            </div>
            <span className="text-[10px] opacity-60">{b.affected} doctors · click to close</span>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
            {b.leads.slice(0, 50).map((lead, i) => (
              <div
                key={lead.id}
                className="flex items-center gap-2 py-1 border-b border-border/20 last:border-0"
                style={{ animationDelay: `${i * 20}ms` }}
              >
                <User className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-[11px] font-medium text-foreground flex-1 truncate">{lead.Full_Name}</span>
                {lead.Owner?.name && (
                  <span className="text-[10px] text-muted-foreground shrink-0">{lead.Owner.name}</span>
                )}
                <span className="text-[9px] text-muted-foreground/60 shrink-0">
                  {lead.Specialty ?? lead.Specialty_New ?? '—'}
                </span>
              </div>
            ))}
            {b.leads.length > 50 && (
              <p className="text-[10px] text-muted-foreground text-center py-2">
                + {b.leads.length - 50} more doctors
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const Operations = () => {
  const { bottlenecks, licenseOverview } = useFilteredData();
  const [flippedArea, setFlippedArea] = useState<string | null>(null);

  const licenseTypes = [
    { key: 'DOH', label: 'DOH License', data: licenseOverview?.doh },
    { key: 'DHA', label: 'DHA License', data: licenseOverview?.dha },
    { key: 'MOH', label: 'MOH License', data: licenseOverview?.moh },
  ];

  return (
    <DashboardLayout title="Operations" subtitle="License pipeline status and active issues across the doctor pool">

      {/* ── License Pipeline ──────────────────────────────────────────────────── */}
      <Card className="mb-5 shadow-sm border-border/50">
        <CardHeader className="pb-2 pt-4 px-5">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <CardTitle className="text-[13px] font-semibold text-foreground">License Pipeline</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {licenseTypes.map(({ key, label, data }) => {
              if (!data) return null;
              const total   = data.yes.length + data.inProgress.length + data.no.length;
              const yesPct  = total > 0 ? Math.round((data.yes.length / total) * 100) : 0;
              const inPct   = total > 0 ? Math.round((data.inProgress.length / total) * 100) : 0;

              return (
                <div key={key} className="rounded-xl border border-border/50 bg-card p-4 hover:shadow-md hover:scale-[1.01] transition-all duration-200">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">{label}</p>

                  <div className="space-y-2 mb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-success" />
                        <span className="text-[11px] text-muted-foreground">Approved</span>
                      </div>
                      <span className="text-[13px] font-bold text-success tabular-nums">{data.yes.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-warning" />
                        <span className="text-[11px] text-muted-foreground">In Progress</span>
                      </div>
                      <span className="text-[13px] font-bold text-warning tabular-nums">{data.inProgress.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                        <span className="text-[11px] text-muted-foreground">Not Applied</span>
                      </div>
                      <span className="text-[13px] font-bold text-muted-foreground tabular-nums">{data.no.length}</span>
                    </div>
                  </div>

                  {total > 0 && (
                    <>
                      <div className="h-2 rounded-full bg-muted overflow-hidden flex">
                        <div className="h-full bg-success transition-all" style={{ width: `${yesPct}%` }} />
                        <div className="h-full bg-warning transition-all" style={{ width: `${inPct}%` }} />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1.5 text-right">
                        {yesPct}% approved · {inPct}% pending
                      </p>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Current Delays & Issues ───────────────────────────────────────────── */}
      <Card className="shadow-sm border-border/50">
        <CardHeader className="pb-1 pt-4 px-4">
          <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
            Current Delays & Issues
            <span className="ml-2 normal-case font-normal text-muted-foreground/60">— click a card to see affected doctors</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {bottlenecks.length === 0 ? (
            <p className="text-[12px] text-muted-foreground text-center py-6">No active issues — all caught up!</p>
          ) : (
            <div className="space-y-2.5">
              {bottlenecks.map(b => (
                <BottleneckCard
                  key={b.area}
                  b={b}
                  flipped={flippedArea === b.area}
                  onFlip={() => setFlippedArea(prev => prev === b.area ? null : b.area)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
};

export default Operations;
