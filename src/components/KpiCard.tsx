import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TrendingUp, TrendingDown, Users, CheckCircle, FileText, Building2, Clock, DollarSign, type LucideIcon } from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
  users: Users,
  check: CheckCircle,
  file: FileText,
  building: Building2,
  clock: Clock,
  dollar: DollarSign,
};

const tooltipMap: Record<string, string> = {
  "Active Doctors": "Doctors currently going through the placement process",
  "Doctors Placed": "Doctors who have been successfully placed at hospitals this period",
  "Awaiting License": "Doctors waiting for their medical license to be approved",
  "Partner Hospitals": "Hospitals we work with across all regions",
  "Avg. Time to Place": "Average number of days it takes to place a doctor from start to finish",
  "Revenue": "Total income earned from placements",
  "Placement Rate": "Percentage of doctors who are successfully placed",
  "Marketing Spend": "Total money spent on advertising and marketing",
  "Placement Revenue": "Total income earned from placing doctors",
  "Cost per Doctor Placed": "How much it costs on average to place one doctor",
  "Return on Investment": "How much revenue we earn for every dollar spent",
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
  const tooltipText = tooltipMap[label];

  const cardContent = (
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
        <div className="flex items-baseline gap-1.5">
          <span className="text-[12px] font-medium text-foreground/70">{label}</span>
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">{period}</p>
      </CardContent>
    </Card>
  );

  if (tooltipText) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{cardContent}</TooltipTrigger>
        <TooltipContent side="bottom" className="text-[10px] max-w-[200px]">{tooltipText}</TooltipContent>
      </Tooltip>
    );
  }

  return cardContent;
};

export default KpiCard;
