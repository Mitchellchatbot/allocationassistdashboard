import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: string;
  change: number;
}

const KpiCard = ({ label, value, change }: KpiCardProps) => {
  const isPositive = change >= 0;

  return (
    <Card className="gradient-card border-border/50 glow-primary/20">
      <CardContent className="p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
          {label}
        </p>
        <p className="text-2xl font-display font-bold text-foreground tracking-tight">
          {value}
        </p>
        <div className="flex items-center gap-1 mt-2">
          {isPositive ? (
            <TrendingUp className="h-3.5 w-3.5 text-success" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5 text-destructive" />
          )}
          <span
            className={`text-xs font-display font-medium ${
              isPositive ? "text-success" : "text-destructive"
            }`}
          >
            {isPositive ? "+" : ""}
            {change}%
          </span>
          <span className="text-xs text-muted-foreground ml-1">vs last month</span>
        </div>
      </CardContent>
    </Card>
  );
};

export default KpiCard;
