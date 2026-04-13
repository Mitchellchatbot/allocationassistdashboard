import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { Star } from "lucide-react";
import { ChannelIcon } from "@/components/ChannelIcon";
import { useZohoData, displaySource } from "@/hooks/use-zoho-data";
import { useState, useMemo } from "react";

const tip = {
  backgroundColor: "#fff",
  border: "1px solid hsl(220,14%,90%)",
  borderRadius: "8px",
  fontSize: "11px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  padding: "8px 12px",
};

const DATE_RANGES = [
  { label: "1W", days: 7 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "1Y", days: 365 },
] as const;

const Marketing = () => {
  const { data: zoho } = useZohoData();
  const [channelDays, setChannelDays] = useState<number>(30);

  const marketing = useMemo(() => {
    if (!zoho?.rawLeads) return [];
    const cutoff = Date.now() - channelDays * 86_400_000;
    const recentLeads = zoho.rawLeads.filter(l =>
      new Date(l.Created_Time).getTime() >= cutoff
    );

    const leadsByChannel:     Record<string, number> = {};
    const contactedByChannel: Record<string, number> = {};

    for (const l of recentLeads) {
      const ch = displaySource(l.Lead_Source);
      leadsByChannel[ch] = (leadsByChannel[ch] ?? 0) + 1;
      if (l.Lead_Status !== 'Not Contacted') {
        contactedByChannel[ch] = (contactedByChannel[ch] ?? 0) + 1;
      }
    }

    return Object.entries(leadsByChannel)
      .sort((a, b) => b[1] - a[1])
      .map(([channel, doctors]) => {
        const contacted    = contactedByChannel[channel] ?? 0;
        const contactRate  = doctors > 0 ? Math.round((contacted / doctors) * 100) : 0;
        return { channel, doctors, contacted, contactRate };
      });
  }, [zoho?.rawLeads, channelDays]);

  const bestChannel = marketing.length > 0
    ? marketing.reduce((a, b) => (a.doctors > b.doctors ? a : b))
    : null;

  return (
    <DashboardLayout title="Marketing" subtitle="See which channels bring in the most doctors and how well they convert">
      {/* Date range filter */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] text-muted-foreground">Showing leads created in the last:</p>
        <div className="flex gap-0.5">
          {DATE_RANGES.map(r => (
            <button
              key={r.label}
              onClick={() => setChannelDays(r.days)}
              className={`px-2.5 py-1 rounded text-[10px] font-medium transition-colors ${
                channelDays === r.days
                  ? "bg-primary text-white"
                  : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Channel KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-5">
        {marketing.map(ch => (
          <Card
            key={ch.channel}
            className={`shadow-sm border-kpi/60 bg-kpi hover:shadow-md hover:scale-[1.02] transition-all duration-200 ${bestChannel && ch.channel === bestChannel.channel ? "ring-1 ring-primary/40" : ""}`}
          >
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <ChannelIcon channel={ch.channel} size={14} />
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide truncate">{ch.channel}</p>
                {bestChannel && ch.channel === bestChannel.channel && <Star className="h-3 w-3 text-primary fill-primary ml-auto shrink-0" />}
              </div>
              <p className="text-lg font-semibold tabular-nums">{ch.doctors}</p>
              <p className="text-[10px] text-muted-foreground">{ch.contactRate}% contacted</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        {/* Doctors Acquired by Channel */}
        <Card className="shadow-sm border-border/50 hover:shadow-md transition-shadow">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Doctors Acquired by Channel</CardTitle>
          </CardHeader>
          <CardContent className="px-2 sm:px-4 pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={marketing}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,92%)" />
                <XAxis dataKey="channel" fontSize={10} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)" />
                <YAxis fontSize={10} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)" />
                <Tooltip contentStyle={tip} />
                <Bar dataKey="doctors" fill="hsl(170,55%,45%)" radius={[4, 4, 0, 0]} name="Doctors" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Contact Rate by Channel */}
        <Card className="shadow-sm border-border/50 hover:shadow-md transition-shadow">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Contact Rate by Channel</CardTitle>
          </CardHeader>
          <CardContent className="px-2 sm:px-4 pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={marketing} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,92%)" horizontal={false} />
                <XAxis
                  type="number" domain={[0, 100]}
                  tickFormatter={(v: number) => `${v}%`}
                  fontSize={10} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)"
                />
                <YAxis
                  type="category" dataKey="channel"
                  fontSize={10} width={70} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)"
                />
                <Tooltip contentStyle={tip} formatter={(v: number) => [`${v}%`, 'Contact Rate']} />
                <Bar dataKey="contactRate" fill="hsl(210,75%,52%)" radius={[0, 4, 4, 0]} name="Contact Rate" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Channel summary table */}
      <Card className="shadow-sm border-border/50">
        <CardHeader className="pb-1 pt-4 px-4">
          <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Channel Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="overflow-x-auto -mx-4 px-4">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[10px] uppercase tracking-wide h-8">Channel</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Doctors</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Contacted</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Contact Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {marketing.map(ch => (
                  <TableRow key={ch.channel} className="hover:bg-muted/30">
                    <TableCell className="text-[12px] font-medium py-2.5">
                      <div className="flex items-center gap-2">
                        <ChannelIcon channel={ch.channel} size={13} />
                        {ch.channel}
                      </div>
                    </TableCell>
                    <TableCell className="text-[12px] text-right py-2.5 tabular-nums">{ch.doctors}</TableCell>
                    <TableCell className="text-[12px] text-right py-2.5 tabular-nums">{ch.contacted}</TableCell>
                    <TableCell className="text-right py-2.5">
                      <span className={`text-[12px] font-semibold tabular-nums ${
                        ch.contactRate >= 70 ? 'text-success' :
                        ch.contactRate >= 40 ? 'text-primary' :
                        'text-warning'
                      }`}>
                        {ch.contactRate}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
};

export default Marketing;
