import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMetaLeadsStats, type GroupedStat } from "@/hooks/use-meta-leads-stats";
import { useMetaAdsApi, useMetaCampaignAds } from "@/hooks/use-meta-ads-api";
import { useFilters } from "@/lib/filters";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  Users, Megaphone, Globe, Loader2, TrendingUp, DollarSign,
  Eye, MousePointer, AlertCircle, X, ImageOff, ExternalLink,
  Repeat2, Hash, Target, Zap, ChevronDown, ChevronUp, Award,
} from "lucide-react";

// ── Colours ────────────────────────────────────────────────────────────────────
const PIE_COLORS = [
  "hsl(170,55%,45%)", "hsl(210,75%,52%)", "hsl(340,70%,55%)",
  "hsl(38,92%,50%)",  "hsl(270,60%,55%)", "hsl(158,50%,42%)",
  "hsl(0,65%,55%)",   "hsl(200,80%,48%)", "hsl(50,85%,50%)",
  "hsl(290,55%,52%)",
];

const tip = {
  backgroundColor: "#fff", border: "1px solid hsl(220,14%,90%)",
  borderRadius: "8px", fontSize: "11px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)", padding: "8px 12px",
};

// ── Formatters ─────────────────────────────────────────────────────────────────
function fmtC(v: number, currency = "AED") {
  if (v >= 1_000_000) return `${currency} ${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)     return `${currency} ${(v / 1_000).toFixed(1)}K`;
  return `${currency} ${v.toFixed(0)}`;
}
function fmtN(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString();
}

// ── Shared small components ───────────────────────────────────────────────────

function KpiTile({ icon: Icon, label, value, sub, accent = false }: {
  icon: React.ElementType; label: string; value: string; sub?: string; accent?: boolean;
}) {
  return (
    <Card className={`shadow-sm hover:shadow-md hover:scale-[1.01] transition-all ${accent ? "border-primary/40 bg-primary/5" : "border-border/50"}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1.5">
          <Icon className="h-4 w-4 text-primary" />
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
        </div>
        <p className="text-[22px] font-semibold text-foreground tabular-nums leading-none">{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/50 mb-3 px-0.5 mt-2">
      {children}
    </p>
  );
}

// Lead-form rank list (from Supabase)
function RankList({ items, useOwnTotal = false }: { items: GroupedStat[]; useOwnTotal?: boolean }) {
  if (items.length === 0) return <p className="text-[11px] text-muted-foreground py-6 text-center">No data for this period</p>;
  const maxCount = items[0]?.count ?? 1;
  const sumCount = useOwnTotal ? items.reduce((a, r) => a + r.count, 0) : maxCount;
  return (
    <div className="space-y-2.5">
      {items.map((r, i) => {
        const barPct   = maxCount > 0 ? Math.round((r.count / maxCount) * 100) : 0;
        const labelPct = sumCount > 0 ? Math.round((r.count / sumCount) * 100) : 0;
        return (
          <div key={r.label} className="flex items-center gap-3">
            <span className="text-[10px] text-muted-foreground w-4 tabular-nums shrink-0">{i + 1}</span>
            <span className="text-[11px] font-medium flex-1 truncate" title={r.label}>{r.label}</span>
            <div className="w-28 h-1.5 bg-secondary rounded-full overflow-hidden shrink-0">
              <div className="h-full rounded-full bg-primary" style={{ width: `${barPct}%` }} />
            </div>
            <span className="text-[10px] text-muted-foreground w-6 text-right shrink-0">{labelPct}%</span>
            <span className="text-[12px] font-semibold tabular-nums w-10 text-right shrink-0">{r.count.toLocaleString()}</span>
          </div>
        );
      })}
    </div>
  );
}

function HBarChart({ data, color, height = 260 }: { data: GroupedStat[]; color: string; height?: number }) {
  if (data.length === 0) return <p className="text-[11px] text-muted-foreground text-center py-12">No data for this period</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" barCategoryGap="20%">
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,92%)" />
        <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)" />
        <YAxis dataKey="label" type="category" fontSize={9} tickLine={false} axisLine={false} width={130} stroke="hsl(220,10%,55%)"
          tickFormatter={(v: string) => v.length > 22 ? v.slice(0, 22) + "…" : v} />
        <Tooltip contentStyle={tip} formatter={(v: number) => [v.toLocaleString(), "Leads"]} />
        <Bar dataKey="count" fill={color} radius={[0, 4, 4, 0]} name="Leads" />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Ad Preview Drawer ─────────────────────────────────────────────────────────

