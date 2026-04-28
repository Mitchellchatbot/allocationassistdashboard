import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChannelIcon } from "@/components/ChannelIcon";
import { InfoIcon } from "@/components/InfoIcon";
import { Trophy, TrendingDown, Target, Zap, ChevronRight } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useChannelEconomics, useChannelWinners, type ChannelEconomicsRow } from "@/hooks/use-channel-economics";
import { useFilters } from "@/lib/filters";
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
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  meaning?: string;
  source?: string;
  iconColor: string;
  iconBg: string;
  channel: string | null;
  value: string;
  sub?: string;
}

function WinnerCard({ icon: Icon, label, meaning, source, iconColor, iconBg, channel, value, sub }: WinnerCardProps) {
  return (
    <Card className="shadow-sm border-border/50">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <p className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            {label}
            {meaning && <InfoIcon meaning={meaning} source={source} side="top" />}
          </p>
          <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${iconBg}`}>
            <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
          </div>
        </div>
        {channel ? (
          <>
            <div className="flex items-center gap-1.5 mb-0.5">
              <ChannelIcon channel={channel} size={14} />
              <p className="text-base font-semibold truncate">{channel}</p>
            </div>
            <p className="text-lg font-bold tabular-nums">{value}</p>
            {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
          </>
        ) : (
          <>
            <p className="text-base font-semibold text-muted-foreground">—</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Not enough data</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function ChannelWinnerCards() {
  const winners = useChannelWinners();
  const { dateRange } = useFilters();
  const { fmt: fmtAED } = useCurrency();

  const dateLabel = `${dateRange.from.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${dateRange.to.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <div className="mb-3">
      <p className="text-[10px] text-muted-foreground mb-2">Channel performance · {dateLabel}</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Headline metric — Cost per Qualified Lead. Sits first because this is
            the metric Ammar prioritises over volume / CPL. */}
        <WinnerCard
          icon={Target}
          label="Lowest Cost / Qualified ★"
          meaning="The headline metric — cheapest channel per qualified lead (Initial Sales Call Completed or High Priority Follow up). Lower = better quality at lower cost."
          source="Marketing-spend imports + Zoho CRM (Lead_Status)."
          iconColor="text-orange-600" iconBg="bg-orange-50"
          channel={winners?.lowestCPQ?.channel ?? null}
          value={winners?.lowestCPQ ? fmtAED(winners.lowestCPQ.costPerQualified) : ""}
          sub={winners?.lowestCPQ ? `${fmtN(winners.lowestCPQ.qualified)} qualified leads` : undefined}
        />
        {/* Lifetime CPC — surfaces channels that have been losing money for years. */}
        <WinnerCard
          icon={TrendingDown}
          label="Best Lifetime Cost / Conv."
          meaning="Cheapest channel per converted lead across ALL time (ignores the date filter). Tells you which channels actually pay back over their full history."
          source="Marketing-spend imports + Zoho CRM, lifetime."
          iconColor="text-emerald-600" iconBg="bg-emerald-50"
          channel={winners?.bestLifetimeCPC?.channel ?? null}
          value={winners?.bestLifetimeCPC ? fmtAED(winners.bestLifetimeCPC.lifetimeCostPerConversion) : ""}
          sub={winners?.bestLifetimeCPC ? `${fmtN(winners.bestLifetimeCPC.lifetimeConverted)} converted lifetime` : undefined}
        />
        <WinnerCard
          icon={Trophy}
          label="Best Channel (Volume)"
          meaning="Channel with the most leads this period (volume only, ignores cost)."
          source="Zoho CRM (Lead_Source)."
          iconColor="text-amber-600" iconBg="bg-amber-50"
          channel={winners?.mostLeads?.channel ?? null}
          value={winners?.mostLeads ? `${fmtN(winners.mostLeads.leads)} leads` : ""}
          sub={winners?.mostLeads ? `${fmtN(winners.mostLeads.qualified)} qualified · ${winners.mostLeads.qualifiedRate.toFixed(0)}% rate` : undefined}
        />
        {/* Cost / Conversion in the windowed period (or fallback to highest
            conversion rate if no spend matched). Kept as the 4th card so the
            full-history "Best Lifetime CPC" doesn't double up. */}
        {winners?.lowestCPC ? (
          <WinnerCard
            icon={Zap}
            label="Lowest Cost / Conv. (this period)"
            meaning="Cheapest channel per converted lead in the SELECTED date range. Compare to the lifetime card to spot windows where a channel is suddenly more expensive."
            source="Marketing-spend imports + Zoho CRM."
            iconColor="text-violet-600" iconBg="bg-violet-50"
            channel={winners.lowestCPC.channel}
            value={fmtAED(winners.lowestCPC.costPerConversion)}
            sub={`${fmtAED(winners.lowestCPC.spend)} / ${fmtN(winners.lowestCPC.converted)} converted`}
          />
        ) : (
          <WinnerCard
            icon={Zap}
            label="Best Conversion Rate"
            meaning="Channel with the highest conversion rate (≥ 5 leads). Shown when no spend is recorded."
            source="Zoho CRM (Lead_Status)."
            iconColor="text-violet-600" iconBg="bg-violet-50"
            channel={winners?.bestConversion?.channel ?? null}
            value={winners?.bestConversion ? `${winners.bestConversion.conversionRate.toFixed(1)}%` : ""}
            sub={winners?.bestConversion ? `${fmtN(winners.bestConversion.converted)} of ${fmtN(winners.bestConversion.leads)} leads` : undefined}
          />
        )}
      </div>
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
        <p className="text-[10px] text-muted-foreground mt-0.5">
          Channels grouped by source type. <strong className="text-foreground">Cost / Qualified is the headline metric</strong> — it filters out junk leads and reflects what you really pay to source someone worth pursuing. The lifetime column shows whether a channel is gradually losing money over its full history. "—" means no data. Click a row to drill in.
        </p>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="overflow-x-auto -mx-4 px-4">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-[10px] uppercase tracking-wide h-8">Channel</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">
                  <HeaderHint label="Qualified" meaning="Leads at Initial Sales Call Completed or High Priority Follow up." source="Zoho CRM (Lead_Status)." className="justify-end" />
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right bg-primary/5">
                  <HeaderHint label="Cost / Qualified" meaning="The headline metric. Spend ÷ qualified leads — what you really pay to source one prospect worth pursuing. Lower is better." source="Marketing-spend imports + Zoho CRM." className="justify-end" />
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">
                  <HeaderHint label="Leads" meaning="Zoho leads attributed to this channel in the period." source="Zoho CRM (Lead_Source)." className="justify-end" />
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">
                  <HeaderHint label="Cost / Lead" meaning="Spend ÷ leads. Includes every lead regardless of quality." source="Marketing-spend imports + Zoho CRM." className="justify-end" />
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">
                  <HeaderHint label="Conv. Rate" meaning="Share of leads converted (High Priority Follow up or Closed Won)." source="Zoho CRM (Lead_Status)." className="justify-end" />
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">
                  <HeaderHint label="Spend" meaning='Marketing spend recorded for this channel. "—" = no spend logged.' source="Marketing-spend imports." className="justify-end" />
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">
                  <HeaderHint label="Cost / Conv. (lifetime)" meaning="All-time spend on this channel ÷ all-time conversions, ignoring the date filter. Surfaces channels that look fine in a recent window but have been losing money for years." source="Marketing-spend imports + Zoho CRM, lifetime." className="justify-end" />
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right w-[80px]">Drill in</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {GROUP_ORDER.flatMap(group => {
                const list = grouped.get(group);
                if (!list || list.length === 0) return [];
                const totals = groupTotals(list);
                return [
                  <TableRow key={`hdr-${group}`} className="hover:bg-transparent bg-muted/20">
                    <TableCell colSpan={colCount} className="py-2 px-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="min-w-0">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground">{group}</span>
                          <span className="text-[10px] text-muted-foreground ml-2">{GROUP_DESCRIPTION[group]}</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                          {fmtN(totals.leads)} leads · {fmtN(totals.qualified)} qualified
                          {totals.spend > 0 && <> · {fmtAED(totals.spend)} spend</>}
                          {totals.costPerQualified > 0 && <> · <span className="font-medium text-foreground">{fmtAED(totals.costPerQualified)} avg CPQL</span></>}
                          {totals.lifetimeCostPerConversion > 0 && <> · <span className="text-muted-foreground/80">{fmtAED(totals.lifetimeCostPerConversion)} lifetime CPC</span></>}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>,
                  ...list.map(r => (
                    <TableRow key={r.channel} className="hover:bg-muted/30 cursor-pointer group" onClick={() => {
                      navigate(`/leads-pipeline?source=${encodeURIComponent(r.channel)}`);
                    }}>
                      <TableCell className="text-[12px] font-medium py-2.5 pl-6">
                        <div className="flex items-center gap-2">
                          <ChannelIcon channel={r.channel} size={13} />
                          {r.channel}
                        </div>
                      </TableCell>
                      <TableCell className="text-[12px] text-right py-2.5 tabular-nums">
                        <span className="text-primary/80">{fmtN(r.qualified)}</span>
                        <span className="text-[10px] font-normal ml-1 opacity-70">({r.qualifiedRate.toFixed(0)}%)</span>
                      </TableCell>
                      <TableCell className="text-[13px] text-right py-2.5 tabular-nums font-bold bg-primary/5">
                        {r.costPerQualified > 0
                          ? <span className="text-foreground">{fmtAED(r.costPerQualified)}</span>
                          : <span className="text-muted-foreground font-normal">—</span>}
                      </TableCell>
                      <TableCell className="text-[12px] text-right py-2.5 tabular-nums">{fmtN(r.leads)}</TableCell>
                      <TableCell className="text-[12px] text-right py-2.5 tabular-nums text-muted-foreground">
                        {r.costPerLead > 0 ? fmtAED(r.costPerLead) : <span>—</span>}
                      </TableCell>
                      <TableCell className="text-right py-2.5">
                        <span className={`text-[12px] tabular-nums ${
                          r.conversionRate >= 40 ? "text-success" :
                          r.conversionRate >= 20 ? "text-primary" :
                          "text-warning"
                        }`}>
                          {r.conversionRate.toFixed(1)}%
                        </span>
                      </TableCell>
                      <TableCell className="text-[12px] text-right py-2.5 tabular-nums text-muted-foreground">
                        {r.spend > 0 ? fmtAED(r.spend) : <span>—</span>}
                      </TableCell>
                      <TableCell className="text-[12px] text-right py-2.5 tabular-nums">
                        {r.lifetimeCostPerConversion > 0
                          ? <span className="text-foreground/80">{fmtAED(r.lifetimeCostPerConversion)}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right py-2.5">
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
