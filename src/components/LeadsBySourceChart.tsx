import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, LabelList,
} from "recharts";
import { useChannelEconomics } from "@/hooks/use-channel-economics";
import { useCurrency } from "@/lib/CurrencyProvider";

const tip = {
  backgroundColor: "#fff",
  border: "1px solid hsl(220,14%,90%)",
  borderRadius: "8px",
  fontSize: "11px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  padding: "8px 12px",
};

/**
 * Channel-level "Leads by Source" with qualification rate AND spend per source.
 * Filters out junk labels ("Other", "Uncategorized", placeholder strings) so
 * the chart reads cleanly.
 */
export function LeadsBySourceChart() {
  const rows = useChannelEconomics();
  const { fmt: fmtAED } = useCurrency();

  // Drop "Other" rows and anything with neither leads nor spend so the chart isn't
  // cluttered with junk like "xxxxx" or unmapped sources.
  const cleaned = rows
    .filter(r => r.channel !== "Other")
    .filter(r => r.leads > 0)
    .sort((a, b) => b.leads - a.leads)
    .slice(0, 12);

  if (cleaned.length === 0) return null;

  return (
    <Card className="shadow-sm border-border/50 mb-5">
      <CardHeader className="pb-1 pt-4 px-4">
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-emerald-600" />
          <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Leads by Source — with Qualification Rate &amp; Spend</CardTitle>
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" />Total leads</span>
          {" · "}
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />Qualified (reached call completed / follow-up)</span>
          {" · "}
          Spend (right) shows AED spent on that channel in the date range.
        </p>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <ResponsiveContainer width="100%" height={Math.max(280, cleaned.length * 36)}>
          <BarChart data={cleaned} layout="vertical" barCategoryGap="22%" margin={{ left: 4, right: 90, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,14%,92%)" />
            <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} stroke="hsl(220,10%,55%)" />
            <YAxis dataKey="channel" type="category" fontSize={10} tickLine={false} axisLine={false} width={130} stroke="hsl(220,10%,55%)" />
            <Tooltip
              contentStyle={tip}
              formatter={(v: number, name: string, p) => {
                if (name === "Total leads") {
                  return [`${v.toLocaleString()} leads · ${p.payload.qualifiedRate.toFixed(0)}% qualified`, "Total"];
                }
                if (name === "Qualified") {
                  return [`${v.toLocaleString()} qualified`, "Qualified"];
                }
                return [v, name];
              }}
              labelFormatter={(l, p) => {
                const spend = p?.[0]?.payload?.spend ?? 0;
                return spend > 0 ? `${l} · ${fmtAED(spend)} spent` : `${l}`;
              }}
            />
            <Bar dataKey="leads"     name="Total leads" fill="hsl(210,75%,52%)" radius={[0, 4, 4, 0]}>
              <LabelList
                dataKey="spend"
                position="right"
                fontSize={10}
                fill="hsl(220,10%,45%)"
                formatter={(v: number) => v > 0 ? fmtAED(v) : ""}
              />
            </Bar>
            <Bar dataKey="qualified" name="Qualified"   fill="hsl(142,70%,45%)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