const RANK_COLORS: Record<string, string> = {
  ABOVE_AVERAGE: "text-success",
  AVERAGE:       "text-warning",
  BELOW_AVERAGE: "text-destructive",
};

function AdPreviewDrawer({
  campaignId, campaignName, since, until, currency, onClose,
}: {
  campaignId: string; campaignName: string; since: string; until: string;
  currency: string; onClose: () => void;
}) {
  const { data, isLoading } = useMetaCampaignAds(campaignId, since, until);
  const ads    = data?.ads    ?? [];
  const adsets = data?.adsets ?? [];
  const [tab, setTab] = useState<"ads" | "targeting">("ads");

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 h-full w-[460px] max-w-[95vw] bg-background border-l border-border shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border/60 shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Campaign</p>
            <p className="text-[13px] font-semibold leading-tight truncate" title={campaignName}>{campaignName}</p>
          </div>
          <button onClick={onClose} className="mt-0.5 rounded-md p-1 text-muted-foreground hover:bg-muted transition-colors shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border/60 shrink-0">
          {(["ads", "targeting"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-[11px] font-medium transition-colors capitalize ${tab === t ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}>
              {t === "ads" ? `Ads (${ads.length})` : `Ad Sets (${adsets.length})`}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-[11px]">Loading…</span>
            </div>
          ) : tab === "ads" ? (
            ads.length === 0 ? (
              <p className="text-[11px] text-muted-foreground text-center py-16">No ads found in this period.</p>
            ) : ads.map((ad, i) => {
              const thumb    = ad.creative.thumbnail_url || ad.creative.image_url;
              const isActive = ad.status === "ACTIVE";
              return (
                <div key={ad.id} className="rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm hover:shadow-md transition-shadow">
                  {/* Thumbnail */}
                  {thumb ? (
                    <div className="relative w-full bg-muted" style={{ aspectRatio: "1.91/1" }}>
                      <img src={thumb} alt={ad.creative.title || ad.name} className="w-full h-full object-cover"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      {/* Quality badges */}
                      {ad.qualityRanking && (
                        <div className="absolute top-2 left-2 flex flex-col gap-1">
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded bg-black/60 ${RANK_COLORS[ad.qualityRanking] ?? "text-white"}`}>
                            Q: {ad.qualityRanking.replace(/_/g, " ")}
                          </span>
                          {ad.engagementRanking && (
                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded bg-black/60 ${RANK_COLORS[ad.engagementRanking] ?? "text-white"}`}>
                              E: {ad.engagementRanking.replace(/_/g, " ")}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="w-full flex items-center justify-center bg-muted/40" style={{ aspectRatio: "1.91/1" }}>
                      <ImageOff className="h-8 w-8 text-muted-foreground/30" />
                    </div>
                  )}

                  {/* Copy */}
                  <div className="px-3 pt-2.5 pb-2">
                    {ad.creative.title && <p className="text-[12px] font-semibold leading-tight mb-1">{ad.creative.title}</p>}
                    {ad.creative.body  && <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3">{ad.creative.body}</p>}
                    {ad.creative.call_to_action_type && (
                      <span className="inline-block mt-1.5 text-[9px] uppercase tracking-wide font-medium px-2 py-0.5 rounded bg-primary/10 text-primary">
                        {ad.creative.call_to_action_type.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="flex items-center justify-between px-3 py-2 border-t border-border/40 bg-muted/20">
                    <div className="flex items-center gap-3">
                      {[
                        { label: "spend",  val: fmtC(ad.spend, currency), color: "text-primary" },
                        { label: "impr.",  val: fmtN(ad.impressions) },
                        { label: "clicks", val: fmtN(ad.clicks) },
                        { label: "CTR",    val: `${ad.ctr.toFixed(2)}%` },
                        ...(ad.leads > 0 ? [{ label: "leads", val: String(ad.leads), color: "text-success" }] : []),
                      ].map(s => (
                        <span key={s.label} className="flex flex-col items-center">
                          <span className={`text-[12px] font-bold tabular-nums ${s.color ?? ""}`}>{s.val}</span>
                          <span className="text-[8px] text-muted-foreground uppercase tracking-wide">{s.label}</span>
                        </span>
                      ))}
                    </div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${isActive ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                      {ad.status}
                    </span>
                  </div>
                  <div className="px-3 pb-2">
                    <p className="text-[9px] text-muted-foreground/40 truncate">#{i + 1} · {ad.name}</p>
                  </div>
                </div>
              );
            })
          ) : (
            // Targeting / Ad Sets tab
            adsets.length === 0 ? (
              <p className="text-[11px] text-muted-foreground text-center py-16">No ad sets found.</p>
            ) : adsets.map(s => (
              <div key={s.id} className="rounded-xl border border-border/50 bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <p className="text-[12px] font-semibold">{s.name}</p>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${s.status === "ACTIVE" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                    {s.status}
                  </span>
                </div>

                {/* Targeting details */}
                <div className="space-y-1.5 mb-3">
                  {(s.targeting.ageMin || s.targeting.ageMax) && (
                    <div className="flex items-center gap-2">
                      <Users className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-[11px] text-muted-foreground">
                        Age {s.targeting.ageMin ?? "—"}–{s.targeting.ageMax ?? "65+"}
                        {s.targeting.genders && s.targeting.genders.length > 0 ? ` · ${s.targeting.genders.join(", ")}` : " · All genders"}
                      </span>
                    </div>
                  )}
                  {s.targeting.locations.length > 0 && (
                    <div className="flex items-start gap-2">
                      <Globe className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                      <span className="text-[11px] text-muted-foreground">{s.targeting.locations.slice(0, 8).join(", ")}</span>
                    </div>
                  )}
                  {s.targeting.interests && s.targeting.interests.length > 0 && (
                    <div className="flex items-start gap-2">
                      <Target className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="flex flex-wrap gap-1">
                        {s.targeting.interests.slice(0, 10).map(int => (
                          <span key={int} className="text-[9px] bg-secondary px-1.5 py-0.5 rounded-full">{int}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {s.dailyBudget > 0 && (
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-[11px] text-muted-foreground">Daily budget: {fmtC(s.dailyBudget, currency)}</span>
                    </div>
                  )}
                </div>

                {/* Adset stats */}
                <div className="flex gap-4 pt-2 border-t border-border/40">
                  {[
                    { l: "Spend",  v: fmtC(s.spend, currency), c: "text-primary" },
                    { l: "Impr.",  v: fmtN(s.impressions) },
                    { l: "Clicks", v: fmtN(s.clicks) },
                    { l: "Reach",  v: fmtN(s.reach) },
                  ].map(m => (
                    <div key={m.l} className="flex flex-col">
                      <span className={`text-[13px] font-bold tabular-nums ${m.c ?? ""}`}>{m.v}</span>
                      <span className="text-[8px] text-muted-foreground uppercase tracking-wide">{m.l}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

const MetaAds = () => {
  const { dateRange } = useFilters();
  const { data, isLoading: leadsLoading } = useMetaLeadsStats(dateRange);
  const { data: api, isLoading: apiLoading, error: apiError } = useMetaAdsApi(dateRange);

  const [previewCampaign, setPreviewCampaign] = useState<{ id: string; name: string } | null>(null);
  const [showAllActions, setShowAllActions]   = useState(false);

  const since    = dateRange.from.toISOString().slice(0, 10);
  const until    = dateRange.to.toISOString().slice(0, 10);
  const summary  = api?.summary;
  const currency = summary?.currency ?? "AED";
  const campaigns   = api?.campaigns    ?? [];
  const dailySeries = api?.dailySeries  ?? [];
  const byAge       = api?.byAge        ?? [];
  const byPlatform  = api?.byPlatform   ?? [];
  const byPlacement = api?.byPlacement  ?? [];
  const actions     = api?.actions      ?? [];
  const visibleActions = showAllActions ? actions : actions.slice(0, 8);

  // Supabase lead data
  const total        = data?.total        ?? 0;
  const withUtm      = data?.withUtm      ?? 0;
  const byCreative   = data?.byCreative   ?? [];
  const byCampaign   = data?.byCampaign   ?? [];
  const byPlatformL  = data?.byPlatform   ?? [];
  const byLocation   = data?.byLocation   ?? [];
  const bySpeciality = data?.bySpeciality ?? [];
  const trackedPct   = total > 0 ? Math.round((withUtm / total) * 100) : 0;

  return (
    <DashboardLayout title="Meta Ads" subtitle="Live performance from Facebook Marketing API · Lead form data from Supabase">

      {/* ══ SECTION 1: LIVE META API DATA ══════════════════════════════════════ */}
      <SectionLabel>Live Ad Performance · Meta Marketing API</SectionLabel>

      {apiError ? (
        <div className="flex items-center gap-2 mb-5 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-[11px] text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{(apiError as Error).message}</span>
        </div>
      ) : apiLoading ? (
        <div className="flex items-center gap-2 mb-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-[11px]">Fetching live data from Meta…</span>
        </div>
      ) : (
        <>
          {/* KPI grid — 4 cols × 2 rows */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <KpiTile icon={DollarSign}   label="Total Spend"     value={fmtC(summary?.spend ?? 0, currency)} sub={currency} accent />
            <KpiTile icon={Eye}          label="Impressions"     value={fmtN(summary?.impressions ?? 0)} sub="times ads were shown" />
            <KpiTile icon={Users}        label="Reach"           value={fmtN(summary?.reach ?? 0)} sub="unique people" />
            <KpiTile icon={MousePointer} label="Link Clicks"     value={fmtN(summary?.clicks ?? 0)} sub={`${summary?.ctr ?? 0}% CTR`} />
            <KpiTile icon={Repeat2}      label="Frequency"       value={(summary?.frequency ?? 0).toFixed(2)} sub="avg impressions per person" />
            <KpiTile icon={Hash}         label="CPM"             value={fmtC(summary?.cpm ?? 0, currency)} sub="per 1,000 impressions" />
            <KpiTile icon={Zap}          label="Leads from Ads"  value={fmtN(summary?.leads ?? 0)} sub="form submissions" />
            <KpiTile icon={Award}        label="Cost Per Lead"   value={(summary?.leads ?? 0) > 0 ? fmtC(summary?.costPerLead ?? 0, currency) : "—"} sub="per form lead" />
          </div>

          {/* Account chips */}
          {(api?.accounts?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-2 mb-5">
              {api?.accounts.map(acc => (
                <div key={acc.id} className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/40 px-3 py-1.5 text-[10px]">
                  <span className="h-1.5 w-1.5 rounded-full bg-success shrink-0" />
                  <span className="font-medium">{acc.name}</span>
                  {acc.amountSpent > 0 && <span className="text-muted-foreground">· {fmtC(acc.amountSpent, currency)} lifetime</span>}
                </div>
              ))}
            </div>
          )}

          {/* Daily chart */}
          {dailySeries.length > 0 && (
            <Card className="mb-4 shadow-sm border-border/50">
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
                  Daily Spend & Clicks
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={dailySeries}>
                    <defs>
                      <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="hsl(170,55%,45%)" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="hsl(170,55%,45%)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="clickGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="hsl(210,75%,52%)" stopOpacity={0.14} />
                        <stop offset="95%" stopColor="hsl(210,75%,52%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,93%)" />
                    <XAxis dataKey="date" fontSize={9} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)"
                      interval={Math.max(0, Math.floor(dailySeries.length / 10) - 1)} />
                    <YAxis yAxisId="spend" orientation="left"  fontSize={9} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)"
                      tickFormatter={v => fmtC(v, currency)} width={65} />
                    <YAxis yAxisId="clicks" orientation="right" fontSize={9} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)"
                      tickFormatter={v => fmtN(v)} width={42} />
                    <Tooltip contentStyle={tip} formatter={(v: number, name: string) =>
                      name === "Spend" ? [fmtC(v, currency), name] : [fmtN(v), name]} />
                    <Legend iconSize={8} iconType="circle" formatter={v => <span style={{ fontSize: 10 }}>{v}</span>} />
                    <Area yAxisId="spend"  type="monotone" dataKey="spend"  stroke="hsl(170,55%,45%)" strokeWidth={2} fill="url(#spendGrad)"  name="Spend" />
                    <Area yAxisId="clicks" type="monotone" dataKey="clicks" stroke="hsl(210,75%,52%)" strokeWidth={2} fill="url(#clickGrad)" name="Clicks" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Platform + Age/Gender */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {/* Platform breakdown */}
            {byPlatform.length > 0 && (
              <Card className="shadow-sm border-border/50">
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Spend by Platform</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2.5">
                  {byPlatform.map(p => {
                    const maxSpend = byPlatform[0]?.spend ?? 1;
                    return (
                      <div key={p.platform}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] font-medium">{p.platform}</span>
                          <div className="flex items-center gap-3 text-[10px] text-muted-foreground tabular-nums">
                            <span>{fmtN(p.impressions)} impr.</span>
                            <span className="font-semibold text-foreground">{fmtC(p.spend, currency)}</span>
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${maxSpend > 0 ? (p.spend / maxSpend) * 100 : 0}%` }} />
                        </div>
                        <p className="text-[9px] text-muted-foreground mt-0.5">{p.ctr.toFixed(2)}% CTR · {fmtN(p.clicks)} clicks</p>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* Age / gender */}
            {byAge.length > 0 && (
              <Card className="shadow-sm border-border/50">
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Impressions by Age & Gender</CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  <ResponsiveContainer width="100%" height={210}>
                    <BarChart data={byAge} barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,93%)" />
                      <XAxis dataKey="age" fontSize={9} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)" />
                      <YAxis fontSize={9} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)" tickFormatter={v => fmtN(v)} width={38} />
                      <Tooltip contentStyle={tip} formatter={(v: number) => [fmtN(v), ""]} />
                      <Legend iconSize={8} iconType="circle" formatter={v => <span style={{ fontSize: 10 }}>{v}</span>} />
                      <Bar dataKey="male"   fill="hsl(210,75%,52%)" name="Male"   radius={[2, 2, 0, 0]} />
                      <Bar dataKey="female" fill="hsl(340,70%,58%)" name="Female" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Placement breakdown */}
          {byPlacement.length > 0 && (
            <Card className="mb-4 shadow-sm border-border/50">
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
                  Placement Performance
                  <span className="ml-2 normal-case font-normal text-muted-foreground/40">impressions by platform + position</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="space-y-2">
                  {byPlacement.slice(0, 10).map(p => {
                    const maxImpr = byPlacement[0]?.impressions ?? 1;
                    return (
                      <div key={p.placement} className="flex items-center gap-3">
                        <span className="text-[10px] text-muted-foreground w-52 truncate shrink-0">{p.placement}</span>
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-primary/70" style={{ width: `${(p.impressions / maxImpr) * 100}%` }} />
                        </div>
                        <span className="text-[10px] tabular-nums w-14 text-right shrink-0">{fmtN(p.impressions)}</span>
                        <span className="text-[10px] text-primary tabular-nums w-14 text-right shrink-0">{fmtC(p.spend, currency)}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Campaigns table */}
          {campaigns.length > 0 && (
            <Card className="mb-4 shadow-sm border-border/50">
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
                  Campaigns
                  <span className="ml-2 normal-case font-normal text-muted-foreground/40">click name to preview ads</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-2 overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-border/40">
                      {["Campaign", "Objective", "Spend", "Impr.", "Clicks", "CTR", "Freq.", "Leads", "Status"].map(h => (
                        <th key={h} className={`py-2 px-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide ${h !== "Campaign" && h !== "Objective" ? "text-right" : ""}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map(c => (
                      <tr key={c.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 px-3">
                          <button onClick={() => setPreviewCampaign({ id: c.id, name: c.name })}
                            className="flex items-center gap-1.5 text-left hover:text-primary transition-colors group/b">
                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${c.status === "ACTIVE" ? "bg-success" : "bg-muted-foreground/40"}`} />
                            <span className="text-[11px] font-medium truncate max-w-[180px] group-hover/b:underline underline-offset-2">{c.name}</span>
                            <ExternalLink className="h-3 w-3 opacity-0 group-hover/b:opacity-40 shrink-0" />
                          </button>
                        </td>
                        <td className="py-2.5 px-3 text-[10px] text-muted-foreground capitalize">{c.objective.toLowerCase()}</td>
                        <td className="py-2.5 px-3 text-right text-[11px] font-semibold tabular-nums text-primary">{fmtC(c.spend, currency)}</td>
                        <td className="py-2.5 px-3 text-right text-[11px] tabular-nums text-muted-foreground">{fmtN(c.impressions)}</td>
                        <td className="py-2.5 px-3 text-right text-[11px] tabular-nums">{fmtN(c.clicks)}</td>
                        <td className="py-2.5 px-3 text-right text-[11px] tabular-nums">{c.ctr.toFixed(2)}%</td>
                        <td className="py-2.5 px-3 text-right text-[11px] tabular-nums">{c.frequency > 0 ? c.frequency.toFixed(1) : "—"}</td>
                        <td className="py-2.5 px-3 text-right text-[11px] tabular-nums font-semibold text-success">{c.leads > 0 ? c.leads : "—"}</td>
                        <td className="py-2.5 px-3 text-right">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${c.status === "ACTIVE" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                            {c.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Actions / Conversions */}
          {actions.length > 0 && (
            <Card className="mb-6 shadow-sm border-border/50">
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Actions & Conversions</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="space-y-1">
                  {visibleActions.map(a => {
                    const maxVal = actions[0]?.value ?? 1;
                    return (
                      <div key={a.type} className="flex items-center gap-3 py-1.5">
                        <span className="text-[11px] text-foreground w-44 truncate shrink-0" title={a.label}>{a.label}</span>
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-primary/60" style={{ width: `${maxVal > 0 ? (a.value / maxVal) * 100 : 0}%` }} />
                        </div>
                        <span className="text-[12px] font-semibold tabular-nums w-14 text-right shrink-0">{fmtN(a.value)}</span>
                        {a.costPerAction > 0 && (
                          <span className="text-[10px] text-muted-foreground tabular-nums w-20 text-right shrink-0">{fmtC(a.costPerAction, currency)} / action</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {actions.length > 8 && (
                  <button onClick={() => setShowAllActions(v => !v)}
                    className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                    {showAllActions ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {showAllActions ? "Show less" : `Show ${actions.length - 8} more actions`}
                  </button>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ══ SECTION 2: LEAD FORM DATA (SUPABASE) ═══════════════════════════════ */}
      <SectionLabel>Lead Form Submissions · Supabase</SectionLabel>

      {leadsLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-[12px]">Loading leads data…</span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <KpiTile icon={Users}      label="Total Leads"     value={total.toLocaleString()}   sub="in selected period" />
            <KpiTile icon={TrendingUp} label="Tracked via Ads" value={withUtm.toLocaleString()} sub={`${trackedPct}% have UTM data`} />
            <KpiTile icon={Megaphone}  label="Campaigns"       value={byCampaign.length > 0 ? byCampaign.length.toString() : "—"}
              sub={byCampaign[0]?.label?.slice(0, 28) ?? undefined} />
            <KpiTile icon={Globe}      label="Top Country"     value={byLocation[0]?.label ?? "—"}
              sub={byLocation[0] ? `${byLocation[0].count.toLocaleString()} leads` : undefined} />
          </div>

          <Card className="mb-4 shadow-sm border-border/50">
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
                Top Ad Creatives by Leads
                {byCreative.length > 0 && <span className="ml-2 normal-case font-normal text-muted-foreground/40">({byCreative.length})</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <RankList items={byCreative.slice(0, 15)} />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <Card className="shadow-sm border-border/50">
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Leads by Campaign</CardTitle>
              </CardHeader>
              <CardContent className="px-2 sm:px-4 pb-4">
                <HBarChart data={byCampaign.slice(0, 8)} color="hsl(170,55%,45%)" height={300} />
              </CardContent>
            </Card>

            <Card className="shadow-sm border-border/50">
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Platform (utm_source)</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 flex items-center justify-center">
                {byPlatformL.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground py-6">No platform data</p>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={byPlatformL} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={90} innerRadius={40} paddingAngle={2}>
                        {byPlatformL.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={tip} formatter={(v: number) => [v.toLocaleString(), ""]} />
                      <Legend iconSize={8} iconType="circle" formatter={v => <span style={{ fontSize: 10 }}>{v}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="shadow-sm border-border/50">
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Leads by Country</CardTitle>
              </CardHeader>
              <CardContent className="px-2 sm:px-4 pb-4">
                <HBarChart data={byLocation.slice(0, 10)} color="hsl(210,75%,52%)" />
              </CardContent>
            </Card>
            <Card className="shadow-sm border-border/50">
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Top Specialities</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <RankList items={bySpeciality.slice(0, 10)} useOwnTotal />
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Preview drawer */}
      {previewCampaign && (
        <AdPreviewDrawer
          campaignId={previewCampaign.id}
          campaignName={previewCampaign.name}
          since={since}
          until={until}
          currency={currency}
          onClose={() => setPreviewCampaign(null)}
        />
      )}
    </DashboardLayout>
  );
};

export default MetaAds;
