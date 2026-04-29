import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { InfoIcon } from "@/components/InfoIcon";

/**
 * Right-aligned table-header with click-to-sort. Active column shows the
 * direction arrow in primary color + filled background; inactive columns
 * show a clearly visible up/down chevron so it's obvious every column is
 * sortable.
 *
 * Generic over the sort-key type so each table can pin its own union.
 */
export function SortableTH<K extends string>({
  sortKey, current, dir, onSort, info, align = "right", size = "sm", children,
}: {
  sortKey: K;
  current: K | null;
  dir: "asc" | "desc";
  onSort: (k: K) => void;
  info: { meaning: string; source: string };
  align?: "left" | "right" | "center";
  /** Size of the header text. "md" gives a bigger, more prominent header. */
  size?: "sm" | "md";
  children: React.ReactNode;
}) {
  const isActive = current === sortKey;
  const justify = align === "left" ? "justify-start" : align === "center" ? "justify-center" : "justify-end";
  const textAlign = align === "left" ? "text-left" : align === "center" ? "text-center" : "text-right";
  const thSize  = size === "md" ? "py-3 px-3 text-[12px]"  : "py-1.5 px-1.5 text-[10px]";
  const btnSize = size === "md" ? "px-2.5 py-1.5 gap-1.5"  : "px-2 py-1 gap-1";
  const iconSz  = size === "md" ? "h-3.5 w-3.5"            : "h-3 w-3";
  return (
    <th className={`${thSize} font-semibold uppercase tracking-wide ${textAlign}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={`Click to sort by ${typeof children === "string" ? children : "this column"}${isActive ? ` (${dir === "desc" ? "high → low" : "low → high"})` : ""}`}
        className={`group inline-flex items-center ${justify} ${btnSize} rounded cursor-pointer select-none transition-colors ${
          isActive
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        }`}
      >
        {children}
        {isActive ? (
          dir === "desc"
            ? <ChevronDown className={iconSz} strokeWidth={2.5} />
            : <ChevronUp   className={iconSz} strokeWidth={2.5} />
        ) : (
          <ChevronsUpDown className={`${iconSz} opacity-50 group-hover:opacity-100`} />
        )}
        <InfoIcon meaning={info.meaning} source={info.source} side="top" />
      </button>
    </th>
  );
}
