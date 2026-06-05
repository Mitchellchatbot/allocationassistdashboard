/**
 * Notifications — written by tick-scheduler when something needs attention
 * (new vacancy match, 72h post-interview chase, ...). Read by PendingActionsCard
 * on the main dashboard.
 */
import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTableSubscription } from "@/lib/realtime-registry";
import { useAuth } from "@/hooks/use-auth";

export type NotificationKind = "vacancy_match" | "interview_followup" | "shortlist_suggested" | "hospital_reply_overdue" | "signed_not_joined" | "availability_checkin" | string;
export type NotificationSeverity = "info" | "action" | "critical";

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
  // Notifications v2 — severity drives grouping + Slack routing on the
  // server. cta_* render the single primary action button on the card.
  severity:            NotificationSeverity;
  cta_label:           string | null;
  cta_kind:            string | null;
  slack_delivered_at:  string | null;
  slack_skip_reason:   string | null;
}

const KEY = ["notifications"] as const;

export function useNotifications(): {
  notifications: AppNotification[];
  unreadCount: number;
  isLoading: boolean;
} {
  const qc = useQueryClient();
  const { user, role } = useAuth();
  const myEmail = (user?.email ?? "").toLowerCase();

  const q = useQuery({
    // Cache key includes the user email so switching accounts re-fetches
    // (otherwise the previous user's filtered list would be served stale).
    queryKey: [...KEY, myEmail, role] as const,
    queryFn: async (): Promise<AppNotification[]> => {
      // Bumped from 50 → 500 so the sidebar badge reflects reality and the
      // panel can group + paginate through hundreds.
      //
      // HI team members only see notifications addressed to them (for_user
      // matches their email) OR team-wide ones (for_user is null). Admins
      // still see everything so they can audit the whole queue.
      let query = supabase
        .from("notifications")
        .select("*")
        .is("dismissed_at", null)
        .order("created_at", { ascending: false })
        .limit(500);
      if (role === "hi_member" && myEmail) {
        query = query.or(`for_user.is.null,for_user.eq.${myEmail}`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as AppNotification[];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  useTableSubscription("notifications", useCallback(() => {
    // Invalidate every per-user variant — easier than reconstructing exact key
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
