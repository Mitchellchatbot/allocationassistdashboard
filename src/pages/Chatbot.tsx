import { useEffect, useRef, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SectionDateRange } from "@/components/SectionDateRange";
import { useFilters } from "@/lib/filters";
import { useChatbotStats, useChatbotInsights, useChatbotLeadDetail } from "@/hooks/use-chatbot-stats";
import { Progress } from "@/components/ui/progress";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, BarChart,
} from "recharts";
import { Bot, UserCheck, TrendingUp, BadgeCheck, Loader2, MessageSquare, AlertCircle, Check, Sparkles, Filter, Stethoscope, X, MapPin, Globe, Mail, Phone } from "lucide-react";

const CANDY = {
  sky:   { bg: "bg-sky-50",     fg: "text-sky-600",     chip: "bg-sky-100",     stripe: "bg-sky-600" },
  mint:  { bg: "bg-emerald-50", fg: "text-emerald-600", chip: "bg-emerald-100", stripe: "bg-emerald-600" },
  teal:  { bg: "bg-teal-50",    fg: "text-teal-700",    chip: "bg-teal-100",    stripe: "bg-teal-600" },
  lilac: { bg: "bg-violet-50",  fg: "text-violet-600",  chip: "bg-violet-100",  stripe: "bg-violet-600" },
};
type Palette = typeof CANDY.sky;

function FlipKpi({ palette, icon, label, value, hint, back }: {
  palette: Palette; icon: React.ReactNode; label: string; value: string; hint?: string; back: React.ReactNode;
}) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div className="h-[112px] [perspective:1000px] cursor-pointer" onClick={() => setFlipped(f => !f)} title="Tap to flip">
      <div className={`relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d] ${flipped ? "[transform:rotateY(180deg)]" : ""}`}>
        {/* Front */}
        <div className={`absolute inset-0 [backface-visibility:hidden] rounded-xl border border-border/60 ${palette.bg} shadow-sm overflow-hidden flex flex-col`}>
          <div className={`h-1 shrink-0 ${palette.stripe}`} />
          <div className="px-4 py-3 flex items-start justify-between flex-1">
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-muted-foreground mb-1">{label}</p>
              <p className={`text-[24px] font-bold tabular-nums leading-none ${palette.fg}`}>{value}</p>
              {hint && <p className="text-[10px] text-muted-foreground mt-1.5">{hint}</p>}
            </div>
            <span className={`h-7 w-7 rounded-lg bg-card/70 flex items-center justify-center shrink-0 ml-2 ${palette.fg}`}>{icon}</span>
          </div>
        </div>
        {/* Back */}
        <div className={`absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] rounded-xl border border-border/60 ${palette.bg} shadow-sm p-4 flex flex-col justify-center`}>
          <p className={`text-[11px] font-semibold uppercase tracking-wide ${palette.fg} mb-1.5`}>{label}</p>
          <div className="text-[11.5px] text-foreground/85 leading-snug">{back}</div>
        </div>
      </div>
    </div>
  );
}

const fmtMonth = (m: string) => {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
};
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

