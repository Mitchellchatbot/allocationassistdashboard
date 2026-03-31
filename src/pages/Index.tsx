import { DashboardLayout } from "@/components/layout/DashboardLayout";
import KpiCard from "@/components/KpiCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { overviewKpis, leadsOverTime, placementFunnel, channelPerformance, recentActivity, regionData } from "@/lib/mock-data";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Line,
} from "recharts";
import { Activity, Award, AlertTriangle, Calendar, FileText, Handshake, UserPlus } from "lucide-react";

const activityIcons: Record<string, React.ReactNode> = {
  lead: <UserPlus className="h-3 w-3 text-info" />,
  placement: <Award className="h-3 w-3 text-success" />,
  license: <FileText className="h-3 w-3 text-primary" />,
  alert: <AlertTriangle className="h-3 w-3 text-warning" />,
  interview: <Calendar className="h-3 w-3 text-muted-foreground" />,
  document: <Activity className="h-3 w-3 text-info" />,
  partnership: <Handshake className="h-3 w-3 text-primary" />,
};

const tip = {
  backgroundColor: "#fff",
  border: "1px solid hsl(220,14%,90%)",
  borderRadius: "6px",
  fontSize: "11px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
};

const Index = () => (
  <DashboardLayout title="Overview" subtitle="Doctor placement and operational performance">
    {/* KPIs */}
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
      {overviewKpis.map((kpi) => <KpiCard key={kpi.label} {...kpi} />)}
    </div>

    {/* Charts row */}
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-5">
      {/* Doctor Applications Over Time */}
      <Card className="lg:col-span-3 shadow-sm border-border/50">
        <CardHeader className="pb-1 pt-4 px-4">
          <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Doctor Applications Over Time</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={leadsOverTime}>
              <defs>
                <linearGradient id="docFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(170,55%,45%)" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="hsl(170,55%,45%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,92%)" />
              <XAxis dataKey="month" fontSize={10} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)" />
              <YAxis fontSize={10} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)" />
              <Tooltip contentStyle={tip} />
              <Area type="monotone" dataKey="doctors" stroke="hsl(170,55%,45%)" strokeWidth={2} fill="url(#docFill)" name="Applications" />
              <Line type="monotone" dataKey="qualified" stroke="hsl(210,75%,52%)" strokeWidth={1.5} dot={false} name="Qualified" />
              <Line type="monotone" dataKey="placed" stroke="hsl(158,50%,42%)" strokeWidth={1.5} dot={false} name="Placed" />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-1 justify-center">
            {[{ c: "bg-primary", l: "Applications" }, { c: "bg-info", l: "Qualified" }, { c: "bg-success", l: "Placed" }].map(i => (
              <span key={i.l} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className={`h-1.5 w-1.5 rounded-full ${i.c}`} />{i.l}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Placement Funnel */}
      <Card className="lg:col-span-2 shadow-sm border-border/50">
        <CardHeader className="pb-1 pt-4 px-4">
          <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Placement Funnel</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="space-y-2.5">
            {placementFunnel.map((item, i) => (
              <div key={item.stage}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[11px] font-medium text-foreground">{item.stage}</span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">{item.count.toLocaleString()}</span>
                </div>
                <div className="h-6 rounded bg-muted overflow-hidden">
                  <div
                    className="h-full rounded flex items-center pl-2 transition-all"
                    style={{ width: `${item.pct}%`, backgroundColor: `hsl(170, ${55 - i * 5}%, ${45 + i * 4}%)` }}
                  >
                    <span className="text-[9px] font-semibold text-white">{item.pct}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>

    {/* Bottom row */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Regions */}
      <Card className="shadow-sm border-border/50">
        <CardHeader className="pb-1 pt-4 px-4">
          <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">By Region</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="space-y-2">
            {regionData.map((r) => (
              <div key={r.region} className="flex items-center justify-between p-2.5 rounded-md bg-secondary/50 hover:bg-secondary transition-colors">
                <div>
                  <p className="text-[12px] font-medium text-foreground">{r.region}</p>
                  <p className="text-[10px] text-muted-foreground">{r.hospitals} hospitals · {r.doctors} doctors</p>
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-semibold text-foreground tabular-nums">{r.placements}</p>
                  <p className="text-[10px] text-muted-foreground">placed</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Channel Performance */}
      <Card className="shadow-sm border-border/50">
        <CardHeader className="pb-1 pt-4 px-4">
          <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Channel Performance</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={channelPerformance} layout="vertical" barCategoryGap="18%">
              <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)" />
              <YAxis dataKey="channel" type="category" fontSize={10} tickLine={false} axisLine={false} width={80} stroke="hsl(220,10%,55%)" />
              <Tooltip contentStyle={tip} />
              <Bar dataKey="doctors" fill="hsl(170,55%,45%)" radius={[0, 3, 3, 0]} name="Doctors" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Activity Feed */}
      <Card className="shadow-sm border-border/50">
        <CardHeader className="pb-1 pt-4 px-4">
          <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="space-y-2">
            {recentActivity.slice(0, 6).map((item, i) => (
              <div key={i} className="flex items-start gap-2 pb-2 border-b border-border/40 last:border-0 last:pb-0">
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted">
                  {activityIcons[item.type]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-foreground leading-tight">{item.action}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{item.detail}</p>
                </div>
                <span className="text-[9px] text-muted-foreground shrink-0 mt-0.5">{item.time}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  </DashboardLayout>
);

export default Index;
