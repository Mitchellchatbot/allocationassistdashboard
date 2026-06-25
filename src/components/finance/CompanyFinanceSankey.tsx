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
import { ChevronLeft } from "lucide-react";
import gsap from "gsap";
import { useZohoBooks } from "@/hooks/use-zoho-books";
import { useCurrency } from "@/lib/CurrencyProvider";
import { groupFor, isMarketingCategory, MARKETING_GROUP } from "@/lib/finance-groups";
import type { ZohoBooksExpenseTxn } from "@/hooks/use-zoho-books";

// ── viewBox layout constants (the SVG scales to its container) ──
const VW = 1120;
const NODE_W = 18;
const COL = { rev: 190, grp: 520, cat: 868 };
const CAT_LABEL_W = 234;
const PAD = 9;
const OUTER = 22;
const TARGET_REV_H = 520;
const MIN_H = 5;
const CATS_PER_GROUP = 6; // beyond this, a group's tail rolls into one "Other …" bucket

const REVENUE_COLOR = "#2563eb";
const PROFIT_COLOR  = "#10b981";

// Expense grouping (groupFor) is shared with the P&L banner + Marketing KPI
// card so all three bucket categories identically — see src/lib/finance-groups.ts.

interface CatInfo { amount: number; count: number; txns: ZohoBooksExpenseTxn[]; color: string }
interface GroupBucket { color: string; total: number; cats: { name: string; amount: number }[] }
interface RNode { name: string; color: string; total: number; x: number; y: number; h: number; group?: string }

/** Filled horizontal-ribbon path between a source slice and a target slice. */
function ribbon(sx: number, sy0: number, sy1: number, tx: number, ty0: number, ty1: number) {
  const xc = (sx + tx) / 2;
  return `M${sx},${sy0} C${xc},${sy0} ${xc},${ty0} ${tx},${ty0} L${tx},${ty1} C${xc},${ty1} ${xc},${sy1} ${sx},${sy1} Z`;
}

