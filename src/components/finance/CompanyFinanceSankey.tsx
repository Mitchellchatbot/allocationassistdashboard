/**
 * CompanyFinanceSankey — a custom, GSAP-animated income-statement Sankey.
 *
 * Three sections: Revenue → (Profit + expense GROUPS) → categories. Profit is
 * pinned to the very top with a curved link; groups are centred on their
 * categories. Hand-rolled SVG layout (the graph is a strict tree) so we control
 * positions and can drive a real zoom.
 *
 * Click a GROUP → GSAP zooms into just that group's categories and fades the
 * rest out in one motion; the breadcrumb zooms back. Click a CATEGORY → its
 * transactions open in a panel below. Backed by Zoho Books actuals.
 */
import { useMemo, useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, X } from "lucide-react";
import gsap from "gsap";
import { useZohoBooks } from "@/hooks/use-zoho-books";
import { useCurrency } from "@/lib/CurrencyProvider";
import type { ZohoBooksExpenseTxn } from "@/hooks/use-zoho-books";

// ── viewBox layout constants (the SVG scales to its container) ──
const VW = 1120;
const NODE_W = 18;
const COL = { rev: 120, grp: 500, cat: 862 };
const CAT_LABEL_W = 234;
const PAD = 9;
const OUTER = 22;
const TARGET_REV_H = 520;
const MIN_H = 5;
const CATS_PER_GROUP = 6; // beyond this, a group's tail rolls into one "Other …" bucket

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
function groupFor(category: string) {
  for (const g of GROUPS) if (g.match.test(category)) return g;
  return OTHER_GROUP;
}

interface CatInfo { amount: number; count: number; txns: ZohoBooksExpenseTxn[]; color: string }
interface GroupBucket { color: string; total: number; cats: { name: string; amount: number }[] }
interface RNode { name: string; color: string; total: number; x: number; y: number; h: number; group?: string }

/** Filled horizontal-ribbon path between a source slice and a target slice. */
function ribbon(sx: number, sy0: number, sy1: number, tx: number, ty0: number, ty1: number) {
  const xc = (sx + tx) / 2;
  return `M${sx},${sy0} C${xc},${sy0} ${xc},${ty0} ${tx},${ty0} L${tx},${ty1} C${xc},${ty1} ${xc},${sy1} ${sx},${sy1} Z`;
}

