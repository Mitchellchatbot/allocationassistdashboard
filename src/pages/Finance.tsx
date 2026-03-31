import { DashboardLayout } from "@/components/layout/DashboardLayout";
import KpiCard from "@/components/KpiCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { financeMetrics, channelROI } from "@/lib/mock-data";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";

const tip = {
  backgroundColor: "#fff",
  border: "1px solid hsl(220,14%,90%)",
  borderRadius: "6px",
  fontSize: "11px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
};

const Finance = () => (
  <DashboardLayout title="Finance" subtitle="Revenue, spend, and return on investment">
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
      {financeMetrics.map(m => <KpiCard key={m.label} {...m} />)}
    </div>

    <Card className="shadow-sm border-border/50">
      <CardHeader className="pb-1 pt-4 px-4">
        <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">ROI by Channel</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={channelROI} layout="vertical" barCategoryGap="25%">
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,92%)" />
            <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)" tickFormatter={v => `${v}x`} />
            <YAxis dataKey="channel" type="category" fontSize={10} tickLine={false} axisLine={false} width={95} stroke="hsl(220,10%,55%)" />
            <Tooltip contentStyle={tip} formatter={(v: number) => [`${v}x`, "ROI"]} />
            <Bar dataKey="roi" radius={[0, 4, 4, 0]}>
              {channelROI.map((_, i) => (
                <Cell key={i} fill={i === 0 ? "hsl(170,55%,45%)" : "hsl(210,75%,52%)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  </DashboardLayout>
);

export default Finance;
