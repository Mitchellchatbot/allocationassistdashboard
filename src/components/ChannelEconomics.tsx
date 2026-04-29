import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChannelIcon } from "@/components/ChannelIcon";
import { InfoIcon } from "@/components/InfoIcon";
import { ChevronRight } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useChannelEconomics, useChannelWinners, type ChannelEconomicsRow } from "@/hooks/use-channel-economics";
import { useCurrency } from "@/lib/CurrencyProvider";
import type { ChannelKey } from "@/lib/channel-mapping";

const fmtN = (v: number) => v.toLocaleString();

// Header label paired with a click-popover (i) icon.
function HeaderHint({ label, meaning, source, className = "" }: { label: string; meaning: string; source: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {label}
      <InfoIcon meaning={meaning} source={source} side="top" />
    </span>
  );
}

// Group channels into the three buckets recruiters actually think in:
// where the lead comes from (own site), paid digital reach, and job boards.
// Anything that doesn't fit lands in "Other" so the table never silently drops a row.
type ChannelGroup = "Website" | "Social" | "Job Boards" | "Other";

const CHANNEL_GROUP: Record<ChannelKey, ChannelGroup> = {
  "Website / SEO": "Website",
  "Landing Page":  "Website",
  "Meta":          "Social",
  "LinkedIn":      "Social",
  "Google Ads":    "Social",
  "TikTok":        "Social",
  "YouTube":       "Social",
  "Snapchat":      "Social",
  "Twitter":       "Social",
  "Influencer":    "Social",
  "WhatsApp":      "Social",
  "Go Hire":       "Job Boards",
  "Dave":          "Other",
  "Referrals":     "Other",
  "Email":         "Other",
  "Print":         "Other",
  "Outdoor":       "Other",
  "Radio":         "Other",
  "TV":            "Other",
  "Events":        "Other",
  "Other":         "Other",
};

const GROUP_ORDER: ChannelGroup[] = ["Website", "Social", "Job Boards", "Other"];

const GROUP_DESCRIPTION: Record<ChannelGroup, string> = {
  "Website":    "Owned web traffic — SEO, direct, landing pages",
  "Social":     "Paid digital — Meta, LinkedIn, Google Ads, TikTok, etc.",
  "Job Boards": "Recruitment marketplaces (Go Hire, etc.)",
  "Other":      "Referrals, email, offline & uncategorised",
};

interface WinnerCardProps {
  label: string;
  meaning?: string;
  source?: string;
  channel: string | null;
  value: string;
  sub?: string;
  /** Color identity for the card — drives the gradient bg + value color +
   *  top-border accent. Defaults to slate (neutral). */
  accent?: "slate" | "emerald" | "orange" | "blue" | "violet" | "amber" | "rose";
  /** Optional back-face content. When provided, the card becomes flippable. */
  back?: React.ReactNode;
}

const WINNER_ACCENTS = {
  slate:   { gradient: "from-slate-50 to-card",    border: "border-slate-200",   value: "text-foreground",     barBg: "bg-slate-300"   },
  emerald: { gradient: "from-emerald-50 to-card",  border: "border-emerald-200", value: "text-emerald-700",    barBg: "bg-emerald-400" },
  orange:  { gradient: "from-orange-50 to-card",   border: "border-orange-200",  value: "text-orange-700",     barBg: "bg-orange-400"  },
  blue:    { gradient: "from-blue-50 to-card",     border: "border-blue-200",    value: "text-blue-700",       barBg: "bg-blue-400"    },
  violet:  { gradient: "from-violet-50 to-card",   border: "border-violet-200",  value: "text-violet-700",     barBg: "bg-violet-400"  },
  amber:   { gradient: "from-amber-50 to-card",    border: "border-amber-200",   value: "text-amber-700",      barBg: "bg-amber-400"   },
  rose:    { gradient: "from-rose-50 to-card",     border: "border-rose-200",    value: "text-rose-700",       barBg: "bg-rose-400"    },
} as const;

