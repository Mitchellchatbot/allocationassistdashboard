import { useState, useMemo, useEffect } from "react";
import { motion, LayoutGroup } from "framer-motion";
import { SectionDateRange } from "@/components/SectionDateRange";
import { useSetAIPageContext } from "@/lib/ai-page-context";
import { useCurrency } from "@/lib/CurrencyProvider";
import { createPortal } from "react-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CampaignWinnerCards } from "@/components/CampaignWinners";
import { useMetaLeadsStats, type GroupedStat } from "@/hooks/use-meta-leads-stats";
import { useMetaAdsApi, useMetaCampaignAds, useMetaAdsByName, useMetaTopAds, useMetaTopAdsets, type MetaTopAd, getMetaToken, META_TOKEN_LS_KEY } from "@/hooks/use-meta-ads-api";
import { useZohoData, displaySource } from "@/hooks/use-zoho-data";
import { useFilters } from "@/lib/filters";
import { useQueryClient } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { InfoIcon } from "@/components/InfoIcon";
import {
  Users, Megaphone, Globe, Loader2, TrendingUp, DollarSign,
  Eye, MousePointer, AlertCircle, X, ImageOff,
  Repeat2, Hash, Target, Zap, Award, KeyRound, CheckCircle2,
  ChevronDown, ChevronUp, ChevronsUpDown, Play, ExternalLink, ClipboardList,
} from "lucide-react";

// Short {meaning, source} pair shown in the (i) popover on each card.
const META_KPI_HINTS: Record<string, { meaning: string; source: string }> = {
  "Total Spend":             { meaning: "Meta Ads spend in the period.",                                                source: "Meta Marketing API." },
  "Impressions":             { meaning: "Total times your ads were shown (a person seeing it 3× = 3).",                  source: "Meta Marketing API." },
  "Reach":                   { meaning: "Unique people who saw your ads at least once.",                                 source: "Meta Marketing API." },
  "Link Clicks":             { meaning: "Clicks on the ad's destination link.",                                          source: "Meta Marketing API." },
  "Frequency":               { meaning: "Avg times each person saw your ad (impressions ÷ reach).",                      source: "Meta Marketing API." },
  "CPM":                     { meaning: "Cost per 1,000 impressions.",                                                   source: "Meta Marketing API." },
  "Leads from Ads":          { meaning: "Leads Meta attributes to your ads in the period.",                              source: "Meta Marketing API (lead actions)." },
  "Leads from Forms":        { meaning: "Form submissions tagged as Meta — independent of Meta's attribution.",          source: "Supabase (meta_leads table)." },
  "Cost Per Lead (forms)":   { meaning: "Meta spend ÷ form-lead submissions. The honest CPL.",                           source: "Meta API + Supabase meta_leads." },
  "Cost Per Qualified":      { meaning: 'Meta spend ÷ qualified form-leads. "Contact in Future" excluded.',              source: "Meta API + meta_leads × Zoho Lead_Status." },
  "Cost per Conversion":     { meaning: "Meta spend ÷ conversions (Doctors on Board attributed to the Meta channel).", source: "Meta API + Zoho Doctors on Board module." },
};

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