export function CompanyFinanceSankey({ dateRange }: { dateRange: { from: Date; to: Date } }) {
  const { data } = useZohoBooks(dateRange);
  const { fmt } = useCurrency();
  const [focus, setFocus] = useState<string | null>(null);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);

  const wrapRef = useRef<SVGGElement | null>(null);
  const svgRef  = useRef<SVGSVGElement | null>(null);
  const tween   = useRef({ s: 1, tx: 0, ty: 0 });

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
      e.total += c.amount; e.cats.push({ name: c.category, amount: c.amount });
      groups.set(g.name, e);
      catInfo.set(c.category, { amount: c.amount, count: c.count, txns: c.txns ?? [], color: g.color });
    }
    const totalExpenses = breakdown.reduce((s, c) => s + c.amount, 0);
    return { revenue, totalExpenses, profit: revenue - totalExpenses, groups, catInfo };
  }, [data]);

  const layout = useMemo(() => {
    if (!base) return null;
    const ky = TARGET_REV_H / base.revenue;
    const hh = (v: number) => Math.max(v * ky, MIN_H);
    const groupList = [...base.groups.entries()].sort((a, b) => b[1].total - a[1].total)
      .map(([name, g]) => ({ name, color: g.color, total: g.total, cats: [...g.cats].sort((a, b) => b.amount - a.amount) }));

    // Categories (col 3), stacked by group. A group's long tail (e.g. Office &
    // Admin) rolls into one clickable "Other <group>" bucket to keep it clean.
    const cats: RNode[] = [];
    const blocks: Record<string, { top: number; bottom: number }> = {};
    const rollupInfo = new Map<string, { amount: number; count: number; txns: ZohoBooksExpenseTxn[] }>();
    let y = 0;
    for (const g of groupList) {
      const top = y;
      const tail = g.cats.slice(CATS_PER_GROUP);
      const shown = tail.length >= 2 ? g.cats.slice(0, CATS_PER_GROUP) : g.cats;
      for (const c of shown) { const ch = hh(c.amount); cats.push({ name: c.name, color: g.color, total: c.amount, x: COL.cat, y, h: ch, group: g.name }); y += ch + PAD; }
      if (tail.length >= 2) {
        const amount = tail.reduce((s, c) => s + c.amount, 0);
        const ch = hh(amount);
        const rollName = `Other ${g.name.split(" ")[0].toLowerCase()}`;
        cats.push({ name: rollName, color: g.color, total: amount, x: COL.cat, y, h: ch, group: g.name });
        rollupInfo.set(rollName, {
          amount,
          count: tail.reduce((s, c) => s + (base.catInfo.get(c.name)?.count ?? 0), 0),
          txns: tail.flatMap(c => base.catInfo.get(c.name)?.txns ?? []),
        });
        y += ch + PAD;
      }
      blocks[g.name] = { top, bottom: y - PAD };
    }
    const col2H = y - PAD;

    // Groups (col 2) centred on their (possibly-rolled-up) category block.
    const groups: RNode[] = groupList.map(g => {
      const myCats = cats.filter(c => c.group === g.name);
      const gh = myCats.reduce((s, c) => s + c.h, 0);
      const blk = blocks[g.name];
      return { name: g.name, color: g.color, total: g.total, x: COL.grp, y: (blk.top + blk.bottom) / 2 - gh / 2, h: gh };
    });

    // Profit pinned above the topmost group.
    const profitH = base.profit > 0 ? hh(base.profit) : 0;
    const minGY = Math.min(...groups.map(g => g.y));
    const profit: RNode | null = base.profit > 0
      ? { name: "Profit (retained)", color: PROFIT_COLOR, total: base.profit, x: COL.grp, y: minGY - PAD - profitH, h: profitH }
      : null;

    // Revenue (col 1) centred on the whole expense side.
    const revH = profitH + groups.reduce((s, g) => s + g.h, 0);
    const spanTop = Math.min(0, profit ? profit.y : 0, ...groups.map(g => g.y));
    const spanBot = Math.max(col2H, ...groups.map(g => g.y + g.h), profit ? profit.y + profit.h : 0);
    const revenue: RNode = { name: "Revenue", color: REVENUE_COLOR, total: base.revenue, x: COL.rev, y: spanTop + (spanBot - spanTop - revH) / 2, h: revH };

    // Normalise: shift so the topmost node sits at OUTER.
    const allNodes = [revenue, ...(profit ? [profit] : []), ...groups, ...cats];
    const minY = Math.min(...allNodes.map(n => n.y));
    const maxY = Math.max(...allNodes.map(n => n.y + n.h));
    for (const n of allNodes) n.y += OUTER - minY;
    const VH = (maxY - minY) + 2 * OUTER;

    // Links. belong = which group the element survives a drill into ("__rev"
    // for Revenue/Profit + their links, which always fade on drill).
    // `group` = the group this link zooms into when clicked (undefined for the
    // Revenue→Profit ribbon, which isn't a drill target).
    const links: { key: string; belong: string; d: string; color: string; group?: string }[] = [];
    const revTargets = [...(profit ? [profit] : []), ...groups].sort((a, b) => a.y - b.y);
    let sy = revenue.y;
    for (const t of revTargets) {
      const isProfit = !!profit && t.name === profit.name;
      links.push({ key: `rev-${t.name}`, belong: "__rev", color: t.color, group: isProfit ? undefined : t.name, d: ribbon(revenue.x + NODE_W, sy, sy + t.h, t.x, t.y, t.y + t.h) });
      sy += t.h;
    }
    for (const g of groups) {
      const myCats = cats.filter(c => c.group === g.name).sort((a, b) => a.y - b.y);
      let gy = g.y;
      for (const c of myCats) { links.push({ key: `${g.name}-${c.name}`, belong: g.name, color: g.color, group: g.name, d: ribbon(g.x + NODE_W, gy, gy + c.h, c.x, c.y, c.y + c.h) }); gy += c.h; }
    }
    return { revenue, profit, groups, cats, links, VH, rollupInfo };
  }, [base]);

  // GSAP: zoom into the focused group + fade the rest, or zoom back out.
  useEffect(() => {
    const wrap = wrapRef.current, svg = svgRef.current;
    if (!wrap || !svg || !layout) return;
    let target = { s: 1, tx: 0, ty: 0 };
    if (focus) {
      const g = layout.groups.find(n => n.name === focus);
      const cs = layout.cats.filter(c => c.group === focus);
      if (g) {
        const x0 = g.x - 12, x1 = COL.cat + NODE_W + CAT_LABEL_W;
        const y0 = Math.min(g.y, ...cs.map(c => c.y)) - 16;
        const y1 = Math.max(g.y + g.h, ...cs.map(c => c.y + c.h)) + 16;
        const bw = x1 - x0, bh = y1 - y0;
        const s = Math.min(Math.max(Math.min(VW / bw, layout.VH / bh), 1), 3.4);
        target = { s, tx: (VW - bw * s) / 2 - x0 * s, ty: (layout.VH - bh * s) / 2 - y0 * s };
      }
    }
    const st = tween.current;
    gsap.to(st, {
      ...target, duration: 0.85, ease: "power3.inOut",
      onUpdate: () => wrap.setAttribute("transform", `translate(${st.tx},${st.ty}) scale(${st.s})`),
    });
    svg.querySelectorAll<SVGElement>("[data-belong]").forEach(el => {
      const keep = !focus || el.getAttribute("data-belong") === focus;
      el.style.pointerEvents = keep ? "auto" : "none";
      gsap.to(el, { opacity: keep ? 1 : 0, duration: 0.55, ease: "power1.out" });
    });
  }, [focus, layout]);

  if (!base || !layout) return null;

  const pct = (v: number) => base.totalExpenses > 0 ? `${((v / base.totalExpenses) * 100).toFixed(1)}% of expenses` : "";
  const selected = selectedCat ? (base.catInfo.get(selectedCat) ?? layout.rollupInfo.get(selectedCat)) : null;

  const NodeRect = ({ n, belong, side, kind }: { n: RNode; belong: string; side: "left" | "right"; kind: "rev" | "profit" | "group" | "cat" }) => {
    const clickable = kind === "group" || kind === "cat";
    const onClick = kind === "group" ? () => { setFocus(focus === n.name ? null : n.name); setSelectedCat(null); }
      : kind === "cat" ? () => setSelectedCat(n.name) : undefined;
    return (
      <g
        data-belong={belong}
        className={clickable ? "cursor-pointer" : undefined}
        onClick={onClick}
        onMouseEnter={clickable ? e => gsap.to(e.currentTarget, { y: -5, duration: 0.2, ease: "power2.out" }) : undefined}
        onMouseLeave={clickable ? e => gsap.to(e.currentTarget, { y: 0, duration: 0.2, ease: "power2.out" }) : undefined}
      >
        <title>{`${n.name} · ${fmt(n.total)}${kind === "rev" ? "" : kind === "profit" ? ` · ${base.revenue > 0 ? ((n.total / base.revenue) * 100).toFixed(1) : 0}% of revenue` : ` · ${pct(n.total)}`}`}</title>
        <rect x={n.x} y={n.y} width={NODE_W} height={Math.max(n.h, 1.5)} rx={3} fill={n.color} fillOpacity={0.95} />
        <text
          x={side === "left" ? n.x - 10 : n.x + NODE_W + 10}
          y={n.y + n.h / 2}
          textAnchor={side === "left" ? "end" : "start"}
          dominantBaseline="middle"
          fontSize={kind === "cat" ? 10.5 : 12}
          fontWeight={kind === "cat" ? 500 : 600}
          fill="hsl(220,15%,28%)"
        >
          {n.name}{kind === "group" ? " ›" : ""}
          <tspan fontWeight={400} fill="hsl(220,10%,55%)"> · {fmt(n.total)}</tspan>
        </text>
      </g>
    );
  };

  return (
    <Card className="shadow-md border-border/60 mb-5">
      <CardHeader className="pb-2 pt-4 px-5">
        <div className="flex items-center gap-2 flex-wrap">
          <CardTitle className="text-[14px] font-semibold text-foreground">Where the Money Goes</CardTitle>
          <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Zoho Books · actuals
          </span>
        </div>
        {focus ? (
          <button type="button" onClick={() => { setFocus(null); setSelectedCat(null); }} className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 hover:text-blue-800 transition-colors">
            <ChevronLeft className="h-3.5 w-3.5" /> All expenses
            <span className="text-muted-foreground font-normal">/ {focus}</span>
          </button>
        ) : (
          <p className="text-[11px] text-muted-foreground/80 mt-0.5">
            {fmt(base.revenue)} revenue → <span className="text-emerald-700 font-medium">{base.profit > 0 ? `${fmt(base.profit)} profit` : `${fmt(Math.abs(base.profit))} loss`}</span> + expenses by group → category.
            {" "}<span className="text-foreground/70">Click a group (›) to zoom in, or a category for its transactions.</span>
          </p>
        )}
      </CardHeader>
      <CardContent className="px-5 pb-5 overflow-hidden">
        <svg ref={svgRef} viewBox={`0 0 ${VW} ${layout.VH}`} width="100%" style={{ display: "block", height: "auto", aspectRatio: `${VW} / ${layout.VH}` }}>
          <g ref={wrapRef}>
            {layout.links.map(l => (
              <path
                key={l.key}
                data-belong={l.belong}
                d={l.d}
                fill={l.color}
                fillOpacity={0.18}
                stroke="none"
                className={l.group ? "cursor-pointer" : undefined}
                onClick={l.group ? () => { setFocus(l.group!); setSelectedCat(null); } : undefined}
                onMouseEnter={l.group ? e => gsap.to(e.currentTarget, { fillOpacity: 0.36, duration: 0.2 }) : undefined}
                onMouseLeave={l.group ? e => gsap.to(e.currentTarget, { fillOpacity: 0.18, duration: 0.2 }) : undefined}
              />
            ))}
            <NodeRect n={layout.revenue} belong="__rev" side="left" kind="rev" />
            {layout.profit && <NodeRect n={layout.profit} belong="__rev" side="right" kind="profit" />}
            {layout.groups.map(g => <NodeRect key={g.name} n={g} belong={g.name} side="right" kind="group" />)}
            {layout.cats.map(c => <NodeRect key={c.name} n={c} belong={c.group!} side="right" kind="cat" />)}
          </g>
        </svg>

        {selected && selectedCat && (
          <div className="mt-3 rounded-lg border border-border/60 bg-muted/20 overflow-hidden animate-in slide-in-from-top-2 fade-in duration-300">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border/40 bg-muted/40">
              <p className="text-[12px] font-semibold text-foreground">
                {selectedCat}
                <span className="ml-2 font-normal text-muted-foreground">{fmt(selected.amount)} · {selected.count} txn{selected.count === 1 ? "" : "s"} · {pct(selected.amount)}</span>
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
