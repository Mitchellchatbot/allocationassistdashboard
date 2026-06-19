import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionDateRange } from "@/components/SectionDateRange";
import { useFilters } from "@/lib/filters";
import { useChatbotStats } from "@/hooks/use-chatbot-stats";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { Bot, UserCheck, TrendingUp, BadgeCheck, Loader2, MessageSquare, AlertCircle, Check } from "lucide-react";

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

export default function Chatbot() {
  const { dateRange } = useFilters();
  const { data: cb, isLoading, error } = useChatbotStats(dateRange.from, dateRange.to);

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
              label="Qualified" value={cb.qualified.toLocaleString()} hint={`${cb.leads ? Math.round(100 * cb.qualified / cb.leads) : 0}% of leads`}
              back={<>The chatbot qualifies leads mid-conversation (specialty, training, intent). <b>{cb.qualified.toLocaleString()}</b> of <b>{cb.leads.toLocaleString()}</b> qualified.</>}
            />
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
                <div key={i} className="flex items-center justify-between gap-3 px-4 py-3">
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
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </DashboardLayout>
  );
}