// Convert an AED-base amount into the display currency using the AED-USD peg.
// Use this in modals/components that receive `currency` as a prop and need to
// honour the AED ↔ USD toggle from the main page.
const AED_PER_USD_PEG = 3.6725;
function aedTo(v: number, displayCurrency: string): number {
  return displayCurrency === "USD" ? v / AED_PER_USD_PEG : v;
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
  const hint = META_KPI_HINTS[label];
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
        <div
          style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
          className="absolute inset-0 rounded-xl border border-kpi/60 bg-kpi px-4 py-3 flex items-start justify-between shadow-sm hover:shadow-md hover:scale-[1.01] transition-all"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-1 mb-1">
              <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
              {hint && <InfoIcon meaning={hint.meaning} source={hint.source} side="bottom" />}
            </div>
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
                            { l: "spend",  v: fmtC(aedTo(ad.spend, currency), currency), c: "text-primary" },
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
                      {s.dailyBudget > 0 && <p><DollarSign className="h-3 w-3 inline mr-1" />Daily budget: {fmtC(aedTo(s.dailyBudget, currency), currency)}</p>}
                    </div>
                    <div className="flex gap-4 pt-2 border-t border-border/40">
                      {[
                        { l: "Spend",  v: fmtC(aedTo(s.spend, currency), currency), c: "text-primary" },
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

// ── Direct ad preview modal — data already loaded, instant display ─────────────
function DirectAdPreviewModal({ ad, currency, onClose }: { ad: MetaTopAd; currency: string; onClose: () => void }) {
  const modal = (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 99999 }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-background rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden"
        style={{ width: "min(520px, 96vw)", maxHeight: "88vh", zIndex: 1 }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border/50 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${ad.status === "ACTIVE" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>{ad.status}</span>
              {ad.isVideo && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">VIDEO</span>}
            </div>
            <p className="text-[14px] font-bold leading-tight" title={ad.name}>{ad.name}</p>
            {ad.leads > 0 && <p className="text-[11px] text-success font-semibold mt-0.5">{ad.leads.toLocaleString()} leads</p>}
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Thumbnail */}
        <div className="flex-1 overflow-y-auto">
          {ad.thumbnail ? (
            <div className="relative w-full bg-black" style={{ aspectRatio: "16/9" }}>
              <img src={ad.thumbnail} alt={ad.title || ad.name}
                className="w-full h-full object-cover"
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
              {ad.isVideo && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="h-16 w-16 rounded-full bg-black/50 flex items-center justify-center ring-2 ring-white/20">
                    <Play className="h-7 w-7 text-white ml-1" />
                  </div>
                </div>
              )}
              {ad.postUrl && (
                <a href={ad.postUrl} target="_blank" rel="noreferrer"
                  className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-black/65 hover:bg-primary text-white text-[10px] font-semibold px-3 py-1.5 rounded-full transition-colors">
                  <ExternalLink className="h-3 w-3" /> View on Facebook
                </a>
              )}
            </div>
          ) : (
            <div className="w-full flex flex-col items-center justify-center gap-3 bg-muted/30 py-14">
              <ImageOff className="h-12 w-12 text-muted-foreground/20" />
              <p className="text-[12px] text-muted-foreground/50">No thumbnail returned by Meta API</p>
              {ad.postUrl && (
                <a href={ad.postUrl} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 text-[12px] text-primary hover:underline font-medium">
                  <ExternalLink className="h-3.5 w-3.5" /> View on Facebook
                </a>
              )}
            </div>
          )}

          {/* Text content */}
          {(ad.title || ad.body) && (
            <div className="px-5 pt-4 pb-2">
              {ad.title && <p className="text-[13px] font-bold mb-1 leading-snug">{ad.title}</p>}
              {ad.body  && <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3">{ad.body}</p>}
              {ad.cta   && (
                <span className="inline-block mt-2 text-[9px] uppercase tracking-wide font-bold px-3 py-1 rounded-full bg-primary text-white">
                  {ad.cta.replace(/_/g, " ")}
                </span>
              )}
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-4 divide-x divide-border/40 border-t border-border/30 bg-muted/20 mt-2">
            {[
              { l: "Leads",  v: ad.leads > 0 ? ad.leads.toLocaleString() : "—",      c: ad.leads > 0 ? "text-success" : "" },
              { l: "Spend",  v: fmtC(aedTo(ad.spend, currency), currency),                              c: "text-primary" },
              { l: "Impr.",  v: fmtN(ad.impressions) },
              { l: "CTR",    v: `${ad.ctr.toFixed(2)}%` },
            ].map(s => (
              <div key={s.l} className="flex flex-col items-center py-3">
                <span className={`text-[16px] font-bold tabular-nums ${s.c ?? ""}`}>{s.v}</span>
                <span className="text-[8px] uppercase tracking-wide text-muted-foreground mt-0.5">{s.l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
  return createPortal(modal, document.body);
}

// ── Ad creative preview modal (opened from the "Top Ad Creatives" list) ──────
function AdCreativeModal({
  adName, accountIds, leads, currency, onClose,
}: {
  adName: string; accountIds: string[]; leads: number;
  currency: string; onClose: () => void;
}) {
  const { data: ads = [], isLoading } = useMetaAdsByName(adName, accountIds);

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

// SortableTH lives in a shared component so Marketing's channel table reuses it.
import { SortableTH } from "@/components/SortableTH";

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

// ── Main page ─────────────────────────────────────────────────────────────────
const MetaAds = () => {
  // Page-scoped date range — driven by the unified <SectionDateRange /> picker
  // at the top of the page (DashboardLayout mounts a per-page FilterProvider).
  const { dateRange } = useFilters();
  const queryClient = useQueryClient();
  // Per-Creative table view mode — toggles which columns are shown.
  // "performance" focuses on volume + cost-per-qualified (default).
  // "cost"        focuses on every cost-per metric (CPL/CPQL/CPP).
  // "reach"       focuses on Meta-side reach (impr/clicks/CTR).
  type CreativeView = "performance" | "cost" | "reach";
  const [creativeView, setCreativeView] = useState<CreativeView>("performance");
  // Per-Creative table user-controlled sort. null = use creativeView default.
  type SortKey = "spend" | "leads" | "qualified" | "cpql" | "cpp" | "impressions" | "clicks" | "ctr";
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const handleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };
  // Campaigns table sort. Default desc by spend.
  type CampSortKey = "spend" | "impressions" | "ctr" | "leads";
  const [campSortKey, setCampSortKey] = useState<CampSortKey>("spend");
  const [campSortDir, setCampSortDir] = useState<"asc" | "desc">("desc");
  const handleCampSort = (k: CampSortKey) => {
    if (campSortKey === k) setCampSortDir(d => d === "asc" ? "desc" : "asc");
    else { setCampSortKey(k); setCampSortDir("desc"); }
  };
  // Per-Creative table render-cap. Starts at 30 to keep render fast; user
  // can expand 20 at a time. All data is already in hand from the API,
  // so this is purely a UI knob — no extra fetches.
  const CREATIVES_INITIAL = 30;
  const CREATIVES_STEP    = 20;
  const [visibleCreatives, setVisibleCreatives] = useState(CREATIVES_INITIAL);
  // Display currency comes from the global toggle in the dashboard header.
  const { currency: displayCurrency, fromAED: toDisplay } = useCurrency();
  // metaDateRange now mirrors the page-scoped date filter (used to be a
  // separate rolling-X-days state). End-of-day on `to` so same-day data is
  // included.
  const metaDateRange = useMemo(() => {
    const to = new Date(dateRange.to);
    to.setHours(23, 59, 59, 999);
    return { from: dateRange.from, to };
  }, [dateRange]);

  // Both leads cards use metaDateRange so they respond to the 30D/90D/1Y buttons
  const { data, isLoading: leadsLoading } = useMetaLeadsStats(metaDateRange);

  const [tokenSet, setTokenSet] = useState(true);
  const { data: api, isLoading: apiLoading, error: apiError } = useMetaAdsApi(metaDateRange);
  const { data: zoho } = useZohoData();
  // Count Zoho leads sourced from Meta (Facebook + Instagram, since they're
  // merged into a single channel everywhere else in the dashboard), filtered
  // by the Meta-side date range.
  const zohoMetaLeads = useMemo(() => {
    if (!zoho?.rawLeads) return 0;
    const from = metaDateRange.from.getTime();
    const to   = metaDateRange.to.getTime();
    return zoho.rawLeads.filter(l => {
      const t = new Date(l.Created_Time).getTime();
      return t >= from && t <= to && displaySource(l.Lead_Source) === "Meta";
    }).length;
  }, [zoho?.rawLeads, metaDateRange]);
  const [previewCampaign, setPreviewCampaign] = useState<{ id: string; name: string } | null>(null);
  const [directPreviewAd, setDirectPreviewAd] = useState<MetaTopAd | null>(null);
  const [showAllActions, setShowAllActions] = useState(false);
  function handleTokenSaved() {
    setTokenSet(true);
    queryClient.invalidateQueries({ queryKey: ["meta-ads-api-v3"] });
  }

  // Format dates as YYYY-MM-DD in LOCAL time. toISOString().slice(0,10)
  // converts to UTC and rolls back a day for east-of-UTC users (UAE +4 etc.),
  // making "Year" send "2025-12-31" to Meta instead of "2026-01-01".
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const since    = ymd(metaDateRange.from);
  const until    = ymd(metaDateRange.to);
  const allAccountIds = api?.accounts?.map(a => a.id) ?? [];

  const { data: topAds = [], isLoading: topAdsLoading } = useMetaTopAds(allAccountIds, since, until);
  const { data: topAdsets = [] } = useMetaTopAdsets(allAccountIds, since, until);
  // Per-Adset table sort + render-cap
  type AdsetSortKey = "spend" | "impressions" | "clicks" | "ctr" | "leads";
  const [adsetSortKey, setAdsetSortKey] = useState<AdsetSortKey>("spend");
  const [adsetSortDir, setAdsetSortDir] = useState<"asc" | "desc">("desc");
  const handleAdsetSort = (k: AdsetSortKey) => {
    if (adsetSortKey === k) setAdsetSortDir(d => d === "asc" ? "desc" : "asc");
    else { setAdsetSortKey(k); setAdsetSortDir("desc"); }
  };
  const sortedAdsets = useMemo(() => {
    const sign = adsetSortDir === "asc" ? 1 : -1;
    const get = (a: typeof topAdsets[number]): number => {
      switch (adsetSortKey) {
        case "spend":       return a.spend;
        case "impressions": return a.impressions;
        case "clicks":      return a.clicks;
        case "ctr":         return a.ctr;
        case "leads":       return a.leads;
      }
    };
    return [...topAdsets].sort((a, b) => (get(a) - get(b)) * sign);
  }, [topAdsets, adsetSortKey, adsetSortDir]);
  const ADSETS_INITIAL = 20;
  const ADSETS_STEP    = 20;
  const [visibleAdsets, setVisibleAdsets] = useState(ADSETS_INITIAL);
  const summary  = api?.summary;
  // Meta returns AED amounts; we display in the user-selected currency.
  const currency = displayCurrency;
  const campaigns    = api?.campaigns    ?? [];
  const dailySeries  = api?.dailySeries  ?? [];
  const byAge        = api?.byAge        ?? [];
  const byPlatform   = api?.byPlatform   ?? [];
  const byPlacement  = api?.byPlacement  ?? [];
  const actions      = api?.actions      ?? [];
  const visibleActions = showAllActions ? actions : actions.slice(0, 8);

  // Register live Meta Ads data for the AI assistant
  useSetAIPageContext("Meta Ads", summary ? {
    spend:       summary.spend,
    impressions: summary.impressions,
    clicks:      summary.clicks,
    reach:       summary.reach,
    leads:       summary.leads,
    costPerLead: summary.costPerLead,
    ctr:         summary.ctr,
    frequency:   summary.frequency,
    cpm:         summary.cpm,
    currency:    "AED",
    dateRange:   `${since} → ${until}`,
    campaigns: campaigns.slice(0, 10).map(c => ({
      name: c.name, status: c.status, spend: c.spend,
      leads: c.leads, impressions: c.impressions, ctr: c.ctr,
    })),
    topAds: topAds.slice(0, 8).map(a => ({
      name: a.name, status: a.status, leads: a.leads,
      spend: a.spend, impressions: a.impressions, ctr: a.ctr,
    })),
    byPlatform: byPlatform.slice(0, 5).map(p => ({
      platform: p.platform, spend: p.spend, impressions: p.impressions,
    })),
    byAge: byAge.slice(0, 8),
    supabaseLeads: {
      total:      data?.total   ?? 0,
      withUtm:    data?.withUtm ?? 0,
      trackedPct: data?.total ? Math.round(((data?.withUtm ?? 0) / data.total) * 100) : 0,
    },
  } : undefined);

  // Supabase
  const total           = data?.total           ?? 0;
  const withUtm         = data?.withUtm         ?? 0;
  const byCreative      = data?.byCreative      ?? [];
  const byCampaign      = data?.byCampaign      ?? [];
  const byPlatformL     = data?.byPlatform      ?? [];
  const byLocation      = data?.byLocation      ?? [];
  const bySpeciality    = data?.bySpeciality    ?? [];
  const creativeFunnels = data?.creativeFunnels ?? [];
  const trackedPct      = total > 0 ? Math.round((withUtm / total) * 100) : 0;

  // Meta API doesn't return lead-action data for this account (their pixel
  // tracks `purchase`/`messaging`, not `lead*`), so c.leads on every campaign
  // is 0. Fill it in by matching campaign.name → meta_leads.utm_campaign.
  // utm_campaign in our form data is sometimes the Meta campaign ID and
  // sometimes a human slug, so we build TWO lookups: by raw id, by normalised
  // name. Whichever hits wins.
  const formLeadsByCampaign = useMemo(() => {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const byId   = new Map<string, number>();
    const byName = new Map<string, number>();
    for (const row of byCampaign) {
      const label = (row.label ?? "").trim();
      if (!label) continue;
      if (/^\d+$/.test(label)) byId.set(label, (byId.get(label) ?? 0) + row.count);
      const k = norm(label);
      if (k) byName.set(k, (byName.get(k) ?? 0) + row.count);
    }
    return (campaign: { id: string; name: string }): number => {
      return byId.get(campaign.id) ?? byName.get(norm(campaign.name)) ?? 0;
    };
  }, [byCampaign]);

  // Apply user-selected sort to the campaigns list. Effective leads = Meta API
  // leads if reported, else our form-side fallback.
  const sortedCampaigns = useMemo(() => {
    const sign = campSortDir === "asc" ? 1 : -1;
    const get = (c: typeof campaigns[number]): number => {
      switch (campSortKey) {
        case "spend":       return c.spend;
        case "impressions": return c.impressions;
        case "ctr":         return c.ctr;
        case "leads":       return c.leads > 0 ? c.leads : formLeadsByCampaign(c);
      }
    };
    return [...campaigns].sort((a, b) => (get(a) - get(b)) * sign);
  }, [campaigns, campSortKey, campSortDir, formLeadsByCampaign]);

  // ── Per-creative performance ──────────────────────────────────────────────
  // Joins Meta API ads (spend / impressions) with form-lead funnels keyed on
  // utm_content. We try TWO match strategies because utm_content can be either:
  //   (a) a Meta numeric ad ID like "120213355981040302" — match by ad.id exact
  //   (b) a human-readable slug like "RnP-Q4-vid01"      — match by normalised ad.name
  // Whichever strategy matches per ad wins.
  // Originally this was video-only, but Meta's `isVideo` flag is unreliable for
  // Reels, Instant Experiences, and dynamic creatives — so we now show every
  // creative and badge the ones we can confirm are video.
  const videoPerformance = useMemo(() => {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

    // Build BOTH lookups: exact (raw id) and normalised (slug match).
    const funnelById      = new Map<string, typeof creativeFunnels[number]>();
    const funnelByNameKey = new Map<string, typeof creativeFunnels[number]>();
    for (const f of creativeFunnels) {
      const raw = (f.creative ?? "").trim();
      if (!raw) continue;
      // utm_content that's all digits is almost always a Meta ad ID
      if (/^\d+$/.test(raw)) funnelById.set(raw, f);
      const k = norm(raw);
      if (k) funnelByNameKey.set(k, f);
    }

    // Every creative from Meta API — we no longer filter by isVideo here since
    // the flag is unreliable. The video badge in the rendered table marks the
    // ones we can confirm are video.
    const rows = topAds
      .map(ad => {
        // Try ID match first (utm_content is a numeric Meta ad ID), then name slug.
        const f = funnelById.get(ad.id) ?? funnelByNameKey.get(norm(ad.name));
        const formLeads = f?.total     ?? 0;
        const qualified = f?.qualified ?? 0;
        const placed    = f?.converted ?? 0;
        return {
          id:          ad.id,
          name:        ad.name,
          thumbnail:   ad.thumbnail,
          status:      ad.status,
          isVideo:     ad.isVideo,
          ad,
          spend:       ad.spend,
          impressions: ad.impressions,
          metaLeads:   ad.leads,
          formLeads,
          qualified,
          placed,
          cpql:        qualified > 0 ? ad.spend / qualified : 0,
          cpp:         placed    > 0 ? ad.spend / placed    : 0,
          qualRate:    formLeads > 0 ? (qualified / formLeads) * 100 : 0,
        };
      })
      // Drop creatives with no measurable activity at all.
      .filter(r => r.spend > 0 || r.formLeads > 0 || r.metaLeads > 0);

    // User-controlled sort takes precedence; otherwise fall back to a
    // sensible default for the active view mode.
    if (sortKey) {
      const sign = sortDir === "asc" ? 1 : -1;
      const getter = (r: typeof rows[number]): number => {
        switch (sortKey) {
          case "spend":       return r.spend;
          case "leads":       return r.formLeads;
          case "qualified":   return r.qualified;
          case "cpql":        return r.cpql > 0 ? r.cpql : (sortDir === "asc" ? Infinity : -Infinity);
          case "cpp":         return r.cpp  > 0 ? r.cpp  : (sortDir === "asc" ? Infinity : -Infinity);
          case "impressions": return r.impressions;
          case "clicks":      return r.ad.clicks;
          case "ctr":         return r.ad.ctr;
        }
      };
      rows.sort((a, b) => (getter(a) - getter(b)) * sign);
    } else if (creativeView === "cost") {
      // Lowest CPQL first; ads with no CPQL sink to the bottom.
      rows.sort((a, b) => {
        const av = a.cpql > 0 ? a.cpql : Infinity;
        const bv = b.cpql > 0 ? b.cpql : Infinity;
        if (av !== bv) return av - bv;
        return b.spend - a.spend;
      });
    } else if (creativeView === "reach") {
      rows.sort((a, b) =>
        b.impressions - a.impressions
        || b.ad.clicks - a.ad.clicks
        || b.spend - a.spend);
    } else {
      // performance (default): qualified count desc, then form leads, then spend.
      rows.sort((a, b) =>
        b.qualified - a.qualified
        || b.formLeads - a.formLeads
        || b.spend - a.spend);
    }

    return rows;
  }, [topAds, creativeFunnels, creativeView, sortKey, sortDir]);

  // ── Back-side content for each KPI flip card ──────────────────────────────
  const topCampBySpend = campaigns.slice(0, 5);
  const maxSpendCamp = topCampBySpend[0]?.spend ?? 1;
  const spendBack = (
    <div className="space-y-2">
      {topCampBySpend.map(c => (
        <div key={c.id}>
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] truncate max-w-[140px]">{c.name}</span>
            <span className="text-[10px] font-semibold text-primary tabular-nums">{fmtC(toDisplay(c.spend), currency)}</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full" style={{ width: `${(c.spend / maxSpendCamp) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );

  const topCampByImpr = campaigns.slice().sort((a, b) => b.impressions - a.impressions).slice(0, 5);
  const maxImprCamp = topCampByImpr[0]?.impressions ?? 1;
  const imprBack = (
    <div className="space-y-2">
      {topCampByImpr.length === 0
        ? <p className="text-[10px] text-muted-foreground">No data</p>
        : topCampByImpr.map(c => (
          <div key={c.id}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] truncate max-w-[140px]">{c.name}</span>
              <span className="text-[10px] font-semibold text-info tabular-nums">{fmtN(c.impressions)}</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-info rounded-full" style={{ width: `${(c.impressions / maxImprCamp) * 100}%` }} />
            </div>
          </div>
        ))}
    </div>
  );

  const topCampByReach = campaigns.slice().sort((a, b) => b.reach - a.reach).slice(0, 5);
  const maxReachCamp = topCampByReach[0]?.reach ?? 1;
  const reachBack = (
    <div className="space-y-2">
      {topCampByReach.length === 0
        ? <p className="text-[10px] text-muted-foreground">No data</p>
        : topCampByReach.map(c => (
          <div key={c.id}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] truncate max-w-[140px]">{c.name}</span>
              <span className="text-[10px] font-semibold text-success tabular-nums">{fmtN(c.reach)}</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-success rounded-full" style={{ width: `${(c.reach / maxReachCamp) * 100}%` }} />
            </div>
          </div>
        ))}
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

  const topCampByCpm = campaigns
    .filter(c => c.impressions > 0)
    .map(c => ({ ...c, cpm: (c.spend / c.impressions) * 1000 }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 5);
  const maxCpmSpend = topCampByCpm[0]?.spend ?? 1;
  const cpmBack = (
    <div className="space-y-2">
      {topCampByCpm.length === 0
        ? <p className="text-[10px] text-muted-foreground">No data</p>
        : topCampByCpm.map(c => (
          <div key={c.id}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] truncate max-w-[130px]">{c.name}</span>
              <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
                {fmtC(toDisplay(c.cpm), currency)} CPM
              </span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-muted-foreground/50 rounded-full" style={{ width: `${(c.spend / maxCpmSpend) * 100}%` }} />
            </div>
          </div>
        ))}
    </div>
  );

  const topCampByLeads = campaigns.filter(c => c.leads > 0).sort((a, b) => b.leads - a.leads).slice(0, 5);
  const maxLeads = topCampByLeads[0]?.leads ?? 1;
  const zohoMetaChannels = useMemo(() => {
    if (!zoho?.rawLeads) return [] as { channel: string; doctors: number }[];
    const from = metaDateRange.from.getTime();
    const to   = metaDateRange.to.getTime();
    const filtered = zoho.rawLeads.filter(l => {
      const t = new Date(l.Created_Time).getTime();
      const src = (l.Lead_Source ?? '').toLowerCase();
      return t >= from && t <= to && (src.includes('facebook') || src.includes('instagram') || src.includes('meta'));
    });
    const counts: Record<string, number> = {};
    for (const l of filtered) {
      const src = (l.Lead_Source ?? '').toLowerCase();
      const ch = src.includes('instagram') ? 'Instagram' : 'Facebook';
      counts[ch] = (counts[ch] ?? 0) + 1;
    }
    return Object.entries(counts).map(([channel, doctors]) => ({ channel, doctors }));
  }, [zoho?.rawLeads, metaDateRange]);
  const maxZohoLeads = Math.max(...zohoMetaChannels.map(c => c.doctors), 1);
  const leadsBack = (
    <div className="space-y-2">
      {topCampByLeads.length > 0
        ? topCampByLeads.map(c => (
          <div key={c.id}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] truncate max-w-[140px]">{c.name}</span>
              <span className="text-[10px] font-semibold text-success tabular-nums">{c.leads} leads</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-success rounded-full" style={{ width: `${(c.leads / maxLeads) * 100}%` }} />
            </div>
          </div>
        ))
        : zohoMetaChannels.length > 0
        ? <>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1">From Zoho CRM</p>
            {zohoMetaChannels.map(c => (
              <div key={c.channel}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px]">{c.channel}</span>
                  <span className="text-[10px] font-semibold text-success tabular-nums">{c.doctors} leads</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-success rounded-full" style={{ width: `${(c.doctors / maxZohoLeads) * 100}%` }} />
                </div>
              </div>
            ))}
          </>
        : <p className="text-[10px] text-muted-foreground">No lead data</p>
      }
    </div>
  );

  const topCampByCpc = campaigns
    .filter(c => c.clicks > 0 && c.spend > 0)
    .map(c => ({ ...c, cpc: c.spend / c.clicks }))
    .sort((a, b) => a.cpc - b.cpc)
    .slice(0, 5);
  const formLeadsBack = (
    <div className="space-y-2">
      {(data?.byCampaign ?? []).length > 0 ? (
        <>
          <p className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1">By campaign</p>
          {(data?.byCampaign ?? []).slice(0, 5).map(c => {
            const maxC = data!.byCampaign[0]?.count ?? 1;
            return (
              <div key={c.label}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] truncate max-w-[140px]">{c.label || "Unknown"}</span>
                  <span className="text-[10px] font-semibold text-orange-500 tabular-nums">{c.count}</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-orange-400 rounded-full" style={{ width: `${(c.count / maxC) * 100}%` }} />
                </div>
              </div>
            );
          })}
        </>
      ) : (data?.bySpeciality ?? []).length > 0 ? (
        <>
          <p className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1">By speciality</p>
          {(data?.bySpeciality ?? []).slice(0, 5).map(c => (
            <div key={c.label} className="flex items-center justify-between">
              <span className="text-[10px] truncate max-w-[150px]">{c.label}</span>
              <span className="text-[10px] font-semibold text-orange-500 tabular-nums">{c.count}</span>
            </div>
          ))}
        </>
      ) : (
        <p className="text-[10px] text-muted-foreground">No form data in Supabase yet</p>
      )}
    </div>
  );

  const cplBack = (
    <div className="space-y-2">
      <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Best cost-per-click by campaign</p>
      {topCampByCpc.length === 0
        ? <p className="text-[10px] text-muted-foreground">No data</p>
        : topCampByCpc.map(c => (
          <div key={c.id} className="flex items-center justify-between">
            <span className="text-[10px] truncate max-w-[150px]">{c.name}</span>
            <span className="text-[10px] font-semibold text-primary tabular-nums">{fmtC(toDisplay(c.cpc), currency)}</span>
          </div>
        ))}
    </div>
  );

  return (
    <DashboardLayout title="Meta Ads" subtitle="Live performance from Facebook Marketing API · Lead form data from Supabase">
      <SectionDateRange />

      {/* ══ Meta API section ══════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between mb-3 mt-2 gap-3 flex-wrap">
        <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/50">
          Live Ad Performance · Meta Marketing API
          <span className="ml-2 normal-case text-muted-foreground/80 font-normal tracking-normal">
            · {since} → {until}
          </span>
        </p>
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
              value={fmtC(toDisplay(summary?.spend ?? 0), currency)}
              sub={`${since} → ${until} · ${currency}`}
              back={spendBack}  backHeight={230} />
            <MetaKpiCard icon={Eye}          label="Impressions"    color="text-info"        bg="bg-info/10"
              value={fmtN(summary?.impressions ?? 0)}         sub="times ads were shown"          back={imprBack}   backHeight={200} />
            <MetaKpiCard icon={Users}        label="Reach"          color="text-success"     bg="bg-success/10"
              value={fmtN(summary?.reach ?? 0)}               sub="unique people"                 back={reachBack}  backHeight={240} />
            <MetaKpiCard icon={MousePointer} label="Link Clicks"    color="text-info"        bg="bg-info/10"
              value={fmtN(summary?.clicks ?? 0)}              sub={`${summary?.ctr ?? 0}% CTR`}  back={clicksBack} backHeight={200} />
            <MetaKpiCard icon={Repeat2}      label="Frequency"      color="text-warning"     bg="bg-warning/10"
              value={(summary?.frequency ?? 0).toFixed(2)}    sub="avg per person"                back={freqBack}   backHeight={180} />
            <MetaKpiCard icon={Hash}         label="CPM"            color="text-muted-foreground" bg="bg-muted"
              value={fmtC(toDisplay(summary?.cpm ?? 0), currency)}       sub="per 1,000 impressions"         back={cpmBack}    backHeight={230} />
            <MetaKpiCard icon={Zap}           label="Leads from Ads"   color="text-success"     bg="bg-success/10"
              value={fmtN((summary?.leads ?? 0) > 0 ? (summary?.leads ?? 0) : zohoMetaLeads)}
              sub={(summary?.leads ?? 0) > 0 ? "form submissions" : "via Zoho (Meta channel)"}
              back={leadsBack}  backHeight={220} />
            <MetaKpiCard icon={ClipboardList} label="Leads from Forms" color="text-orange-500" bg="bg-orange-50"
              value={fmtN(data?.total ?? 0)}
              sub={leadsLoading ? "loading…" : `${data?.withUtm ?? 0} tracked`}
              back={formLeadsBack} backHeight={220} />
            {/* Cost Per Lead lives in the cost-per-funnel section below alongside CPQL and CPP */}
          </div>

          {/* Cost-per-funnel KPIs — spend joined with meta_leads stage progression */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            {(() => {
              const adSpend          = summary?.spend ?? 0;
              const totalLeads       = data?.total          ?? 0;
              const qualifiedLeads   = data?.qualifiedCount ?? 0;
              // Conversions: a DoB record counts as a Meta conversion if its
              // Lead_Source resolves to Meta (Facebook / Instagram / Meta /
              // their placement variants). Zoho is the sole source of truth —
              // no meta_leads cross-references.
              const metaFromMs = metaDateRange.from.getTime();
              const metaToMs   = metaDateRange.to.getTime();
              const conversions = (zoho?.rawDoctorsOnBoard ?? []).filter(dob => {
                const t = dob.Created_Time ? new Date(dob.Created_Time).getTime() : NaN;
                if (isNaN(t) || t < metaFromMs || t > metaToMs) return false;
                return displaySource(dob.Lead_Source) === "Meta";
              }).length;
              const cpl = totalLeads     > 0 ? adSpend / totalLeads     : 0;
              const cpq = qualifiedLeads > 0 ? adSpend / qualifiedLeads : 0;
              const cpc = conversions    > 0 ? adSpend / conversions    : 0;
              return (
                <>
                  <MetaKpiCard
                    icon={Target} label="Cost Per Lead (forms)" color="text-orange-600" bg="bg-orange-50"
                    value={cpl > 0 ? fmtC(toDisplay(cpl), currency) : "—"}
                    sub={cpl > 0 ? `${fmtC(toDisplay(adSpend), currency)} / ${fmtN(totalLeads)} leads` : "no form leads in period"}
                    back={
                      <div className="space-y-2 text-[11px]">
                        <div className="flex justify-between"><span className="text-muted-foreground">Ad spend</span><span className="font-semibold tabular-nums">{fmtC(toDisplay(adSpend), currency)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Form leads</span><span className="font-semibold tabular-nums">{fmtN(totalLeads)}</span></div>
                        <div className="pt-2 border-t border-border/40 flex justify-between">
                          <span className="font-semibold">Cost / lead</span>
                          <span className="font-bold tabular-nums text-orange-600">{cpl > 0 ? fmtC(toDisplay(cpl), currency) : "—"}</span>
                        </div>
                      </div>
                    } backHeight={170}
                  />
                  <MetaKpiCard
                    icon={Zap} label="Cost Per Qualified" color="text-emerald-600" bg="bg-emerald-50"
                    value={cpq > 0 ? fmtC(toDisplay(cpq), currency) : "—"}
                    sub={cpq > 0 ? `${fmtN(qualifiedLeads)} qualified · ${totalLeads > 0 ? Math.round((qualifiedLeads / totalLeads) * 100) : 0}% rate` : "no qualified leads in period"}
                    back={
                      <div className="space-y-2 text-[11px]">
                        <p className="text-muted-foreground">Qualified = lead's <strong>stage</strong> is "Initial Sales Call Completed" or "High Priority Follow up". "Contact in Future" is excluded — that's a deferred conversation, not a qualification.</p>
                        <div className="pt-2 border-t border-border/40 space-y-1">
                          <div className="flex justify-between"><span className="text-muted-foreground">Ad spend</span><span className="font-semibold tabular-nums">{fmtC(toDisplay(adSpend), currency)}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Qualified</span><span className="font-semibold tabular-nums">{fmtN(qualifiedLeads)}</span></div>
                          <div className="flex justify-between"><span className="font-semibold">Cost / qualified</span><span className="font-bold tabular-nums text-emerald-600">{cpq > 0 ? fmtC(toDisplay(cpq), currency) : "—"}</span></div>
                        </div>
                      </div>
                    } backHeight={220}
                  />
                  <MetaKpiCard
                    icon={Award} label="Cost per Conversion" color="text-violet-600" bg="bg-violet-50"
                    value={cpc > 0 ? fmtC(toDisplay(cpc), currency) : "—"}
                    sub={cpc > 0 ? `${fmtN(conversions)} converted (Doctors on Board)` : "no conversions in period"}
                    back={
                      <div className="space-y-2 text-[11px]">
                        <p className="text-muted-foreground">Conversion = a row in the Zoho <strong>Doctors on Board</strong> module whose <code>Lead_Source</code> resolves to Meta (Facebook / Instagram / placement variants). Zoho is the sole source — no form-side cross-references.</p>
                        <div className="pt-2 border-t border-border/40 space-y-1">
                          <div className="flex justify-between"><span className="text-muted-foreground">Ad spend</span><span className="font-semibold tabular-nums">{fmtC(toDisplay(adSpend), currency)}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Conversions</span><span className="font-semibold tabular-nums">{fmtN(conversions)}</span></div>
                          <div className="flex justify-between"><span className="font-semibold">Cost / conversion</span><span className="font-bold tabular-nums text-violet-600">{cpc > 0 ? fmtC(toDisplay(cpc), currency) : "—"}</span></div>
                        </div>
                      </div>
                    } backHeight={220}
                  />
                </>
              );
            })()}
          </div>

          {/* Top Campaigns — most qualified / lowest CPQL / lowest cost per conversion */}
          <CampaignWinnerCards />

          {/* Account chips */}
          {(api?.accounts?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {api!.accounts.map(acc => (
                <div key={acc.id} className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/40 px-3 py-1.5 text-[10px]">
                  <span className="h-1.5 w-1.5 rounded-full bg-success shrink-0" />
                  <span className="font-medium">{acc.name}</span>
                  {acc.amountSpent > 0 && <span className="text-muted-foreground">· {fmtC(toDisplay(acc.amountSpent), currency)} all-time (since account opened)</span>}
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
                    <YAxis yAxisId="s" orientation="left"  fontSize={9} tickLine={false} axisLine={false} tickFormatter={v => fmtC(toDisplay(v), currency)} width={65} />
                    <YAxis yAxisId="c" orientation="right" fontSize={9} tickLine={false} axisLine={false} tickFormatter={v => fmtN(v)} width={42} />
                    <Tooltip contentStyle={tip} formatter={(v: number, name: string) => name === "Spend" ? [fmtC(toDisplay(v), currency), name] : [fmtN(v), name]} />
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
                              <span className="font-semibold text-foreground">{fmtC(toDisplay(p.spend), currency)}</span>
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

          {/* ── Per-Creative Performance ──────────────────────────────── */}
          {/* Joins Meta API ads (spend) with form-lead funnels by ad name ↔ utm_content,
              then surfaces qualified + placement counts and the cost-per metrics
              (CPQL / cost per placement) per creative. Video ads are badged. */}
          {videoPerformance.length > 0 && (
            <Card className="mb-4 shadow-md border-border/60">
              <CardHeader className="pb-2 pt-4 px-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <CardTitle className="text-[14px] font-semibold text-foreground">Per-Creative Performance</CardTitle>
                    <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                      Spend from Meta API · qualified/placed from Zoho via utm_content match · click any column to sort
                    </p>
                  </div>
                  {/* View-mode toggle — swaps which columns are shown */}
                  <div className="inline-flex rounded-md border border-border/60 overflow-hidden text-[10px] font-medium shrink-0">
                    {([
                      { v: "performance", label: "Performance" },
                      { v: "cost",        label: "Cost-per" },
                      { v: "reach",       label: "Reach" },
                    ] as const).map(opt => (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() => setCreativeView(opt.v)}
                        className={`px-3 py-1 transition-colors ${
                          creativeView === opt.v ? "bg-primary text-white" : "bg-card text-muted-foreground hover:bg-muted/40"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-0 pb-3 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-muted/40 border-y border-border/60">
                    <tr>
                      <th className="py-3 px-3 text-[12px] font-semibold text-muted-foreground uppercase tracking-wide w-8">#</th>
                      <th className="py-3 px-3 text-[12px] font-semibold text-muted-foreground uppercase tracking-wide w-12">Ad</th>
                      <th className="py-3 px-3 text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                      <SortableTH sortKey="spend" current={sortKey} dir={sortDir} onSort={handleSort} size="md"
                        info={{ meaning: "Meta Ads spend on this creative in the period.", source: "Meta Marketing API." }}>
                        Spend
                      </SortableTH>

                      {/* Performance view: Leads → Qualified → CPQL */}
                      {creativeView === "performance" && <>
                        <SortableTH sortKey="leads" current={sortKey} dir={sortDir} onSort={handleSort} size="md"
                          info={{ meaning: "Form leads matched to this creative by ad-id or ad-name ↔ utm_content.", source: "Supabase meta_leads." }}>
                          Leads
                        </SortableTH>
                        <SortableTH sortKey="qualified" current={sortKey} dir={sortDir} onSort={handleSort} size="md"
                          info={{ meaning: 'How many of those leads reached qualified status. "Contact in Future" excluded.', source: "meta_leads × Zoho Lead_Status." }}>
                          Qualified
                        </SortableTH>
                        <SortableTH sortKey="cpql" current={sortKey} dir={sortDir} onSort={handleSort} size="md"
                          info={{ meaning: "Cost per Qualified Lead = Meta spend ÷ qualified leads for this creative.", source: "Meta API + Zoho." }}>
                          CPQL
                        </SortableTH>
                      </>}

                      {/* Cost view: CPL → CPQL → Cost / Conversion */}
                      {creativeView === "cost" && <>
                        <SortableTH sortKey="leads" current={sortKey} dir={sortDir} onSort={handleSort} size="md"
                          info={{ meaning: "Meta spend ÷ form leads for this creative. Sort by lead volume.", source: "Meta API + Supabase meta_leads." }}>
                          Cost / Lead
                        </SortableTH>
                        <SortableTH sortKey="cpql" current={sortKey} dir={sortDir} onSort={handleSort} size="md"
                          info={{ meaning: "Cost per Qualified Lead = Meta spend ÷ qualified leads for this creative.", source: "Meta API + Zoho Lead_Status." }}>
                          CPQL
                        </SortableTH>
                        <SortableTH sortKey="cpp" current={sortKey} dir={sortDir} onSort={handleSort} size="md"
                          info={{ meaning: "Meta spend ÷ conversions for this creative.", source: "Meta API + Zoho Doctors on Board." }}>
                          Cost / Conversion
                        </SortableTH>
                      </>}

                      {/* Reach view: Impressions → Clicks → CTR */}
                      {creativeView === "reach" && <>
                        <SortableTH sortKey="impressions" current={sortKey} dir={sortDir} onSort={handleSort} size="md"
                          info={{ meaning: "Times this creative was shown in the period.", source: "Meta Marketing API." }}>
                          Impressions
                        </SortableTH>
                        <SortableTH sortKey="clicks" current={sortKey} dir={sortDir} onSort={handleSort} size="md"
                          info={{ meaning: "Link clicks on this creative.", source: "Meta Marketing API." }}>
                          Clicks
                        </SortableTH>
                        <SortableTH sortKey="ctr" current={sortKey} dir={sortDir} onSort={handleSort} size="md"
                          info={{ meaning: "Click-through rate = clicks ÷ impressions.", source: "Meta Marketing API." }}>
                          CTR
                        </SortableTH>
                      </>}

                      <th className="py-3 px-3 text-[12px] font-semibold text-muted-foreground uppercase tracking-wide text-center">Preview</th>
                    </tr>
                  </thead>
                  <LayoutGroup>
                  <motion.tbody layout>
                    {videoPerformance.slice(0, visibleCreatives).map((v, i) => (
                      <motion.tr
                        key={v.id}
                        layout
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                        className="border-b border-border/30 hover:bg-muted/30"
                      >
                        <motion.td layout="position" className="py-3 px-3 text-[12px] text-muted-foreground tabular-nums">{i + 1}</motion.td>
                        <td className="py-3 px-3">
                          {v.thumbnail ? (
                            <div className="relative h-9 w-14 rounded overflow-hidden bg-muted shrink-0">
                              <img src={v.thumbnail} alt="" className="h-full w-full object-cover" />
                              {v.isVideo && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                  <Play className="h-3 w-3 text-white" />
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="h-9 w-14 rounded bg-muted/50 flex items-center justify-center">
                              <ImageOff className="h-3.5 w-3.5 text-muted-foreground/30" />
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${v.status === "ACTIVE" ? "bg-success" : "bg-muted-foreground/30"}`} />
                            <span className="text-[13px] font-semibold truncate max-w-[260px]" title={v.name}>{v.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right text-[13px] font-bold tabular-nums text-blue-700">
                          {v.spend > 0 ? fmtC(toDisplay(v.spend), currency) : <span className="text-muted-foreground/40 font-normal">—</span>}
                        </td>

                        {/* Performance: Leads / Qualified / CPQL */}
                        {creativeView === "performance" && <>
                          <td className="py-3 px-3 text-right text-[13px] tabular-nums text-foreground/90 font-semibold">
                            {v.formLeads > 0 ? v.formLeads.toLocaleString() : <span className="text-muted-foreground/40 font-normal">—</span>}
                          </td>
                          <td className="py-3 px-3 text-right text-[13px] tabular-nums">
                            {v.qualified > 0 ? (
                              <>
                                <span className="font-bold text-emerald-700">{v.qualified.toLocaleString()}</span>
                                <span className="text-[11px] font-normal text-muted-foreground ml-1.5">({v.qualRate.toFixed(0)}%)</span>
                              </>
                            ) : <span className="text-muted-foreground/40">—</span>}
                          </td>
                          <td className="py-3 px-3 text-right text-[13px] font-semibold tabular-nums text-orange-700">
                            {v.cpql > 0 ? fmtC(toDisplay(v.cpql), currency) : <span className="text-muted-foreground/40 font-normal">—</span>}
                          </td>
                        </>}

                        {/* Cost: CPL / CPQL / CPP */}
                        {creativeView === "cost" && <>
                          <td className="py-3 px-3 text-right text-[13px] font-semibold tabular-nums text-orange-700">
                            {(v.spend > 0 && v.formLeads > 0)
                              ? fmtC(toDisplay(v.spend / v.formLeads), currency)
                              : <span className="text-muted-foreground/40 font-normal">—</span>}
                          </td>
                          <td className="py-3 px-3 text-right text-[13px] font-semibold tabular-nums text-orange-700">
                            {v.cpql > 0 ? fmtC(toDisplay(v.cpql), currency) : <span className="text-muted-foreground/40 font-normal">—</span>}
                          </td>
                          <td className="py-3 px-3 text-right text-[13px] font-semibold tabular-nums text-violet-700">
                            {v.cpp > 0 ? fmtC(toDisplay(v.cpp), currency) : <span className="text-muted-foreground/40 font-normal">—</span>}
                          </td>
                        </>}

                        {/* Reach: Impressions / Clicks / CTR */}
                        {creativeView === "reach" && <>
                          <td className="py-3 px-3 text-right text-[12px] text-foreground/80 tabular-nums">
                            {v.impressions > 0 ? fmtN(v.impressions) : <span className="text-muted-foreground/40">—</span>}
                          </td>
                          <td className="py-3 px-3 text-right text-[12px] tabular-nums text-foreground/80">
                            {v.ad.clicks > 0 ? fmtN(v.ad.clicks) : <span className="text-muted-foreground/40">—</span>}
                          </td>
                          <td className="py-3 px-3 text-right text-[12px] tabular-nums text-violet-700 font-semibold">
                            {v.ad.ctr > 0 ? `${v.ad.ctr.toFixed(2)}%` : <span className="text-muted-foreground/40 font-normal">—</span>}
                          </td>
                        </>}

                        <td className="py-3 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => setDirectPreviewAd(v.ad)}
                            className="inline-flex items-center gap-1 rounded-lg bg-primary/10 hover:bg-primary hover:text-white text-primary px-2.5 py-1 text-[10px] font-semibold transition-colors"
                          >
                            <Play className="h-2.5 w-2.5" /> Preview
                          </button>
                        </td>
                      </motion.tr>
                    ))}
                  </motion.tbody>
                  </LayoutGroup>
                </table>
                {videoPerformance.length > visibleCreatives && (
                  <div className="flex flex-col items-center gap-1 px-4 pt-3 pb-1">
                    <button
                      type="button"
                      onClick={() => setVisibleCreatives(n => n + CREATIVES_STEP)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 hover:bg-primary hover:text-white text-primary px-3 py-1.5 text-[11px] font-semibold transition-colors"
                    >
                      <ChevronDown className="h-3 w-3" />
                      Show {Math.min(CREATIVES_STEP, videoPerformance.length - visibleCreatives)} more
                    </button>
                    <span className="text-[9px] text-muted-foreground/60">
                      Showing {visibleCreatives} of {videoPerformance.length} creatives — already loaded, no extra API call
                    </span>
                  </div>
                )}
                {videoPerformance.length > CREATIVES_INITIAL && visibleCreatives > CREATIVES_INITIAL && (
                  <div className="flex justify-center px-4 pt-1 pb-1">
                    <button
                      type="button"
                      onClick={() => setVisibleCreatives(CREATIVES_INITIAL)}
                      className="text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors"
                    >
                      Collapse to top {CREATIVES_INITIAL}
                    </button>
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground px-4 pt-2 pb-1">
                  Match is by Meta ad ID or normalised ad-name ↔ <code>utm_content</code>. A creative with no match shows "—" for leads/qualified.
                </p>
              </CardContent>
            </Card>
          )}

          {/* ── Per-Adset Performance ──────────────────────────────────
              One row per ad set (a level above ads, below campaign) with
              spend / impressions / clicks / CTR / leads. Sortable + animated
              + same shape as the per-creative table. */}
          {topAdsets.length > 0 && (
            <Card className="mb-4 shadow-md border-border/60">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-[14px] font-semibold text-foreground">Per-Adset Performance</CardTitle>
                <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                  Spend &amp; reach per ad set · sorted by spend by default · click any column to sort
                </p>
              </CardHeader>
              <CardContent className="px-0 pb-3 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-muted/40 border-y border-border/60">
                    <tr>
                      <th className="py-3 px-3 text-[12px] font-semibold text-muted-foreground uppercase tracking-wide w-8">#</th>
                      <th className="py-3 px-3 text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">Adset · Campaign</th>
                      <SortableTH sortKey="spend" current={adsetSortKey} dir={adsetSortDir} onSort={handleAdsetSort} size="md"
                        info={{ meaning: "Total Meta Ads spend on this ad set in the period.", source: "Meta Marketing API." }}>
                        Spend
                      </SortableTH>
                      <SortableTH sortKey="impressions" current={adsetSortKey} dir={adsetSortDir} onSort={handleAdsetSort} size="md"
                        info={{ meaning: "Times any ad in this set was shown.", source: "Meta Marketing API." }}>
                        Impr.
                      </SortableTH>
                      <SortableTH sortKey="clicks" current={adsetSortKey} dir={adsetSortDir} onSort={handleAdsetSort} size="md"
                        info={{ meaning: "Link clicks on ads in this set.", source: "Meta Marketing API." }}>
                        Clicks
                      </SortableTH>
                      <SortableTH sortKey="ctr" current={adsetSortKey} dir={adsetSortDir} onSort={handleAdsetSort} size="md"
                        info={{ meaning: "Click-through rate = clicks ÷ impressions.", source: "Meta Marketing API." }}>
                        CTR
                      </SortableTH>
                      <SortableTH sortKey="leads" current={adsetSortKey} dir={adsetSortDir} onSort={handleAdsetSort} size="md"
                        info={{ meaning: "Lead actions Meta attributed to this ad set's ads.", source: "Meta Marketing API." }}>
                        Leads
                      </SortableTH>
                    </tr>
                  </thead>
                  <LayoutGroup>
                    <motion.tbody layout>
                      {sortedAdsets.slice(0, visibleAdsets).map((s, i) => (
                        <motion.tr
                          key={s.id}
                          layout
                          transition={{ type: "spring", stiffness: 380, damping: 32 }}
                          className="border-b border-border/30 hover:bg-muted/30"
                        >
                          <motion.td layout="position" className="py-3 px-3 text-[12px] text-muted-foreground tabular-nums">{i + 1}</motion.td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5">
                              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${s.status === "ACTIVE" ? "bg-success" : "bg-muted-foreground/30"}`} />
                              <span className="text-[13px] font-semibold truncate max-w-[260px]" title={s.name}>{s.name}</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground truncate max-w-[260px] ml-3.5" title={s.campaignName}>{s.campaignName}</p>
                          </td>
                          <td className="py-3 px-3 text-right text-[13px] font-bold tabular-nums text-blue-700">
                            {s.spend > 0 ? fmtC(toDisplay(s.spend), currency) : <span className="text-muted-foreground/40 font-normal">—</span>}
                          </td>
                          <td className="py-3 px-3 text-right text-[12px] tabular-nums text-foreground/80">
                            {s.impressions > 0 ? fmtN(s.impressions) : <span className="text-muted-foreground/40">—</span>}
                          </td>
                          <td className="py-3 px-3 text-right text-[12px] tabular-nums text-foreground/80">
                            {s.clicks > 0 ? fmtN(s.clicks) : <span className="text-muted-foreground/40">—</span>}
                          </td>
                          <td className="py-3 px-3 text-right text-[12px] tabular-nums text-violet-700 font-semibold">
                            {s.ctr > 0 ? `${s.ctr.toFixed(2)}%` : <span className="text-muted-foreground/40 font-normal">—</span>}
                          </td>
                          <td className="py-3 px-3 text-right text-[13px] font-bold tabular-nums text-emerald-700">
                            {s.leads > 0 ? fmtN(s.leads) : <span className="text-muted-foreground/40 font-normal">—</span>}
                          </td>
                        </motion.tr>
                      ))}
                    </motion.tbody>
                  </LayoutGroup>
                </table>
                {sortedAdsets.length > visibleAdsets && (
                  <div className="flex flex-col items-center gap-1 px-4 pt-3 pb-1">
                    <button
                      type="button"
                      onClick={() => setVisibleAdsets(n => n + ADSETS_STEP)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 hover:bg-primary hover:text-white text-primary px-3 py-1.5 text-[11px] font-semibold transition-colors"
                    >
                      <ChevronDown className="h-3 w-3" />
                      Show {Math.min(ADSETS_STEP, sortedAdsets.length - visibleAdsets)} more
                    </button>
                    <span className="text-[9px] text-muted-foreground/60">
                      Showing {visibleAdsets} of {sortedAdsets.length} ad sets
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Campaigns — with big "View Ads" button */}
          {campaigns.length > 0 && (
            <Card className="mb-4 shadow-md border-border/60">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-[14px] font-semibold text-foreground">
                  Campaigns
                  <span className="ml-2 text-[11px] font-normal text-muted-foreground/70">· click <Play className="h-2.5 w-2.5 inline" /> to preview ads</span>
                </CardTitle>
                <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                  Total spend, reach &amp; lead attribution per campaign · click any column to sort
                </p>
              </CardHeader>
              <CardContent className="px-0 pb-3 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-muted/40 border-y border-border/60">
                    <tr>
                      <th className="py-3 px-3 text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">Campaign</th>
                      <th className="py-3 px-3 text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">Objective</th>
                      <SortableTH sortKey="spend" current={campSortKey} dir={campSortDir} onSort={handleCampSort} size="md"
                        info={{ meaning: "Total Meta Ads spend on this campaign in the period.", source: "Meta Marketing API." }}>
                        Spend
                      </SortableTH>
                      <SortableTH sortKey="impressions" current={campSortKey} dir={campSortDir} onSort={handleCampSort} size="md"
                        info={{ meaning: "Times any ad in this campaign was shown.", source: "Meta Marketing API." }}>
                        Impr.
                      </SortableTH>
                      <SortableTH sortKey="ctr" current={campSortKey} dir={campSortDir} onSort={handleCampSort} size="md"
                        info={{ meaning: "Click-through rate = clicks ÷ impressions.", source: "Meta Marketing API." }}>
                        CTR
                      </SortableTH>
                      <SortableTH sortKey="leads" current={campSortKey} dir={campSortDir} onSort={handleCampSort} size="md"
                        info={{ meaning: "Form leads attributed to this campaign. Meta API first; falls back to meta_leads.utm_campaign join when API returns no lead actions (marked *).", source: "Meta API + Supabase meta_leads." }}>
                        Leads
                      </SortableTH>
                      <th className="py-3 px-3 text-[12px] font-semibold text-muted-foreground uppercase tracking-wide text-center">Preview</th>
                    </tr>
                  </thead>
                  <LayoutGroup>
                  <motion.tbody layout>
                    {sortedCampaigns.map(c => {
                      const formLeads = formLeadsByCampaign(c);
                      // Meta API leads first; fall back to form-side count.
                      const displayLeads = c.leads > 0 ? c.leads : formLeads;
                      const fromForms = c.leads === 0 && formLeads > 0;
                      return (
                      <motion.tr
                        key={c.id}
                        layout
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                        className="border-b border-border/30 hover:bg-muted/30"
                      >
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${c.status === "ACTIVE" ? "bg-success" : "bg-muted-foreground/40"}`} />
                            <span className="text-[13px] font-semibold truncate max-w-[260px]" title={c.name}>{c.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-[11px] text-muted-foreground capitalize">{c.objective.toLowerCase()}</td>
                        <td className="py-3 px-3 text-right text-[13px] font-bold tabular-nums text-blue-700">{fmtC(toDisplay(c.spend), currency)}</td>
                        <td className="py-3 px-3 text-right text-[12px] tabular-nums text-foreground/80">{fmtN(c.impressions)}</td>
                        <td className="py-3 px-3 text-right text-[12px] tabular-nums text-violet-700 font-semibold">{c.ctr.toFixed(2)}%</td>
                        <td className="py-3 px-3 text-right text-[13px] tabular-nums font-bold text-emerald-700">
                          {displayLeads > 0 ? (
                            <span title={fromForms ? "Sourced from form submissions (Meta API didn't report lead actions for this campaign)" : "Sourced from Meta API"}>
                              {displayLeads}
                              {fromForms && <span className="ml-0.5 text-[8px] text-muted-foreground/60 font-normal">*</span>}
                            </span>
                          ) : <span className="text-muted-foreground/40 font-normal">—</span>}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => setPreviewCampaign({ id: c.id, name: c.name })}
                            className="inline-flex items-center gap-1 rounded-lg bg-primary/10 hover:bg-primary hover:text-white text-primary px-2.5 py-1 text-[10px] font-semibold transition-colors"
                          >
                            <Play className="h-2.5 w-2.5" />
                            View Ads
                          </button>
                        </td>
                      </motion.tr>
                      );
                    })}
                  </motion.tbody>
                  </LayoutGroup>
                </table>
                <p className="text-[10px] text-muted-foreground/70 px-4 pt-2 pb-1">
                  <span className="text-[8px] align-text-top">*</span> Lead count from form submissions matched to this campaign — Meta API didn't return lead-action data, so we joined <code>meta_leads.utm_campaign</code> ↔ campaign name/id.
                </p>
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
                          <span className="text-[10px] text-muted-foreground tabular-nums w-20 text-right shrink-0">{fmtC(toDisplay(a.costPerAction), currency)} / action</span>
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

      {/* Direct ad preview — data already loaded, instant */}
      {directPreviewAd && (
        <DirectAdPreviewModal
          ad={directPreviewAd}
          currency={currency}
          onClose={() => setDirectPreviewAd(null)}
        />
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


    </DashboardLayout>
  );
};

export default MetaAds;
