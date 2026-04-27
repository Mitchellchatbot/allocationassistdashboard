import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChannelIcon } from "@/components/ChannelIcon";
import { Trophy, TrendingDown, Target, Zap, ChevronRight } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useChannelEconomics, useChannelWinners } from "@/hooks/use-channel-economics";
import { useFilters } from "@/lib/filters";
import { useCurrency } from "@/lib/CurrencyProvider";

const fmtN = (v: number) => v.toLocaleString();

interface WinnerCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  iconColor: string;
  iconBg: string;
  channel: string | null;
  value: string;
  sub?: string;
}

function WinnerCard({ icon: Icon, label, iconColor, iconBg, channel, value, sub }: WinnerCardProps) {
  return (
    <Card className="shadow-sm border-border/50">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
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
          iconColor="text-amber-600" iconBg="bg-amber-50"
          channel={winners?.mostLeads?.channel ?? null}
          value={winners?.mostLeads ? `${fmtN(winners.mostLeads.leads)} leads` : ""}
          sub={winners?.mostLeads ? `${fmtN(winners.mostLeads.qualified)} qualified · ${winners.mostLeads.qualifiedRate.toFixed(0)}% rate` : undefined}
        />
        <WinnerCard
          icon={TrendingDown}
          label="Lowest Cost Per Lead"
          iconColor="text-emerald-600" iconBg="bg-emerald-50"
          channel={winners?.lowestCPL?.channel ?? null}
          value={winners?.lowestCPL ? fmtAED(winners.lowestCPL.costPerLead) : ""}
          sub={winners?.lowestCPL ? `${fmtAED(winners.lowestCPL.spend)} / ${fmtN(winners.lowestCPL.leads)} leads` : undefined}
        />
        <WinnerCard
          icon={Target}
          label="Lowest Cost / Qualified"
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
            iconColor="text-violet-600" iconBg="bg-violet-50"
            channel={winners.lowestCPC.channel}
            value={fmtAED(winners.lowestCPC.costPerConversion)}
            sub={`${fmtAED(winners.lowestCPC.spend)} / ${fmtN(winners.lowestCPC.converted)} converted`}
          />
        ) : (
          <WinnerCard
            icon={Zap}
            label="Best Conversion Rate"
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

  return (
    <Card className="shadow-sm border-border/50 mb-5">
      <CardHeader className="pb-1 pt-4 px-4">
        <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Channel Economics</CardTitle>
        <p className="text-[10px] text-muted-foreground mt-0.5">Spend joined with Zoho leads on a normalised channel name. "—" means no spend recorded for that channel. Click a row to see that channel's leads.</p>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="overflow-x-auto -mx-4 px-4">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-[10px] uppercase tracking-wide h-8">Channel</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Spend</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Leads</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Cost / Lead</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Qualified</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Cost / Qual.</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Cost / Conv.</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Conv. Rate</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right w-[80px]">Drill in</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(r => (
                <TableRow key={r.channel} className="hover:bg-muted/30 cursor-pointer group" onClick={() => {
                  navigate(`/leads-pipeline?source=${encodeURIComponent(r.channel)}`);
                }}>
                  <TableCell className="text-[12px] font-medium py-2.5">
                    <div className="flex items-center gap-2">
                      <ChannelIcon channel={r.channel} size={13} />
                      {r.channel}
                    </div>
                  </TableCell>
                  <TableCell className="text-[12px] text-right py-2.5 tabular-nums">
                    {r.spend > 0 ? fmtAED(r.spend) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-[12px] text-right py-2.5 tabular-nums">{fmtN(r.leads)}</TableCell>
                  <TableCell className="text-[12px] text-right py-2.5 tabular-nums">
                    {r.costPerLead > 0 ? fmtAED(r.costPerLead) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-[12px] text-right py-2.5 tabular-nums">
                    <span className="text-primary/80">{fmtN(r.qualified)}</span>
                    <span className="text-[10px] font-normal ml-1 opacity-70">({r.qualifiedRate.toFixed(0)}%)</span>
                  </TableCell>
                  <TableCell className="text-[12px] text-right py-2.5 tabular-nums">
                    {r.costPerQualified > 0 ? fmtAED(r.costPerQualified) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-[12px] text-right py-2.5 tabular-nums">
                    {r.costPerConversion > 0 ? fmtAED(r.costPerConversion) : <span className="text-muted-foreground">—</span>}
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
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
