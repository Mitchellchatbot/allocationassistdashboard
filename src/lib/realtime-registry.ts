/**
 * Singleton realtime subscription registry.
 *
 * Before this lived: every hook (`useNotifications`, `useAutomationFlowRuns`,
 * `useVacancies`, etc.) created its own Supabase channel on mount. If three
 * components called `useNotifications` (sidebar badge + dashboard greeting
 * + pending actions), that was 3 separate WebSocket-side subscriptions for
 * the same table — wasteful + the changes fired 3 listeners.
 *
 * Now: one channel per table app-wide. Each call to `useTableSubscription`
 * registers a callback; when subscribers > 0 a channel is opened; when
 * subscribers drop to 0 the channel is removed.
 *
 * Coalescing: postgres_changes events fire ONCE PER ROW, which means a
 * bulk operation (e.g. the JotForm historical sync upserting 865 rows)
 * can fire 865 invalidations in seconds. Each invalidation triggers
 * useInfiniteQuery to refetch ALL loaded pages — at 1000 rows × 621KB
 * per page the browser drowns, the dashboard locks up, and the
 * displayed count stops updating ('stuck at 225'). We debounce per
 * table at 350ms so a flood of writes collapses into one refetch.
 */
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

type Listener = () => void;

interface ChannelHandle {
  listeners:    Set<Listener>;
  channel:      ReturnType<typeof supabase.channel> | null;
  pendingFlush: ReturnType<typeof setTimeout> | null;
}

const registry = new Map<string, ChannelHandle>();

/** Window during which a burst of change events fires only one
 *  invalidation. 350ms is short enough that single-event responses
 *  (typing → save → see your change) still feel instant, long
 *  enough to swallow a parallel bulk sync at 8-row chunks. */
const COALESCE_MS = 350;

/** Subscribe to ALL postgres_changes on a table. Returns nothing — the
 *  caller passes a `cb` that fires on insert/update/delete, typically a
 *  react-query `invalidateQueries`. Multiple events within a 350ms
 *  window collapse into a single callback invocation per listener. */
export function useTableSubscription(table: string, cb: Listener): void {
  useEffect(() => {
    let handle = registry.get(table);
    if (!handle) {
      handle = { listeners: new Set(), channel: null, pendingFlush: null };
      registry.set(table, handle);
    }
    handle.listeners.add(cb);

    // First subscriber — open the channel.
    if (!handle.channel) {
      handle.channel = supabase
        .channel(`shared_${table}`)
        .on("postgres_changes", { event: "*", schema: "public", table }, () => {
          // Debounce: every event resets the timer; we fire once 350ms
          // after the last event in a burst. A sync that hammers the
          // table for 30s causes ONE refetch at the end, not 865.
          if (handle!.pendingFlush) clearTimeout(handle!.pendingFlush);
          handle!.pendingFlush = setTimeout(() => {
            handle!.pendingFlush = null;
            for (const l of handle!.listeners) l();
          }, COALESCE_MS);
        })
        .subscribe();
    }

    return () => {
      handle!.listeners.delete(cb);
      // Last subscriber gone — tear it down so we don't leak channels.
      if (handle!.listeners.size === 0 && handle!.channel) {
        if (handle!.pendingFlush) clearTimeout(handle!.pendingFlush);
        supabase.removeChannel(handle!.channel);
        handle!.channel = null;
        registry.delete(table);
      }
    };
  }, [table, cb]);
}