export function WinnerCard({ label, meaning, source, channel, value, sub, accent = "slate", back }: WinnerCardProps) {
  const [flipped, setFlipped] = useState(false);
  const flippable = !!back && !!channel;
  const a = WINNER_ACCENTS[accent];

  return (
    <div
      className={flippable ? "cursor-pointer select-none" : "select-none"}
      style={{
        perspective: "1200px",
        height: flipped ? "240px" : "150px",
        transition: "height 0.45s cubic-bezier(0.4,0,0.2,1)",
      }}
      onClick={() => flippable && setFlipped(f => !f)}
    >
      <div
        style={{
          transformStyle: "preserve-3d",
          transition: "transform 0.55s cubic-bezier(0.4,0,0.2,1)",
          transform: flipped ? "rotateX(-180deg)" : "rotateX(0deg)",
          position: "relative",
          height: "100%",
        }}
      >
        {/* Front */}
        <div
          style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
          className={`absolute inset-0 rounded-xl border ${a.border} bg-gradient-to-br ${a.gradient} shadow-sm hover:shadow-md hover:scale-[1.01] transition-all flex flex-col overflow-hidden`}
        >
          {/* Top color stripe — strong accent bar so each card reads as its own family */}
          <div className={`h-1 ${a.barBg}`} />
          <div className="p-4 flex-1 flex flex-col">
            <p className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              {label}
              {meaning && <InfoIcon meaning={meaning} source={source} side="top" />}
            </p>
            {channel ? (
              <>
                <div className="flex items-center gap-1.5 mb-1">
                  <ChannelIcon channel={channel} size={14} />
                  <p className="text-base font-semibold truncate">{channel}</p>
                </div>
                <p className={`text-xl font-bold tabular-nums ${a.value}`}>{value}</p>
                {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
                {flippable && (
                  <p className="text-[9px] text-muted-foreground/60 mt-auto pt-1">click to see how this was calculated</p>
                )}
              </>
            ) : (
              <>
                <p className="text-base font-semibold text-muted-foreground">—</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Not enough data</p>
              </>
            )}
          </div>
        </div>

        {/* Back */}
        {flippable && (
          <div
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "rotateX(180deg)",
            }}
            className={`absolute inset-0 rounded-xl border ${a.border} bg-card shadow-md flex flex-col overflow-hidden`}
          >
            <div className={`flex items-center justify-between px-4 py-2 border-b border-border/30 bg-gradient-to-br ${a.gradient} shrink-0`}>
              <span className="text-[11px] font-semibold truncate">{label}</span>
              <span className="text-[9px] text-muted-foreground shrink-0 ml-2">click to close</span>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0 text-[11px]">
              {back}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ChannelWinnerCards() {
  // Kept as a thin wrapper for any consumers that don't have a local
  // channelRows array. Reads from useChannelWinners (legacy normalizer path).
  const winners = useChannelWinners();
  const { fmt: fmtAED } = useCurrency();

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
      <WinnerCard
        label="Best Cost / Conversion"
        meaning="Cheapest channel per converted lead (Doctors on Board) in the selected date range."
        source="Marketing-spend imports + Zoho Doctors on Board."
        channel={winners?.lowestCPC?.channel ?? null}
        value={winners?.lowestCPC ? fmtAED(winners.lowestCPC.costPerConversion) : ""}
        sub={winners?.lowestCPC ? `${fmtAED(winners.lowestCPC.spend)} / ${fmtN(winners.lowestCPC.converted)} converted` : undefined}
      />
      <WinnerCard
        label="Best Lead Quality"
        meaning="Share of QUALIFIED leads that actually converted (became Doctors on Board). Higher = the channel sends prospects who actually close."
        source="Zoho Lead_Status × Doctors on Board (converted ÷ qualified)."
        channel={winners?.bestQuality?.channel ?? null}
        value={winners?.bestQuality ? `${winners.bestQuality.qualityScore.toFixed(1)}%` : ""}
        sub={winners?.bestQuality ? `${fmtN(winners.bestQuality.converted)} converted of ${fmtN(winners.bestQuality.qualified)} qualified` : undefined}
      />
      <WinnerCard
        label="Best Volume"
        meaning="Channel with the most leads in the selected period (volume only, ignores cost or quality)."
        source="Zoho CRM (Lead_Source)."
        channel={winners?.mostLeads?.channel ?? null}
        value={winners?.mostLeads ? `${fmtN(winners.mostLeads.leads)} leads` : ""}
        sub={winners?.mostLeads ? `${fmtN(winners.mostLeads.qualified)} qualified · ${winners.mostLeads.qualifiedRate.toFixed(0)}% rate` : undefined}
      />
    </div>
  );
}

export function ChannelEconomicsTable() {
  const rows = useChannelEconomics();
  const navigate = useNavigate();
  const { fmt: fmtAED } = useCurrency();

  if (rows.length === 0) {
    return null;
  }

  // Bucket rows by group, then sort within each group by lead volume so the
  // most-trafficked channel in each section sits on top.
  const grouped = new Map<ChannelGroup, ChannelEconomicsRow[]>();
  for (const r of rows) {
    const g = CHANNEL_GROUP[r.channel] ?? "Other";
    if (!grouped.has(g)) grouped.set(g, []);
    grouped.get(g)!.push(r);
  }
  for (const list of grouped.values()) list.sort((a, b) => b.leads - a.leads);

  // Per-group totals shown alongside each section header so users can compare
  // groups (e.g. "Social spent 80% of the budget but delivered 30% of leads").
  const groupTotals = (list: ChannelEconomicsRow[]) => {
    const leads             = list.reduce((s, r) => s + r.leads,             0);
    const spend             = list.reduce((s, r) => s + r.spend,             0);
    const qualified         = list.reduce((s, r) => s + r.qualified,         0);
    const lifetimeSpend     = list.reduce((s, r) => s + r.lifetimeSpend,     0);
    const lifetimeConverted = list.reduce((s, r) => s + r.lifetimeConverted, 0);
    return {
      leads, spend, qualified,
      costPerQualified: qualified > 0 && spend > 0 ? spend / qualified : 0,
      lifetimeCostPerConversion: lifetimeConverted > 0 && lifetimeSpend > 0
        ? lifetimeSpend / lifetimeConverted
        : 0,
    };
  };

  const colCount = 9; // Channel + 7 metric columns + drill-in

  return (
    <Card className="shadow-sm border-border/50 mb-5">
      <CardHeader className="pb-1 pt-4 px-4">
        <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Channel Economics</CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-4">
        <div className="overflow-x-auto">
          <Table className="min-w-[920px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b-border/60">
                <TableHead className="text-[10px] uppercase tracking-wide h-9 pl-5 pr-3 w-[180px]">Channel</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide h-9 px-3 text-right whitespace-nowrap w-[110px]">
                  <HeaderHint label="Qualified" meaning="Leads at Initial Sales Call Completed or High Priority Follow up." source="Zoho CRM (Lead_Status)." className="justify-end" />
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide h-9 px-4 text-right whitespace-nowrap bg-primary/[0.06] w-[140px]">
                  <HeaderHint label="Cost / Qualified" meaning="The headline metric. Spend ÷ qualified leads — what you really pay to source one prospect worth pursuing. Lower is better." source="Marketing-spend imports + Zoho CRM." className="justify-end" />
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide h-9 px-3 text-right whitespace-nowrap w-[80px]">
                  <HeaderHint label="Leads" meaning="Zoho leads attributed to this channel in the period." source="Zoho CRM (Lead_Source)." className="justify-end" />
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide h-9 px-3 text-right whitespace-nowrap w-[100px]">
                  <HeaderHint label="Cost / Lead" meaning="Spend ÷ leads. Includes every lead regardless of quality." source="Marketing-spend imports + Zoho CRM." className="justify-end" />
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide h-9 px-3 text-right whitespace-nowrap w-[90px]">
                  <HeaderHint label="Conv. Rate" meaning="Share of leads converted (High Priority Follow up or Closed Won)." source="Zoho CRM (Lead_Status)." className="justify-end" />
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide h-9 px-3 text-right whitespace-nowrap w-[110px]">
                  <HeaderHint label="Spend" meaning='Marketing spend recorded for this channel. "—" = no spend logged.' source="Marketing-spend imports." className="justify-end" />
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide h-9 px-3 text-right whitespace-nowrap w-[130px]">
                  <HeaderHint label="Lifetime CPC" meaning="All-time spend on this channel ÷ all-time conversions, ignoring the date filter. Surfaces channels that look fine in a recent window but have been losing money for years." source="Marketing-spend imports + Zoho CRM, lifetime." className="justify-end" />
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide h-9 px-3 text-right w-[80px]">Drill</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {GROUP_ORDER.flatMap(group => {
                const list = grouped.get(group);
                if (!list || list.length === 0) return [];
                const totals = groupTotals(list);
                return [
                  <TableRow key={`hdr-${group}`} className="hover:bg-transparent bg-muted/30 border-b-border/60">
                    <TableCell colSpan={colCount} className="py-2.5 pl-5 pr-4">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="min-w-0">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground">{group}</span>
                          <span className="text-[10px] text-muted-foreground ml-2">{GROUP_DESCRIPTION[group]}</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground tabular-nums shrink-0 whitespace-nowrap flex items-center gap-x-3 gap-y-0.5 flex-wrap justify-end">
                          <span>{fmtN(totals.leads)} leads</span>
                          <span>{fmtN(totals.qualified)} qualified</span>
                          {totals.spend > 0 && <span>{fmtAED(totals.spend)} spend</span>}
                          {totals.costPerQualified > 0 && (
                            <span className="font-semibold text-foreground">{fmtAED(totals.costPerQualified)} avg CPQL</span>
                          )}
                          {totals.lifetimeCostPerConversion > 0 && (
                            <span>{fmtAED(totals.lifetimeCostPerConversion)} lifetime CPC</span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>,
                  ...list.map(r => (
                    <TableRow key={r.channel} className="hover:bg-muted/30 cursor-pointer group border-b-border/40" onClick={() => {
                      navigate(`/leads-pipeline?source=${encodeURIComponent(r.channel)}`);
                    }}>
                      <TableCell className="text-[12px] font-medium py-3 pl-7 pr-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <ChannelIcon channel={r.channel} size={14} />
                          <span className="truncate">{r.channel}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-[12px] text-right py-3 px-3 tabular-nums whitespace-nowrap">
                        <span className="text-primary/80 font-medium">{fmtN(r.qualified)}</span>
                        <span className="text-[10px] font-normal ml-1 text-muted-foreground">({r.qualifiedRate.toFixed(0)}%)</span>
                      </TableCell>
                      <TableCell className="text-[13px] text-right py-3 px-4 tabular-nums font-bold whitespace-nowrap bg-primary/[0.06]">
                        {r.costPerQualified > 0
                          ? <span className="text-foreground">{fmtAED(r.costPerQualified)}</span>
                          : <span className="text-muted-foreground/50 font-normal">—</span>}
                      </TableCell>
                      <TableCell className="text-[12px] text-right py-3 px-3 tabular-nums whitespace-nowrap">
                        {fmtN(r.leads)}
                      </TableCell>
                      <TableCell className="text-[12px] text-right py-3 px-3 tabular-nums whitespace-nowrap text-muted-foreground">
                        {r.costPerLead > 0 ? fmtAED(r.costPerLead) : <span className="text-muted-foreground/50">—</span>}
                      </TableCell>
                      <TableCell className="text-right py-3 px-3 whitespace-nowrap">
                        <span className={`text-[12px] tabular-nums font-medium ${
                          r.conversionRate >= 40 ? "text-success" :
                          r.conversionRate >= 20 ? "text-primary" :
                          r.conversionRate > 0  ? "text-warning" :
                          "text-muted-foreground/50"
                        }`}>
                          {r.conversionRate.toFixed(1)}%
                        </span>
                      </TableCell>
                      <TableCell className="text-[12px] text-right py-3 px-3 tabular-nums whitespace-nowrap text-muted-foreground">
                        {r.spend > 0 ? fmtAED(r.spend) : <span className="text-muted-foreground/50">—</span>}
                      </TableCell>
                      <TableCell className="text-[12px] text-right py-3 px-3 tabular-nums whitespace-nowrap">
                        {r.lifetimeCostPerConversion > 0
                          ? <span className="text-foreground/80">{fmtAED(r.lifetimeCostPerConversion)}</span>
                          : <span className="text-muted-foreground/50">—</span>}
                      </TableCell>
                      <TableCell className="text-right py-3 px-3 whitespace-nowrap">
                        <Link
                          to={`/leads-pipeline?source=${encodeURIComponent(r.channel)}&stage=Not%20Contacted`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-0.5 text-[10px] text-warning hover:text-warning/80 font-medium transition-colors opacity-0 group-hover:opacity-100"
                        >
                          Uncontacted
                          <ChevronRight className="h-3 w-3" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  )),
                ];
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
