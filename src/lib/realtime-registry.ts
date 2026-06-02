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
 */
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

type Listener = () => void;

interface ChannelHandle {
  listeners: Set<Listener>;
  channel:   ReturnType<typeof supabase.channel> | null;
}

const registry = new Map<string, ChannelHandle>();

/** Subscribe to ALL postgres_changes on a table. Returns nothing — the
 *  caller passes a `cb` that fires on insert/update/delete, typically a
 *  react-query `invalidateQueries`. */
export function useTableSubscription(table: string, cb: Listener): void {
  useEffect(() => {
    let handle = registry.get(table);
    if (!handle) {
      handle = { listeners: new Set(), channel: null };
      registry.set(table, handle);
    }
    handle.listeners.add(cb);

    // First subscriber — open the channel.
    if (!handle.channel) {
      handle.channel = supabase
        .channel(`shared_${table}`)
        .on("postgres_changes", { event: "*", schema: "public", table }, () => {
          for (const l of handle!.listeners) l();
        })
        .subscribe();
    }

    return () => {
      handle!.listeners.delete(cb);
      // Last subscriber gone — tear it down so we don't leak channels.
      if (handle!.listeners.size === 0 && handle!.channel) {
        supabase.removeChannel(handle!.channel);
        handle!.channel = null;
        registry.delete(table);
      }
    };
  }, [table, cb]);
}
