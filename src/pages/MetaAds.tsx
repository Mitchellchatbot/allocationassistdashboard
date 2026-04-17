import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMetaLeadsStats, type GroupedStat } from "@/hooks/use-meta-leads-stats";
import { useMetaAdsApi, useMetaCampaignAds } from "@/hooks/use-meta-ads-api";
import { useFilters } from "@/lib/filters";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { Users, Megaphone, Globe, Loader2, TrendingUp, DollarSign, Eye, MousePointer, AlertCircle, X, ImageOff, ExternalLink } from "lucide-react";
import { useState } from "react";

const COLORS = [
  "hsl(170,55%,45%)",
  "hsl(210,75%,52%)",
  "hsl(340,70%,55%)",
  "hsl(38,92%,50%)",
  "hsl(270,60%,55%)",
  "hsl(158,50%,42%)",
  "hsl(0,65%,55%)",
  "hsl(200,80%,48%)",
  "hsl(50,85%,50%)",
  "hsl(290,55%,52%)",
];

const tip = {
  backgroundColor: "#fff",
  border: "1px solid hsl(220,14%,90%)",
  borderRadius: "8px",
  fontSize: "11px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  padding: "8px 12px",
};

function KpiTile({ icon: Icon, label, value, sub, highlight }: {
  icon: React.ElementType; label: string; value: string; sub?: string; highlight?: boolean;
}) {
  return (
    <Card className={`shadow-sm hover:shadow-md hover:scale-[1.01] transition-all duration-200 ${highlight ? "border-primary/40 bg-primary/5" : "border-kpi/60 bg-kpi"}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1.5">
          <Icon className={`h-4 w-4 ${highlight ? "text-primary" : "text-primary"}`} />
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
        </div>
        <p className="text-[22px] font-semibold text-foreground tabular-nums leading-none">{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function HBarChart({ data, color, height = 260 }: { data: GroupedStat[]; color: string; height?: number }) {
  if (data.length === 0) return <p className="text-[11px] text-muted-foreground text-center py-12">No data for this period</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" barCategoryGap="20%">
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,92%)" />
        <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)" />
        <YAxis
          dataKey="label"
          type="category"
          fontSize={9}
          tickLine={false}
          axisLine={false}
          width={130}
          stroke="hsl(220,10%,55%)"
          tickFormatter={(v: string) => v.length > 22 ? v.slice(0, 22) + "…" : v}
        />
        <Tooltip contentStyle={tip} formatter={(v: number) => [v.toLocaleString(), "Leads"]} />
        <Bar dataKey="count" fill={color} radius={[0, 4, 4, 0]} name="Leads" />
      </BarChart>
    </ResponsiveContainer>
  );
}

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

function fmtCurrency(v: number, currency = "AED") {
  if (v >= 1_000_000) return `${currency} ${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)     return `${currency} ${(v / 1_000).toFixed(1)}K`;
  return `${currency} ${v.toFixed(0)}`;
}

function fmtNum(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString();
}

// Campaign table row — clicking the name opens the preview drawer
function CampaignRow({ c, currency, onSelect }: {
  c: { id: string; name: string; status: string; spend: number; impressions: number; clicks: number; reach: number; ctr: number };
  currency: string;
  onSelect: (id: string, name: string) => void;
}) {
  const isActive = c.status === "ACTIVE";
  return (
    <tr className="border-b border-border/30 hover:bg-muted/30 transition-colors group">
      <td className="py-2.5 px-3">
        <button
          onClick={() => onSelect(c.id, c.name)}
          className="flex items-center gap-2 text-left hover:text-primary transition-colors group/btn"
          title="Click to preview ads in this campaign"
        >
          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${isActive ? "bg-success" : "bg-muted-foreground/40"}`} />
          <span className="text-[11px] font-medium truncate max-w-[220px] group-hover/btn:underline underline-offset-2">{c.name}</span>
          <ExternalLink className="h-3 w-3 opacity-0 group-hover/btn:opacity-50 shrink-0 transition-opacity" />
        </button>
      </td>
      <td className="py-2.5 px-3 text-right text-[11px] font-semibold tabular-nums text-primary">
        {fmtCurrency(c.spend, currency)}
      </td>
      <td className="py-2.5 px-3 text-right text-[11px] tabular-nums text-muted-foreground">
        {fmtNum(c.impressions)}
      </td>
      <td className="py-2.5 px-3 text-right text-[11px] tabular-nums">
        {fmtNum(c.clicks)}
      </td>
      <td className="py-2.5 px-3 text-right text-[11px] tabular-nums">
        {c.ctr.toFixed(2)}%
      </td>
      <td className="py-2.5 px-3 text-right">
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${isActive ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
          {c.status}
        </span>
      </td>
    </tr>
  );
}

// ── Ad preview drawer ─────────────────────────────────────────────────────────

function AdPreviewDrawer({
  campaignId, campaignName, since, until, currency, onClose,
}: {
  campaignId: string; campaignName: string; since: string; until: string; currency: string; onClose: () => void;
}) {
  const { data: ads, isLoading } = useMetaCampaignAds(campaignId, since, until);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 z-50 h-full w-[420px] max-w-[95vw] bg-background border-l border-border shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border/60 shrink-0">
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">Campaign Ads</p>
            <p className="text-[13px] font-semibold text-foreground leading-tight truncate" title={campaignName}>{campaignName}</p>
          </div>
          <button
            onClick={onClose}
            className="mt-0.5 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable ad list */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-[11px]">Loading ads…</span>
            </div>
          ) : !ads || ads.length === 0 ? (
            <p className="text-[11px] text-muted-foreground text-center py-16">No ads found for this campaign in the selected period.</p>
          ) : (
            ads.map((ad, i) => {
              const thumb = ad.creative.thumbnail_url || ad.creative.image_url;
              const isActive = ad.status === "ACTIVE";
              return (
                <div key={ad.id} className="rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm hover:shadow-md transition-shadow">
                  {/* Ad image / thumbnail */}
                  {thumb ? (
                    <div className="relative w-full bg-muted" style={{ aspectRatio: "1.91/1" }}>
                      <img
                        src={thumb}
                        alt={ad.creative.title || ad.name}
                        className="w-full h-full object-cover"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    </div>
                  ) : (
                    <div className="w-full flex items-center justify-center bg-muted/40" style={{ aspectRatio: "1.91/1" }}>
                      <ImageOff className="h-8 w-8 text-muted-foreground/30" />
                    </div>
                  )}

                  {/* Ad copy */}
                  <div className="px-3 pt-2.5 pb-3">
                    {ad.creative.title && (
                      <p className="text-[12px] font-semibold text-foreground leading-tight mb-1">{ad.creative.title}</p>
                    )}
                    {ad.creative.body && (
                      <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3">{ad.creative.body}</p>
                    )}
                    {ad.creative.call_to_action_type && (
                      <span className="inline-block mt-1.5 text-[9px] uppercase tracking-wide font-medium px-2 py-0.5 rounded bg-primary/10 text-primary">
                        {ad.creative.call_to_action_type.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>

                  {/* Stats footer */}
                  <div className="flex items-center justify-between px-3 py-2 border-t border-border/40 bg-muted/20">
                    <div className="flex items-center gap-3">
                      <span className="flex flex-col items-center">
                        <span className="text-[13px] font-bold tabular-nums text-primary">{fmtCurrency(ad.spend, currency)}</span>
                        <span className="text-[8px] text-muted-foreground uppercase tracking-wide">spend</span>
                      </span>
                      <span className="flex flex-col items-center">
                        <span className="text-[13px] font-bold tabular-nums">{fmtNum(ad.impressions)}</span>
                        <span className="text-[8px] text-muted-foreground uppercase tracking-wide">impr.</span>
                      </span>
                      <span className="flex flex-col items-center">
                        <span className="text-[13px] font-bold tabular-nums">{fmtNum(ad.clicks)}</span>
                        <span className="text-[8px] text-muted-foreground uppercase tracking-wide">clicks</span>
                      </span>
                      <span className="flex flex-col items-center">
                        <span className="text-[13px] font-bold tabular-nums">{ad.ctr.toFixed(2)}%</span>
                        <span className="text-[8px] text-muted-foreground uppercase tracking-wide">CTR</span>
                      </span>
                    </div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${isActive ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                      {ad.status}
                    </span>
                  </div>

                  {/* Ad name */}
                  <div className="px-3 pb-2.5">
                    <p className="text-[9px] text-muted-foreground/50 truncate" title={ad.name}>
                      #{i + 1} · {ad.name}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}

const MetaAds = () => {
  const { dateRange } = useFilters();
  const { data, isLoading }         = useMetaLeadsStats(dateRange);
  const { data: adsData, isLoading: adsLoading, error: adsError } = useMetaAdsApi(dateRange);

  const [previewCampaign, setPreviewCampaign] = useState<{ id: string; name: string } | null>(null);
  const since = dateRange.from.toISOString().slice(0, 10);
  const until = dateRange.to.toISOString().slice(0, 10);

  const total        = data?.total        ?? 0;
  const withUtm      = data?.withUtm      ?? 0;
  const byCreative   = data?.byCreative   ?? [];
  const byCampaign   = data?.byCampaign   ?? [];
  const byPlatform   = data?.byPlatform   ?? [];
  const byLocation   = data?.byLocation   ?? [];
  const bySpeciality = data?.bySpeciality ?? [];

  const trackedPct = total > 0 ? Math.round((withUtm / total) * 100) : 0;
  const summary    = adsData?.summary;
  const campaigns  = adsData?.campaigns ?? [];
  const currency   = summary?.currency ?? "AED";

  return (
    <DashboardLayout
      title="Meta Ads"
      subtitle="Live ad spend and performance from the Meta Marketing API, plus lead form data"
    >
      {/* ── Section 1: Live Ad Spend (from Meta API) ──────────────────────── */}
      <div className="mb-1">
        <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/50 mb-2 px-0.5">
          Live Ad Performance · Meta Marketing API
        </p>
      </div>

      {adsError ? (
        <div className="flex items-center gap-2 mb-5 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-[11px] text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Could not load Meta Ads data: {(adsError as Error).message}</span>
        </div>
      ) : adsLoading ? (
        <div className="flex items-center gap-2 mb-5 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-[11px]">Loading ad spend data from Meta…</span>
        </div>
      ) : (
        <>
          {/* KPIs from live API */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <KpiTile icon={DollarSign}   label="Total Ad Spend"   value={fmtCurrency(summary?.spend ?? 0, currency)}      sub={`${currency} · selected period`} highlight />
            <KpiTile icon={Eye}          label="Impressions"      value={fmtNum(summary?.impressions ?? 0)}                sub="times your ads were seen" />
            <KpiTile icon={MousePointer} label="Link Clicks"      value={fmtNum(summary?.clicks ?? 0)}                    sub={`${summary?.ctr ?? 0}% click-through rate`} />
            <KpiTile icon={Users}        label="Reach"            value={fmtNum(summary?.reach ?? 0)}                     sub="unique people reached" />
          </div>

          {/* CPM + accounts strip */}
          {(summary?.cpm ?? 0) > 0 && (
            <div className="flex flex-wrap gap-3 mb-4">
              <div className="flex items-center gap-1.5 rounded-lg bg-muted/50 border border-border/40 px-3 py-1.5">
                <span className="text-[10px] text-muted-foreground">CPM</span>
                <span className="text-[12px] font-semibold">{fmtCurrency(summary?.cpm ?? 0, currency)}</span>
              </div>
              {(adsData?.accounts?.length ?? 0) > 0 && (
                <div className="flex items-center gap-1.5 rounded-lg bg-muted/50 border border-border/40 px-3 py-1.5">
                  <span className="text-[10px] text-muted-foreground">Ad Accounts</span>
                  <span className="text-[12px] font-semibold">{adsData?.accounts.length}</span>
                  <span className="text-[10px] text-muted-foreground">active</span>
                </div>
              )}
            </div>
          )}

          {/* Campaign table */}
          {campaigns.length > 0 && (
            <Card className="mb-5 shadow-sm border-border/50">
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
                  Campaigns
                  <span className="ml-2 normal-case font-normal text-muted-foreground/50">({campaigns.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-2 overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-border/40">
                      <th className="py-2 px-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Campaign</th>
                      <th className="py-2 px-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide text-right">Spend</th>
                      <th className="py-2 px-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide text-right">Impr.</th>
                      <th className="py-2 px-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide text-right">Clicks</th>
                      <th className="py-2 px-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide text-right">CTR</th>
                      <th className="py-2 px-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.slice(0, 15).map(c => (
                      <CampaignRow
                        key={c.id}
                        c={c}
                        currency={currency}
                        onSelect={(id, name) => setPreviewCampaign({ id, name })}
                      />
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ── Section 2: Lead Form Data (from Supabase) ─────────────────────── */}
      <div className="mb-1 mt-2">
        <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/50 mb-2 px-0.5">
          Lead Form Submissions · Supabase
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-[12px]">Loading leads data…</span>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <KpiTile icon={Users}      label="Total Leads"     value={total.toLocaleString()}       sub="in selected period" />
            <KpiTile icon={TrendingUp} label="Tracked via Ads" value={withUtm.toLocaleString()}     sub={`${trackedPct}% have UTM data`} />
            <KpiTile icon={Megaphone}  label="Campaigns"       value={byCampaign.length > 0 ? byCampaign.length.toString() : "—"}
              sub={byCampaign[0]?.label ? byCampaign[0].label.slice(0, 30) + (byCampaign[0].label.length > 30 ? "…" : "") : undefined} />
            <KpiTile icon={Globe}      label="Top Country"     value={byLocation[0]?.label ?? "—"}
              sub={byLocation[0] ? `${byLocation[0].count.toLocaleString()} leads` : undefined} />
          </div>

          {/* Creative performance */}
          <Card className="mb-4 shadow-sm border-border/50">
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
                Top Ad Creatives by Leads
                {byCreative.length > 0 && <span className="ml-2 normal-case font-normal text-muted-foreground/50">({byCreative.length} creatives)</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <RankList items={byCreative.slice(0, 15)} />
            </CardContent>
          </Card>

          {/* Campaign + Platform row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <Card className="shadow-sm border-border/50 flex flex-col">
              <CardHeader className="pb-1 pt-4 px-4 shrink-0">
                <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Leads by Campaign</CardTitle>
              </CardHeader>
              <CardContent className="px-2 sm:px-4 pb-4 flex-1">
                <HBarChart data={byCampaign.slice(0, 8)} color="hsl(170,55%,45%)" height={300} />
              </CardContent>
            </Card>

            <Card className="shadow-sm border-border/50 flex flex-col">
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Platform (utm_source)</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 flex-1 flex items-center justify-center">
                {byPlatform.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground text-center py-6">No platform data</p>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={byPlatform} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={90} innerRadius={40} paddingAngle={2}>
                        {byPlatform.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={tip} formatter={(v: number) => [v.toLocaleString(), ""]} />
                      <Legend iconSize={8} iconType="circle" formatter={(v) => <span style={{ fontSize: 10 }}>{v}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Country + Specialty */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
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
      {/* ── Ad preview drawer (portal-style, renders over everything) ── */}
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
