import { DashboardLayout } from "@/components/layout/DashboardLayout";
import KpiCard from "@/components/KpiCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFilteredData } from "@/hooks/use-filtered-data";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Line,
} from "recharts";
import { Activity, Award, AlertTriangle, Calendar, FileText, Handshake, UserPlus } from "lucide-react";
import { ChannelIcon } from "@/components/ChannelIcon";

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
  borderRadius: "8px",
  fontSize: "11px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  padding: "8px 12px",
};

const Index = () => {
  const { kpis, timeData, funnel, channels, regions, activity } = useFilteredData();

  return (
    <DashboardLayout title="Dashboard" subtitle="A quick look at how doctor placements and operations are performing">
      {/* Welcome Banner */}
      <div className="mb-5 rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 p-5">
        <h2 className="text-lg font-semibold text-foreground">Welcome back 👋</h2>
        <p className="text-sm text-muted-foreground mt-1">Here's what's happening with your doctor placements and operations today.</p>
      </div>

      {/* KPI Grid - responsive */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        {kpis.map((kpi) => <KpiCard key={kpi.label} {...kpi} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-5">
        <Card className="lg:col-span-3 shadow-sm border-border/50 hover:shadow-md transition-shadow">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Doctor Applications Over Time</CardTitle>
          </CardHeader>
          <CardContent className="px-2 sm:px-4 pb-4">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={timeData}>
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
                <Area type="monotone" dataKey="doctors" stroke="hsl(170,55%,45%)" strokeWidth={2} fill="url(#docFill)" name="Applied" />
                <Line type="monotone" dataKey="qualified" stroke="hsl(210,75%,52%)" strokeWidth={1.5} dot={false} name="Qualified" />
                <Line type="monotone" dataKey="placed" stroke="hsl(158,50%,42%)" strokeWidth={1.5} dot={false} name="Placed" />
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-2 justify-center">
              {[{ c: "bg-primary", l: "Applied" }, { c: "bg-info", l: "Qualified" }, { c: "bg-success", l: "Placed" }].map(i => (
                <span key={i.l} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className={`h-2 w-2 rounded-full ${i.c}`} />{i.l}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 shadow-sm border-border/50 hover:shadow-md transition-shadow">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">How Doctors Move Through the Process</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-3">
              {funnel.map((item, i) => (
                <div key={item.stage}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-medium text-foreground">{item.stage}</span>
                    <span className="text-[11px] text-muted-foreground tabular-nums">{item.count.toLocaleString()}</span>
                  </div>
                  <div className="h-7 rounded-md bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-md flex items-center pl-2.5 transition-all duration-500"
                      style={{ width: `${item.pct}%`, backgroundColor: `hsl(170, ${55 - i * 5}%, ${45 + i * 4}%)` }}
                    >
                      <span className="text-[9px] font-semibold text-white drop-shadow-sm">{item.pct}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="shadow-sm border-border/50 hover:shadow-md transition-shadow">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Performance by Region</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-2">
              {regions.map((r) => (
                <div key={r.region} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors">
                  <div>
                    <p className="text-[12px] font-medium text-foreground">{r.region}</p>
                    <p className="text-[10px] text-muted-foreground">{r.hospitals} hospitals · {r.doctors} doctors</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[14px] font-semibold text-foreground tabular-nums">{r.placements}</p>
                    <p className="text-[10px] text-muted-foreground">placed</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/50 hover:shadow-md transition-shadow">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Where Doctors Come From</CardTitle>
          </CardHeader>
          <CardContent className="px-2 sm:px-4 pb-4">
            <div className="space-y-2">
              {channels.map((ch) => (
                <div key={ch.channel} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors">
                  <ChannelIcon channel={ch.channel} size={14} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-foreground">{ch.channel}</p>
                    <div className="h-2 rounded-full bg-muted mt-1 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${Math.round((ch.doctors / Math.max(...channels.map(c => c.doctors))) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-[13px] font-semibold text-foreground tabular-nums">{ch.doctors}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/50 hover:shadow-md transition-shadow md:col-span-2 lg:col-span-1">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-2">
              {activity.slice(0, 6).map((item, i) => (
                <div key={i} className="flex items-start gap-2.5 pb-2 border-b border-border/40 last:border-0 last:pb-0 hover:bg-muted/30 rounded px-1 -mx-1 transition-colors">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted">
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
};

export default Index;
