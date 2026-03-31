import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { marketingChannelMetrics, costVsConversions } from "@/lib/mock-data";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ComposedChart, Line,
} from "recharts";
import { Star } from "lucide-react";

const tooltipStyle = {
  backgroundColor: "hsl(0, 0%, 100%)",
  border: "1px solid hsl(214, 20%, 90%)",
  borderRadius: "8px",
  fontSize: "12px",
};

const Marketing = () => {
  const bestChannel = marketingChannelMetrics.reduce((a, b) => (a.roi > b.roi ? a : b));

  return (
    <DashboardLayout title="Marketing" subtitle="Channel performance and campaign ROI">
      {/* Channel KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {marketingChannelMetrics.map((ch) => (
          <Card key={ch.channel} className={`shadow-sm ${ch.channel === bestChannel.channel ? "ring-2 ring-primary" : ""}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground">{ch.channel}</p>
                {ch.channel === bestChannel.channel && <Star className="h-3.5 w-3.5 text-primary fill-primary" />}
              </div>
              <p className="text-xl font-display font-bold">{ch.leads}</p>
              <p className="text-[11px] text-muted-foreground">leads · ${ch.cpl.toFixed(2)} CPL</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Leads by Channel */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Leads by Channel</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={marketingChannelMetrics}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 93%)" />
                <XAxis dataKey="channel" fontSize={11} tickLine={false} axisLine={false} stroke="hsl(215,15%,50%)" />
                <YAxis fontSize={11} tickLine={false} axisLine={false} stroke="hsl(215,15%,50%)" />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="leads" fill="hsl(174, 65%, 42%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Cost vs Conversions */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cost vs Conversions</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={costVsConversions}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 93%)" />
                <XAxis dataKey="channel" fontSize={11} tickLine={false} axisLine={false} stroke="hsl(215,15%,50%)" />
                <YAxis yAxisId="left" fontSize={11} tickLine={false} axisLine={false} stroke="hsl(215,15%,50%)" tickFormatter={(v) => `$${v / 1000}k`} />
                <YAxis yAxisId="right" orientation="right" fontSize={11} tickLine={false} axisLine={false} stroke="hsl(215,15%,50%)" />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar yAxisId="left" dataKey="cost" fill="hsl(210, 80%, 55%)" radius={[4, 4, 0, 0]} name="Cost ($)" />
                <Line yAxisId="right" dataKey="conversions" stroke="hsl(152, 60%, 42%)" strokeWidth={2} dot={{ r: 4 }} name="Conversions" />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Channel ROI Table */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Channel ROI Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Channel</TableHead>
                <TableHead className="text-xs text-right">Leads</TableHead>
                <TableHead className="text-xs text-right">Spend</TableHead>
                <TableHead className="text-xs text-right">CPL</TableHead>
                <TableHead className="text-xs text-right">Conversions</TableHead>
                <TableHead className="text-xs text-right">ROI</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {marketingChannelMetrics.map((ch) => (
                <TableRow key={ch.channel}>
                  <TableCell className="text-sm font-medium">{ch.channel}</TableCell>
                  <TableCell className="text-right text-sm">{ch.leads}</TableCell>
                  <TableCell className="text-right text-sm">${ch.spend.toLocaleString()}</TableCell>
                  <TableCell className="text-right text-sm">${ch.cpl.toFixed(2)}</TableCell>
                  <TableCell className="text-right text-sm">{ch.conversions}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={ch.roi >= 3 ? "default" : "secondary"} className="text-xs">
                      {ch.roi}x
                    </Badge>
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
