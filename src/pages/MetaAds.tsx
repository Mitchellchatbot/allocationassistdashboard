import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMetaAdsData, type MetaAd, type MetaCampaign } from "@/hooks/use-meta-ads-data";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { TrendingUp, Users, DollarSign, MousePointer, Image as ImageIcon, AlertCircle, Loader2 } from "lucide-react";
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
];

const tip = {
  backgroundColor: "#fff",
  border: "1px solid hsl(220,14%,90%)",
  borderRadius: "8px",
  fontSize: "11px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  padding: "8px 12px",
};

function statusColor(status: string) {
  if (status === "ACTIVE") return "bg-success/10 text-success border-success/20";
  if (status === "PAUSED") return "bg-warning/10 text-warning border-warning/20";
  return "bg-secondary text-muted-foreground";
}

function KpiTile({ icon: Icon, label, value, sub }: {
  icon: React.ElementType; label: string; value: string; sub?: string;
}) {
  return (
    <Card className="shadow-sm border-kpi/60 bg-kpi hover:shadow-md hover:scale-[1.01] transition-all duration-200">
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

function AdCard({ ad }: { ad: MetaAd }) {
  const [imgErr, setImgErr] = useState(false);
  return (
    <div className="rounded-xl border border-border/50 overflow-hidden bg-card hover:shadow-md transition-shadow">
      {/* Ad image / thumbnail */}
      <div className="relative h-36 bg-muted flex items-center justify-center">
        {ad.thumbnailUrl && !imgErr ? (
          <img
            src={ad.thumbnailUrl}
            alt={ad.title}
            className="w-full h-full object-cover"
            onError={() => setImgErr(true)}
          />
        ) : (
          <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
        )}
        {/* Status pill */}
        <span className={`absolute top-2 right-2 text-[8px] font-bold px-1.5 py-0.5 rounded-full border ${statusColor(ad.status)}`}>
          {ad.status}
        </span>
        {/* Leads badge */}
        {ad.leads > 0 && (
          <span className="absolute bottom-2 left-2 bg-primary text-white text-[9px] font-bold px-2 py-0.5 rounded-full">
            {ad.leads} lead{ad.leads !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="text-[11px] font-semibold text-foreground leading-tight line-clamp-2">{ad.title}</p>
        {ad.body && (
          <p className="text-[9px] text-muted-foreground mt-1 line-clamp-2">{ad.body}</p>
        )}
        <p className="text-[9px] text-primary/70 mt-1 truncate">{ad.campaignName}</p>
        <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border/30">
          <div className="text-center">
            <p className="text-[10px] font-semibold tabular-nums">{ad.impressions.toLocaleString()}</p>
            <p className="text-[8px] text-muted-foreground">views</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-semibold tabular-nums">{ad.clicks.toLocaleString()}</p>
            <p className="text-[8px] text-muted-foreground">clicks</p>
          </div>
          <div className="text-center ml-auto">
            <p className="text-[10px] font-semibold tabular-nums">${ad.spend.toFixed(0)}</p>
            <p className="text-[8px] text-muted-foreground">spent</p>
          </div>
        </div>
      </div>
    </div>
  );
}

const PRESETS = [
  { label: "Last 7 Days",  value: "last_7d"   },
  { label: "Last 30 Days", value: "last_30d"  },
  { label: "This Month",   value: "this_month" },
  { label: "This Quarter", value: "this_quarter" },
];

const MetaAds = () => {
  const [preset, setPreset] = useState("last_30d");
  const { data, isLoading, isError, error } = useMetaAdsData(preset);

  const campaigns = data?.campaigns ?? [];
  const ads       = data?.ads       ?? [];
  const totals    = data?.totals    ?? { spend: 0, impressions: 0, clicks: 0, leads: 0 };

  // Sort ads by leads desc for the image grid
  const topAds = [...ads].sort((a, b) => b.leads - a.leads || b.impressions - a.impressions);

  // Pie chart data — leads by campaign (only campaigns with leads or spend)
  const pieData = campaigns
    .filter((c) => c.leads > 0 || c.spend > 0)
    .map((c, i) => ({
      name:   c.name.length > 28 ? c.name.slice(0, 28) + "…" : c.name,
      leads:  c.leads,
      spend:  c.spend,
      color:  COLORS[i % COLORS.length],
    }));

  // Bar chart data — spend by campaign
  const barData = [...campaigns]
    .filter((c) => c.spend > 0)
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 8)
    .map((c) => ({
      name:  c.name.length > 20 ? c.name.slice(0, 20) + "…" : c.name,
      spend: c.spend,
      leads: c.leads,
    }));

  const cpl = totals.leads > 0 ? (totals.spend / totals.leads).toFixed(2) : "—";

  return (
    <DashboardLayout title="Meta Ads" subtitle="Facebook & Instagram ad performance — leads, spend, and ad creative results">

      {/* Date preset selector */}
      <div className="flex gap-1.5 mb-5 flex-wrap">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPreset(p.value)}
            className={`px-3 py-1 rounded-md text-[11px] font-medium transition-colors border ${
              preset === p.value
                ? "bg-primary text-white border-primary"
                : "bg-card text-muted-foreground border-border/50 hover:bg-secondary"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Loading / error states */}
      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-[12px]">Loading Meta Ads data…</span>
        </div>
      )}

      {isError && (
        <Card className="mb-5 border-destructive/30 bg-destructive/5">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <p className="text-[12px] font-medium text-destructive">Could not load Meta Ads data</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {String(error).includes("META_ACCESS_TOKEN")
                  ? "Add META_ACCESS_TOKEN and META_AD_ACCOUNT_ID as Supabase secrets, then deploy the meta-ads edge function."
                  : String(error)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          {/* KPI tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <KpiTile icon={DollarSign}    label="Total Spend"       value={`$${totals.spend.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} sub={preset.replace(/_/g, " ")} />
            <KpiTile icon={Users}         label="Total Leads"       value={totals.leads.toLocaleString()} sub="from all campaigns" />
            <KpiTile icon={TrendingUp}    label="Impressions"       value={totals.impressions >= 1000 ? `${(totals.impressions / 1000).toFixed(1)}K` : totals.impressions.toString()} />
            <KpiTile icon={MousePointer}  label="Cost Per Lead"     value={`$${cpl}`} sub={`${totals.clicks.toLocaleString()} clicks total`} />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
            {/* Pie chart — leads by campaign */}
            <Card className="shadow-sm border-border/50">
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Leads by Campaign</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {pieData.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground text-center py-12">No lead data for this period</p>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="leads"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        innerRadius={40}
                        paddingAngle={2}
                      >
                        {pieData.map((entry, i) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={tip}
                        formatter={(val: number) => [`${val} leads`, ""]}
                      />
                      <Legend
                        iconSize={8}
                        iconType="circle"
                        formatter={(value) => <span style={{ fontSize: 10 }}>{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Bar chart — spend by campaign */}
            <Card className="shadow-sm border-border/50">
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Spend by Campaign (Top 8)</CardTitle>
              </CardHeader>
              <CardContent className="px-2 sm:px-4 pb-4">
                {barData.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground text-center py-12">No spend data for this period</p>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={barData} layout="vertical" barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,92%)" />
                      <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)" tickFormatter={(v) => `$${v.toLocaleString()}`} />
                      <YAxis dataKey="name" type="category" fontSize={9} tickLine={false} axisLine={false} width={110} stroke="hsl(220,10%,55%)" />
                      <Tooltip contentStyle={tip} formatter={(v: number) => [`$${v.toFixed(2)}`, "Spend"]} />
                      <Bar dataKey="spend" fill="hsl(170,55%,45%)" radius={[0, 4, 4, 0]} name="Spend ($)" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Ad image grid */}
          <Card className="mb-5 shadow-sm border-border/50">
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
                Ad Creatives — sorted by leads
                {topAds.length > 0 && <span className="ml-2 normal-case font-normal text-muted-foreground/50">({topAds.length} ads)</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {topAds.length === 0 ? (
                <p className="text-[12px] text-muted-foreground text-center py-8">No ads found</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {topAds.map((ad) => <AdCard key={ad.id} ad={ad} />)}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Campaign table */}
          <Card className="shadow-sm border-border/50">
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
                All Campaigns ({campaigns.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="overflow-x-auto -mx-4 px-4">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-[10px] uppercase tracking-wide h-8">Campaign</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide h-8">Status</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Leads</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right hidden sm:table-cell">Impressions</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right hidden sm:table-cell">Clicks</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Spend</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right hidden md:table-cell">CTR</TableHead>
                      <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right hidden md:table-cell">CPL</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...campaigns]
                      .sort((a, b) => b.leads - a.leads || b.spend - a.spend)
                      .map((c: MetaCampaign) => {
                        const cpl = c.leads > 0 ? (c.spend / c.leads).toFixed(2) : "—";
                        return (
                          <TableRow key={c.id} className="hover:bg-muted/30">
                            <TableCell className="py-2.5">
                              <p className="text-[12px] font-medium max-w-[220px] truncate">{c.name}</p>
                              {c.dailyBudget && <p className="text-[9px] text-muted-foreground">${c.dailyBudget}/day budget</p>}
                            </TableCell>
                            <TableCell className="py-2.5">
                              <Badge variant="outline" className={`text-[9px] ${statusColor(c.status)}`}>{c.status}</Badge>
                            </TableCell>
                            <TableCell className="py-2.5 text-right">
                              <span className={`text-[12px] font-semibold tabular-nums ${c.leads > 0 ? "text-primary" : "text-muted-foreground"}`}>
                                {c.leads}
                              </span>
                            </TableCell>
                            <TableCell className="py-2.5 text-[11px] text-right tabular-nums hidden sm:table-cell">{c.impressions.toLocaleString()}</TableCell>
                            <TableCell className="py-2.5 text-[11px] text-right tabular-nums hidden sm:table-cell">{c.clicks.toLocaleString()}</TableCell>
                            <TableCell className="py-2.5 text-[12px] text-right tabular-nums font-medium">${c.spend.toFixed(2)}</TableCell>
                            <TableCell className="py-2.5 text-[11px] text-right tabular-nums hidden md:table-cell">{c.ctr}%</TableCell>
                            <TableCell className="py-2.5 text-[11px] text-right tabular-nums hidden md:table-cell">{cpl !== "—" ? `$${cpl}` : "—"}</TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </DashboardLayout>
  );
};

export default MetaAds;
