import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL      as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export interface SalesBoardMember {
  id:          string;
  member_name: string;
  email:       string | null;
  user_id:     string | null;
}

const KEY = ["sales-board-members"] as const;

/** Admin-pinned salespeople on the Sales Tracker leaderboard. Returns [] if the
 *  sales_board_members table hasn't been created yet, so the feature stays
 *  dormant (and the page never breaks) until it's set up. */
export function useSalesBoardMembers() {
  return useQuery<SalesBoardMember[]>({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_board_members")
        .select("id, member_name, email, user_id");
      if (error) return [];   // table not created yet → dormant
      return (data ?? []) as SalesBoardMember[];
    },
    staleTime: 60_000,
  });
}

export function useAddSalesBoardMember() {
  const qc = useQueryClient();
  return useMutation<void, Error, { member_name: string; email?: string | null; user_id?: string | null; added_by?: string | null }>({
    mutationFn: async (m) => {
      const { error } = await supabase.from("sales_board_members").insert({
        member_name: m.member_name,
        email:       m.email ?? null,
        user_id:     m.user_id ?? null,
        added_by:    m.added_by ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRemoveSalesBoardMember() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await supabase.from("sales_board_members").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export interface DashboardUser {
  id:        string;
  email:     string | null;
  full_name: string | null;
  role:      string | null;
}

/** Lists dashboard users (via the get-users function) for the "add salesperson"
 *  picker. Enabled only when needed (admin opens the dialog). */
export function useDashboardUsers(enabled: boolean) {
  return useQuery<DashboardUser[]>({
    queryKey: ["dashboard-users-list"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const token = (await supabase.auth.getSession()).data.session?.access_token ?? SUPABASE_ANON_KEY;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/get-users`, {
        method: "POST",
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, "content-type": "application/json" },
      });
      const json = await res.json().catch(() => ({}));
      return ((json.users ?? []) as DashboardUser[]);
    },
  });
}
