import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingDown, Users, CheckCircle2, Clock, AlertTriangle, ChevronDown, Loader2, MousePointerClick } from "lucide-react";
import { InfoIcon } from "@/components/InfoIcon";
import { useFormInsights, type InsightField } from "@/hooks/use-form-insights";
import type { Form } from "@/hooks/use-forms";
import { cn } from "@/lib/utils";

/** Strip Typeform's {{field:…}} piped-answer refs and tidy spacing so titles read cleanly. */
function cleanTitle(t: string): string {
  return (t || "")
    .replace(/\{\{field:[^}]*\}\}/g, "…")
    .replace(/\s+/g, " ")
    .replace(/\s+([?!.,])/g, "$1")
    .trim() || "Untitled question";
}

function fmtTime(s?: number | null): string | null {
  if (!s || s <= 0) return null;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

/** Severity of a drop-off rate → bar + text colour. */
function sev(rate: number) {
  if (rate >= 0.3) return { bar: "bg-rose-500", text: "text-rose-600", ring: "ring-rose-200 bg-rose-50" };
  if (rate >= 0.1) return { bar: "bg-amber-500", text: "text-amber-600", ring: "ring-amber-200 bg-amber-50" };
  return { bar: "bg-emerald-500", text: "text-emerald-600", ring: "ring-emerald-200 bg-emerald-50" };
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-card px-3 py-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">{icon}{label}</div>
      <div className={cn("text-[16px] font-semibold tabular-nums mt-0.5", tone)}>{value}</div>
    </div>
  );
}

/**
 * "Drop-off funnel" panel for a form's detail view.
 *  - Typeform: per-question drop-off (dropoffs/views) from the Insights API,
 *    with completion rate + the single biggest drop-off called out.
 *  - Jotform: only an overall submission count (its API has no per-field funnel).
 *  - Other providers / no token: renders nothing or a short note.
 */
export function FormDropoff({ form }: { form: Form }) {
  const { data, isLoading, isError, error } = useFormInsights(form.id, form.provider);
  const [open, setOpen] = useState(true);

  const fields = data?.fields ?? [];
  const biggestRef = useMemo(() => {
    let ref: string | null = null, most = 0;
    for (const f of fields) if (f.dropoffs > most) { most = f.dropoffs; ref = f.ref; }
    return ref;
  }, [fields]);

  // Nothing to show for providers the funnel doesn't cover.
  if (form.provider !== "typeform" && form.provider !== "jotform") return null;

  const dropRate = (f: InsightField) => (f.views > 0 ? f.dropoffs / f.views : 0);

  return (
    <Card className="shadow-sm border-border/50">
      <CardHeader className="pb-2 pt-3.5 px-4">
        <button type="button" onClick={() => setOpen(o => !o)} className="flex w-full items-center gap-2 text-left">
          <TrendingDown className="h-4 w-4 text-teal-600 shrink-0" />
          <CardTitle className="text-[13px] font-semibold">Drop-off funnel</CardTitle>
          <InfoIcon
            meaning="Where people abandon this form. Drop-off per question = the share of people who reached that question and left without continuing. From the provider's own analytics."
            source={form.provider === "typeform" ? "Typeform Insights API." : "Jotform API (submission count only)."}
          />
          <ChevronDown className={cn("ml-auto h-4 w-4 text-muted-foreground transition-transform", open ? "rotate-180" : "")} />
        </button>
      </CardHeader>

      {open && (
        <CardContent className="px-4 pb-4">
          {isLoading && (
            <div className="flex items-center gap-2 py-6 text-[12px] text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading analytics from {form.provider}…
            </div>
          )}

          {!isLoading && (isError || data?.error) && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{data?.error ?? (error instanceof Error ? error.message : "Couldn't load analytics.")}</span>
            </div>
          )}

          {/* Jotform — overall only */}
          {!isLoading && !isError && data && !data.supported && !data.error && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <Stat icon={<CheckCircle2 className="h-3 w-3" />} label="Submissions" value={(data.submitted ?? 0).toLocaleString()} />
              </div>
              <p className="text-[11px] text-muted-foreground flex items-start gap-1">
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                {data.note ?? "This provider's API doesn't expose per-question drop-off — only the overall submission count."}
              </p>
            </div>
          )}

          {/* Typeform — full funnel */}
          {!isLoading && data?.supported && !data.error && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Stat icon={<CheckCircle2 className="h-3 w-3" />} label="Completion" value={data.completionRate != null ? `${data.completionRate}%` : "—"}
                  tone={data.completionRate != null ? sev(1 - data.completionRate / 100).text : undefined} />
                <Stat icon={<Users className="h-3 w-3" />} label="Visits" value={(data.visits ?? 0).toLocaleString()} />
                <Stat icon={<MousePointerClick className="h-3 w-3" />} label="Responses" value={(data.responses ?? 0).toLocaleString()} />
                <Stat icon={<Clock className="h-3 w-3" />} label="Avg. time" value={fmtTime(data.avgTimeSec) ?? "—"} />
              </div>

              {fields.length === 0 ? (
                <p className="text-[12px] text-muted-foreground py-2">No per-question data returned for this form.</p>
              ) : (
                <>
                  {biggestRef && (() => {
                    const b = fields.find(f => f.ref === biggestRef)!;
                    return (
                      <div className="flex items-center gap-2 rounded-lg bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-[12px]">
                        <TrendingDown className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                        <span className="text-rose-800">
                          Biggest drop-off: <span className="font-semibold">“{cleanTitle(b.title)}”</span> — {(dropRate(b) * 100).toFixed(0)}% leave here
                          <span className="text-rose-700/70"> ({b.dropoffs.toLocaleString()} people)</span>
                        </span>
                      </div>
                    );
                  })()}

                  <div className="space-y-1.5">
                    {fields.map((f, i) => {
                      const rate = dropRate(f);
                      const s = sev(rate);
                      const isBig = f.ref === biggestRef;
                      return (
                        <div key={f.ref || i} className={cn("rounded-md px-2 py-1.5", isBig ? cn("ring-1", s.ring) : "hover:bg-muted/40")}>
                          <div className="flex items-center gap-2">
                            <span className="w-4 text-right text-[10px] tabular-nums text-muted-foreground shrink-0">{i + 1}</span>
                            <span className="min-w-0 flex-1 text-[12px] text-foreground truncate" title={cleanTitle(f.title)}>{cleanTitle(f.title)}</span>
                            <span className={cn("text-[12px] font-semibold tabular-nums shrink-0 w-10 text-right", s.text)}>{f.views > 0 ? `${(rate * 100).toFixed(0)}%` : "—"}</span>
                            <span className="text-[11px] tabular-nums text-muted-foreground shrink-0 w-24 text-right hidden sm:block">{f.dropoffs.toLocaleString()} left</span>
                          </div>
                          <div className="ml-6 mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className={cn("h-full rounded-full", s.bar)} style={{ width: `${Math.max(rate * 100, f.dropoffs > 0 ? 2 : 0)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10.5px] text-muted-foreground/80">
                    Drop-off = share of people who reached a question and left without continuing (branching forms mean not everyone sees every question).
                  </p>
                </>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
