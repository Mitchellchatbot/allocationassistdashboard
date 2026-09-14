/**
 * Loading placeholders for the Reports page.
 *
 * The page pulls several thousand placement rows plus the hospitals table, and
 * until those land every panel used to render its EMPTY state — "No activity in
 * this range", zeroed tiles, blank tables — which reads as "there's no data"
 * rather than "not loaded yet". These skeletons mirror the real layout so the
 * page holds its shape while it fills in, and nothing ever claims emptiness it
 * hasn't verified.
 *
 * Rule of thumb for callers: check `isLoading` BEFORE the empty check.
 */
import { Skeleton } from "@/components/ui/skeleton";

/** Trend chart placeholder — matches the 260px plot + the toggle above it. */
export function ChartSkeleton() {
  return (
    <div className="w-full">
      <div className="mb-2 flex justify-end">
        <Skeleton className="h-7 w-[124px] rounded-md" />
      </div>
      <div className="h-[260px] w-full flex items-end gap-2 px-2 pb-6">
        {/* Staggered column heights so it reads as a chart, not a grey slab. */}
        {[38, 52, 44, 67, 58, 74, 49, 63, 71, 55, 80, 62].map((h, i) => (
          <Skeleton key={i} className="flex-1 rounded-sm" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

/** Horizontal bar list (region / specialty / vacancy breakdowns). */
export function BarsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <Skeleton className="h-3 w-[44%]" />
          <Skeleton className="h-4 flex-1 rounded" />
          <Skeleton className="h-3 w-8" />
        </div>
      ))}
    </div>
  );
}

/** Grid of stat tiles (scoreboard, lifecycle averages). */
export function TilesSkeleton({ count = 4, cols = "lg:grid-cols-4" }: { count?: number; cols?: string }) {
  return (
    <div className={`grid grid-cols-2 ${cols} gap-3`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-slate-200 p-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-12 mt-2.5" />
          <Skeleton className="h-2.5 w-24 mt-2" />
        </div>
      ))}
    </div>
  );
}

/**
 * Width of one stage column in the team leaderboard.
 *
 * The header, the data cells and this skeleton all have to agree or the
 * numbers stop lining up under their labels. It's sized for the longest
 * header ("Shortlisted") PLUS its sort arrow — the arrow occupies real width
 * rather than floating over the text, so a narrower column makes adjacent
 * headers collide. The slack is deliberate: Poppins runs wide, and the active
 * column renders semibold, so the widest state is a bolded "Shortlisted ↓".
 */
export const STAGE_COL = "w-[100px]";

/** Team leaderboard rows — avatar, name + progress bar, five stage numbers. */
export function RepRowsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-0.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-2">
          <Skeleton className="h-3.5 w-3.5 rounded-sm shrink-0" />
          <Skeleton className="h-7 w-7 rounded-full shrink-0" />
          <div className="flex-1 min-w-0">
            <Skeleton className="h-3 w-[180px]" />
            <Skeleton className="h-1.5 w-[140px] mt-2 rounded-full" />
          </div>
          {Array.from({ length: 5 }).map((_, c) => (
            <div key={c} className={`${STAGE_COL} shrink-0 flex justify-end`}>
              <Skeleton className="h-4 w-6" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Generic table body placeholder: first column wide, the rest right-aligned. */
export function TableRowsSkeleton({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="px-4 py-3 space-y-3">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-3">
          <Skeleton className="h-3.5 flex-1" />
          {Array.from({ length: cols - 1 }).map((_, c) => (
            <div key={c} className="w-[62px] flex justify-end">
              <Skeleton className="h-3.5 w-7" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
