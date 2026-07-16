/**
 * Lightweight React Query cache persistence — no extra dependency.
 *
 * Why: every hard refresh otherwise throws away the in-memory cache and every
 * page refetches from scratch (the 25-min staleTime is memory-only). Persisting
 * the cache to localStorage lets a reload paint instantly from the last
 * snapshot, then revalidate in the background. Biggest wins: first load after a
 * refresh, switching between data-heavy pages, and the ~19s Zoho Books call on
 * Finance (which now shows last-known actuals immediately while it refetches).
 *
 * Built on react-query's own dehydrate()/hydrate() (already in the bundle) so
 * there's no new package. Every storage touch is wrapped in try/catch — if
 * localStorage is full, disabled, or the snapshot is corrupt, we silently fall
 * back to the cold-start behaviour the app had before.
 */
import { dehydrate, hydrate, type QueryClient, type Query } from "@tanstack/react-query";

// Bump the version suffix to invalidate every persisted cache after a release
// that changes a query's data SHAPE (so we never hydrate a stale structure).
const STORAGE_KEY = "aa-rq-cache-v3";
// localStorage is ~5MB of UTF-16; stay well under so a write can't throw quota.
const MAX_CHARS = 2_000_000;
// Don't hydrate anything older than this — avoids showing day-old numbers.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
// Trailing debounce window: a burst of cache mutations collapses into a single
// write that fires only after things go quiet for this long. Raised from 1.5s
// to 3s to cut the number of localStorage writes (each is a full re-dehydrate +
// JSON.stringify of the whole persisted cache).
const WRITE_THROTTLE_MS = 3000;

// Queries we deliberately DON'T persist:
//   - zoho-data: the whole Zoho cache (multi-MB) — would blow the size budget.
//     It's a single fast zoho_cache row read on reload, not a bottleneck.
//   - wp-candidates / form-responses-infinite: large lists that are cheap to
//     refetch. Excluding them keeps the snapshot small; on reload they cold-start
//     exactly like zoho-data (a normal fetch), not from the persisted cache.
const EXCLUDE_FIRST_KEY = new Set<string>([
  "zoho-data",
  "wp-candidates",
  "form-responses-infinite",
  // These queries return Map<string,string> / Set which JSON.stringify serialises
  // to {} — hydrating a plain object breaks .get()/.has() calls. Exclude them so
  // they always cold-start from Supabase (cheap read, no bottleneck).
  "wp-doctor-photos",
  "jotform-doctor-photos",
  "meta-leads-stats",   // returns { metaLeadEmails: Set, metaLeadPhones: Set }
  // Finance: served from a fast SHARED server cache now, so don't also persist a
  // per-browser snapshot — that's what made numbers "flash" (a stale localStorage
  // value shown, then a jump to fresh) and diverge between people. A reload now
  // shows a brief skeleton, then the shared cached number (identical for everyone).
  "zoho-books",
  "zoho-accounttxns",
]);

/** JSON.stringify turns Set/Map into `{}`, which hydrates as a plain object and
 *  then throws "x.has is not a function" / "x.get is not a function" on the
 *  consumer. Never persist a query whose data holds a Set/Map (top-level or one
 *  level deep) — a catch-all so a new such hook can't reintroduce the crash. */
function hasUnserialisableCollections(data: unknown, depth = 0): boolean {
  if (data instanceof Set || data instanceof Map) return true;
  if (depth >= 2 || data == null || typeof data !== "object") return false;
  for (const v of Object.values(data as Record<string, unknown>)) {
    if (v instanceof Set || v instanceof Map) return true;
    if (depth < 1 && v && typeof v === "object" && hasUnserialisableCollections(v, depth + 1)) return true;
  }
  return false;
}

function shouldPersist(q: Query): boolean {
  return q.state.status === "success"
    && !EXCLUDE_FIRST_KEY.has(String(q.queryKey[0]))
    && !hasUnserialisableCollections(q.state.data);
}

/** Restore the last snapshot into the cache. Call ONCE, synchronously, before
 *  the first render so components read warm data on mount. */
export function restoreQueryCache(qc: QueryClient): void {
  try {
    if (typeof localStorage === "undefined") return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { t?: number; state?: unknown };
    if (!parsed || typeof parsed.t !== "number" || Date.now() - parsed.t > MAX_AGE_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    hydrate(qc, parsed.state);
  } catch {
    // Corrupt / unreadable snapshot — start cold and clear it.
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }
}

/** Subscribe to cache changes and persist a throttled snapshot. Returns an
 *  unsubscribe fn (unused at the app root, but handy for tests). */
export function startQueryPersist(qc: QueryClient): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const write = () => {
    try {
      if (typeof localStorage === "undefined") return;
      const state = dehydrate(qc, { shouldDehydrateQuery: shouldPersist });
      const payload = JSON.stringify({ t: Date.now(), state });
      // All-or-nothing size guard — if the snapshot is too big, skip this write
      // rather than risk a QuotaExceededError mid-set.
      if (payload.length > MAX_CHARS) return;
      localStorage.setItem(STORAGE_KEY, payload);
    } catch {
      // Quota or serialisation error — drop the snapshot and carry on.
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    }
  };

  // Trailing debounce: each cache change resets the timer, so a rapid burst of
  // mutations collapses into a single write that fires once things go quiet for
  // WRITE_THROTTLE_MS. The persisted snapshot is always the full current cache
  // at write time, so coalescing loses nothing — just fewer writes.
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = undefined; write(); }, WRITE_THROTTLE_MS);
  };

  return qc.getQueryCache().subscribe(schedule);
}

/** Wipe the persisted snapshot — call on sign-out so a shared machine doesn't
 *  hand the next user the previous one's cached data. */
export function clearQueryCachePersist(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
