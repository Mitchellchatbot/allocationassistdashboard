import { DashboardLayout } from "@/components/layout/DashboardLayout";
import KpiCard from "@/components/KpiCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { financeMetrics, channelROI } from "@/lib/mock-data";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";

const tooltipStyle = {
  backgroundColor: "hsl(0, 0%, 100%)",
  border: "1px solid hsl(214, 20%, 90%)",
  borderRadius: "8px",
  fontSize: "12px",
};

const Finance = () => {
  return (
    <DashboardLayout title="Finance" subtitle="Financial overview and ROI tracking">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {financeMetrics.map((m) => (
          <KpiCard key={m.label} {...m} period="vs last month" />
        ))}
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">ROI by Channel</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={channelROI} layout="vertical" barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 93%)" />
              <XAxis type="number" fontSize={12} tickLine={false} axisLine={false} stroke="hsl(215,15%,50%)" tickFormatter={(v) => `${v}x`} />
              <YAxis dataKey="channel" type="category" fontSize={12} tickLine={false} axisLine={false} width={100} stroke="hsl(215,15%,50%)" />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}x`, "ROI"]} />
              <Bar dataKey="roi" radius={[0, 6, 6, 0]}>
                {channelROI.map((_, i) => (
                  <Cell key={i} fill={i === 0 ? "hsl(174, 65%, 42%)" : "hsl(210, 80%, 55%)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
};

export default Finance;
