import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type WorkerEntry = {
  id?: string;
  call_date: string;        // ISO date e.g. "2025-02-11"
  status: string;
  name: string;
  specialty: string;
  qualifications: string;
  state: string;
  meeting_type: string;
  country_of_training: string;
  notes: string;
  created_by?: string;
  created_at?: string;
};

type DateFilter = "today" | "week" | "month" | "all";

function dateRange(filter: DateFilter): { from: string; to: string } | null {
  const now  = new Date();
  const pad  = (n: number) => String(n).padStart(2, "0");
  const fmt  = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = fmt(now);

  if (filter === "today") return { from: today, to: today };

  if (filter === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    return { from: fmt(start), to: today };
  }

  if (filter === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: fmt(start), to: today };
  }

  return null; // all
}

export function useWorkerEntries(filter: DateFilter = "all") {
  return useQuery<WorkerEntry[]>({
    queryKey: ["worker-entries", filter],
    queryFn: async () => {
      let q = supabase
        .from("worker_entries")
        .select("*")
        .order("call_date", { ascending: false })
        .order("created_at", { ascending: false });

      const range = dateRange(filter);
      if (range) {
        q = q.gte("call_date", range.from).lte("call_date", range.to);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as WorkerEntry[];
    },
    staleTime: 2 * 60 * 1000,
  });
}

export function useSaveEntries() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (entries: WorkerEntry[]) => {
      const { data: { user } } = await supabase.auth.getUser();
      const rows = entries.map(e => ({
        ...e,
        id:         undefined,   // let DB generate
        created_by: user?.id ?? null,
      }));
      const { error } = await supabase.from("worker_entries").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["worker-entries"] });
    },
  });
}

export function useDeleteEntry() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("worker_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["worker-entries"] });
    },
  });
}
