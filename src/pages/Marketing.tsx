import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { SectionDateRange } from "@/components/SectionDateRange";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, LabelList,
} from "recharts";
import { InfoIcon } from "@/components/InfoIcon";
import { User, ArrowLeft, X } from "lucide-react";
import { ChannelIcon } from "@/components/ChannelIcon";
import { motion, LayoutGroup } from "framer-motion";
import { SortableTH } from "@/components/SortableTH";
import { WinnerCard } from "@/components/ChannelEconomics";
import { REVENUE_PER_CONVERSION_AED } from "@/lib/revenue";
import { SpendAllocationChart } from "@/components/SpendAllocationChart";
import { useZohoData, displaySource } from "@/hooks/use-zoho-data";
import { useChannelEconomics } from "@/hooks/use-channel-economics";
import { useMarketingExpenses } from "@/hooks/use-marketing-expenses";
import { useMetaAdsApi } from "@/hooks/use-meta-ads-api";
import { useMetaLeadsStats } from "@/hooks/use-meta-leads-stats";
import { useCurrency } from "@/lib/CurrencyProvider";
import { normalizeChannelKey } from "@/lib/channel-mapping";
import { useFilters } from "@/lib/filters";
import { Link } from "react-router-dom";
import { useMemo, useState } from "react";

const tip = {
  backgroundColor: "#fff",
  border: "1px solid hsl(220,14%,90%)",
  borderRadius: "8px",
  fontSize: "11px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  padding: "8px 12px",
};