// On-demand AI read on how the chatbot is performing for the selected window.
function ChatbotInsightsPanel({ from, to }: { from?: Date; to?: Date }) {
  const { data, isFetching, error, generate } = useChatbotInsights(from, to);
  return (
    <Card className="shadow-sm border-border/60 overflow-hidden">
      <CardHeader className="py-3 px-4 border-b border-border/40 bg-gradient-to-r from-violet-50 via-sky-50 to-transparent">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-[13px] font-semibold flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-100 text-violet-600"><Sparkles className="h-3.5 w-3.5" /></span>
            AI insights
            <span className="text-[10px] font-normal text-muted-foreground hidden sm:inline">how the chatbot is doing</span>
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => generate()} disabled={isFetching} className="h-8 text-[12px] shrink-0">
            {isFetching ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
            {isFetching ? "Reading…" : data ? "Refresh" : "Generate"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {error ? (
          <div className="flex items-start gap-2 text-[12px] text-rose-700"><AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" /><span>{error.message}</span></div>
        ) : isFetching && !data ? (
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground py-1"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the chatbot's numbers…</div>
        ) : !data ? (
          <p className="text-[12px] text-muted-foreground">A quick AI read on momentum, conversion health, and which specialties the chatbot brings in. Click <span className="font-medium text-foreground">Generate</span>.</p>
        ) : (
          <div className="space-y-2.5">
            {data.overview && <p className="text-[12.5px] text-foreground leading-relaxed">{data.overview}</p>}
            <ul className="space-y-1.5">
              {data.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[11.5px] text-foreground/90 leading-snug">
                  <span className="mt-1.5 h-1 w-1 rounded-full bg-violet-500 shrink-0" />{b}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Chatbot() {
  const { dateRange } = useFilters();
  const { data: cb, isLoading, error } = useChatbotStats(dateRange.from, dateRange.to);
  const [openLead, setOpenLead] = useState<{ id: string; name: string } | null>(null);

  return (
    <DashboardLayout
      title="Chatbot"
      subtitle="Care Assist widget — leads it captures and how many become conversions (Doctors on Board)"
      docSlug="overview/chatbot"
    >
      <SectionDateRange />

      {error ? (
        <div className="flex items-start gap-2 text-[12px] text-rose-700 px-1 py-4">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>Couldn't load chatbot data: {error.message}</span>
        </div>
      ) : isLoading || !cb ? (
        <div className="flex items-center justify-center py-16 text-[12px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading chatbot data…
        </div>
      ) : cb.leads === 0 ? (
        <Card className="shadow-sm border-border/60 mt-4">
          <CardContent className="py-12 text-center text-[13px] text-muted-foreground">
            <Bot className="h-8 w-8 mx-auto mb-3 text-muted-foreground/50" />
            No chatbot leads in this date range. Try widening the range.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6 mt-2">
          {/* ── Flippable KPIs ─────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <FlipKpi
              palette={CANDY.sky} icon={<MessageSquare className="h-3.5 w-3.5" />}
              label="Leads captured" value={cb.leads.toLocaleString()} hint="exported to the CRM"
              back={<>The chatbot pushed <b>{cb.leads.toLocaleString()}</b> leads to Zoho in this period. <b>{cb.qualified.toLocaleString()}</b> reached a qualified stage in the chat.</>}
            />
            <FlipKpi
              palette={CANDY.mint} icon={<UserCheck className="h-3.5 w-3.5" />}
              label="Conversions" value={cb.conversions.toLocaleString()} hint="became Doctors on Board"
              back={<>Matched against Doctors on Board by email, phone, or name. <b>{cb.conversions.toLocaleString()}</b> of the chatbot's leads have converted so far.</>}
            />
            <FlipKpi
              palette={CANDY.teal} icon={<TrendingUp className="h-3.5 w-3.5" />}
              label="Conversion rate" value={`${cb.conversionRate}%`} hint={`${cb.conversions} of ${cb.leads} leads`}
              back={<>{cb.conversions.toLocaleString()} conversions ÷ {cb.leads.toLocaleString()} captured leads. Conversions lag capture, so recent periods read lower until those leads mature.</>}
            />
            <FlipKpi
              palette={CANDY.lilac} icon={<BadgeCheck className="h-3.5 w-3.5" />}
              label="Qualified in chat" value={cb.qualified.toLocaleString()} hint={`${cb.leads ? Math.round(100 * cb.qualified / cb.leads) : 0}% of leads`}
              back={<>The chatbot's OWN mid-conversation qualification (specialty, training, intent) — separate from the Zoho lead-status "qualified". <b>{cb.qualified.toLocaleString()}</b> of <b>{cb.leads.toLocaleString()}</b> qualified in chat.</>}
            />
          </div>

          {/* ── AI read on how the chatbot is doing (on demand) ─────────── */}
          <ChatbotInsightsPanel from={dateRange.from} to={dateRange.to} />

          {/* ── Funnel + top specialties ───────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Conversion funnel */}
            <Card className="shadow-sm border-border/60">
              <CardHeader className="py-3 px-4 border-b border-border/40">
                <CardTitle className="text-[14px] font-semibold flex items-center gap-2">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-md ${CANDY.teal.chip} ${CANDY.teal.fg}`}>
                    <Filter className="h-3.5 w-3.5" />
                  </span>
                  Conversion funnel
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {[
                  { label: "Leads captured",   value: cb.leads,       palette: CANDY.sky },
                  { label: "Qualified in chat", value: cb.qualified,  palette: CANDY.lilac },
                  { label: "Converted",        value: cb.conversions, palette: CANDY.mint },
                ].map(step => {
                  const pct = cb.leads > 0 ? Math.round((step.value / cb.leads) * 100) : 0;
                  return (
                    <div key={step.label}>
                      <div className="flex items-center justify-between text-[11.5px] mb-1">
                        <span className="text-muted-foreground">{step.label}</span>
                        <span className="font-semibold tabular-nums text-foreground">{step.value.toLocaleString()} <span className="text-muted-foreground font-normal">· {pct}%</span></span>
                      </div>
                      <div className="h-3 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full rounded-full ${step.palette.stripe} transition-all`} style={{ width: `${Math.max(pct, step.value > 0 ? 2 : 0)}%` }} />
                      </div>
                    </div>
                  );
                })}
                <p className="text-[10.5px] text-muted-foreground pt-1">% of all captured leads. Conversions lag capture, so the bottom step fills in over time.</p>
              </CardContent>
            </Card>

            {/* Top specialties */}
            <Card className="shadow-sm border-border/60">
              <CardHeader className="py-3 px-4 border-b border-border/40">
                <CardTitle className="text-[14px] font-semibold flex items-center gap-2">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-md ${CANDY.lilac.chip} ${CANDY.lilac.fg}`}>
                    <Stethoscope className="h-3.5 w-3.5" />
                  </span>
                  Top specialties
                  <span className="text-[10px] font-normal text-muted-foreground">leads captured</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                {cb.bySpecialty.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground py-6 text-center">No specialty data in this range.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(180, cb.bySpecialty.length * 30)}>
                    <BarChart data={cb.bySpecialty} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                      <YAxis type="category" dataKey="specialty" width={150} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                      <Bar dataKey="leads" name="Leads" fill="hsl(199 89% 48%)" radius={[0, 3, 3, 0]} maxBarSize={18} />
                      <Bar dataKey="conversions" name="Converted" fill="hsl(160 84% 39%)" radius={[0, 3, 3, 0]} maxBarSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Trend ──────────────────────────────────────────────────── */}
          <Card className="shadow-sm border-border/60">
            <CardHeader className="py-3 px-4 border-b border-border/40">
              <CardTitle className="text-[14px] font-semibold flex items-center gap-2">
                <span className={`flex h-7 w-7 items-center justify-center rounded-md ${CANDY.sky.chip} ${CANDY.sky.fg}`}>
                  <TrendingUp className="h-3.5 w-3.5" />
                </span>
                Leads captured vs conversions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={cb.trend} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis yAxisId="left"  tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <Tooltip labelFormatter={(m) => fmtMonth(String(m))} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar  yAxisId="left"  dataKey="leads"       name="Leads captured" fill="hsl(199 89% 48%)" radius={[3, 3, 0, 0]} maxBarSize={28} />
                  <Line yAxisId="right" dataKey="conversions" name="Conversions"    stroke="hsl(160 84% 39%)" strokeWidth={2.5} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
              <p className="text-[10.5px] text-muted-foreground mt-2">Conversions use the right axis — they're far lower than leads, so the dual scale keeps both readable.</p>
            </CardContent>
          </Card>

          {/* ── Recent chatbot leads (genuinely recent — from the widget) ── */}
          <Card className="shadow-sm border-border/60">
            <CardHeader className="py-3 px-4 border-b border-border/40">
              <CardTitle className="text-[14px] font-semibold flex items-center gap-2">
                <span className={`flex h-7 w-7 items-center justify-center rounded-md ${CANDY.mint.chip} ${CANDY.mint.fg}`}>
                  <Bot className="h-3.5 w-3.5" />
                </span>
                Recent chatbot leads
                <span className="text-[10px] font-normal text-muted-foreground">newest first</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 divide-y divide-border/40">
              {cb.recent.length === 0 ? (
                <p className="text-[12px] text-muted-foreground px-4 py-6 text-center">No leads in this range.</p>
              ) : cb.recent.map((c, i) => (
                <button
                  key={i}
                  onClick={() => c.visitor_id && setOpenLead({ id: c.visitor_id, name: c.name })}
                  disabled={!c.visitor_id}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors disabled:cursor-default"
                >
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-medium text-foreground truncate">{c.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{c.specialty}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {c.converted ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[10px] font-medium">
                        <Check className="h-3 w-3" /> Converted
                      </span>
                    ) : c.qualified ? (
                      <span className="inline-flex items-center rounded-full bg-violet-100 text-violet-700 px-2 py-0.5 text-[10px] font-medium">Qualified</span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[10px] font-medium">Lead</span>
                    )}
                    <span className="text-[11px] text-muted-foreground tabular-nums w-[88px] text-right">{fmtDate(c.exported_at)}</span>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {openLead && (
        <ChatbotLeadDrawer visitorId={openLead.id} fallbackName={openLead.name} onClose={() => setOpenLead(null)} />
      )}
    </DashboardLayout>
  );
}

function InfoRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-border/30 last:border-0">
      <span className="text-[11px] text-muted-foreground flex items-center gap-1.5 shrink-0">{icon}{label}</span>
      <span className="text-[12px] text-foreground text-right min-w-0 break-words">{value}</span>
    </div>
  );
}

function DrawerSection({ title, palette, children }: { title: string; palette: { chip: string; fg: string }; children: React.ReactNode }) {
  return (
    <div>
      <div className={`flex items-center gap-1.5 mb-2 text-[11px] font-semibold uppercase tracking-wide ${palette.fg}`}>
        <span className={`flex h-5 w-5 items-center justify-center rounded ${palette.chip}`}><Sparkles className="h-3 w-3" /></span>
        {title}
      </div>
      {children}
    </div>
  );
}

function ChatbotLeadDrawer({ visitorId, fallbackName, onClose }: { visitorId: string; fallbackName: string; onClose: () => void }) {
  const { data, isLoading, error } = useChatbotLeadDetail(visitorId);
  const v = data?.visitor;
  const z = data?.zoho;

  // Simulated progress: climbs toward a randomized ceiling (82–94%) on a
  // decelerating curve while the request is in-flight, then snaps to 100%
  // the moment data or error arrives. `completing` keeps the loading UI
  // visible for 280ms so the final fill animation is visible.
  const [progress, setProgress] = useState(0);
  const [completing, setCompleting] = useState(false);
  const wasLoadingRef = useRef(false);
  const ceilingRef = useRef(90);

  useEffect(() => {
    if (isLoading) {
      ceilingRef.current = 50 + Math.random() * 45; // fresh ceiling per open, 50–95%
      wasLoadingRef.current = true;
      setProgress(0);
      setCompleting(false);
      const id = setInterval(() => {
        setProgress(p => p + (ceilingRef.current - p) * 0.12);
      }, 120);
      return () => clearInterval(id);
    } else if (wasLoadingRef.current) {
      wasLoadingRef.current = false;
      setCompleting(true);
      setProgress(100);
      const t = setTimeout(() => setCompleting(false), 280);
      return () => clearTimeout(t);
    }
  }, [isLoading]);

  const showLoader = isLoading || completing;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 w-full max-w-[560px] p-2 sm:p-3 pointer-events-none">
        <div className="h-full bg-background border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden pointer-events-auto">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border/50 bg-gradient-to-r from-emerald-50 via-sky-50 to-transparent shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-100 text-emerald-600 shrink-0"><Bot className="h-3.5 w-3.5" /></span>
              <h3 className="text-[14px] font-semibold truncate">{v?.name || fallbackName}</h3>
            </div>
            <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-white/60"><X className="h-4 w-4" /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {showLoader ? (
              <div className="flex flex-col gap-2 py-12 px-2">
                <div className="flex items-center justify-between text-[12px] text-muted-foreground">
                  <span>Loading lead detail…</span>
                  <span className="tabular-nums">{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="h-1" />
              </div>
            ) : error ? (
              <div className="flex items-start gap-2 text-[12px] text-rose-700"><AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" /><span>{error.message}</span></div>
            ) : !data ? null : (
              <>
                {/* AI summary first — the quick read */}
                {data.ai && (data.ai.summary || data.ai.facts.length > 0) && (
                  <DrawerSection title="AI summary" palette={{ chip: "bg-violet-100", fg: "text-violet-600" }}>
                    {data.ai.summary && <p className="text-[12.5px] text-foreground leading-relaxed mb-2">{data.ai.summary}</p>}
                    {data.ai.facts.length > 0 && (
                      <ul className="space-y-1">
                        {data.ai.facts.map((f, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-[11.5px] text-foreground/90 leading-snug">
                            <span className="mt-1.5 h-1 w-1 rounded-full bg-violet-500 shrink-0" />{f}
                          </li>
                        ))}
                      </ul>
                    )}
                  </DrawerSection>
                )}

                {/* What the chatbot captured */}
                <DrawerSection title="What the chatbot captured" palette={{ chip: "bg-sky-100", fg: "text-sky-600" }}>
                  <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-1">
                    <InfoRow icon={<Stethoscope className="h-3 w-3" />} label="Specialty" value={v?.specialty || "—"} />
                    <InfoRow icon={<Globe className="h-3 w-3" />} label="Trained in" value={v?.country || "—"} />
                    <InfoRow icon={<MapPin className="h-3 w-3" />} label="Location" value={v?.location || "—"} />
                    <InfoRow label="Qualified in chat" value={v?.qualified ? "Yes" : v?.qualified === false ? "No" : "—"} />
                    <InfoRow icon={<Mail className="h-3 w-3" />} label="Email" value={v?.email || "—"} />
                    <InfoRow icon={<Phone className="h-3 w-3" />} label="Phone" value={v?.phone || "—"} />
                    <InfoRow label="First seen" value={v?.firstSeen ? fmtDate(v.firstSeen) : "—"} />
                  </div>
                </DrawerSection>

                {/* CRM status */}
                <DrawerSection title="In the CRM (Zoho)" palette={{ chip: "bg-emerald-100", fg: "text-emerald-600" }}>
                  {z?.inZoho ? (
                    <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-1">
                      <InfoRow label="Lead status" value={z.leadStatus || "—"} />
                      <InfoRow label="Source" value={z.leadSource || "—"} />
                      <InfoRow label="Owner" value={z.owner || "—"} />
                      <InfoRow label="Converted" value={
                        z.converted
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[10px] font-medium"><Check className="h-3 w-3" /> Doctor on Board</span>
                          : <span className="text-muted-foreground">Not yet</span>
                      } />
                      {z.converted && z.hospital && <InfoRow label="Hospital" value={z.hospital} />}
                      {z.converted && z.convertedAt && <InfoRow label="Converted on" value={fmtDate(z.convertedAt)} />}
                    </div>
                  ) : (
                    <p className="text-[12px] text-muted-foreground">Not matched to a Zoho record yet.</p>
                  )}
                </DrawerSection>

                {/* Transcript */}
                <DrawerSection title={`Conversation (${data.messages.length})`} palette={{ chip: "bg-amber-100", fg: "text-amber-600" }}>
                  {data.messages.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground italic">No transcript available.</p>
                  ) : (
                    <div className="space-y-2">
                      {data.messages.map((m, i) => {
                        const isVisitor = m.sender_type === "visitor";
                        return (
                          <div key={i} className={`flex ${isVisitor ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[82%] rounded-2xl px-3 py-1.5 text-[12px] leading-snug ${isVisitor ? "bg-sky-100 text-sky-900 rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"}`}>
                              {m.content}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </DrawerSection>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
