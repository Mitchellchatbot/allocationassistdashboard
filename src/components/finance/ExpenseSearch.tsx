/**
 * ExpenseSearch — a universal search over every expense in Zoho Books for the
 * selected period. It reads the same general-ledger feed the Sankey drill-downs
 * use (action=accounttxns) — every bill / expense / journal leg posted to an
 * expense account — and filters it client-side across account, vendor /
 * description, type and amount. The ledger fetch is lazy + cached, so the first
 * search pages the GL once and every keystroke after is instant.
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useZohoAccountTxns } from "@/hooks/use-zoho-books";
import { useCurrency } from "@/lib/CurrencyProvider";
import { groupFor } from "@/lib/finance-groups";
import { Search, Loader2 } from "lucide-react";

interface Row { date: string; category: string; type: string; text: string; amount: number }

const CAP = 250; // max rows rendered; refine the query to narrow

function rangeLabel(r: { from: Date; to: Date }) {
  const o: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "2-digit" };
  return `${r.from.toLocaleDateString("en-GB", o)} – ${r.to.toLocaleDateString("en-GB", o)}`;
}

export function ExpenseSearch({ dateRange }: { dateRange: { from: Date; to: Date } }) {
  const [active, setActive] = useState(false);  // lazily trigger the heavy GL fetch
  const [q, setQ] = useState("");
  const { data: ledger, isLoading } = useZohoAccountTxns(dateRange, active);
  const { fmt } = useCurrency();

  // Flatten the per-account ledger into one searchable list, newest first.
  const all = useMemo<Row[]>(() => {
    if (!ledger?.accounts) return [];
    const out: Row[] = [];
    for (const [category, txns] of Object.entries(ledger.accounts))
      for (const t of txns) out.push({ date: t.date, category, type: t.type, text: t.text, amount: t.amount });
    return out.sort((a, b) => b.date.localeCompare(a.date));
  }, [ledger]);

  // Every space-separated term must match somewhere (account / text / type /
  // rounded amount), so "meta april" or "licensing 252" both work.
  const query = q.trim().toLowerCase();
  const results = useMemo(() => {
    if (!query) return all;
    const terms = query.split(/\s+/);
    return all.filter(r => {
      const hay = `${r.category} ${r.text} ${r.type} ${Math.round(Math.abs(r.amount))}`.toLowerCase();
      return terms.every(t => hay.includes(t));
    });
  }, [all, query]);

  const total = results.reduce((s, r) => s + r.amount, 0);
  const shown = results.slice(0, CAP);

  return (
    <Card className="mb-5 shadow-sm border-border/50">
      <CardHeader className="pb-3 pt-4 px-5">
        <CardTitle className="text-[13px] font-semibold text-foreground">Search expenses</CardTitle>
        <p className="text-[11px] text-muted-foreground/80 mt-0.5">
          Every expense in Zoho Books for the selected period — by vendor, account, type or amount.
        </p>
        <div className="relative mt-2.5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={q}
            onFocus={() => setActive(true)}
            onChange={e => { setActive(true); setQ(e.target.value); }}
            placeholder='e.g. "meta", "salary", "licensing", "scaled ai", "252239"…'
            className="pl-9 h-9 text-[13px]"
          />
        </div>
        {active && (
          <p className="text-[11px] text-muted-foreground mt-2">
            {isLoading ? (
              <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Loading expenses from Zoho…</span>
            ) : (
              <>{results.length.toLocaleString()} match{results.length === 1 ? "" : "es"} · <span className="font-semibold text-foreground/80 tabular-nums">{fmt(total)}</span> · {rangeLabel(dateRange)}</>
            )}
          </p>
        )}
      </CardHeader>

      {active && !isLoading && (
        <CardContent className="px-0 pb-3">
          <div className="max-h-[440px] overflow-y-auto border-t border-border/40">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm shadow-[0_1px_0_rgba(0,0,0,0.06)]">
                <tr>
                  <th className="py-2.5 px-5 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Date</th>
                  <th className="py-2.5 px-3 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Account</th>
                  <th className="py-2.5 px-3 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Description</th>
                  <th className="py-2.5 px-5 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 ? (
                  <tr><td colSpan={4} className="py-12 text-center text-[12.5px] text-muted-foreground">
                    No expenses match {q ? <>“{q}”</> : "this period"}.
                  </td></tr>
                ) : shown.map((r, i) => {
                  const color = groupFor(r.category).color;
                  return (
                    <tr key={i} className="border-b border-border/25 last:border-0 odd:bg-muted/15 hover:bg-blue-50/50 transition-colors">
                      <td className="py-2.5 px-5 text-[12px] font-mono text-muted-foreground whitespace-nowrap align-top">{r.date || "—"}</td>
                      <td className="py-2.5 px-3 align-top">
                        <span className="inline-flex items-center gap-1.5 text-[12px] text-foreground/80 whitespace-nowrap">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                          {r.category}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 max-w-[420px]">
                        <div className="flex items-center gap-2 min-w-0">
                          {r.type ? <span className="shrink-0 text-[9px] uppercase tracking-wide text-muted-foreground/70 bg-muted/70 rounded px-1.5 py-0.5">{r.type}</span> : null}
                          <span className="text-[12.5px] text-foreground/85 truncate" title={r.text}>{r.text || <span className="text-muted-foreground/40">—</span>}</span>
                        </div>
                      </td>
                      <td className={`py-2.5 px-5 text-[12.5px] text-right tabular-nums font-semibold align-top ${r.amount < 0 ? "text-emerald-700" : "text-foreground"}`}>{fmt(r.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {results.length > CAP && (
              <p className="px-5 py-2.5 text-[11px] text-muted-foreground border-t border-border/40">
                Showing the first {CAP} of {results.length.toLocaleString()} matches — refine your search to narrow it down.
              </p>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