export function CompanyFinanceSankey({ dateRange, marketingOverride }: {
  dateRange: { from: Date; to: Date };
  // When provided, the raw-Books Marketing lines are stripped and replaced by
  // this corrected marketing (retainer + live Meta) so the graph's Marketing +
  // Profit match the KPI card and ignore the corrupted Scaled-AI vendor bills.
  marketingOverride?: { total: number; cats: { name: string; amount: number }[] };
}) {
  const { data } = useZohoBooks(dateRange);
  const { fmt } = useCurrency();
  const [focus, setFocus] = useState<string | null>(null);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);

  const wrapRef  = useRef<SVGGElement | null>(null);
  const svgRef   = useRef<SVGSVGElement | null>(null);
  const graphRef = useRef<HTMLDivElement | null>(null);
  const tableRef = useRef<HTMLDivElement | null>(null);
  const tween    = useRef({ s: 1, tx: 0, ty: 0 });
  const [tableCat, setTableCat] = useState<string | null>(null); // category the table shows (persists through fade-out)
  const openTxns = (cat: string) => { setTableCat(cat); setSelectedCat(cat); };

  const base = useMemo(() => {
    if (!data?.configured || !data.ok) return null;
    const revenue = data.revenue ?? 0;
    // When a corrected marketing total is supplied, drop the raw-Books Marketing
    // categories (corrupted by duplicate Scaled-AI vendor bills) — the corrected
    // Marketing group is injected below.
    const rawBreakdown = (data.expenseBreakdown ?? []).filter(c => c.amount > 0);
    const breakdown = marketingOverride
      ? rawBreakdown.filter(c => !isMarketingCategory(c.category))
      : rawBreakdown;
    if (revenue <= 0 || (breakdown.length === 0 && !marketingOverride)) return null;
    const groups = new Map<string, GroupBucket>();
    const catInfo = new Map<string, CatInfo>();
    for (const c of breakdown) {
      const g = groupFor(c.category);
      const e = groups.get(g.name) ?? { color: g.color, total: 0, cats: [] };
      e.total += c.amount; e.cats.push({ name: c.category, amount: c.amount });
      groups.set(g.name, e);
      catInfo.set(c.category, { amount: c.amount, count: c.count, txns: c.txns ?? [], color: g.color });
    }
    // Inject the corrected Marketing group — its categories are the marketing
    // CHANNELS (Website/SEO at the 45k/mo retainer, Meta live, LinkedIn, …),
    // the same numbers the Marketing Spend KPI card shows.
    if (marketingOverride && marketingOverride.total > 0) {
      const cats = marketingOverride.cats.filter(c => c.amount > 0).sort((a, b) => b.amount - a.amount);
      groups.set("Marketing", { color: MARKETING_GROUP.color, total: marketingOverride.total, cats });
      for (const c of cats) catInfo.set(c.name, { amount: c.amount, count: 0, txns: [], color: MARKETING_GROUP.color });
    }
    const totalExpenses = [...groups.values()].reduce((s, g) => s + g.total, 0);
    return { revenue, totalExpenses, profit: revenue - totalExpenses, groups, catInfo };
  }, [data, marketingOverride]);

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
    // `cat` = the category a group→cat ribbon points at (so that, when zoomed
    // in, clicking the ribbon opens that category's transactions).
    const links: { key: string; belong: string; d: string; color: string; group?: string; cat?: string }[] = [];
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
      for (const c of myCats) { links.push({ key: `${g.name}-${c.name}`, belong: g.name, color: g.color, group: g.name, cat: c.name, d: ribbon(g.x + NODE_W, gy, gy + c.h, c.x, c.y, c.y + c.h) }); gy += c.h; }
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
    // Clear any leftover hover-lift / shadow when the view changes.
    gsap.set(svg.querySelectorAll(".snk-bar"), { y: 0 });
    gsap.set(svg.querySelectorAll(".snk-link"), { y: 0, fillOpacity: 0.18 });
    svg.querySelectorAll<SVGGElement>("[data-section]").forEach(s => (s.style.filter = ""));
  }, [focus, layout]);

  // Overview only: lift a whole subsection (bars + ribbons) on hover, with a
  // drop shadow; bars rise a touch more than the ribbons for depth. When zoomed
  // in, the subsection lift is off — individual ribbons highlight instead.
  const onSectionEnter = (e: React.MouseEvent<SVGGElement>) => {
    if (focus) return;
    const sec = e.currentTarget;
    gsap.to(sec.querySelectorAll(".snk-bar"),  { y: -9, duration: 0.22, ease: "power2.out" });
    gsap.to(sec.querySelectorAll(".snk-link"), { y: -4, fillOpacity: 0.3, duration: 0.22, ease: "power2.out" });
    sec.style.filter = "drop-shadow(0 7px 7px rgba(15,23,42,0.20))";
  };
  const onSectionLeave = (e: React.MouseEvent<SVGGElement>) => {
    if (focus) return;
    const sec = e.currentTarget;
    gsap.to(sec.querySelectorAll(".snk-bar"),  { y: 0, duration: 0.22, ease: "power2.out" });
    gsap.to(sec.querySelectorAll(".snk-link"), { y: 0, fillOpacity: 0.18, duration: 0.22, ease: "power2.out" });
    sec.style.filter = "";
  };

  // Cross-fade the graph ↔ the transaction table in the same viewport.
  useEffect(() => {
    const g = graphRef.current, t = tableRef.current;
    if (!g || !t) return;
    if (selectedCat) {
      gsap.to(g, { opacity: 0, duration: 0.3, ease: "power1.out" });
      gsap.to(t, { opacity: 1, duration: 0.4, delay: 0.12, ease: "power1.out" });
    } else {
      gsap.to(t, { opacity: 0, duration: 0.28, ease: "power1.out", onComplete: () => setTableCat(null) });
      gsap.to(g, { opacity: 1, duration: 0.4, delay: 0.1, ease: "power1.out" });
    }
  }, [selectedCat]);

  if (!base || !layout) return null;

  const pct = (v: number) => base.totalExpenses > 0 ? `${((v / base.totalExpenses) * 100).toFixed(1)}% of expenses` : "";
  const tableSel = tableCat ? (base.catInfo.get(tableCat) ?? layout.rollupInfo.get(tableCat)) : null;

  const NodeRect = ({ n, belong, side, kind }: { n: RNode; belong: string; side: "left" | "right"; kind: "rev" | "profit" | "group" | "cat" }) => {
    const clickable = kind === "group" || kind === "cat";
    const onClick = kind === "group" ? () => { setFocus(focus === n.name ? null : n.name); setSelectedCat(null); }
      : kind === "cat" ? () => openTxns(n.name) : undefined;
    return (
      <g
        data-belong={belong}
        className={`snk-bar ${clickable ? "cursor-pointer" : ""}`}
        onClick={onClick}
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
        {(focus || selectedCat) ? (
          <button type="button" onClick={() => { setFocus(null); setSelectedCat(null); }} className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 hover:text-blue-800 transition-colors">
            <ChevronLeft className="h-3.5 w-3.5" /> All expenses
            {focus && <span className="text-muted-foreground font-normal">/ {focus}</span>}
            {selectedCat && <span className="text-muted-foreground font-normal">/ {selectedCat}</span>}
          </button>
        ) : (
          <p className="text-[11px] text-muted-foreground/80 mt-0.5">
            {fmt(base.revenue)} revenue → <span className="text-emerald-700 font-medium">{base.profit > 0 ? `${fmt(base.profit)} profit` : `${fmt(Math.abs(base.profit))} loss`}</span> + expenses by group → category.
            {" "}<span className="text-foreground/70">Click a group (›) to zoom in, or a category for its transactions.</span>
          </p>
        )}
      </CardHeader>
      <CardContent className="px-5 pb-5 overflow-hidden">
        <div className="relative">
          <div ref={graphRef} style={{ pointerEvents: selectedCat ? "none" : "auto" }}>
            <svg ref={svgRef} viewBox={`0 0 ${VW} ${layout.VH}`} width="100%" style={{ display: "block", height: "auto", aspectRatio: `${VW} / ${layout.VH}` }}>
          <g ref={wrapRef}>
            {/* Revenue→Profit ribbon — not part of any drillable subsection */}
            {layout.links.filter(l => !l.group).map(l => (
              <path key={l.key} className="snk-link" data-belong={l.belong} d={l.d} fill={l.color} fillOpacity={0.18} stroke="none" />
            ))}
            {/* One liftable subsection per group: its ribbons + its bars */}
            {layout.groups.map(g => (
              <g key={g.name} data-section={g.name} style={{ transition: "filter 0.22s ease" }} onMouseEnter={onSectionEnter} onMouseLeave={onSectionLeave}>
                {layout.links.filter(l => l.group === g.name).map(l => (
                  <path
                    key={l.key}
                    className="snk-link cursor-pointer"
                    data-belong={l.belong}
                    d={l.d}
                    fill={l.color}
                    fillOpacity={0.18}
                    stroke="none"
                    onClick={() => {
                      // Zoomed into this group: a ribbon opens its category's
                      // transactions. Otherwise: zoom into the group.
                      if (focus === g.name && l.cat) openTxns(l.cat);
                      else { setFocus(g.name); setSelectedCat(null); }
                    }}
                    onMouseEnter={e => { if (focus === g.name) gsap.to(e.currentTarget, { fillOpacity: 0.42, duration: 0.18 }); }}
                    onMouseLeave={e => { if (focus === g.name) gsap.to(e.currentTarget, { fillOpacity: 0.18, duration: 0.18 }); }}
                  />
                ))}
                <NodeRect n={g} belong={g.name} side="right" kind="group" />
                {layout.cats.filter(c => c.group === g.name).map(c => (
                  <NodeRect key={c.name} n={c} belong={c.group!} side="right" kind="cat" />
                ))}
              </g>
            ))}
            {/* Revenue + Profit bars on top */}
            <NodeRect n={layout.revenue} belong="__rev" side="left" kind="rev" />
            {layout.profit && <NodeRect n={layout.profit} belong="__rev" side="right" kind="profit" />}
          </g>
            </svg>
          </div>

          {/* Transaction table — cross-fades in over the graph viewport.
              No close button: the "‹ All expenses" breadcrumb is the way out. */}
          <div ref={tableRef} className="absolute inset-0" style={{ pointerEvents: selectedCat ? "auto" : "none" }}>
            {tableSel && tableCat && (
              <div className="h-full flex flex-col rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border/50 bg-gradient-to-b from-muted/40 to-muted/10 shrink-0">
                  <div className="min-w-0">
                    <h4 className="text-[13px] font-semibold text-foreground truncate">{tableCat}</h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{tableSel.count} transaction{tableSel.count === 1 ? "" : "s"} · {pct(tableSel.amount)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[16px] font-bold tabular-nums text-foreground leading-none">{fmt(tableSel.amount)}</p>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">Total</p>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm shadow-[0_1px_0_rgba(0,0,0,0.06)]">
                      <tr>
                        <th className="py-2.5 px-5 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Date</th>
                        <th className="py-2.5 px-3 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Description</th>
                        <th className="py-2.5 px-5 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableSel.txns.length === 0 ? (
                        <tr><td colSpan={3} className="py-6 text-center text-[12px] text-muted-foreground">No transaction detail for this category</td></tr>
                      ) : tableSel.txns.map((t, i) => (
                        <tr key={`${t.date}-${i}`} className="border-b border-border/25 last:border-0 odd:bg-muted/15 hover:bg-blue-50/50 transition-colors">
                          <td className="py-2.5 px-5 text-[12px] font-mono text-muted-foreground whitespace-nowrap">{t.date || "—"}</td>
                          <td className="py-2.5 px-3 text-[12.5px] text-foreground/85 max-w-[520px] truncate" title={t.text}>{t.text || <span className="text-muted-foreground/40">—</span>}</td>
                          <td className="py-2.5 px-5 text-[12.5px] text-right tabular-nums font-semibold text-foreground">{fmt(t.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
