import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { categoryData } from "@/lib/mock-data";

const COLORS = [
  "hsl(175, 80%, 48%)",
  "hsl(200, 75%, 55%)",
  "hsl(145, 65%, 48%)",
  "hsl(38, 92%, 55%)",
  "hsl(280, 65%, 60%)",
];

const CategoryChart = () => {
  return (
    <Card className="gradient-card border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Sales by Category
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={categoryData} layout="vertical" barCategoryGap="20%">
            <XAxis
              type="number"
              stroke="hsl(215, 15%, 50%)"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${v / 1000}k`}
            />
            <YAxis
              dataKey="name"
              type="category"
              stroke="hsl(215, 15%, 50%)"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              width={100}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(220, 18%, 12%)",
                border: "1px solid hsl(220, 14%, 18%)",
                borderRadius: "8px",
                color: "hsl(210, 20%, 92%)",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "12px",
              }}
              formatter={(value: number) => [`$${value.toLocaleString()}`, "Sales"]}
            />
            <Bar dataKey="sales" radius={[0, 6, 6, 0]}>
              {categoryData.map((_, index) => (
                <Cell key={index} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

export default CategoryChart;
