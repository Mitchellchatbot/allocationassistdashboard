import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFilteredData } from "@/hooks/use-filtered-data";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ComposedChart, Line,
} from "recharts";
import { Star } from "lucide-react";
import { ChannelIcon } from "@/components/ChannelIcon";

const tip = {
  backgroundColor: "#fff",
  border: "1px solid hsl(220,14%,90%)",
  borderRadius: "8px",
  fontSize: "11px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  padding: "8px 12px",
};

const Marketing = () => {
  const { marketing, costVsConv } = useFilteredData();
  const bestChannel = marketing.reduce((a, b) => (a.roi > b.roi ? a : b));

  return (
    <DashboardLayout title="Marketing" subtitle="See which advertising channels bring in the most doctors and best value">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-5">
        {marketing.map(ch => (
          <Card key={ch.channel} className={`shadow-sm border-kpi/60 bg-kpi hover:shadow-md hover:scale-[1.02] transition-all duration-200 ${ch.channel === bestChannel.channel ? "ring-1 ring-primary/40" : ""}`}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{ch.channel}</p>
                {ch.channel === bestChannel.channel && <Star className="h-3 w-3 text-primary fill-primary" />}
              </div>
              <p className="text-lg font-semibold tabular-nums">{ch.doctors}</p>
              <p className="text-[10px] text-muted-foreground">doctors · ${ch.spend > 0 ? Math.round(ch.spend / Math.max(ch.placements, 1)) : 0} per placement</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
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

        <Card className="shadow-sm border-border/50 hover:shadow-md transition-shadow">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Money Spent vs. Doctors Placed</CardTitle>
          </CardHeader>
          <CardContent className="px-2 sm:px-4 pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={costVsConv}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,92%)" />
                <XAxis dataKey="channel" fontSize={10} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)" />
                <YAxis yAxisId="left" fontSize={10} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)" tickFormatter={v => `$${v / 1000}k`} />
                <YAxis yAxisId="right" orientation="right" fontSize={10} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)" />
                <Tooltip contentStyle={tip} />
                <Bar yAxisId="left" dataKey="cost" fill="hsl(210,75%,52%)" radius={[4, 4, 0, 0]} name="Amount Spent ($)" />
                <Line yAxisId="right" dataKey="placements" stroke="hsl(158,50%,42%)" strokeWidth={2} dot={{ r: 3 }} name="Doctors Placed" />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm border-border/50">
        <CardHeader className="pb-1 pt-4 px-4">
          <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Which Channels Give the Best Returns</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="overflow-x-auto -mx-4 px-4">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[10px] uppercase tracking-wide h-8">Channel</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Doctors</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right hidden sm:table-cell">Amount Spent</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right hidden sm:table-cell">Cost per Placement</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Placed</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Return</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {marketing.map(ch => (
                  <TableRow key={ch.channel} className="hover:bg-muted/30">
                    <TableCell className="text-[12px] font-medium py-2.5">{ch.channel}</TableCell>
                    <TableCell className="text-[12px] text-right py-2.5 tabular-nums">{ch.doctors}</TableCell>
                    <TableCell className="text-[12px] text-right py-2.5 tabular-nums hidden sm:table-cell">${ch.spend.toLocaleString()}</TableCell>
                    <TableCell className="text-[12px] text-right py-2.5 tabular-nums hidden sm:table-cell">${ch.spend > 0 ? Math.round(ch.spend / Math.max(ch.placements, 1)) : 0}</TableCell>
                    <TableCell className="text-[12px] text-right py-2.5 tabular-nums">{ch.placements}</TableCell>
                    <TableCell className="text-right py-2.5">
                      <Badge variant={ch.roi >= 4 ? "default" : "secondary"} className="text-[10px] tabular-nums">{ch.roi}x</Badge>
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
