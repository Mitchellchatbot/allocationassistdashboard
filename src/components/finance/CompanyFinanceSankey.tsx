/**
 * CompanyFinanceSankey — an interactive 3-section income-statement Sankey.
 *
 * Overview: Revenue → Profit + big expense GROUPS → individual categories
 * (top few per group, the tail rolled into "other"). Centred layout.
 *  - Click a GROUP (the middle column) to zoom into it — that group becomes
 *    the root and the chart fades/zooms to just its categories.
 *  - Click a CATEGORY to open its transactions in a panel below.
 *  - Hover for amount + % of expenses (+ txn count on categories).
 *
 * Backed by Zoho Books actuals; renders nothing until connected.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sankey, Tooltip, ResponsiveContainer, Layer, Rectangle } from "recharts";
import { ChevronLeft, X } from "lucide-react";
import { useZohoBooks } from "@/hooks/use-zoho-books";
import { useCurrency } from "@/lib/CurrencyProvider";
import type { ZohoBooksExpenseTxn } from "@/hooks/use-zoho-books";

const CATS_PER_GROUP = 4; // overview only; no cap once drilled into a group

const REVENUE_COLOR = "#2563eb";
const PROFIT_COLOR  = "#10b981";

const GROUPS: { name: string; color: string; match: RegExp }[] = [
  { name: "Payroll & Directors",      color: "#f43f5e", match: /salar|remunerat|payroll|wage|bonus|commission|\bhr\b|staff|employee/i },
  { name: "Licensing & Verification", color: "#f59e0b", match: /licens|dataflow|verificat|visa|permit|complian|regulator|gratuit|\bwps\b/i },
  { name: "Marketing",                color: "#8b5cf6", match: /market|advertis|website|video|\bmedia\b|\bseo\b|\bads?\b|content/i },
  { name: "Tax & Professional",       color: "#0ea5e9", match: /\bvat\b|\btax\b|account|audit|legal|consult|contractor|professional|advisor/i },
  { name: "Office & Admin",           color: "#14b8a6", match: /rent|utilit|electric|water|telephone|internet|kitchen|hygiene|subscription|software|insurance|travel|accommod|bank|charge|deprecia|leasehold|meals|office|stationer|telr/i },
];
const OTHER_GROUP = { name: "Other", color: "#94a3b8" };

function groupFor(category: string): { name: string; color: string } {
  for (const g of GROUPS) if (g.match.test(category)) return g;
  return OTHER_GROUP;
}

interface SankeyNodeProps {
  x: number; y: number; width: number; height: number;
  payload: { name: string; color?: string; value: number };
  containerWidth: number;
}
interface CatInfo { amount: number; count: number; txns: ZohoBooksExpenseTxn[]; color: string }
interface GroupBucket { color: string; total: number; cats: { name: string; amount: number }[] }

export function CompanyFinanceSankey({ dateRange }: { dateRange: { from: Date; to: Date } }) {
  const { data } = useZohoBooks(dateRange);
  const { fmt } = useCurrency();
  const [root, setRoot] = useState<string | null>(null);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);

  const base = useMemo(() => {
    if (!data?.configured || !data.ok) return null;
    const revenue = data.revenue ?? 0;
    const breakdown = (data.expenseBreakdown ?? []).filter(c => c.amount > 0);
    if (revenue <= 0 || breakdown.length === 0) return null;

    const groups = new Map<string, GroupBucket>();
    const catInfo = new Map<string, CatInfo>();
    for (const c of breakdown) {
      const g = groupFor(c.category);
      const e = groups.get(g.name) ?? { color: g.color, total: 0, cats: [] };
      e.total += c.amount;
      e.cats.push({ name: c.category, amount: c.amount });
      groups.set(g.name, e);
      catInfo.set(c.category, { amount: c.amount, count: c.count, txns: c.txns ?? [], color: g.color });
    }
    const totalExpenses = breakdown.reduce((s, c) => s + c.amount, 0);
    return { revenue, totalExpenses, profit: revenue - totalExpenses, groups, catInfo };
  }, [data]);

  const model = useMemo(() => {
    if (!base) return null;
    const nodes: { name: string; color: string }[] = [];
    const links: { source: number; target: number; value: number }[] = [];
    const add = (name: string, color: string) => nodes.push({ name, color }) - 1;

    // Drill: one group → ALL its categories.
    if (root && base.groups.has(root)) {
      const g = base.groups.get(root)!;
      const gIdx = add(root, g.color);
      [...g.cats].sort((a, b) => b.amount - a.amount).forEach(c => {
        links.push({ source: gIdx, target: add(c.name, g.color), value: c.amount });
      });
      return { nodes, links, rightCount: g.cats.length, groupNames: new Set<string>() };
    }

    // Overview: Revenue → Profit + groups → categories (top few + "other").
    const revIdx = add("Revenue", REVENUE_COLOR);
    if (base.profit > 0) links.push({ source: revIdx, target: add("Profit (retained)", PROFIT_COLOR), value: base.profit });
    const groupNames = new Set<string>();
    let leafCount = base.profit > 0 ? 1 : 0;
    [...base.groups.entries()].sort((a, b) => b[1].total - a[1].total).forEach(([gName, g]) => {
      groupNames.add(gName);
      const gIdx = add(gName, g.color);
      links.push({ source: revIdx, target: gIdx, value: g.total });
      const cats = [...g.cats].sort((a, b) => b.amount - a.amount);
      cats.slice(0, CATS_PER_GROUP).forEach(c => { links.push({ source: gIdx, target: add(c.name, g.color), value: c.amount }); leafCount++; });
      const tailTotal = cats.slice(CATS_PER_GROUP).reduce((s, c) => s + c.amount, 0);
      if (tailTotal > 0) {
        const label = gName === OTHER_GROUP.name ? "Misc" : `Other ${gName.split(" ")[0].toLowerCase()}`;
        links.push({ source: gIdx, target: add(label, g.color), value: tailTotal });
        leafCount++;
      }
    });
    return { nodes, links, rightCount: leafCount, groupNames };
  }, [base, root]);

  if (!base || !model) return null;

  const onNodeClick = (name: string) => {
    if (!root && model.groupNames.has(name)) { setRoot(name); setSelectedCat(null); }
    else if (base.catInfo.has(name)) setSelectedCat(name);
  };

  const Node = ({ x, y, width, height, payload, containerWidth }: SankeyNodeProps) => {
    const leftHalf = x < containerWidth / 2;
    const isGroup = !root && model.groupNames.has(payload.name);
    const isCat = base.catInfo.has(payload.name);
    const clickable = isGroup || isCat;
    return (
      <Layer style={{ cursor: clickable ? "pointer" : "default" }} onClick={clickable ? () => onNodeClick(payload.name) : undefined}>
        <Rectangle x={x} y={y} width={width} height={height} fill={payload.color ?? "#6366f1"} fillOpacity={0.92} radius={[3, 3, 3, 3]} />
        <text
          x={leftHalf ? x - 8 : x + width + 8}
          y={y + height / 2}
          textAnchor={leftHalf ? "end" : "start"}
          dominantBaseline="middle"
          fontSize={11}
          fontWeight={600}
          fill="hsl(220,15%,30%)"
        >
          {payload.name}{isGroup ? " ›" : ""}
          <tspan fontWeight={400} fill="hsl(220,10%,55%)"> · {fmt(payload.value)}</tspan>
        </text>
      </Layer>
    );
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const p = payload[0]?.payload ?? {};
    const name: string | undefined = typeof p.name === "string" ? p.name : undefined;
    const value: number = p.value ?? payload[0]?.value ?? 0;
    const cat = name ? base.catInfo.get(name) : undefined;
    return (
      <div className="rounded-lg border border-border/60 bg-white px-3 py-2 shadow-md text-[11px]">
        <p className="font-semibold text-foreground">{name ?? "Flow"}</p>
        <p className="tabular-nums">{fmt(value)}</p>
        {name === "Revenue" ? null
          : name === "Profit (retained)"
            ? <p className="text-muted-foreground">{base.revenue > 0 ? ((value / base.revenue) * 100).toFixed(1) : 0}% of revenue</p>
            : <p className="text-muted-foreground">{base.totalExpenses > 0 ? ((value / base.totalExpenses) * 100).toFixed(1) : 0}% of expenses</p>}
        {cat && <p className="text-muted-foreground mt-0.5">{cat.count} transaction{cat.count === 1 ? "" : "s"} · <span className="text-blue-700">click to view</span></p>}
      </div>
    );
  };

  const selected = selectedCat ? base.catInfo.get(selectedCat) : null;
  const chartHeight = Math.max(380, model.rightCount * 40);

  return (
    <Card className="shadow-md border-border/60 mb-5">
      <CardHeader className="pb-2 pt-4 px-5">
        <div className="flex items-center gap-2 flex-wrap">
          <CardTitle className="text-[14px] font-semibold text-foreground">Where the Money Goes</CardTitle>
          <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Zoho Books · actuals
          </span>
        </div>
        {root ? (
          <button type="button" onClick={() => { setRoot(null); setSelectedCat(null); }} className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 hover:text-blue-800 transition-colors">
            <ChevronLeft className="h-3.5 w-3.5" /> All expenses
            <span className="text-muted-foreground font-normal">/ {root}</span>
          </button>
        ) : (
          <p className="text-[11px] text-muted-foreground/80 mt-0.5">
            {fmt(base.revenue)} revenue → <span className="text-emerald-700 font-medium">{base.profit > 0 ? `${fmt(base.profit)} profit` : `${fmt(Math.abs(base.profit))} loss`}</span> + expenses by group → category.
            {" "}<span className="text-foreground/70">Click a group (›) to zoom in, or a category for its transactions.</span>
          </p>
        )}
      </CardHeader>
      <CardContent className="px-5 pb-5 overflow-hidden">
        {/* keyed so each drill/zoom re-mounts and animates in */}
        <div
          key={root ?? "top"}
          className={root
            ? "animate-in fade-in zoom-in-95 slide-in-from-right-4 duration-500"
            : "animate-in fade-in duration-300"}
        >
          <ResponsiveContainer width="100%" height={chartHeight}>
            <Sankey
              data={{ nodes: model.nodes, links: model.links }}
              nodePadding={22}
              nodeWidth={14}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              node={(props: any) => <Node {...props} />}
              link={{ stroke: "#cbd5e1", strokeOpacity: 0.4 }}
              margin={{ top: 12, right: 200, bottom: 12, left: 90 }}
            >
              <Tooltip content={renderTooltip} />
            </Sankey>
          </ResponsiveContainer>
        </div>

        {selected && selectedCat && (
          <div className="mt-3 rounded-lg border border-border/60 bg-muted/20 overflow-hidden animate-in slide-in-from-top-2 fade-in duration-300">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border/40 bg-muted/40">
              <p className="text-[12px] font-semibold text-foreground">
                {selectedCat}
                <span className="ml-2 font-normal text-muted-foreground">{fmt(selected.amount)} · {selected.count} txn{selected.count === 1 ? "" : "s"} · {base.totalExpenses > 0 ? ((selected.amount / base.totalExpenses) * 100).toFixed(1) : 0}% of expenses</span>
              </p>
              <button type="button" onClick={() => setSelectedCat(null)} className="text-muted-foreground hover:text-foreground transition-colors"><X className="h-3.5 w-3.5" /></button>
            </div>
            <div className="overflow-x-auto" style={{ maxHeight: 280 }}>
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-muted/40">
                  <tr className="border-b border-border/40">
                    <th className="py-2 px-4 text-[10px] uppercase tracking-wide text-muted-foreground/70 font-semibold">Date</th>
                    <th className="py-2 px-4 text-[10px] uppercase tracking-wide text-muted-foreground/70 font-semibold">Description</th>
                    <th className="py-2 px-4 text-[10px] uppercase tracking-wide text-muted-foreground/70 font-semibold text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.txns.length === 0 ? (
                    <tr><td colSpan={3} className="py-3 text-center text-[12px] text-muted-foreground">No transaction detail for this category</td></tr>
                  ) : selected.txns.map((t, i) => (
                    <tr key={`${t.date}-${i}`} className="border-b border-border/20 last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-2 px-4 text-[12px] font-mono text-muted-foreground whitespace-nowrap">{t.date || "—"}</td>
                      <td className="py-2 px-4 text-[12px] text-foreground/80 max-w-[520px] truncate" title={t.text}>{t.text || <span className="text-muted-foreground/40">—</span>}</td>
                      <td className="py-2 px-4 text-[12px] text-right tabular-nums font-semibold">{fmt(t.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
