/**
 * Notifications — written by tick-scheduler when something needs attention
 * (new vacancy match, 72h post-interview chase, ...). Read by PendingActionsCard
 * on the main dashboard.
 */
import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTableSubscription } from "@/lib/realtime-registry";

export type NotificationKind = "vacancy_match" | "interview_followup" | string;

export interface AppNotification {
  id:                  string;
  kind:                NotificationKind;
  title:               string;
  body:                string | null;
  link_path:           string | null;
  related_vacancy_id:  string | null;
  related_doctor_id:   string | null;
  related_run_id:      string | null;
  for_user:            string | null;
  read_at:             string | null;
  dismissed_at:        string | null;
  created_at:          string;
}

const KEY = ["notifications"] as const;

export function useNotifications(): {
  notifications: AppNotification[];
  unreadCount: number;
  isLoading: boolean;
} {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<AppNotification[]> => {
      // Bumped from 50 → 500 so the sidebar badge reflects reality and the
      // panel can group + paginate through hundreds. Beyond 500 we'd want
      // server-side pagination, but at that volume the team should bulk-
      // dismiss before scrolling anyway.
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .is("dismissed_at", null)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as AppNotification[];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  useTableSubscription("notifications", useCallback(() => {
    qc.invalidateQueries({ queryKey: KEY });
  }, [qc]));

  const notifications = q.data ?? [];
  const unreadCount = notifications.filter(n => !n.read_at).length;
  return { notifications, unreadCount, isLoading: q.isLoading };
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDismissNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ dismissed_at: new Date().toISOString(), read_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Dismiss every notification of a given kind in one shot — used by the
 *  per-group "Clear all" affordance in the panel. */
export function useDismissAllOfKind() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (kind: NotificationKind) => {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("notifications")
        .update({ dismissed_at: now, read_at: now })
        .eq("kind", kind)
        .is("dismissed_at", null);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
