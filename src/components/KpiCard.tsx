import { Card, CardContent } from "@/components/ui/card";
import { InfoIcon } from "@/components/InfoIcon";
import { TrendingUp, TrendingDown, Users, CheckCircle, FileText, Building2, Clock, DollarSign, type LucideIcon } from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
  users: Users,
  check: CheckCircle,
  file: FileText,
  building: Building2,
  clock: Clock,
  dollar: DollarSign,
};

// Short {meaning, source} pair for every KPI label that can render through
// this card. Kept terse on purpose — users asked for one-line explanations,
// not paragraphs.
const HINTS: Record<string, { meaning: string; source: string }> = {
  // Current dashboard KPIs
  "Qualified Active":     { meaning: "Qualified leads still active in the pipeline. Excludes Closed Won, Contact in Future, and unqualified leads.",                                  source: "Zoho CRM (Lead_Status)." },
  "Qualified Leads":      { meaning: 'Leads that reached Initial Sales Call Completed, High Priority Follow up, or Closed Won. "Contact in Future" excluded.',                       source: "Zoho CRM (Lead_Status)." },
  "Qualification Rate":   { meaning: "Qualified leads ÷ total leads in the period.",                                                                                                  source: "Zoho CRM (Lead_Status)." },
  "Lead → Placement":     { meaning: "Share of leads that reached Initial Sales Call Completed or High Priority Follow up.",                                                          source: "Zoho CRM (Lead_Status)." },
  "Pipeline Value":       { meaning: "Total $ value of open deals. Weighted figure applies stage probability.",                                                                       source: "Zoho CRM (Deals — Amount)." },
  "Avg. Time to Place":   { meaning: "Average days from lead creation to a Closed Won deal. Falls back to active-lead age when no deals closed.",                                     source: "Zoho CRM (Created_Time → Closing_Date)." },

  // Legacy labels still rendered in places
  "Active Doctors":         { meaning: "Doctors currently in the placement process.",                            source: "Zoho CRM (Lead_Status)." },
  "Doctors Placed":         { meaning: "Doctors successfully placed this period.",                               source: "Zoho CRM (Closed Won deals)." },
  "Awaiting License":       { meaning: "Doctors waiting for medical-license approval.",                          source: "Zoho CRM (license fields)." },
  "Partner Hospitals":      { meaning: "Hospitals we work with across all regions.",                             source: "Zoho CRM (Accounts module)." },
  "Revenue":                { meaning: "Total income from placements.",                                          source: "Zoho CRM (Closed Won deals — Amount)." },
  "Placement Rate":         { meaning: "Share of doctors successfully placed.",                                  source: "Zoho CRM." },
  "Marketing Spend":        { meaning: "Total advertising / marketing spend in the period.",                     source: "Marketing-spend imports." },
  "Placement Revenue":      { meaning: "Total income from Closed Won deals.",                                    source: "Zoho CRM (Deals — Amount)." },
  "Cost per Doctor Placed": { meaning: "Marketing spend ÷ placements.",                                          source: "Marketing-spend imports + Zoho CRM." },
  "Cost per Placement":     { meaning: "Marketing spend ÷ placements.",                                          source: "Marketing-spend imports + Zoho CRM." },
  "Return on Investment":   { meaning: "Revenue earned per dirham spent.",                                       source: "Marketing-spend imports + Zoho CRM (Deals)." },
};

interface KpiCardProps {
  label: string;
  value: string;
  change: number;
  period: string;
  icon?: string;
}

const KpiCard = ({ label, value, change, period, icon }: KpiCardProps) => {
  const isPositive = change >= 0;
  const Icon = icon ? iconMap[icon] : null;
  const isGood = label.includes("Time to Place") || label.includes("Cost") ? !isPositive : isPositive;
  const hint = HINTS[label];

  return (
    <Card className="shadow-sm bg-card border-border/60 border-t-2 border-t-primary hover:shadow-md hover:scale-[1.01] transition-all duration-200 cursor-default overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          {Icon ? (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
              <Icon className="h-4.5 w-4.5 text-primary" />
            </div>
          ) : <div />}
          <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${
            isGood ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
          }`}>
            {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {isPositive ? "+" : ""}{change}%
          </span>
        </div>
        <p className="text-[27px] font-semibold text-foreground tracking-tight leading-none mb-1.5" style={{ fontVariantNumeric: "tabular-nums" }}>
          {value}
        </p>
        <div className="flex items-center gap-1">
          <span className="text-[12px] font-medium text-foreground/70">{label}</span>
          {hint && <InfoIcon meaning={hint.meaning} source={hint.source} side="bottom" />}
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">{period}</p>
      </CardContent>
    </Card>
  );
};

export default KpiCard;
