import { Card, CardContent } from "@/components/ui/card";
import { Trophy, Target, Zap } from "lucide-react";
import { useCampaignWinners, type CampaignRow } from "@/hooks/use-campaign-winners";

const fmtAED = (v: number) =>
  v >= 1000 ? `AED ${(v / 1000).toFixed(1)}K` : `AED ${Math.round(v).toLocaleString()}`;
const fmtN = (v: number) => v.toLocaleString();

interface WinnerCardProps {
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  iconBg: string;
  label: string;
  campaign: CampaignRow | null;
  primaryValue: string;
  sub?: string;
}

function CampaignCard({ icon: Icon, iconColor, iconBg, label, campaign, primaryValue, sub }: WinnerCardProps) {
  return (
    <Card className="shadow-sm border-border/50">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
          <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${iconBg}`}>
            <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
          </div>
        </div>
        {campaign ? (
          <>
            <p className="text-base font-semibold truncate" title={campaign.campaign}>{campaign.campaign}</p>
            <p className="text-lg font-bold tabular-nums">{primaryValue}</p>
            {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
          </>
        ) : (
          <>
            <p className="text-base font-semibold text-muted-foreground">—</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Not enough campaign data</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function CampaignWinnerCards() {
  const { rows, hasSpendData, mostQualified, bestQualifiedKpi, bestConversionKpi } = useCampaignWinners();

  if (rows.length === 0) return null;

  // Card 2 + 3 labels swap when no spend data (rate-based fallback).
  const qualifiedLabel  = hasSpendData ? "Lowest Cost / Qualified Lead" : "Highest Qualification Rate";
  const conversionLabel = hasSpendData ? "Lowest Cost / Conversion"     : "Highest Conversion Rate";

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Campaign Winners</p>
        {!hasSpendData && (
          <p className="text-[10px] text-muted-foreground">
            Cost-per metrics unavailable — connect Meta Ads on the Meta Ads page to enable
          </p>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <CampaignCard
          icon={Trophy}
          iconColor="text-amber-600" iconBg="bg-amber-50"
          label="Most Qualified Leads"
          campaign={mostQualified}
          primaryValue={mostQualified ? `${fmtN(mostQualified.qualified)} qualified` : ""}
          sub={mostQualified
            ? `${fmtN(mostQualified.total)} total · ${mostQualified.qualifiedRate.toFixed(0)}% rate`
            : undefined}
        />
        <CampaignCard
          icon={Target}
          iconColor="text-orange-600" iconBg="bg-orange-50"
          label={qualifiedLabel}
          campaign={bestQualifiedKpi}
          primaryValue={
            bestQualifiedKpi
              ? hasSpendData
                ? fmtAED(bestQualifiedKpi.costPerQualified)
                : `${bestQualifiedKpi.qualifiedRate.toFixed(1)}%`
              : ""
          }
          sub={bestQualifiedKpi
            ? hasSpendData
              ? `${fmtAED(bestQualifiedKpi.spend)} / ${fmtN(bestQualifiedKpi.qualified)} qualified`
              : `${fmtN(bestQualifiedKpi.qualified)} of ${fmtN(bestQualifiedKpi.total)} leads`
            : undefined}
        />
        <CampaignCard
          icon={Zap}
          iconColor="text-violet-600" iconBg="bg-violet-50"
          label={conversionLabel}
          campaign={bestConversionKpi}
          primaryValue={
            bestConversionKpi
              ? hasSpendData
                ? fmtAED(bestConversionKpi.costPerConversion)
                : `${bestConversionKpi.conversionRate.toFixed(1)}%`
              : ""
          }
          sub={bestConversionKpi
            ? hasSpendData
              ? `${fmtAED(bestConversionKpi.spend)} / ${fmtN(bestConversionKpi.converted)} converted`
              : `${fmtN(bestConversionKpi.converted)} of ${fmtN(bestConversionKpi.total)} leads`
            : undefined}
        />
      </div>
    </div>
  );
}
