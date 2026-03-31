import { Activity } from "lucide-react";
import KpiCard from "@/components/KpiCard";
import RevenueChart from "@/components/RevenueChart";
import CategoryChart from "@/components/CategoryChart";
import OrdersTable from "@/components/OrdersTable";
import { kpiData } from "@/lib/mock-data";

const Index = () => {
  return (
    <div className="min-h-screen bg-background p-6 md:p-8">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 glow-primary">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-display font-bold tracking-tight text-foreground">
              Sales Dashboard
            </h1>
            <p className="text-xs text-muted-foreground">Real-time metrics overview</p>
          </div>
        </div>
        <p className="text-xs font-display text-muted-foreground hidden sm:block">
          Last updated: Mar 31, 2026 · 09:42 AM
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpiData.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
        <div className="lg:col-span-3">
          <RevenueChart />
        </div>
        <div className="lg:col-span-2">
          <CategoryChart />
        </div>
      </div>

      <OrdersTable />
    </div>
  );
};

export default Index;
