import { DashboardLayout } from "@/components/layout/DashboardLayout";
import KpiCard from "@/components/KpiCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { overviewKpis, leadsOverTime, conversionFunnel, channelPerformance, recentActivity } from "@/lib/mock-data";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Area, AreaChart,
} from "recharts";
import { Activity, Phone, Mail, AlertTriangle, Award, Calendar } from "lucide-react";

const activityIcons: Record<string, React.ReactNode> = {
  lead: <Activity className="h-3.5 w-3.5 text-info" />,
  deal: <Award className="h-3.5 w-3.5 text-success" />,
  campaign: <Mail className="h-3.5 w-3.5 text-primary" />,
  alert: <AlertTriangle className="h-3.5 w-3.5 text-warning" />,
  interview: <Calendar className="h-3.5 w-3.5 text-muted-foreground" />,
  milestone: <Award className="h-3.5 w-3.5 text-primary" />,
};

const tooltipStyle = {
  backgroundColor: "hsl(0, 0%, 100%)",
  border: "1px solid hsl(214, 20%, 90%)",
  borderRadius: "8px",
  fontSize: "12px",
};

const Index = () => {
  return (
    <DashboardLayout title="Dashboard" subtitle="Overview of key metrics and performance">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {overviewKpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Leads Over Time */}
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Leads Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={leadsOverTime}>
                <defs>
                  <linearGradient id="leadsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(174, 65%, 42%)" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="hsl(174, 65%, 42%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 93%)" />
                <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} stroke="hsl(215,15%,50%)" />
                <YAxis fontSize={12} tickLine={false} axisLine={false} stroke="hsl(215,15%,50%)" />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="leads" stroke="hsl(174, 65%, 42%)" strokeWidth={2} fill="url(#leadsFill)" />
                <Line type="monotone" dataKey="qualified" stroke="hsl(210, 80%, 55%)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="closed" stroke="hsl(152, 60%, 42%)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-2 justify-center">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="h-2 w-2 rounded-full bg-primary" /> Leads
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="h-2 w-2 rounded-full bg-info" /> Qualified
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="h-2 w-2 rounded-full bg-success" /> Closed
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Conversion Funnel */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Conversion Funnel</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {conversionFunnel.map((item, i) => (
                <div key={item.stage}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-foreground">{item.stage}</span>
                    <span className="text-xs text-muted-foreground">{item.count.toLocaleString()}</span>
                  </div>
                  <div className="h-8 rounded-md bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-md flex items-center pl-3 transition-all"
                      style={{
                        width: `${item.pct}%`,
                        backgroundColor: `hsl(174, 65%, ${42 + i * 8}%)`,
                      }}
                    >
                      <span className="text-[10px] font-bold text-primary-foreground">{item.pct}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Channel Performance */}
        <Card className="lg:col-span-3 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Channel Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={channelPerformance} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 93%)" />
                <XAxis dataKey="channel" fontSize={11} tickLine={false} axisLine={false} stroke="hsl(215,15%,50%)" />
                <YAxis fontSize={11} tickLine={false} axisLine={false} stroke="hsl(215,15%,50%)" />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="leads" fill="hsl(174, 65%, 42%)" radius={[4, 4, 0, 0]} name="Leads" />
                <Bar dataKey="conversions" fill="hsl(210, 80%, 55%)" radius={[4, 4, 0, 0]} name="Conversions" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentActivity.map((item, i) => (
                <div key={i} className="flex items-start gap-3 pb-3 border-b last:border-0 last:pb-0">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
                    {activityIcons[item.type]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground">{item.action}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{item.detail}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">{item.time}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Index;
