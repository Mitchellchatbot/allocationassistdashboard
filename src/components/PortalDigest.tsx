import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { usePortalDigest, type DigestPeriod } from "@/hooks/use-portal-digest";
import {
  Sparkles, Loader2, AlertCircle, AlertTriangle, TrendingUp, Megaphone, Building2, RefreshCw,
} from "lucide-react";

const SECTIONS: Array<{
  key: "attention" | "pipeline" | "marketing" | "operations";
  title: string; bg: string; fg: string; chip: string; dot: string; ring: string;
  icon: React.ReactNode; full?: boolean;
}> = [
  { key: "attention",  title: "Needs attention", bg: "bg-rose-50",    fg: "text-rose-600",    chip: "bg-rose-100",    dot: "bg-rose-500",    ring: "border-rose-200",  icon: <AlertTriangle className="h-3.5 w-3.5" />, full: true },
  { key: "pipeline",   title: "Pipeline",        bg: "bg-sky-50",     fg: "text-sky-600",     chip: "bg-sky-100",     dot: "bg-sky-500",     ring: "border-border/50", icon: <TrendingUp className="h-3.5 w-3.5" /> },
  { key: "marketing",  title: "Marketing",       bg: "bg-violet-50",  fg: "text-violet-600",  chip: "bg-violet-100",  dot: "bg-violet-500",  ring: "border-border/50", icon: <Megaphone className="h-3.5 w-3.5" /> },
  { key: "operations", title: "Operations",      bg: "bg-emerald-50", fg: "text-emerald-600", chip: "bg-emerald-100", dot: "bg-emerald-500", ring: "border-border/50", icon: <Building2 className="h-3.5 w-3.5" /> },
];

const PERIODS: DigestPeriod[] = ["daily", "weekly", "monthly"];

function MetricTile({ metric }: { metric: string }) {
  const idx   = metric.indexOf(":");
  const label = idx >= 0 ? metric.slice(0, idx).trim() : metric;
  const value = idx >= 0 ? metric.slice(idx + 1).trim() : "";
  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">{label}</div>
      {value && <div className="text-[13px] font-semibold text-foreground leading-tight mt-0.5">{value}</div>}
    </div>
  );
}

function fmtUpdated(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** AI digest of the portal, scoped to what the viewer can access. Daily digest
 *  auto-generates once a day (shared across the team); weekly/monthly on demand
 *  via the toggle. */
export function PortalDigest() {
  const { role, allowedPages } = useAuth();
  const [period, setPeriod] = useState<DigestPeriod>("daily");
  const { data, isLoading, isFetching, error, regenerate } = usePortalDigest(period, role, allowedPages);

  return (
    <Card className="shadow-sm border-border/60 mb-6 overflow-hidden" data-tour="dashboard-digest">
      <CardHeader className="py-3 px-4 border-b border-border/40 bg-gradient-to-r from-violet-50 via-sky-50 to-transparent">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-[13px] font-semibold flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-100 text-violet-600">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            Portal digest
            {data?.generated_at && (
              <span className="text-[10px] font-normal text-muted-foreground hidden sm:inline">
                updated {fmtUpdated(data.generated_at)}
              </span>
            )}
          </CardTitle>

          <div className="flex items-center gap-2">
            {/* Period selector — highlighted pill */}
            <div className="flex items-center gap-0.5 rounded-full bg-muted/70 p-0.5">
              {PERIODS.map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium capitalize transition-all ${
                    period === p ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => regenerate()}
              disabled={isFetching}
              className="h-8 text-[12px] shrink-0"
              title="Generate a fresh digest now"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4">
        {error ? (
          <div className="flex items-start gap-2 text-[12px] text-rose-700">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{error.message}</span>
          </div>
        ) : isLoading || (isFetching && !data) ? (
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground py-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Reading the portal — leads, deals, recruiters, contracts, the HI workflow and more…
          </div>
        ) : !data ? null : (
          <div className="space-y-4">
            {data.headline && (
              <p className="text-[12.5px] text-foreground leading-relaxed">{data.headline}</p>
            )}

            {data.metrics.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {data.metrics.map((m, i) => <MetricTile key={i} metric={m} />)}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {SECTIONS.map(s => {
                const items = data[s.key];
                if (!items?.length) return null;
                return (
                  <div
                    key={s.key}
                    className={`rounded-lg border ${s.ring} ${s.bg} p-3.5 ${s.full ? "md:col-span-3" : ""}`}
                  >
                    <div className={`flex items-center gap-1.5 mb-2 text-[11px] font-semibold uppercase tracking-wide ${s.fg}`}>
                      <span className={`flex h-5 w-5 items-center justify-center rounded ${s.chip}`}>{s.icon}</span>
                      {s.title}
                    </div>
                    <ul className={`gap-x-6 gap-y-1.5 ${s.full ? "grid sm:grid-cols-2" : "space-y-1.5"}`}>
                      {items.map((it, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-[11.5px] text-foreground/90 leading-snug">
                          <span className={`mt-1.5 h-1 w-1 rounded-full ${s.dot} shrink-0`} />
                          {it}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
