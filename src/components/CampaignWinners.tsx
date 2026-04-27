import { useState } from "react";
import { Trophy, Target, Zap } from "lucide-react";
import { useCampaignWinners, type CampaignRow } from "@/hooks/use-campaign-winners";
import { useCurrency } from "@/lib/CurrencyProvider";

const fmtN = (v: number) => v.toLocaleString();

interface WinnerCardProps {
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  iconBg: string;
  label: string;
  campaign: CampaignRow | null;
  primaryValue: string;
  sub?: string;
  back: React.ReactNode;          // calculation breakdown shown when flipped
}

/**
 * Flippable campaign-winner card. Front shows the headline metric; click flips
 * the card to a back face that explains how the number was computed (input
 * spend, lead counts, division shown step-by-step).
 */
function CampaignCard({ icon: Icon, iconColor, iconBg, label, campaign, primaryValue, sub, back }: WinnerCardProps) {
  const [flipped, setFlipped] = useState(false);
  const empty = !campaign;
  return (
    <div
      className={empty ? "select-none" : "cursor-pointer select-none"}
      style={{
        perspective: "1200px",
        height: flipped ? "200px" : "128px",
        transition: "height 0.45s cubic-bezier(0.4,0,0.2,1)",
      }}
      onClick={() => !empty && setFlipped(f => !f)}
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
          className="absolute inset-0 rounded-xl border border-border/50 bg-card shadow-sm hover:shadow-md hover:scale-[1.01] transition-all p-4 flex flex-col"
        >
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
              <p className="text-[9px] text-muted-foreground/50 mt-auto pt-1">click to see how this was calculated</p>
            </>
          ) : (
            <>
              <p className="text-base font-semibold text-muted-foreground">—</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Not enough campaign data</p>
            </>
          )}
        </div>

        {/* Back */}
        <div
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateX(180deg)",
          }}
          className="absolute inset-0 rounded-xl border border-border/50 bg-card shadow-md flex flex-col overflow-hidden"
        >
          <div className={`flex items-center justify-between px-4 py-2 border-b border-border/30 ${iconBg} shrink-0`}>
            <div className="flex items-center gap-1.5 min-w-0">
              <Icon className={`h-3 w-3 ${iconColor} shrink-0`} />
              <span className="text-[11px] font-semibold truncate">{label}</span>
            </div>
            <span className="text-[9px] text-muted-foreground shrink-0 ml-2">click to close</span>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0 text-[11px]">
            {back}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CampaignWinnerCards() {
  const { rows, hasSpendData, mostQualified, bestQualifiedKpi, bestConversionKpi } = useCampaignWinners();
  const { fmt: fmtAED } = useCurrency();

  if (rows.length === 0) return null;

  // Card 2 + 3 labels swap when no spend data (rate-based fallback).
  const qualifiedLabel  = hasSpendData ? "Lowest Cost / Qualified Lead" : "Highest Qualification Rate";
  const conversionLabel = hasSpendData ? "Lowest Cost / Conversion"     : "Highest Conversion Rate";

  // ── Calculation breakdowns for the back faces ────────────────────────────

  const mostQualifiedBack = mostQualified ? (
    <div className="space-y-2">
      <p className="text-foreground/80">
        We rank every campaign by raw <strong>qualified lead count</strong>. A lead is "qualified"
        if its Zoho status is one of: Initial Sales Call Completed, Contact in Future, High Priority Follow up, or Closed Won.
      </p>
      <div className="space-y-1 pt-2 border-t border-border/40">
        <div className="flex justify-between"><span className="text-muted-foreground">Total leads</span><span className="font-semibold tabular-nums">{fmtN(mostQualified.total)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Qualified</span><span className="font-semibold tabular-nums">{fmtN(mostQualified.qualified)}</span></div>
        <div className="flex justify-between pt-1 border-t border-border/40">
          <span className="font-semibold">Qualification rate</span>
          <span className="font-bold tabular-nums text-amber-600">{mostQualified.qualifiedRate.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  ) : null;

  const bestQualifiedBack = bestQualifiedKpi ? (
    hasSpendData ? (
      <div className="space-y-2">
        <p className="text-foreground/80">
          <strong>Cost / Qualified Lead</strong> = Meta ad spend on this campaign ÷ qualified lead count.
          Only campaigns with both spend and qualified leads are eligible.
        </p>
        <div className="space-y-1 pt-2 border-t border-border/40">
          <div className="flex justify-between"><span className="text-muted-foreground">Ad spend</span><span className="font-semibold tabular-nums">{fmtAED(bestQualifiedKpi.spend)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Qualified leads</span><span className="font-semibold tabular-nums">{fmtN(bestQualifiedKpi.qualified)}</span></div>
          <div className="flex justify-between pt-1 border-t border-border/40">
            <span className="font-semibold">Cost / qualified</span>
            <span className="font-bold tabular-nums text-orange-600">{fmtAED(bestQualifiedKpi.costPerQualified)}</span>
          </div>
        </div>
      </div>
    ) : (
      <div className="space-y-2">
        <p className="text-foreground/80">
          No Meta ad spend matched to campaigns, so we ranked by <strong>qualification rate</strong>
          (qualified ÷ total). Campaigns need ≥ 5 leads to be eligible — avoids tiny campaigns winning by accident.
        </p>
        <div className="space-y-1 pt-2 border-t border-border/40">
          <div className="flex justify-between"><span className="text-muted-foreground">Total leads</span><span className="font-semibold tabular-nums">{fmtN(bestQualifiedKpi.total)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Qualified</span><span className="font-semibold tabular-nums">{fmtN(bestQualifiedKpi.qualified)}</span></div>
          <div className="flex justify-between pt-1 border-t border-border/40">
            <span className="font-semibold">Qualification rate</span>
            <span className="font-bold tabular-nums text-orange-600">{bestQualifiedKpi.qualifiedRate.toFixed(1)}%</span>
          </div>
        </div>
      </div>
    )
  ) : null;

  const bestConversionBack = bestConversionKpi ? (
    hasSpendData ? (
      <div className="space-y-2">
        <p className="text-foreground/80">
          <strong>Cost / Conversion</strong> = Meta ad spend on this campaign ÷ converted lead count.
          A lead is "converted" if its Zoho status is Contact in Future, High Priority Follow up, or Closed Won.
        </p>
        <div className="space-y-1 pt-2 border-t border-border/40">
          <div className="flex justify-between"><span className="text-muted-foreground">Ad spend</span><span className="font-semibold tabular-nums">{fmtAED(bestConversionKpi.spend)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Converted leads</span><span className="font-semibold tabular-nums">{fmtN(bestConversionKpi.converted)}</span></div>
          <div className="flex justify-between pt-1 border-t border-border/40">
            <span className="font-semibold">Cost / conversion</span>
            <span className="font-bold tabular-nums text-violet-600">{fmtAED(bestConversionKpi.costPerConversion)}</span>
          </div>
        </div>
      </div>
    ) : (
      <div className="space-y-2">
        <p className="text-foreground/80">
          No Meta ad spend matched to campaigns, so we ranked by <strong>conversion rate</strong>
          (converted ÷ total). Campaigns need ≥ 5 leads to be eligible.
        </p>
        <div className="space-y-1 pt-2 border-t border-border/40">
          <div className="flex justify-between"><span className="text-muted-foreground">Total leads</span><span className="font-semibold tabular-nums">{fmtN(bestConversionKpi.total)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Converted</span><span className="font-semibold tabular-nums">{fmtN(bestConversionKpi.converted)}</span></div>
          <div className="flex justify-between pt-1 border-t border-border/40">
            <span className="font-semibold">Conversion rate</span>
            <span className="font-bold tabular-nums text-violet-600">{bestConversionKpi.conversionRate.toFixed(1)}%</span>
          </div>
        </div>
      </div>
    )
  ) : null;

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
          back={mostQualifiedBack}
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
          back={bestQualifiedBack}
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
          back={bestConversionBack}
        />
      </div>
    </div>
  );
}