const Marketing = () => {
  const { data: zoho } = useZohoData();
  const { dateRange } = useFilters();
  const { fmt: fmtMoney } = useCurrency();
  // Date-windowed spend per normalized channel key — drives cost-per metrics
  // on each channel card. Channels with no spend in the period get "—".
  const channelEconomics = useChannelEconomics();
  const spendByChannel = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of channelEconomics) m.set(r.channel, r.spend);
    return m;
  }, [channelEconomics]);
  // Raw expense categories — drives the SpendAllocationChart so the user
  // sees every line item from `marketing_expenses` (DILO, Brand Photoshoot,
  // etc.), not the channel-mapped buckets the table uses.
  const { byCategory: expenseCategories } = useMarketingExpenses();

  // For the Meta channel specifically, source spend from the Meta API and
  // qualified count from meta_leads (form submissions) — same data the Meta
  // Ads page uses, so the two pages agree on Meta numbers.
  const { data: metaApi }   = useMetaAdsApi(dateRange);
  const { data: metaStats } = useMetaLeadsStats(dateRange);
  const metaApiSpend        = metaApi?.summary?.spend ?? null;        // AED, may be 0 outside window
  const metaFormQualified   = metaStats?.qualifiedCount ?? null;      // form-side qualified count

  const marketing = useMemo(() => {
    if (!zoho?.rawLeads) return [];
    const fromMs = dateRange.from.getTime();
    const toMs   = dateRange.to.getTime() + 86_400_000;
    const recentLeads = zoho.rawLeads.filter(l => {
      const t = new Date(l.Created_Time).getTime();
      return t >= fromMs && t < toMs;
    });

    const leadsByChannel:        Record<string, number> = {};
    const activeByChannel:       Record<string, number> = {};
    const contactedByChannel:    Record<string, number> = {};
    const qualifiedByChannel:    Record<string, number> = {};
    const convertedByChannel:    Record<string, number> = {};

    // "Contacted" = anything past Not Contacted.
    // "Qualified" = passed Initial Sales Call (lead-status based).
    // "Converted" = a row in `Doctors on Board` for this channel — single
    // source of truth, NOT derived from Lead_Status.
    const activeStatuses = new Set([
      'Not Contacted', 'Attempted to Contact', 'Initial Sales Call Completed',
      'Contact in Future', 'High Priority Follow up',
    ]);
    const qualifiedStatuses = new Set([
      'Initial Sales Call Completed', 'High Priority Follow up',
    ]);

    for (const l of recentLeads) {
      const ch = displaySource(l.Lead_Source);
      leadsByChannel[ch] = (leadsByChannel[ch] ?? 0) + 1;
      if (activeStatuses.has(l.Lead_Status)) {
        activeByChannel[ch] = (activeByChannel[ch] ?? 0) + 1;
      }
      if (l.Lead_Status && l.Lead_Status !== 'Not Contacted') {
        contactedByChannel[ch] = (contactedByChannel[ch] ?? 0) + 1;
      }
      if (qualifiedStatuses.has(l.Lead_Status)) {
        qualifiedByChannel[ch] = (qualifiedByChannel[ch] ?? 0) + 1;
      }
    }

    // Conversions from Doctors on Board, attributed to channel via Lead_Source.
    for (const dob of zoho.rawDoctorsOnBoard ?? []) {
      const t = dob.Created_Time ? new Date(dob.Created_Time).getTime() : NaN;
      if (isNaN(t) || t < fromMs || t >= toMs) continue;
      const ch = displaySource(dob.Lead_Source);
      convertedByChannel[ch] = (convertedByChannel[ch] ?? 0) + 1;
    }

    // Union channel keys from BOTH leads and conversions — otherwise a channel
    // with recent DoB rows but only historical leads (e.g. Dave's old 432
    // leads + 2 recent conversions) silently drops out of the table because
    // leadsByChannel doesn't have it for the window.
    const allChannels = new Set<string>([
      ...Object.keys(leadsByChannel),
      ...Object.keys(convertedByChannel),
    ]);
    return Array.from(allChannels)
      .map(channel => {
        const rawLeads  = leadsByChannel[channel] ?? 0;
        const converted = convertedByChannel[channel] ?? 0;
        // Floor leads to converted — every DoB row is, by definition, a lead
        // that became a doctor. Channels like Dave where referrals enter
        // directly in the Contacts module (skipping the Leads module) would
        // otherwise show "0 leads · 2 converted" which reads as a math error.
        const doctors = Math.max(rawLeads, converted);
        return [channel, doctors] as const;
      })
      .sort((a, b) => b[1] - a[1])
      .map(([channel, doctors]) => {
        const active         = activeByChannel[channel] ?? 0;
        const contacted      = Math.max(contactedByChannel[channel] ?? 0, convertedByChannel[channel] ?? 0);
        const converted      = convertedByChannel[channel] ?? 0;
        // Qualified = leads with qualifying Lead_Status OR any DoB row attributed
        // to this channel. Anything in DoB is qualified by definition (it
        // progressed to placement), so floor qualified to ≥ converted.
        const qualified      = Math.max(qualifiedByChannel[channel] ?? 0, converted);
        const uncontacted    = (active > 0 ? active : doctors) - contacted;
        // All percentages use TOTAL leads as denominator so they're comparable.
        const contactRate    = doctors > 0 ? Math.round((contacted  / doctors) * 100) : 0;
        const qualifiedRate  = doctors > 0 ? Math.round((qualified  / doctors) * 100) : 0;
        const conversionRate = doctors > 0 ? Math.round((converted  / doctors) * 100) : 0;
        return { channel, doctors, contacted, uncontacted, qualified, converted, contactRate, qualifiedRate, conversionRate };
      });
  }, [zoho?.rawLeads, dateRange]);

  const bestChannel = marketing.length > 0
    ? marketing.reduce((a, b) => (a.doctors > b.doctors ? a : b))
    : null;

  // Hide low-volume channels (< 10 leads) AND the "Undefined" bucket by default
  // so the grid stays scannable. Two independent toggles let users opt in to
  // either group.
  const MIN_LEADS_THRESHOLD = 10;
  const [showAllChannels, setShowAllChannels] = useState(false);
  const [showUndefined,   setShowUndefined]   = useState(false);
  const visibleMarketing = useMemo(() => {
    return marketing.filter(c => {
      if (!showUndefined && c.channel === "Undefined") return false;
      if (!showAllChannels && c.doctors < MIN_LEADS_THRESHOLD) return false;
      return true;
    });
  }, [marketing, showAllChannels, showUndefined]);
  const undefinedRow         = marketing.find(c => c.channel === "Undefined");
  const undefinedLeads       = undefinedRow?.doctors ?? 0;
  const hiddenLowVolumeCount = marketing.filter(c => c.doctors < MIN_LEADS_THRESHOLD && c.channel !== "Undefined").length;

  // KPI card expand panel
  const [selectedKpiChannel, setSelectedKpiChannel] = useState<string | null>(null);

  // Channel table sort. (qualifiedRate / conversionRate are no longer standalone
  // columns — they're rendered inline with their counts to avoid the naming
  // collision between "Qual %" (qualified/leads) and "Lead Quality" (conv/qual).)
  type ChSortKey = "channel" | "leads" | "qualified" | "converted" | "quality" | "cpq" | "cpc";
  const [chSortKey, setChSortKey] = useState<ChSortKey>("converted");
  const [chSortDir, setChSortDir] = useState<"asc" | "desc">("desc");
  const handleChSort = (k: ChSortKey) => {
    if (chSortKey === k) setChSortDir(d => d === "asc" ? "desc" : "asc");
    else { setChSortKey(k); setChSortDir(k === "channel" ? "asc" : "desc"); }
  };
  // Enriched rows: marketing channel data + Meta overrides + cost-per metrics
  const channelRows = useMemo(() => {
    return visibleMarketing.map(ch => {
      const isMeta = ch.channel === "Meta";
      const spend = isMeta && metaApiSpend !== null
        ? metaApiSpend
        : (spendByChannel.get(normalizeChannelKey(ch.channel)) ?? 0);
      const qualified = isMeta && metaFormQualified !== null
        ? metaFormQualified
        : ch.qualified;
      const qualifiedRate = ch.doctors > 0 ? Math.round((qualified / ch.doctors) * 100) : ch.qualifiedRate;
      const cpq = qualified    > 0 && spend > 0 ? spend / qualified    : 0;
      const cpc = ch.converted > 0 && spend > 0 ? spend / ch.converted : 0;
      // Lead quality = share of QUALIFIED leads that converted. Same metric
      // the "Best Lead Quality" KPI card uses, so the two views agree.
      // Cap at 100% — rare cases (e.g. Dave) where DoB exceeds qualified
      // because leads bypass the qualified status entirely.
      const quality = qualified > 0
        ? Math.min(100, (ch.converted / qualified) * 100)
        : 0;
      return { ...ch, qualified, qualifiedRate, spend, cpq, cpc, quality };
    });
  }, [visibleMarketing, metaApiSpend, metaFormQualified, spendByChannel]);
  const sortedChannelRows = useMemo(() => {
    const sign = chSortDir === "asc" ? 1 : -1;
    // For cost columns, rows with no cost (0) go to the bottom regardless of dir.
    const get = (r: typeof channelRows[number]): number | string => {
      switch (chSortKey) {
        case "channel":   return r.channel;
        case "leads":     return r.doctors;
        case "qualified": return r.qualified;
        case "converted": return r.converted;
        case "quality":   return r.quality;
        case "cpq":       return r.cpq > 0 ? r.cpq : (chSortDir === "asc" ? Infinity : -Infinity);
        case "cpc":       return r.cpc > 0 ? r.cpc : (chSortDir === "asc" ? Infinity : -Infinity);
      }
    };
    return [...channelRows].sort((a, b) => {
      const av = get(a), bv = get(b);
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * sign;
      return ((av as number) - (bv as number)) * sign;
    });
  }, [channelRows, chSortKey, chSortDir]);

  // ── Channel winners — computed from the SAME channelRows the table uses, so
  // the cards and table can never disagree. (Previously the cards came from
  // `useChannelWinners` which normalized through `normalizeChannelKey` and
  // collapsed many channels into an "Other" bucket the table didn't have.)
  const channelWinners = useMemo(() => {
    if (channelRows.length === 0) return null;
    // Most Revenue Generated — channel that produced the most revenue
    // (converted doctors × per-doctor fee). Ranks channels on actual money
    // delivered, not raw lead volume.
    const mostRevenue = [...channelRows]
      .filter(r => r.converted > 0)
      .sort((a, b) => b.converted - a.converted)[0] ?? null;
    // Best Lead Quality — converted ÷ qualified, min 5 qualified to avoid noise
    const QUAL_MIN = 5;
    const bestQuality = [...channelRows]
      .filter(r => r.qualified >= QUAL_MIN && r.quality > 0)
      .sort((a, b) => b.quality - a.quality)[0] ?? null;
    // Best Cost / Conversion — needs both spend AND a converted lead
    const lowestCPC = [...channelRows]
      .filter(r => r.spend > 0 && r.converted > 0 && r.cpc > 0)
      .sort((a, b) => a.cpc - b.cpc)[0] ?? null;
    return { mostRevenue, bestQuality, lowestCPC };
  }, [channelRows]);

  const kpiPanelDoctors = useMemo(() => {
    if (!selectedKpiChannel || !zoho?.rawLeads) return [];
    const fromMs = dateRange.from.getTime();
    const toMs   = dateRange.to.getTime() + 86_400_000;
    return zoho.rawLeads.filter(l => {
      const t = new Date(l.Created_Time).getTime();
      return t >= fromMs && t < toMs && displaySource(l.Lead_Source) === selectedKpiChannel;
    }).map(l => ({
      name:      l.Full_Name || `${l.First_Name ?? ''} ${l.Last_Name ?? ''}`.trim() || '—',
      specialty: l.Specialty ?? l.Specialty_New ?? '—',
      status:    l.Lead_Status ?? '—',
      contacted: l.Lead_Status !== 'Not Contacted',
    }));
  }, [selectedKpiChannel, zoho?.rawLeads, dateRange]);

  // Flip state for chart cards
  const [acquiredChannel, setAcquiredChannel] = useState<string | null>(null);
  const [uncontactedChannel, setUncontactedChannel] = useState<string | null>(null);

  // Doctor lists for back faces (derived from raw leads in the date window)
  const acquiredDoctors = useMemo(() => {
    if (!acquiredChannel || !zoho?.rawLeads) return [];
    const fromMs = dateRange.from.getTime();
    const toMs   = dateRange.to.getTime() + 86_400_000;
    return zoho.rawLeads.filter(l => {
      const t = new Date(l.Created_Time).getTime();
      return t >= fromMs && t < toMs && displaySource(l.Lead_Source) === acquiredChannel;
    }).map(l => ({
      name:      l.Full_Name || `${l.First_Name ?? ''} ${l.Last_Name ?? ''}`.trim() || '—',
      specialty: l.Specialty ?? l.Specialty_New ?? '—',
      status:    l.Lead_Status ?? '—',
    }));
  }, [acquiredChannel, zoho?.rawLeads, dateRange]);

  const uncontactedDoctors = useMemo(() => {
    if (!uncontactedChannel || !zoho?.rawLeads) return [];
    const fromMs = dateRange.from.getTime();
    const toMs   = dateRange.to.getTime() + 86_400_000;
    return zoho.rawLeads.filter(l => {
      const t = new Date(l.Created_Time).getTime();
      return t >= fromMs && t < toMs
        && displaySource(l.Lead_Source) === uncontactedChannel
        && l.Lead_Status === 'Not Contacted';
    }).map(l => ({
      name:      l.Full_Name || `${l.First_Name ?? ''} ${l.Last_Name ?? ''}`.trim() || '—',
      specialty: l.Specialty ?? l.Specialty_New ?? '—',
    }));
  }, [uncontactedChannel, zoho?.rawLeads, dateRange]);

  return (
    <DashboardLayout title="Marketing" subtitle="See which channels bring in the most doctors and how well they convert">
      <SectionDateRange />
      {/* Channel winner KPIs — Most Revenue Generated, Best Cost/Conv, Best Lead Quality.
          Computed from the SAME channelRows array the table below uses, so
          the two views always agree. Click any card to flip and see the top
          3 contenders + the formula used. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <WinnerCard
          accent="emerald"
          label="Most Revenue Generated"
          meaning="Channel that produced the most revenue in the selected period — converted doctors × the per-doctor fee. Ranks channels on actual money delivered, not raw lead volume."
          source="Zoho Doctors on Board × revenue per conversion."
          channel={channelWinners?.mostRevenue?.channel ?? null}
          value={channelWinners?.mostRevenue ? fmtMoney(channelWinners.mostRevenue.converted * REVENUE_PER_CONVERSION_AED) : ""}
          sub={channelWinners?.mostRevenue ? `${channelWinners.mostRevenue.converted.toLocaleString()} converted · ${fmtMoney(REVENUE_PER_CONVERSION_AED)}/doctor` : undefined}
          back={
            <div className="space-y-3">
              <p className="text-muted-foreground">
                <strong>Formula:</strong> converted doctors × {fmtMoney(REVENUE_PER_CONVERSION_AED)} per placement. Channels need at least one converted doctor to qualify.
              </p>
              <div>
                <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground/70 mb-1">Top 3 by revenue</p>
                <div className="divide-y divide-border/30">
                  {[...channelRows]
                    .filter(r => r.converted > 0)
                    .sort((a, b) => b.converted - a.converted)
                    .slice(0, 3)
                    .map(r => {
                      const revenue = r.converted * REVENUE_PER_CONVERSION_AED;
                      return (
                        <div key={r.channel} className="flex items-center justify-between py-1.5">
                          <div className="flex items-center gap-1.5">
                            <ChannelIcon channel={r.channel} size={11} />
                            <span className="font-medium">{r.channel}</span>
                          </div>
                          <div className="text-right tabular-nums">
                            <span className="font-semibold">{fmtMoney(revenue)}</span>
                            <span className="text-muted-foreground ml-2">{r.converted} converted</span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          }
        />
        <WinnerCard
          accent="orange"
          label="Best Cost / Conversion"
          meaning="Cheapest channel per converted lead (Doctors on Board) in the selected date range. Lower = more efficient. Channels need both spend and at least one conversion to qualify."
          source="Marketing-spend imports + Zoho Doctors on Board (Meta = live Meta API spend)."
          channel={channelWinners?.lowestCPC?.channel ?? null}
          value={channelWinners?.lowestCPC ? fmtMoney(channelWinners.lowestCPC.cpc) : ""}
          sub={channelWinners?.lowestCPC ? `${fmtMoney(channelWinners.lowestCPC.spend)} / ${channelWinners.lowestCPC.converted.toLocaleString()} converted` : undefined}
          back={
            <div className="space-y-3">
              <p className="text-muted-foreground">
                <strong>Formula:</strong> spend ÷ conversions (Doctors on Board), per channel. Channels need both spend and at least one conversion.
              </p>
              <div>
                <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground/70 mb-1">Top 3 cheapest</p>
                <div className="divide-y divide-border/30">
                  {channelRows
                    .filter(r => r.spend > 0 && r.converted > 0 && r.cpc > 0)
                    .sort((a, b) => a.cpc - b.cpc)
                    .slice(0, 3)
                    .map(r => (
                      <div key={r.channel} className="flex items-center justify-between py-1.5">
                        <div className="flex items-center gap-1.5">
                          <ChannelIcon channel={r.channel} size={11} />
                          <span className="font-medium">{r.channel}</span>
                        </div>
                        <div className="text-right tabular-nums">
                          <span className="font-semibold">{fmtMoney(r.cpc)}</span>
                          <span className="text-muted-foreground ml-2">{fmtMoney(r.spend)} / {r.converted}</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          }
        />
        <WinnerCard
          accent="blue"
          label="Best Lead Quality"
          meaning="Share of QUALIFIED leads that actually converted (became Doctors on Board). Higher = the channel sends prospects who actually close. Min 5 qualified leads to avoid 1-of-1 noise."
          source="Zoho Lead_Status × Doctors on Board (converted ÷ qualified)."
          channel={channelWinners?.bestQuality?.channel ?? null}
          value={channelWinners?.bestQuality ? `${channelWinners.bestQuality.quality.toFixed(1)}%` : ""}
          sub={channelWinners?.bestQuality ? `${channelWinners.bestQuality.converted.toLocaleString()} converted of ${channelWinners.bestQuality.qualified.toLocaleString()} qualified` : undefined}
          back={
            <div className="space-y-3">
              <p className="text-muted-foreground">
                <strong>Formula:</strong> converted ÷ qualified, per channel. Capped at 100%. Min 5 qualified leads to avoid 1-of-1 noise.
              </p>
              <div>
                <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground/70 mb-1">Top 3 highest quality</p>
                <div className="divide-y divide-border/30">
                  {channelRows
                    .filter(r => r.qualified >= 5 && r.quality > 0)
                    .sort((a, b) => b.quality - a.quality)
                    .slice(0, 3)
                    .map(r => (
                      <div key={r.channel} className="flex items-center justify-between py-1.5">
                        <div className="flex items-center gap-1.5">
                          <ChannelIcon channel={r.channel} size={11} />
                          <span className="font-medium">{r.channel}</span>
                        </div>
                        <div className="text-right tabular-nums">
                          <span className="font-semibold">{r.quality.toFixed(1)}%</span>
                          <span className="text-muted-foreground ml-2">{r.converted} / {r.qualified}</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          }
        />
      </div>

      {/* Channel KPI cards */}
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/70">
          Channels {visibleMarketing.length > 0 && <span className="opacity-60">· {visibleMarketing.length} of {marketing.length}</span>}
        </p>
        <div className="flex items-center gap-3">
          {undefinedLeads > 0 && (
            <button
              onClick={() => setShowUndefined(s => !s)}
              className="text-[10px] text-primary hover:text-primary/80 font-medium transition-colors"
              title="Undefined = leads with no Lead_Source, 'xxxxx', or other untagged values"
            >
              {showUndefined ? `Hide undefined (${undefinedLeads})` : `Show undefined (${undefinedLeads})`}
            </button>
          )}
          {hiddenLowVolumeCount > 0 && (
            <button
              onClick={() => setShowAllChannels(s => !s)}
              className="text-[10px] text-primary hover:text-primary/80 font-medium transition-colors"
            >
              {showAllChannels ? `Hide ${hiddenLowVolumeCount} smaller channels` : `Show ${hiddenLowVolumeCount} smaller channels`}
            </button>
          )}
        </div>
      </div>
      {/* Channel performance — sortable & animated table. Click any column
          header to re-sort. Click a row to filter the lead drill-down panel
          below to that channel. Bigger type + tinted header strip + per-column
          color so the table reads at a glance. */}
      <Card className="mb-6 shadow-md border-border/60">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-[14px] font-semibold text-foreground">Channel Performance</CardTitle>
          <p className="text-[11px] text-muted-foreground/80 mt-0.5">
            Click any column header to sort · click any row to drill into that channel's leads
          </p>
        </CardHeader>
        <CardContent className="px-0 pb-3 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-muted/40 border-y border-border/60">
              <tr>
                <SortableTH sortKey="channel" current={chSortKey} dir={chSortDir} onSort={handleChSort} align="left" size="md"
                  info={{ meaning: "Marketing channel — derived from Zoho Lead_Source.", source: "Zoho CRM (Lead_Source)." }}>
                  Channel
                </SortableTH>
                <SortableTH sortKey="converted" current={chSortKey} dir={chSortDir} onSort={handleChSort} size="md"
                  info={{ meaning: "Doctors on Board rows attributed to this channel via Lead_Source, in the selected period. % in parens = converted ÷ leads.", source: "Zoho Doctors on Board." }}>
                  Converted
                </SortableTH>
                <SortableTH sortKey="leads" current={chSortKey} dir={chSortDir} onSort={handleChSort} size="md"
                  info={{ meaning: "Total leads from this channel in the selected period.", source: "Zoho CRM (Lead_Source)." }}>
                  Leads
                </SortableTH>
                <SortableTH sortKey="qualified" current={chSortKey} dir={chSortDir} onSort={handleChSort} size="md"
                  info={{ meaning: "Leads at Initial Sales Call Completed or High Priority Follow up. % shown in parens = qualified ÷ leads. For Meta, sourced from meta_leads form table.", source: "Zoho Lead_Status (or meta_leads for Meta)." }}>
                  Qualified
                </SortableTH>
                <SortableTH sortKey="quality" current={chSortKey} dir={chSortDir} onSort={handleChSort} size="md"
                  info={{ meaning: "Share of QUALIFIED leads that actually converted (Converted ÷ Qualified). Same definition as the 'Best Lead Quality' KPI card. Higher = stronger leads — they progress to placement instead of stalling.", source: "Computed (Converted ÷ Qualified)." }}>
                  Lead Quality
                </SortableTH>
                <SortableTH sortKey="cpq" current={chSortKey} dir={chSortDir} onSort={handleChSort} size="md"
                  info={{ meaning: "Spend ÷ qualified leads. — when no spend record. For Meta, spend from Meta API.", source: "Marketing-spend imports + Meta API." }}>
                  Cost / Qual
                </SortableTH>
                <SortableTH sortKey="cpc" current={chSortKey} dir={chSortDir} onSort={handleChSort} size="md"
                  info={{ meaning: "Spend ÷ conversions (Doctors on Board). — when no spend record. For Meta, spend from Meta API.", source: "Marketing-spend imports + Meta API." }}>
                  Cost / Conv
                </SortableTH>
              </tr>
            </thead>
            <LayoutGroup>
              <motion.tbody layout>
                {sortedChannelRows.map(ch => {
                  const isSelected = selectedKpiChannel === ch.channel;
                  return (
                    <motion.tr
                      key={ch.channel}
                      layout
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                      onClick={() => setSelectedKpiChannel(isSelected ? null : ch.channel)}
                      className={`border-b border-border/30 cursor-pointer transition-colors ${
                        isSelected ? "bg-primary/10" : "hover:bg-muted/30"
                      }`}
                    >
                      <motion.td layout="position" className="py-3.5 px-5">
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                            <ChannelIcon channel={ch.channel} size={15} />
                          </div>
                          <span className="text-[14px] font-semibold text-foreground">{ch.channel}</span>
                          {isSelected && <X className="h-3.5 w-3.5 text-primary shrink-0" />}
                        </div>
                      </motion.td>
                      <td className="py-3.5 px-3 text-right tabular-nums">
                        <span className="text-[14px] font-bold text-foreground">{ch.converted.toLocaleString()}</span>
                        <span className="text-[11px] text-muted-foreground ml-1.5">({ch.conversionRate}%)</span>
                      </td>
                      <td className="py-3.5 px-3 text-right tabular-nums">
                        <span className="text-[14px] font-semibold text-emerald-600">{ch.doctors.toLocaleString()}</span>
                      </td>
                      <td className="py-3.5 px-3 text-right tabular-nums">
                        <span className="text-[14px] font-semibold text-blue-600">{ch.qualified.toLocaleString()}</span>
                        <span className="text-[11px] text-muted-foreground ml-1.5">({ch.qualifiedRate}%)</span>
                      </td>
                      <td className="py-3.5 px-3 text-right text-[14px] tabular-nums font-semibold">
                        {ch.quality > 0
                          ? <span className="inline-block px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700">{ch.quality.toFixed(1)}%</span>
                          : <span className="text-muted-foreground/40 font-normal">—</span>}
                      </td>
                      <td className="py-3.5 px-3 text-right text-[14px] tabular-nums font-semibold text-orange-700">
                        {ch.cpq > 0 ? fmtMoney(ch.cpq) : <span className="text-muted-foreground/40 font-normal">—</span>}
                      </td>
                      <td className="py-3.5 px-5 text-right text-[14px] tabular-nums font-semibold text-violet-700">
                        {ch.cpc > 0 ? fmtMoney(ch.cpc) : <span className="text-muted-foreground/40 font-normal">—</span>}
                      </td>
                    </motion.tr>
                  );
                })}
              </motion.tbody>
            </LayoutGroup>
          </table>
        </CardContent>
      </Card>

      {/* Expand panel — slides open below cards when one is selected */}
      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{ maxHeight: selectedKpiChannel ? '320px' : '0px', opacity: selectedKpiChannel ? 1 : 0, marginBottom: selectedKpiChannel ? '20px' : '0px', marginTop: selectedKpiChannel ? '12px' : '0px' }}
      >
        {selectedKpiChannel && (
          <div className="rounded-xl border border-border/50 bg-card shadow-sm p-4">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <ChannelIcon channel={selectedKpiChannel} size={14} />
              <span className="text-[12px] font-semibold uppercase tracking-wide">{selectedKpiChannel}</span>
              <span className="text-[11px] text-muted-foreground">· {kpiPanelDoctors.length} doctor{kpiPanelDoctors.length !== 1 ? 's' : ''}</span>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary/70 inline-block" />{kpiPanelDoctors.filter(d => d.contacted).length} contacted</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted-foreground/30 inline-block" />{kpiPanelDoctors.filter(d => !d.contacted).length} to reach</span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Link
                  to={`/leads-pipeline?source=${encodeURIComponent(selectedKpiChannel)}&stage=Not%20Contacted`}
                  className="h-7 inline-flex items-center gap-1 rounded-md bg-warning/10 hover:bg-warning/20 text-warning px-2 text-[10px] font-medium transition-colors"
                >
                  Pull uncontacted →
                </Link>
                <Link
                  to={`/leads-pipeline?source=${encodeURIComponent(selectedKpiChannel)}`}
                  className="h-7 inline-flex items-center gap-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary px-2 text-[10px] font-medium transition-colors"
                >
                  All leads →
                </Link>
              </div>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: '240px' }}>
              {kpiPanelDoctors.length === 0 ? (
                <p className="text-[12px] text-muted-foreground text-center py-6">No doctors found in this period</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                  {kpiPanelDoctors.map((d, i) => (
                    <div key={i} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-muted/40 transition-colors">
                      <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${d.contacted ? 'bg-primary/10' : 'bg-warning/10'}`}>
                        <User className={`h-3 w-3 ${d.contacted ? 'text-primary' : 'text-warning'}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[12px] font-medium truncate leading-tight">{d.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate leading-tight">{d.specialty}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        {/* Doctors Acquired by Channel — top 8, horizontal — flippable */}
        <div style={{ perspective: '1000px' }} className="rounded-lg">
          <div style={{
            position: 'relative',
            transformStyle: 'preserve-3d',
            transition: 'transform 0.45s ease, height 0.35s ease',
            transform: acquiredChannel ? 'rotateX(-180deg)' : 'rotateX(0deg)',
            height: acquiredChannel ? '340px' : '340px',
          }}>
            {/* Front */}
            <Card className="shadow-sm border-border/50 hover:shadow-md transition-shadow absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Doctors Acquired by Channel</CardTitle>
              </CardHeader>
              <CardContent className="px-2 sm:px-4 pb-4">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={marketing.slice(0, 8)}
                    layout="vertical"
                    margin={{ left: 4, right: 40 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,92%)" horizontal={false} />
                    <XAxis
                      type="number"
                      fontSize={10} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)"
                    />
                    <YAxis
                      type="category" dataKey="channel"
                      fontSize={10} width={90} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)"
                    />
                    <Tooltip contentStyle={tip} formatter={(v: number) => [v.toLocaleString(), 'Doctors']} />
                    <Bar dataKey="doctors" radius={[0, 4, 4, 0]} name="Doctors" cursor="pointer" onClick={(data) => setAcquiredChannel(data.channel)}>
                      {marketing.slice(0, 8).map((_, i) => (
                        <Cell key={i} fill={`hsl(170, ${55 - i * 3}%, ${42 + i * 3}%)`} />
                      ))}
                      <LabelList dataKey="doctors" position="right" fontSize={10} fill="hsl(220,10%,45%)" formatter={(v: number) => v.toLocaleString()} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <p className="text-center text-[10px] text-muted-foreground mt-1">Click a bar to see the doctors list</p>
              </CardContent>
            </Card>
            {/* Back */}
            <Card className="shadow-sm border-border/50 absolute inset-0 overflow-hidden" style={{ backfaceVisibility: 'hidden', transform: 'rotateX(180deg)' }}>
              <CardHeader className="pb-1 pt-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <ChannelIcon channel={acquiredChannel ?? ''} size={13} />
                    {acquiredChannel}
                  </CardTitle>
                  <button onClick={() => setAcquiredChannel(null)} className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/70 transition-colors">
                    <ArrowLeft className="h-3 w-3" /> Back
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">{acquiredDoctors.length} doctor{acquiredDoctors.length !== 1 ? 's' : ''} from this channel</p>
              </CardHeader>
              <CardContent className="px-4 pb-4 overflow-y-auto" style={{ maxHeight: '256px' }}>
                {acquiredDoctors.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground text-center py-8">No doctors found</p>
                ) : (
                  <div className="space-y-1.5">
                    {acquiredDoctors.map((d, i) => (
                      <div key={i} className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/40 transition-colors">
                        <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <User className="h-3 w-3 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-medium truncate">{d.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{d.specialty} · {d.status}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Contacted vs Uncontacted — top 8, stacked horizontal — flippable */}
        <div style={{ perspective: '1000px' }} className="rounded-lg">
          <div style={{
            position: 'relative',
            transformStyle: 'preserve-3d',
            transition: 'transform 0.45s ease, height 0.35s ease',
            transform: uncontactedChannel ? 'rotateX(-180deg)' : 'rotateX(0deg)',
            height: '340px',
          }}>
            {/* Front */}
            <Card className="shadow-sm border-border/50 hover:shadow-md transition-shadow absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>
              <CardHeader className="pb-1 pt-4 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Contacted vs Still to Reach</CardTitle>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><span className="h-2 w-2 rounded-sm inline-block" style={{ backgroundColor: "hsl(210,75%,52%)" }} />Contacted</span>
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><span className="h-2 w-2 rounded-sm inline-block" style={{ backgroundColor: "hsl(210,80%,82%)" }} />Uncontacted</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-2 sm:px-4 pb-4">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={marketing.slice(0, 8)}
                    layout="vertical"
                    margin={{ left: 4, right: 36 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,92%)" horizontal={false} />
                    <XAxis
                      type="number"
                      fontSize={10} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)"
                    />
                    <YAxis
                      type="category" dataKey="channel"
                      fontSize={10} width={90} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)"
                    />
                    <Tooltip
                      contentStyle={tip}
                      formatter={(v: number, name: string) => [v.toLocaleString(), name]}
                    />
                    {/* Stacked bars: leftmost segment (Contacted) gets left-rounded
                        corners, rightmost (Uncontacted) gets right-rounded corners.
                        Counts shown inline so users don't need to read the X axis. */}
                    {/* Recharts applies the radius array as [tl, tr, br, bl]
                        relative to a vertical bar — for horizontal layouts the
                        mapping ends up flipped. To round the OUTSIDE ends of
                        the stack we use the values that look reversed:
                        Contacted (leftmost) → top-right + bottom-right values
                        Uncontacted (rightmost) → top-left + bottom-left values. */}
                    <Bar dataKey="contacted" stackId="a" fill="hsl(210,75%,52%)" name="Contacted" radius={[0, 6, 6, 0]}>
                      <LabelList dataKey="contacted" position="insideLeft" fill="white" fontSize={10} formatter={(v: number) => v > 0 ? v.toLocaleString() : ""} />
                    </Bar>
                    <Bar dataKey="uncontacted" stackId="a" fill="hsl(210,80%,82%)" name="Uncontacted" radius={[6, 0, 0, 6]} cursor="pointer" onClick={(data) => setUncontactedChannel(data.channel)}>
                      <LabelList dataKey="uncontacted" position="right" fill="hsl(220,10%,40%)" fontSize={10} formatter={(v: number) => v > 0 ? v.toLocaleString() : ""} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <p className="text-center text-[10px] text-muted-foreground mt-1">Click a bar to see uncontacted doctors</p>
              </CardContent>
            </Card>
            {/* Back */}
            <Card className="shadow-sm border-border/50 absolute inset-0 overflow-hidden" style={{ backfaceVisibility: 'hidden', transform: 'rotateX(180deg)' }}>
              <CardHeader className="pb-1 pt-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <ChannelIcon channel={uncontactedChannel ?? ''} size={13} />
                    {uncontactedChannel} — Uncontacted
                  </CardTitle>
                  <button onClick={() => setUncontactedChannel(null)} className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/70 transition-colors">
                    <ArrowLeft className="h-3 w-3" /> Back
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">{uncontactedDoctors.length} doctor{uncontactedDoctors.length !== 1 ? 's' : ''} still to reach</p>
              </CardHeader>
              <CardContent className="px-4 pb-4 overflow-y-auto" style={{ maxHeight: '256px' }}>
                {uncontactedDoctors.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground text-center py-8">All doctors contacted!</p>
                ) : (
                  <div className="space-y-1.5">
                    {uncontactedDoctors.map((d, i) => (
                      <div key={i} className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/40 transition-colors">
                        <div className="h-6 w-6 rounded-full bg-warning/10 flex items-center justify-center shrink-0">
                          <User className="h-3 w-3 text-warning" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-medium truncate">{d.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{d.specialty}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Spend allocation — donut shows how budget is split across channels.
          Sourced from the same channelRows the table uses, so Meta uses live
          Meta API spend instead of marketing_expenses. */}
      {/* Raw expense categories from marketing_expenses (DILO, Brand
          Photoshoot, etc.) — not bucketed via the channel mapping. Shows
          every line item that has an actual spend record. */}
      <SpendAllocationChart channels={expenseCategories.map(c => ({ channel: c.category, spend: c.amount }))} />
    </DashboardLayout>
  );
};

export default Marketing;
