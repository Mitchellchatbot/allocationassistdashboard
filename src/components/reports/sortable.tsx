/**
 * Column sorting for the Reports tables.
 *
 * Every table on the page ranks by one hard-coded rule (usually signings), which
 * is the right default but a dead end the moment someone asks "who has the most
 * hospitals?" or "which account has gone quietest?". This is the shared piece:
 * a tiny sort-state hook plus header cells that show the active column and
 * direction.
 *
 * Direction rules, so clicking feels predictable rather than arbitrary:
 *   - first click on a NUMERIC column sorts high → low (the interesting end)
 *   - first click on a TEXT column sorts A → Z
 *   - clicking the active column flips it
 *
 * Sorting is presentation-only — it never changes what's counted, just the
 * order, so a sorted table still reconciles with the scoreboard above it.
 */
import { useState, useMemo, useCallback } from "react";
import { TableHead } from "@/components/ui/table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

export type SortDir = "asc" | "desc";

export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
  /** Select a column, or flip it when it's already active. */
  toggle: (key: K, numeric?: boolean) => void;
  /** Comparator wrapper: pass a value accessor, get a sorted copy. */
  sort: <T>(rows: T[], value: (row: T, key: K) => string | number | null) => T[];
}

export function useSort<K extends string>(initialKey: K, initialDir: SortDir = "desc"): SortState<K> {
  const [key, setKey] = useState<K>(initialKey);
  const [dir, setDir] = useState<SortDir>(initialDir);

  const toggle = useCallback((next: K, numeric = true) => {
    setKey(prev => {
      if (prev === next) { setDir(d => (d === "asc" ? "desc" : "asc")); return prev; }
      setDir(numeric ? "desc" : "asc");
      return next;
    });
  }, []);

  const sort = useCallback(<T,>(rows: T[], value: (row: T, key: K) => string | number | null): T[] => {
    const mul = dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = value(a, key), y = value(b, key);
      // Nulls ("—", never contacted) always sink, whichever way the column
      // points — an empty cell isn't "the smallest value", it's no value.
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * mul;
      return String(x).localeCompare(String(y)) * mul;
    });
  }, [key, dir]);

  return useMemo(() => ({ key, dir, toggle, sort }), [key, dir, toggle, sort]);
}

// The arrow is always rendered — a chevron pair when the column is idle — so a
// header keeps the same width whether or not it's the active sort. shrink-0
// stops it collapsing inside a fixed-width column and letting the label drift.
function Arrow({ active, dir }: { active: boolean; dir: SortDir }) {
  const cls = "h-3 w-3 shrink-0";
  if (!active) return <ChevronsUpDown className={`${cls} text-slate-300 group-hover:text-slate-400`} />;
  return dir === "asc"
    ? <ArrowUp   className={`${cls} text-teal-600`} />
    : <ArrowDown className={`${cls} text-teal-600`} />;
}

interface HeadProps<K extends string> {
  sort:     SortState<K>;
  sortKey:  K;
  /** Numeric columns sort high → low on first click and right-align. */
  numeric?: boolean;
  className?: string;
  children: React.ReactNode;
}

/** Sortable <TableHead> for the shadcn Table tables. */
export function SortHead<K extends string>({ sort, sortKey, numeric = true, className = "", children }: HeadProps<K>) {
  const active = sort.key === sortKey;
  return (
    <TableHead className={`text-[11px] ${numeric ? "text-right" : ""} ${className}`}>
      <button
        onClick={() => sort.toggle(sortKey, numeric)}
        className={`group inline-flex items-center gap-1 whitespace-nowrap hover:text-slate-900 transition-colors ${
          active ? "text-slate-900 font-semibold" : ""
        } ${numeric ? "flex-row-reverse" : ""}`}
      >
        <Arrow active={active} dir={sort.dir} />
        {children}
      </button>
    </TableHead>
  );
}

/** Sortable header for the div-based layouts (the team leaderboard). */
export function SortLabel<K extends string>({ sort, sortKey, numeric = true, className = "", children }: HeadProps<K>) {
  const active = sort.key === sortKey;
  return (
    <button
      onClick={() => sort.toggle(sortKey, numeric)}
      className={`group inline-flex items-center gap-1 whitespace-nowrap text-[9px] uppercase tracking-wider transition-colors hover:text-slate-700 ${
        active ? "text-slate-700 font-semibold" : "text-muted-foreground"
      } ${numeric ? "flex-row-reverse" : ""} ${className}`}
    >
      <Arrow active={active} dir={sort.dir} />
      {children}
    </button>
  );
}
