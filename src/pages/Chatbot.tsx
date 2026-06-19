import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useZohoData } from "@/hooks/use-zoho-data";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { Bot, UserCheck, TrendingUp, BadgeCheck, Loader2, MessageSquare } from "lucide-react";

const CANDY = {
  sky:   { bg: "bg-sky-50",     fg: "text-sky-600",     chip: "bg-sky-100",     stripe: "bg-sky-600" },
  mint:  { bg: "bg-emerald-50", fg: "text-emerald-600", chip: "bg-emerald-100", stripe: "bg-emerald-600" },
  teal:  { bg: "bg-teal-50",    fg: "text-teal-700",    chip: "bg-teal-100",    stripe: "bg-teal-600" },
  lilac: { bg: "bg-violet-50",  fg: "text-violet-600",  chip: "bg-violet-100",  stripe: "bg-violet-600" },
};

function Kpi({ palette, icon, label, value, hint }: {
  palette: typeof CANDY.sky; icon: React.ReactNode; label: string; value: string; hint?: string;
}) {
  return (
    <div className={`rounded-xl border border-border/60 ${palette.bg} shadow-sm overflow-hidden flex flex-col`}>
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
  );
}

const fmtMonth = (m: string) => {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("en-GB", { month: "short" });
};
const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

export default function Chatbot() {
  const { data: zoho, isLoading } = useZohoData();
  const cb = zoho?.chatbot;

  return (
    <DashboardLayout
      title="Chatbot"
      subtitle="Care Assist widget — leads it sends to the CRM and how many become conversions (Doctors on Board)"
      docSlug="overview/chatbot"
    >
      {isLoading || !cb ? (
        <div className="flex items-center justify-center py-16 text-[12px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading chatbot data…
        </div>
      ) : cb.leads === 0 && cb.conversions === 0 ? (
        <Card className="shadow-sm border-border/60">
          <CardContent className="py-12 text-center text-[13px] text-muted-foreground">
            <Bot className="h-8 w-8 mx-auto mb-3 text-muted-foreground/50" />
            No chatbot leads in the CRM yet. Leads the widget exports are tagged
            <span className="font-medium text-foreground"> Lead Source = "Chatbot" </span>
            in Zoho — they'll show up here once they sync.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* ── KPIs: the main story — leads → conversions ──────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi palette={CANDY.sky}   icon={<MessageSquare className="h-3.5 w-3.5" />} label="Leads exported"   value={cb.leads.toLocaleString()}        hint="sent to the CRM by the chatbot" />
            <Kpi palette={CANDY.mint}  icon={<UserCheck className="h-3.5 w-3.5" />}     label="Conversions"      value={cb.conversions.toLocaleString()}  hint="became Doctors on Board" />
            <Kpi palette={CANDY.teal}  icon={<TrendingUp className="h-3.5 w-3.5" />}    label="Conversion rate"  value={`${cb.conversionRate}%`}          hint={`${cb.conversions.toLocaleString()} of ${cb.totalPeople.toLocaleString()} chatbot people`} />
            <Kpi palette={CANDY.lilac} icon={<BadgeCheck className="h-3.5 w-3.5" />}    label="Qualified leads"  value={cb.qualified.toLocaleString()}    hint="reached a qualified stage" />
          </div>

          {/* ── Trend: leads vs conversions over 12 months ─────────────── */}
          <Card className="shadow-sm border-border/60">
            <CardHeader className="py-3 px-4 border-b border-border/40">
              <CardTitle className="text-[14px] font-semibold flex items-center gap-2">
                <span className={`flex h-7 w-7 items-center justify-center rounded-md ${CANDY.sky.chip} ${CANDY.sky.fg}`}>
                  <TrendingUp className="h-3.5 w-3.5" />
                </span>
                Leads exported vs conversions
                <span className="text-[10px] font-normal text-muted-foreground">last 12 months</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={cb.trend} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis yAxisId="left"  tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <Tooltip
                    labelFormatter={(m) => fmtMonth(String(m))}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar  yAxisId="left"  dataKey="leads"       name="Leads exported" fill="hsl(199 89% 48%)" radius={[3, 3, 0, 0]} maxBarSize={28} />
                  <Line yAxisId="right" dataKey="conversions" name="Conversions"    stroke="hsl(160 84% 39%)" strokeWidth={2.5} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
              <p className="text-[10.5px] text-muted-foreground mt-2">
                Conversions use the right axis — they're naturally far lower than leads, so the dual scale keeps both readable.
              </p>
            </CardContent>
          </Card>

          {/* ── Recent conversions ─────────────────────────────────────── */}
          <Card className="shadow-sm border-border/60">
            <CardHeader className="py-3 px-4 border-b border-border/40">
              <CardTitle className="text-[14px] font-semibold flex items-center gap-2">
                <span className={`flex h-7 w-7 items-center justify-center rounded-md ${CANDY.mint.chip} ${CANDY.mint.fg}`}>
                  <UserCheck className="h-3.5 w-3.5" />
                </span>
                Recent chatbot conversions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 divide-y divide-border/40">
              {cb.recentConversions.length === 0 ? (
                <p className="text-[12px] text-muted-foreground px-4 py-6 text-center">No conversions from the chatbot yet.</p>
              ) : cb.recentConversions.map((c, i) => (
                <div key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-medium text-foreground truncate">{c.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {c.specialty}{c.owner ? ` · ${c.owner}` : ""}
                    </p>
                  </div>
                  <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">{fmtDate(c.date)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </DashboardLayout>
  );
}
