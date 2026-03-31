import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, type LucideIcon } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: string;
  change: number;
  period: string;
  icon?: LucideIcon;
}

const KpiCard = ({ label, value, change, period, icon: Icon }: KpiCardProps) => {
  const isPositive = change >= 0;

  return (
    <Card className="shadow-sm hover:shadow-md transition-all duration-200 border-border/60">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <p className="stat-label leading-tight">{label}</p>
          {Icon && (
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/8">
              <Icon className="h-3.5 w-3.5 text-primary" />
            </div>
          )}
        </div>
        <p className="stat-value">{value}</p>
        <div className="flex items-center gap-1.5 mt-2">
          <div className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
            isPositive 
              ? "bg-success/10 text-success" 
              : "bg-destructive/10 text-destructive"
          }`}>
            {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {isPositive ? "+" : ""}{change}%
          </div>
          <span className="text-[11px] text-muted-foreground">{period}</span>
        </div>
      </CardContent>
    </Card>
  );
};

export default KpiCard;
