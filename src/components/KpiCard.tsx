import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: string;
  change: number;
  period: string;
}

const KpiCard = ({ label, value, change, period }: KpiCardProps) => {
  const isPositive = change >= 0;

  return (
    <Card className="border shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
        <p className="text-2xl font-display font-bold text-foreground tracking-tight">{value}</p>
        <div className="flex items-center gap-1 mt-2">
          {isPositive ? (
            <TrendingUp className="h-3.5 w-3.5 text-success" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5 text-destructive" />
          )}
          <span className={`text-xs font-medium ${isPositive ? "text-success" : "text-destructive"}`}>
            {isPositive ? "+" : ""}{change}%
          </span>
          <span className="text-xs text-muted-foreground ml-1">{period}</span>
        </div>
      </CardContent>
    </Card>
  );
};

export default KpiCard;
