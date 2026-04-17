import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMetaLeadsStats, type GroupedStat } from "@/hooks/use-meta-leads-stats";
import { useMetaAdsApi, useMetaCampaignAds, useMetaAdsByName, getMetaToken, META_TOKEN_LS_KEY } from "@/hooks/use-meta-ads-api";
import { useFilters } from "@/lib/filters";
import { useQueryClient } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  Users, Megaphone, Globe, Loader2, TrendingUp, DollarSign,
  Eye, MousePointer, AlertCircle, X, ImageOff,
  Repeat2, Hash, Target, Zap, Award, KeyRound, CheckCircle2,
  ChevronDown, ChevronUp, Play, ExternalLink,
} from "lucide-react";

// ── Colours ───────────────────────────────────────────────────────────────────
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

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtC(v: number, currency = "PKR") {
  if (v >= 1_000_000) return `${currency} ${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)     return `${currency} ${(v / 1_000).toFixed(1)}K`;
  return `${currency} ${v.toFixed(0)}`;
}
function fmtN(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString();
}

// ── Flip KPI card (same 3-D flip as Dashboard) ────────────────────────────────
function MetaKpiCard({
  icon: Icon, label, value, sub, color, bg, back, backHeight = 220,
}: {
  icon: React.ElementType; label: string; value: string; sub?: string;
  color: string; bg: string; back: React.ReactNode; backHeight?: number;
}) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div
      className="cursor-pointer select-none"
      style={{
        perspective: "1200px",
        height: flipped ? `${backHeight}px` : "88px",
        transition: "height 0.45s cubic-bezier(0.4,0,0.2,1)",
      }}
      onClick={() => setFlipped(f => !f)}
    >
      <div style={{
        transformStyle: "preserve-3d",
        transition: "transform 0.55s cubic-bezier(0.4,0,0.2,1)",
        transform: flipped ? "rotateX(-180deg)" : "rotateX(0deg)",
        position: "relative", height: "100%",
      }}>
        {/* Front */}
        <div
          style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
          className="absolute inset-0 rounded-xl border border-kpi/60 bg-kpi px-4 py-3 flex items-start justify-between shadow-sm hover:shadow-md hover:scale-[1.01] transition-all"
        >
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground mb-1">{label}</p>
            <p className={`text-[24px] font-bold tabular-nums leading-none ${color}`}>{value}</p>
            {sub && <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`h-7 w-7 rounded-lg ${bg} flex items-center justify-center shrink-0 ml-2`}>
            <Icon className={`h-3.5 w-3.5 ${color}`} />
          </div>
        </div>
        {/* Back */}
        <div
          style={{
            backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
            transform: "rotateX(180deg)",
          }}
          className="absolute inset-0 rounded-xl border border-border/50 bg-card shadow-md flex flex-col overflow-hidden"
        >
          <div className={`flex items-center justify-between px-4 py-2 border-b border-border/30 ${bg} shrink-0`}>
            <div className="flex items-center gap-1.5">
              <Icon className={`h-3 w-3 ${color}`} />
              <span className="text-[11px] font-semibold">{label}</span>
            </div>
            <span className="text-[9px] text-muted-foreground">click to close</span>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">{back}</div>
        </div>
      </div>
    </div>
  );
}

// ── Ad preview modal (centered, rendered via portal) ──────────────────────────
const RANK_COLORS: Record<string, string> = {
  ABOVE_AVERAGE: "text-success", AVERAGE: "text-warning", BELOW_AVERAGE: "text-destructive",
};

function AdPreviewModal({
  campaignId, campaignName, since, until, currency, onClose,
}: {
  campaignId: string; campaignName: string; since: string; until: string;
  currency: string; onClose: () => void;
}) {
  const { data, isLoading } = useMetaCampaignAds(campaignId, since, until);
  const ads    = data?.ads    ?? [];
  const adsets = data?.adsets ?? [];
  const [tab, setTab] = useState<"ads" | "targeting">("ads");

  const modal = (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 99999 }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal box */}
      <div
        className="relative bg-background rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden"
        style={{ width: "min(600px, 95vw)", maxHeight: "85vh", zIndex: 1 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-border/60 shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Ad Preview</p>
            <p className="text-[15px] font-semibold leading-tight truncate" title={campaignName}>
              {campaignName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full h-8 w-8 flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border/60 shrink-0 px-2">
          {(["ads", "targeting"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-[12px] font-medium capitalize transition-colors ${
                tab === t
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "ads" ? `Ads (${ads.length})` : `Ad Sets & Targeting (${adsets.length})`}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-[13px]">Loading ads from Meta…</span>
            </div>
          ) : tab === "ads" ? (
            ads.length === 0 ? (
              <p className="text-[12px] text-muted-foreground text-center py-16">
                No ads found for this campaign in the selected period.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {ads.map((ad, i) => {
                  const thumb = ad.creative.thumbnail_url || ad.creative.image_url;
                  const isActive = ad.status === "ACTIVE";
                  return (
                    <div key={ad.id} className="rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm hover:shadow-md transition-shadow">
                      {thumb ? (
                        <div className="relative w-full bg-muted" style={{ aspectRatio: "1.91/1" }}>
                          <img
                            src={thumb}
                            alt={ad.creative.title || ad.name}
                            className="w-full h-full object-cover"
                            onError={e => {
                              const img = e.target as HTMLImageElement;
                              img.style.display = "none";
                              const parent = img.parentElement;
                              if (parent) {
                                parent.innerHTML = `<div class="w-full h-full flex items-center justify-center"><svg class="h-8 w-8 opacity-20" xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><rect x='3' y='3' width='18' height='18' rx='2'/><circle cx='8.5' cy='8.5' r='1.5'/><polyline points='21 15 16 10 5 21'/></svg></div>`;
                              }
                            }}
                          />
                          {/* Video indicator */}
                          {(ad.creative as { video_id?: string }).video_id && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <div className="h-10 w-10 rounded-full bg-black/50 flex items-center justify-center">
                                <Play className="h-5 w-5 text-white ml-0.5" />
                              </div>
                            </div>
                          )}
                          {ad.qualityRanking && (
                            <span className={`absolute top-2 left-2 text-[8px] font-bold px-1.5 py-0.5 rounded bg-black/60 ${RANK_COLORS[ad.qualityRanking] ?? "text-white"}`}>
                              Quality: {ad.qualityRanking.replace(/_/g, " ")}
                            </span>
                          )}
                          {/* View on Facebook link */}
                          {(ad.creative as { effective_object_story_id?: string }).effective_object_story_id && (
                            <a
                              href={`https://www.facebook.com/${(ad.creative as { effective_object_story_id?: string }).effective_object_story_id}`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="absolute top-2 right-2 flex items-center gap-1 text-[8px] font-bold px-1.5 py-0.5 rounded bg-black/60 text-white hover:bg-primary transition-colors"
                            >
                              <ExternalLink className="h-2.5 w-2.5" />
                              View Post
                            </a>
                          )}
                        </div>
                      ) : (
                        <div className="w-full flex flex-col items-center justify-center bg-muted/40 gap-2" style={{ aspectRatio: "1.91/1" }}>
                          <ImageOff className="h-8 w-8 text-muted-foreground/30" />
                          <span className="text-[9px] text-muted-foreground/40">No preview available</span>
                          {(ad.creative as { effective_object_story_id?: string }).effective_object_story_id && (
                            <a
                              href={`https://www.facebook.com/${(ad.creative as { effective_object_story_id?: string }).effective_object_story_id}`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="flex items-center gap-1 text-[9px] text-primary hover:underline"
                            >
                              <ExternalLink className="h-2.5 w-2.5" />
                              View on Facebook
                            </a>
                          )}
                        </div>
                      )}

                      <div className="px-3 pt-2.5 pb-2">
                        {ad.creative.title && (
                          <p className="text-[12px] font-semibold leading-tight mb-1">{ad.creative.title}</p>
                        )}
                        {ad.creative.body && (
                          <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{ad.creative.body}</p>
                        )}
                        {ad.creative.call_to_action_type && (
                          <span className="inline-block mt-1 text-[9px] uppercase tracking-wide font-medium px-2 py-0.5 rounded bg-primary/10 text-primary">
                            {ad.creative.call_to_action_type.replace(/_/g, " ")}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between px-3 py-2 border-t border-border/40 bg-muted/20">
                        <div className="flex items-center gap-3">
                          {[
                            { l: "spend",  v: fmtC(ad.spend, currency), c: "text-primary" },
                            { l: "impr.",  v: fmtN(ad.impressions) },
                            { l: "CTR",    v: `${ad.ctr.toFixed(2)}%` },
                            ...(ad.leads > 0 ? [{ l: "leads", v: String(ad.leads), c: "text-success" }] : []),
                          ].map(s => (
                            <span key={s.l} className="flex flex-col items-center">
                              <span className={`text-[12px] font-bold tabular-nums ${s.c ?? ""}`}>{s.v}</span>
                              <span className="text-[8px] text-muted-foreground uppercase">{s.l}</span>
                            </span>
                          ))}
                        </div>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${isActive ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                          {ad.status}
                        </span>
                      </div>

                      <div className="px-3 pb-2.5">
                        <p className="text-[9px] text-muted-foreground/40 truncate">#{i + 1} · {ad.name}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            // Targeting tab
            adsets.length === 0 ? (
              <p className="text-[12px] text-muted-foreground text-center py-16">No ad sets found.</p>
            ) : (
              <div className="space-y-4">
                {adsets.map(s => (
                  <div key={s.id} className="rounded-xl border border-border/50 bg-card p-4 shadow-sm">
                    <div className="flex items-start justify-between mb-3">
                      <p className="text-[13px] font-semibold">{s.name}</p>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${s.status === "ACTIVE" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                        {s.status}
                      </span>
                    </div>
                    <div className="space-y-1.5 mb-3 text-[11px] text-muted-foreground">
                      {(s.targeting.ageMin || s.targeting.ageMax) && (
                        <p><Users className="h-3 w-3 inline mr-1" />Age {s.targeting.ageMin ?? "—"}–{s.targeting.ageMax ?? "65+"}
                          {s.targeting.genders?.length ? ` · ${s.targeting.genders.join(", ")}` : " · All genders"}</p>
                      )}
                      {s.targeting.locations.length > 0 && (
                        <p><Globe className="h-3 w-3 inline mr-1" />{s.targeting.locations.slice(0, 8).join(", ")}</p>
                      )}
                      {s.targeting.interests && s.targeting.interests.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          <Target className="h-3 w-3 shrink-0 mt-0.5" />
                          {s.targeting.interests.slice(0, 12).map(int => (
                            <span key={int} className="text-[9px] bg-secondary px-1.5 py-0.5 rounded-full">{int}</span>
                          ))}
                        </div>
                      )}
                      {s.dailyBudget > 0 && <p><DollarSign className="h-3 w-3 inline mr-1" />Daily budget: {fmtC(s.dailyBudget, currency)}</p>}
                    </div>
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
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

// ── Token config panel ────────────────────────────────────────────────────────
function TokenConfigPanel({ onSaved }: { onSaved: () => void }) {
  const [val, setVal] = useState("");
  const [saved, setSaved] = useState(false);
  function save() {
    const t = val.trim();
    if (!t) return;
    localStorage.setItem(META_TOKEN_LS_KEY, t);
    setSaved(true);
    setTimeout(() => onSaved(), 600);
  }
  return (
    <div className="mb-6 rounded-xl border border-warning/30 bg-warning/5 p-5">
      <div className="flex items-start gap-3">
        <KeyRound className="h-5 w-5 text-warning shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold mb-1">Meta Access Token Required</p>
          <p className="text-[11px] text-muted-foreground mb-3">Enter your Facebook Marketing API token. Saved in your browser.</p>
          <div className="flex gap-2">
            <input type="password" value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => e.key === "Enter" && save()}
              placeholder="EAAcQ2n9…" className="flex-1 rounded-lg border border-border/60 bg-background px-3 py-2 text-[12px] font-mono focus:outline-none focus:ring-2 focus:ring-primary/30" />
            <button onClick={save} disabled={!val.trim() || saved}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[12px] font-medium text-white hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0">
              {saved ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
              {saved ? "Saved!" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Ad creative preview modal (opened from the "Top Ad Creatives" list) ──────
function AdCreativeModal({
  adName, accountId, leads, currency, onClose,
}: {
  adName: string; accountId: string; leads: number;
  currency: string; onClose: () => void;
}) {
  const { data: ads = [], isLoading } = useMetaAdsByName(adName, accountId);

  const modal = (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 99999 }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative bg-background rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden"
        style={{ width: "min(560px, 96vw)", maxHeight: "88vh", zIndex: 1 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border/50 shrink-0">
          <div className="min-w-0">
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-medium mb-0.5">Ad Creative</p>
            <p className="text-[14px] font-bold leading-tight truncate" title={adName}>{adName}</p>
            {leads > 0 && (
              <p className="text-[11px] text-success font-semibold mt-0.5">{leads.toLocaleString()} leads generated</p>
            )}
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-[12px]">Loading ad from Meta…</span>
            </div>
          ) : ads.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-20 text-muted-foreground">
              <ImageOff className="h-10 w-10 opacity-20" />
              <p className="text-[13px] font-medium">No matching ad found</p>
              <p className="text-[11px] opacity-60">"{adName}" wasn't found across any status (active, archived, deleted) in this account.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {ads.map((ad, idx) => {
                const thumb = ad.creative.thumbnail_url;
                const postUrl = (ad.creative as { effective_object_story_id?: string }).effective_object_story_id
                  ? `https://www.facebook.com/${(ad.creative as { effective_object_story_id?: string }).effective_object_story_id}`
                  : null;
                const isVideo = !!(ad.creative as { video_id?: string }).video_id;
                return (
                  <div key={ad.id} className="rounded-2xl border border-border/50 overflow-hidden bg-card shadow-sm">
                    {/* Thumbnail — prominent */}
                    {thumb ? (
                      <div className="relative w-full bg-black" style={{ aspectRatio: "16/9" }}>
                        <img
                          src={thumb}
                          alt={ad.creative.title || ad.name}
                          className="w-full h-full object-cover opacity-95"
                          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                        {isVideo && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="h-14 w-14 rounded-full bg-black/50 flex items-center justify-center ring-2 ring-white/20">
                              <Play className="h-6 w-6 text-white ml-1" />
                            </div>
                          </div>
                        )}
                        {postUrl && (
                          <a href={postUrl} target="_blank" rel="noreferrer"
                            className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/60 hover:bg-primary text-white text-[10px] font-semibold px-2.5 py-1 rounded-full transition-colors">
                            <ExternalLink className="h-3 w-3" />
                            View on Facebook
                          </a>
                        )}
                        <div className={`absolute top-2 left-2 text-[9px] font-bold px-2 py-0.5 rounded-full ${ad.status === "ACTIVE" ? "bg-success/90 text-white" : "bg-black/60 text-white"}`}>
                          {ad.status}
                        </div>
                        {idx === 0 && ads.length > 1 && (
                          <div className="absolute top-2 right-2 text-[9px] bg-primary/90 text-white px-2 py-0.5 rounded-full font-bold">Top performer</div>
                        )}
                      </div>
                    ) : (
                      <div className="w-full flex flex-col items-center justify-center gap-3 bg-muted/30 py-10">
                        <ImageOff className="h-10 w-10 text-muted-foreground/20" />
                        <p className="text-[11px] text-muted-foreground/50">No thumbnail available</p>
                        {postUrl && (
                          <a href={postUrl} target="_blank" rel="noreferrer"
                            className="flex items-center gap-1.5 text-[11px] text-primary hover:underline font-medium">
                            <ExternalLink className="h-3 w-3" />
                            View on Facebook
                          </a>
                        )}
                      </div>
                    )}

                    {/* Text content */}
                    <div className="px-4 pt-3 pb-2">
                      {ad.creative.title && (
                        <p className="text-[13px] font-bold leading-snug mb-1">{ad.creative.title}</p>
                      )}
                      {ad.creative.body && (
                        <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3">{ad.creative.body}</p>
                      )}
                      {ad.creative.call_to_action_type && (
                        <span className="inline-block mt-2 text-[9px] uppercase tracking-wide font-bold px-3 py-1 rounded-full bg-primary text-white">
                          {ad.creative.call_to_action_type.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>

                    {/* Stats — leads count from Supabase (reliable), other stats from Meta */}
                    <div className="grid grid-cols-2 divide-x divide-border/40 border-t border-border/40 bg-muted/20">
                      {[
                        { l: "Leads (form)", v: leads > 0 ? leads.toLocaleString() : "—", c: leads > 0 ? "text-success" : "", note: "from Supabase" },
                        { l: "Status",       v: ad.status, c: ad.status === "ACTIVE" ? "text-success" : "text-muted-foreground" },
                      ].map(s => (
                        <div key={s.l} className="flex flex-col items-center py-3">
                          <span className={`text-[18px] font-bold tabular-nums ${s.c ?? ""}`}>{s.v}</span>
                          <span className="text-[8px] uppercase tracking-wide text-muted-foreground mt-0.5">{s.l}</span>
                          {(s as { note?: string }).note && <span className="text-[7px] text-muted-foreground/40 mt-0.5">{(s as { note?: string }).note}</span>}
                        </div>
                      ))}
                    </div>

                    {ads.length > 1 && (
                      <div className="px-4 pb-2.5">
                        <p className="text-[9px] text-muted-foreground/40 truncate">Ad #{idx + 1} · {ad.name}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

// ── Shared small components ───────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/50 mb-3 mt-2 px-0.5">{children}</p>;
}

function RankList({ items, useOwnTotal = false, onItemClick }: { items: GroupedStat[]; useOwnTotal?: boolean; onItemClick?: (label: string) => void }) {
  if (items.length === 0) return <p className="text-[11px] text-muted-foreground py-6 text-center">No data</p>;
  const maxCount = items[0]?.count ?? 1;
  const sumCount = useOwnTotal ? items.reduce((a, r) => a + r.count, 0) : maxCount;
  return (
    <div className="space-y-1.5">
      {items.map((r, i) => {
        const barPct   = maxCount > 0 ? Math.round((r.count / maxCount) * 100) : 0;
        const labelPct = sumCount > 0 ? Math.round((r.count / sumCount) * 100) : 0;
        const clickable = !!onItemClick;
        return (
          <div
            key={r.label}
            onClick={() => onItemClick?.(r.label)}
            className={`flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors ${clickable ? "cursor-pointer hover:bg-primary/5 group" : ""}`}
          >
            <span className="text-[10px] text-muted-foreground w-4 tabular-nums shrink-0">{i + 1}</span>
            <span className={`text-[11px] font-medium flex-1 truncate ${clickable ? "group-hover:text-primary" : ""}`} title={r.label}>
              {r.label}
            </span>
            {clickable && (
              <Eye className="h-3 w-3 text-muted-foreground/30 group-hover:text-primary shrink-0 transition-colors" />
            )}
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
  if (data.length === 0) return <p className="text-[11px] text-muted-foreground text-center py-12">No data</p>;
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

// ── Meta presets ──────────────────────────────────────────────────────────────
const META_PRESETS = [
  { label: "30D",  days: 30 },
  { label: "90D",  days: 90 },
  { label: "180D", days: 180 },
  { label: "1Y",   days: 365 },
  { label: "All",  days: 730 },
] as const;

// ── Main page ─────────────────────────────────────────────────────────────────
const MetaAds = () => {
  const { dateRange } = useFilters();
  const { data, isLoading: leadsLoading } = useMetaLeadsStats(dateRange);
  const queryClient = useQueryClient();

  const [metaDays, setMetaDays] = useState(365);
  const metaDateRange = useMemo(() => {
    const to = new Date(); const from = new Date();
    from.setDate(from.getDate() - metaDays);
    return { from, to };
  }, [metaDays]);

  const [tokenSet, setTokenSet] = useState(true);
  const { data: api, isLoading: apiLoading, error: apiError } = useMetaAdsApi(metaDateRange);
  const [previewCampaign, setPreviewCampaign] = useState<{ id: string; name: string } | null>(null);
  const [previewCreative, setPreviewCreative] = useState<{ name: string; leads: number } | null>(null);
  const [showAllActions, setShowAllActions] = useState(false);
  const primaryAccountId = api?.accounts?.[0]?.id ?? null;

  function handleTokenSaved() {
    setTokenSet(true);
    queryClient.invalidateQueries({ queryKey: ["meta-ads-api-v3"] });
  }

  const since    = metaDateRange.from.toISOString().slice(0, 10);
  const until    = metaDateRange.to.toISOString().slice(0, 10);
  const summary  = api?.summary;
  const currency = summary?.currency ?? "AED";
  const campaigns    = api?.campaigns    ?? [];
  const dailySeries  = api?.dailySeries  ?? [];
  const byAge        = api?.byAge        ?? [];
  const byPlatform   = api?.byPlatform   ?? [];
  const byPlacement  = api?.byPlacement  ?? [];
  const actions      = api?.actions      ?? [];
  const visibleActions = showAllActions ? actions : actions.slice(0, 8);

  // Supabase
  const total        = data?.total        ?? 0;
  const withUtm      = data?.withUtm      ?? 0;
  const byCreative   = data?.byCreative   ?? [];
  const byCampaign   = data?.byCampaign   ?? [];
  const byPlatformL  = data?.byPlatform   ?? [];
  const byLocation   = data?.byLocation   ?? [];
  const bySpeciality = data?.bySpeciality ?? [];
  const trackedPct   = total > 0 ? Math.round((withUtm / total) * 100) : 0;

  // ── Back-side content for each KPI flip card ──────────────────────────────
  const topCampBySpend = campaigns.slice(0, 5);
  const maxSpendCamp = topCampBySpend[0]?.spend ?? 1;
  const spendBack = (
    <div className="space-y-2">
      {topCampBySpend.map(c => (
        <div key={c.id}>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] truncate max-w-[140px]">{c.name}</span>
            <span className="text-[10px] font-semibold text-primary tabular-nums">{fmtC(c.spend, currency)}</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: `${(c.spend / maxSpendCamp) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );

  const imprBack = (
    <div className="space-y-1.5">
      {byPlatform.slice(0, 5).map(p => (
        <div key={p.platform} className="flex items-center justify-between">
          <span className="text-[10px]">{p.platform}</span>
          <span className="text-[10px] font-semibold tabular-nums">{fmtN(p.impressions)}</span>
        </div>
      ))}
      {byPlatform.length === 0 && <p className="text-[10px] text-muted-foreground">No platform data</p>}
    </div>
  );

  const reachBack = (
    <div className="space-y-1.5">
      {byAge.slice(0, 6).map(a => {
        const total = a.male + a.female + a.unknown;
        const malePct  = total > 0 ? Math.round((a.male   / total) * 100) : 0;
        const femPct   = total > 0 ? Math.round((a.female / total) * 100) : 0;
        return (
          <div key={a.age}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px]">{a.age}</span>
              <span className="text-[9px] text-muted-foreground">{malePct}% M · {femPct}% F</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden flex">
              <div className="h-full bg-blue-400" style={{ width: `${malePct}%` }} />
              <div className="h-full bg-pink-400" style={{ width: `${femPct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );

  const topCampByCtr = campaigns.slice().sort((a, b) => b.ctr - a.ctr).slice(0, 5);
  const clicksBack = (
    <div className="space-y-1.5">
      {topCampByCtr.map(c => (
        <div key={c.id} className="flex items-center justify-between">
          <span className="text-[10px] truncate max-w-[140px]">{c.name}</span>
          <span className="text-[10px] font-semibold text-info tabular-nums">{c.ctr.toFixed(2)}% CTR</span>
        </div>
      ))}
    </div>
  );

  const freqBack = (
    <div className="space-y-2">
      <p className="text-[10px] text-muted-foreground">Avg. times each unique person saw your ads</p>
      <div className="grid grid-cols-3 gap-2 pt-1">
        {[
          { label: "Total Impr.", val: fmtN(summary?.impressions ?? 0) },
          { label: "Reach",       val: fmtN(summary?.reach       ?? 0) },
          { label: "Frequency",   val: (summary?.frequency ?? 0).toFixed(2) },
        ].map(m => (
          <div key={m.label} className="text-center p-2 rounded-lg bg-muted/30">
            <p className="text-[14px] font-bold">{m.val}</p>
            <p className="text-[8px] text-muted-foreground uppercase tracking-wide">{m.label}</p>
          </div>
        ))}
      </div>
    </div>
  );

  const cpmBack = (
    <div className="space-y-1.5">
      {byPlacement.slice(0, 6).map(p => {
        const maxImpr = byPlacement[0]?.impressions ?? 1;
        return (
          <div key={p.placement}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] truncate max-w-[150px]">{p.placement}</span>
              <span className="text-[10px] font-semibold tabular-nums text-primary">{fmtC(p.spend, currency)}</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary/60 rounded-full" style={{ width: `${(p.impressions / maxImpr) * 100}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );

  const topCampByLeads = campaigns.filter(c => c.leads > 0).sort((a, b) => b.leads - a.leads).slice(0, 5);
  const maxLeads = topCampByLeads[0]?.leads ?? 1;
  const leadsBack = (
    <div className="space-y-2">
      {topCampByLeads.length === 0
        ? <p className="text-[10px] text-muted-foreground">No lead data</p>
        : topCampByLeads.map(c => (
          <div key={c.id}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] truncate max-w-[140px]">{c.name}</span>
              <span className="text-[10px] font-semibold text-success tabular-nums">{c.leads} leads</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-success rounded-full" style={{ width: `${(c.leads / maxLeads) * 100}%` }} />
            </div>
          </div>
        ))}
    </div>
  );

  const cplBack = (
    <div className="space-y-1.5">
      {actions.slice(0, 6).map(a => (
        <div key={a.type} className="flex items-center justify-between">
          <span className="text-[10px] truncate max-w-[140px]">{a.label}</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold tabular-nums">{fmtN(a.value)}</span>
            {a.costPerAction > 0 && (
              <span className="text-[9px] text-muted-foreground">{fmtC(a.costPerAction, currency)}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <DashboardLayout title="Meta Ads" subtitle="Live performance from Facebook Marketing API · Lead form data from Supabase">

      {/* ══ Meta API section ══════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between mb-3 mt-2">
        <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/50">
          Live Ad Performance · Meta Marketing API
        </p>
        <div className="flex gap-0.5">
          {META_PRESETS.map(p => (
            <button key={p.label} type="button" onClick={() => setMetaDays(p.days)}
              className={`px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${
                metaDays === p.days ? "bg-primary text-white" : "text-muted-foreground hover:bg-secondary"
              }`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {!tokenSet ? (
        <TokenConfigPanel onSaved={handleTokenSaved} />
      ) : apiError ? (
        <div className="mb-5 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-4 space-y-3">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="text-[12px] font-semibold">{(apiError as Error).message}</span>
          </div>
          <TokenConfigPanel onSaved={handleTokenSaved} />
        </div>
      ) : apiLoading ? (
        <div className="flex items-center gap-2 mb-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-[11px]">Fetching from Meta ({since} → {until})…</span>
        </div>
      ) : campaigns.length === 0 && (summary?.spend ?? 0) === 0 ? (
        <div className="mb-5 rounded-xl border border-border/50 bg-muted/30 px-4 py-4">
          <p className="text-[12px] font-medium mb-1">No ad data found for this period</p>
          <p className="text-[11px] text-muted-foreground">
            Range: {since} → {until}
            {(api?.accounts?.length ?? 0) > 0 && <> · Accounts: {api?.accounts.map(a => a.name).join(", ")}</>}
          </p>
          <p className="text-[10px] text-muted-foreground/60 mt-1">Try selecting "All" to see all historical data.</p>
        </div>
      ) : (
        <>
          {/* ── 8 Flip KPI cards ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <MetaKpiCard icon={DollarSign}   label="Total Spend"    color="text-primary"     bg="bg-primary/10"
              value={fmtC(summary?.spend ?? 0, currency)}     sub={currency}                      back={spendBack}  backHeight={230} />
            <MetaKpiCard icon={Eye}          label="Impressions"    color="text-info"        bg="bg-info/10"
              value={fmtN(summary?.impressions ?? 0)}         sub="times ads were shown"          back={imprBack}   backHeight={200} />
            <MetaKpiCard icon={Users}        label="Reach"          color="text-success"     bg="bg-success/10"
              value={fmtN(summary?.reach ?? 0)}               sub="unique people"                 back={reachBack}  backHeight={240} />
            <MetaKpiCard icon={MousePointer} label="Link Clicks"    color="text-info"        bg="bg-info/10"
              value={fmtN(summary?.clicks ?? 0)}              sub={`${summary?.ctr ?? 0}% CTR`}  back={clicksBack} backHeight={200} />
            <MetaKpiCard icon={Repeat2}      label="Frequency"      color="text-warning"     bg="bg-warning/10"
              value={(summary?.frequency ?? 0).toFixed(2)}    sub="avg per person"                back={freqBack}   backHeight={180} />
            <MetaKpiCard icon={Hash}         label="CPM"            color="text-muted-foreground" bg="bg-muted"
              value={fmtC(summary?.cpm ?? 0, currency)}       sub="per 1,000 impressions"         back={cpmBack}    backHeight={230} />
            <MetaKpiCard icon={Zap}          label="Leads from Ads" color="text-success"     bg="bg-success/10"
              value={fmtN(summary?.leads ?? 0)}               sub="form submissions"              back={leadsBack}  backHeight={220} />
            <MetaKpiCard icon={Award}        label="Cost Per Lead"  color="text-primary"     bg="bg-primary/10"
              value={(summary?.leads ?? 0) > 0 ? fmtC(summary?.costPerLead ?? 0, currency) : "—"}
              sub="per form lead"                                                                   back={cplBack}    backHeight={220} />
          </div>

          {/* Account chips */}
          {(api?.accounts?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {api!.accounts.map(acc => (
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
                <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Daily Spend & Clicks</CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={dailySeries}>
                    <defs>
                      <linearGradient id="spG" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="hsl(170,55%,45%)" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="hsl(170,55%,45%)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="clG" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="hsl(210,75%,52%)" stopOpacity={0.14} />
                        <stop offset="95%" stopColor="hsl(210,75%,52%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,93%)" />
                    <XAxis dataKey="date" fontSize={9} tickLine={false} axisLine={false}
                      interval={Math.max(0, Math.floor(dailySeries.length / 10) - 1)} />
                    <YAxis yAxisId="s" orientation="left"  fontSize={9} tickLine={false} axisLine={false} tickFormatter={v => fmtC(v, currency)} width={65} />
                    <YAxis yAxisId="c" orientation="right" fontSize={9} tickLine={false} axisLine={false} tickFormatter={v => fmtN(v)} width={42} />
                    <Tooltip contentStyle={tip} formatter={(v: number, name: string) => name === "Spend" ? [fmtC(v, currency), name] : [fmtN(v), name]} />
                    <Legend iconSize={8} iconType="circle" formatter={v => <span style={{ fontSize: 10 }}>{v}</span>} />
                    <Area yAxisId="s" type="monotone" dataKey="spend"  stroke="hsl(170,55%,45%)" strokeWidth={2} fill="url(#spG)" name="Spend" />
                    <Area yAxisId="c" type="monotone" dataKey="clicks" stroke="hsl(210,75%,52%)" strokeWidth={2} fill="url(#clG)" name="Clicks" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Platform + Age/Gender */}
          {(byPlatform.length > 0 || byAge.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              {byPlatform.length > 0 && (
                <Card className="shadow-sm border-border/50">
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Spend by Platform</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-2.5">
                    {byPlatform.map(p => {
                      const maxS = byPlatform[0]?.spend ?? 1;
                      return (
                        <div key={p.platform}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] font-medium">{p.platform}</span>
                            <div className="flex gap-3 text-[10px] text-muted-foreground tabular-nums">
                              <span>{fmtN(p.impressions)} impr.</span>
                              <span className="font-semibold text-foreground">{fmtC(p.spend, currency)}</span>
                            </div>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${(p.spend / maxS) * 100}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}
              {byAge.length > 0 && (
                <Card className="shadow-sm border-border/50">
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Impressions by Age & Gender</CardTitle>
                  </CardHeader>
                  <CardContent className="px-2 pb-4">
                    <ResponsiveContainer width="100%" height={210}>
                      <BarChart data={byAge} barCategoryGap="20%">
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,93%)" />
                        <XAxis dataKey="age" fontSize={9} tickLine={false} axisLine={false} />
                        <YAxis fontSize={9} tickLine={false} axisLine={false} tickFormatter={v => fmtN(v)} width={38} />
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
          )}

          {/* Campaigns — with big "View Ads" button */}
          {campaigns.length > 0 && (
            <Card className="mb-4 shadow-sm border-border/50">
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
                  Campaigns
                  <span className="ml-2 normal-case font-normal text-muted-foreground/40">
                    · click <Play className="h-2.5 w-2.5 inline" /> to preview ads
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-2 overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-border/40">
                      <th className="py-2 px-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Campaign</th>
                      <th className="py-2 px-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Objective</th>
                      <th className="py-2 px-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide text-right">Spend</th>
                      <th className="py-2 px-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide text-right">Impr.</th>
                      <th className="py-2 px-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide text-right">CTR</th>
                      <th className="py-2 px-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide text-right">Leads</th>
                      <th className="py-2 px-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide text-center">Preview</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map(c => (
                      <tr key={c.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5">
                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${c.status === "ACTIVE" ? "bg-success" : "bg-muted-foreground/40"}`} />
                            <span className="text-[11px] font-medium truncate max-w-[200px]">{c.name}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-[10px] text-muted-foreground capitalize">{c.objective.toLowerCase()}</td>
                        <td className="py-2.5 px-3 text-right text-[11px] font-semibold tabular-nums text-primary">{fmtC(c.spend, currency)}</td>
                        <td className="py-2.5 px-3 text-right text-[11px] tabular-nums text-muted-foreground">{fmtN(c.impressions)}</td>
                        <td className="py-2.5 px-3 text-right text-[11px] tabular-nums">{c.ctr.toFixed(2)}%</td>
                        <td className="py-2.5 px-3 text-right text-[11px] tabular-nums font-semibold text-success">{c.leads > 0 ? c.leads : "—"}</td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => setPreviewCampaign({ id: c.id, name: c.name })}
                            className="inline-flex items-center gap-1 rounded-lg bg-primary/10 hover:bg-primary hover:text-white text-primary px-2.5 py-1 text-[10px] font-semibold transition-colors"
                          >
                            <Play className="h-2.5 w-2.5" />
                            View Ads
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
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
                        <span className="text-[11px] w-44 truncate shrink-0">{a.label}</span>
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-primary/60" style={{ width: `${(a.value / maxVal) * 100}%` }} />
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
                  <button onClick={() => setShowAllActions(v => !v)} className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
                    {showAllActions ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {showAllActions ? "Show less" : `Show ${actions.length - 8} more`}
                  </button>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ══ Lead Form Data (Supabase) ══════════════════════════════════════════ */}
      <SectionLabel>Lead Form Submissions · Supabase</SectionLabel>

      {leadsLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-[12px]">Loading leads…</span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            {[
              { icon: Users,      label: "Total Leads",     value: total.toLocaleString(),   sub: "in selected period" },
              { icon: TrendingUp, label: "Tracked via Ads", value: withUtm.toLocaleString(), sub: `${trackedPct}% have UTM data` },
              { icon: Megaphone,  label: "Campaigns",       value: byCampaign.length > 0 ? byCampaign.length.toString() : "—", sub: byCampaign[0]?.label?.slice(0, 26) },
              { icon: Globe,      label: "Top Country",     value: byLocation[0]?.label ?? "—", sub: byLocation[0] ? `${byLocation[0].count.toLocaleString()} leads` : undefined },
            ].map(k => (
              <div key={k.label} className="rounded-xl border border-kpi/60 bg-kpi px-4 py-3 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <k.icon className="h-4 w-4 text-primary" />
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{k.label}</p>
                </div>
                <p className="text-[22px] font-semibold tabular-nums leading-none">{k.value}</p>
                {k.sub && <p className="text-[10px] text-muted-foreground mt-1">{k.sub}</p>}
              </div>
            ))}
          </div>

          <Card className="mb-4 shadow-sm border-border/50">
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
                Top Ad Creatives by Leads {byCreative.length > 0 && <span className="ml-1 normal-case font-normal text-muted-foreground/40">({byCreative.length})</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {primaryAccountId && (
                <p className="text-[10px] text-muted-foreground/50 mb-2 flex items-center gap-1">
                  <Eye className="h-3 w-3" /> Click any row to preview that ad
                </p>
              )}
              <RankList
                items={byCreative.slice(0, 15)}
                onItemClick={primaryAccountId ? (label) => {
                  const stat = byCreative.find(c => c.label === label);
                  setPreviewCreative({ name: label, leads: stat?.count ?? 0 });
                } : undefined}
              />
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
                {byPlatformL.length === 0 ? <p className="text-[11px] text-muted-foreground py-6">No data</p> : (
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

      {/* Campaign preview modal */}
      {previewCampaign && (
        <AdPreviewModal
          campaignId={previewCampaign.id}
          campaignName={previewCampaign.name}
          since={since}
          until={until}
          currency={currency}
          onClose={() => setPreviewCampaign(null)}
        />
      )}

      {/* Creative preview modal — opened from Top Ad Creatives list */}
      {previewCreative && primaryAccountId && (
        <AdCreativeModal
          adName={previewCreative.name}
          accountId={primaryAccountId}
          leads={previewCreative.leads}
          currency={currency}
          onClose={() => setPreviewCreative(null)}
        />
      )}
    </DashboardLayout>
  );
};

export default MetaAds;
