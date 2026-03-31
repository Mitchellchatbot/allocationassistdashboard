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

const tip = {
  backgroundColor: "#fff",
  border: "1px solid hsl(220,14%,90%)",
  borderRadius: "6px",
  fontSize: "11px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
};

const Marketing = () => {
  const { marketing, costVsConv } = useFilteredData();
  const bestChannel = marketing.reduce((a, b) => (a.roi > b.roi ? a : b));

  return (
    <DashboardLayout title="Marketing" subtitle="Channel performance and doctor acquisition cost">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        {marketing.map(ch => (
          <Card key={ch.channel} className={`shadow-sm border-kpi/60 bg-kpi ${ch.channel === bestChannel.channel ? "ring-1 ring-primary/40" : ""}`}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{ch.channel}</p>
                {ch.channel === bestChannel.channel && <Star className="h-3 w-3 text-primary fill-primary" />}
              </div>
              <p className="text-lg font-semibold tabular-nums">{ch.doctors}</p>
              <p className="text-[10px] text-muted-foreground">doctors · ${ch.spend > 0 ? Math.round(ch.spend / Math.max(ch.placements, 1)) : 0} CPA</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Doctors by Channel</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={marketing}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,92%)" />
                <XAxis dataKey="channel" fontSize={10} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)" />
                <YAxis fontSize={10} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)" />
                <Tooltip contentStyle={tip} />
                <Bar dataKey="doctors" fill="hsl(170,55%,45%)" radius={[3, 3, 0, 0]} name="Doctors" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Cost vs Placements</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={costVsConv}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,92%)" />
                <XAxis dataKey="channel" fontSize={10} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)" />
                <YAxis yAxisId="left" fontSize={10} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)" tickFormatter={v => `$${v / 1000}k`} />
                <YAxis yAxisId="right" orientation="right" fontSize={10} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)" />
                <Tooltip contentStyle={tip} />
                <Bar yAxisId="left" dataKey="cost" fill="hsl(210,75%,52%)" radius={[3, 3, 0, 0]} name="Spend ($)" />
                <Line yAxisId="right" dataKey="placements" stroke="hsl(158,50%,42%)" strokeWidth={2} dot={{ r: 3 }} name="Placements" />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm border-border/50">
        <CardHeader className="pb-1 pt-4 px-4">
          <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Channel ROI Comparison</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-[10px] uppercase tracking-wide h-8">Channel</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Doctors</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Spend</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">CPA</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">Placements</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wide h-8 text-right">ROI</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {marketing.map(ch => (
                <TableRow key={ch.channel}>
                  <TableCell className="text-[12px] font-medium py-2">{ch.channel}</TableCell>
                  <TableCell className="text-[12px] text-right py-2 tabular-nums">{ch.doctors}</TableCell>
                  <TableCell className="text-[12px] text-right py-2 tabular-nums">${ch.spend.toLocaleString()}</TableCell>
                  <TableCell className="text-[12px] text-right py-2 tabular-nums">${ch.spend > 0 ? Math.round(ch.spend / Math.max(ch.placements, 1)) : 0}</TableCell>
                  <TableCell className="text-[12px] text-right py-2 tabular-nums">{ch.placements}</TableCell>
                  <TableCell className="text-right py-2">
                    <Badge variant={ch.roi >= 4 ? "default" : "secondary"} className="text-[10px] tabular-nums">{ch.roi}x</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
};

export default Marketing;
