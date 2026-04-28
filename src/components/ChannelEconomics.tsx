import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChannelIcon } from "@/components/ChannelIcon";
import { Trophy, TrendingDown, Target, Zap, ChevronRight } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useChannelEconomics, useChannelWinners, type ChannelEconomicsRow } from "@/hooks/use-channel-economics";
import { useFilters } from "@/lib/filters";
import { useCurrency } from "@/lib/CurrencyProvider";
import type { ChannelKey } from "@/lib/channel-mapping";

const fmtN = (v: number) => v.toLocaleString();

// Lightweight helper: a label with a hover-tooltip explaining the metric.
// No visible info icon — hover anywhere on the label reveals the tooltip,
// matching the rest of the dashboard's hover-only KPI tooltip pattern.
function HeaderHint({ label, hint, className = "" }: { label: string; hint: string; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`cursor-help ${className}`}>{label}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-[11px] max-w-[260px] leading-snug">
        {hint}
      </TooltipContent>
    </Tooltip>
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
  hint?: string;
  iconColor: string;
  iconBg: string;
  channel: string | null;
  value: string;
  sub?: string;
}

function WinnerCard({ icon: Icon, label, hint, iconColor, iconBg, channel, value, sub }: WinnerCardProps) {
  return (
    <Card className="shadow-sm border-border/50">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          {hint ? (
            <HeaderHint label={label} hint={hint} className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide" />
          ) : (
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
          )}
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
        <WinnerCard
          icon={Trophy}
          label="Best Channel (Volume)"
          hint="Channel that produced the most leads in this period — pure volume, ignoring cost."
          iconColor="text-amber-600" iconBg="bg-amber-50"
          channel={winners?.mostLeads?.channel ?? null}
          value={winners?.mostLeads ? `${fmtN(winners.mostLeads.leads)} leads` : ""}
          sub={winners?.mostLeads ? `${fmtN(winners.mostLeads.qualified)} qualified · ${winners.mostLeads.qualifiedRate.toFixed(0)}% rate` : undefined}
        />
        <WinnerCard
          icon={TrendingDown}
          label="Lowest Cost Per Lead"
          hint="Cheapest channel per lead generated. Spend ÷ leads. Only channels with both spend and leads are considered."
          iconColor="text-emerald-600" iconBg="bg-emerald-50"
          channel={winners?.lowestCPL?.channel ?? null}
          value={winners?.lowestCPL ? fmtAED(winners.lowestCPL.costPerLead) : ""}
          sub={winners?.lowestCPL ? `${fmtAED(winners.lowestCPL.spend)} / ${fmtN(winners.lowestCPL.leads)} leads` : undefined}
        />
        <WinnerCard
          icon={Target}
          label="Lowest Cost / Qualified"
          hint={`Cheapest channel per qualified lead. Spend ÷ qualified leads. Qualified = Initial Sales Call Completed, High Priority Follow up, or Closed Won. "Contact in Future" excluded.`}
          iconColor="text-orange-600" iconBg="bg-orange-50"
          channel={winners?.lowestCPQ?.channel ?? null}
          value={winners?.lowestCPQ ? fmtAED(winners.lowestCPQ.costPerQualified) : ""}
          sub={winners?.lowestCPQ ? `${fmtN(winners.lowestCPQ.qualified)} qualified leads` : undefined}
        />
        {/* Prefer Cost / Conversion when we have spend + a converted lead; otherwise show
            the rate-based winner so the card never reads as empty. */}
        {winners?.lowestCPC ? (
          <WinnerCard
            icon={Zap}
            label="Lowest Cost / Conversion"
            hint="Cheapest channel per converted lead. Spend ÷ converted leads. Converted = High Priority Follow up or Closed Won (genuine traction)."
            iconColor="text-violet-600" iconBg="bg-violet-50"
            channel={winners.lowestCPC.channel}
            value={fmtAED(winners.lowestCPC.costPerConversion)}
            sub={`${fmtAED(winners.lowestCPC.spend)} / ${fmtN(winners.lowestCPC.converted)} converted`}
          />
        ) : (
          <WinnerCard
            icon={Zap}
            label="Best Conversion Rate"
            hint="Channel with the highest share of leads that converted (≥ 5 leads required to avoid tiny-sample winners). Shown when no spend is recorded so a Cost / Conversion winner can't be picked."
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
    const leads     = list.reduce((s, r) => s + r.leads,     0);
    const spend     = list.reduce((s, r) => s + r.spend,     0);
    const qualified = list.reduce((s, r) => s + r.qualified, 0);
    return {
      leads, spend, qualified,
      costPerLead: leads > 0 && spend > 0 ? spend / leads : 0,
    };
  };

  const colCount = 8; // Channel + 6 metric columns + drill-in

  return (
    <Card className="shadow-sm border-border/50 mb-5">
      <CardHeader className="pb-1 pt-4 px-4">
        <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Channel Economics</CardTitle>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          Channels grouped by source type. Cost / Lead is the headline efficiency metric — lower is better. "—" means no spend recorded. Click a row to drill into that channel's leads.
        </p>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="overflow-x-auto -mx-4 px-4">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-[10px] uppercase tracking-wide h-8">Channel</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">
                  <HeaderHint label="Leads" hint="Total Zoho leads attributed to this channel in the selected date range." className="justify-end" />
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">
                  <HeaderHint label="Cost / Lead" hint="Marketing spend ÷ leads. The headline efficiency metric — lower is better. Shown as “—” when no spend was recorded for the channel." className="justify-end" />
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">
                  <HeaderHint label="Qualified" hint="Leads that reached a qualified status: Initial Sales Call Completed, High Priority Follow up, or Closed Won. % shows the qualification rate. “Contact in Future” is excluded." className="justify-end" />
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">
                  <HeaderHint label="Cost / Qual." hint="Marketing spend ÷ qualified leads. More meaningful than Cost / Lead because it adjusts for lead quality. Lower is better." className="justify-end" />
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">
                  <HeaderHint label="Conv. Rate" hint="Share of leads that converted (High Priority Follow up or Closed Won). Coloured: green ≥ 40%, blue ≥ 20%, amber below." className="justify-end" />
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">
                  <HeaderHint label="Spend" hint="Total marketing spend recorded for this channel in the period. “—” means no spend was logged (lead came in organically or attribution is missing)." className="justify-end" />
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
                          {fmtN(totals.leads)} leads
                          {totals.spend > 0 && <> · {fmtAED(totals.spend)} spend</>}
                          {totals.costPerLead > 0 && <> · <span className="font-medium text-foreground">{fmtAED(totals.costPerLead)} avg CPL</span></>}
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
                      <TableCell className="text-[12px] text-right py-2.5 tabular-nums">{fmtN(r.leads)}</TableCell>
                      <TableCell className="text-[12px] text-right py-2.5 tabular-nums font-semibold">
                        {r.costPerLead > 0 ? fmtAED(r.costPerLead) : <span className="text-muted-foreground font-normal">—</span>}
                      </TableCell>
                      <TableCell className="text-[12px] text-right py-2.5 tabular-nums">
                        <span className="text-primary/80">{fmtN(r.qualified)}</span>
                        <span className="text-[10px] font-normal ml-1 opacity-70">({r.qualifiedRate.toFixed(0)}%)</span>
                      </TableCell>
                      <TableCell className="text-[12px] text-right py-2.5 tabular-nums">
                        {r.costPerQualified > 0 ? fmtAED(r.costPerQualified) : <span className="text-muted-foreground">—</span>}
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
