import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export const PAGE_SIZE = 50;

export type Doctor = {
  id: string;
  zohoId?: string;       // raw Zoho record ID (for status updates)
  leadStatus?: string;   // raw Zoho Lead_Status value
  name: string;
  specialty: string;
  stage: string;
  origin: string;
  destination: string;
  assignedTo: string;
  daysInStage: number;
  status: "on-track" | "delayed" | "at-risk" | "closed";
  license: string;
};

export function useMetaLeads(page: number = 0, search: string = "") {
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  return useQuery<{ doctors: Doctor[]; total: number }>({
    queryKey: ["meta-leads", page, search],
    queryFn: async () => {
      let query = supabase
        .from("meta_leads_pipeline")
        .select(
          "id, name, specialty, stage, origin, destination, assigned_to, days_in_stage, status, license, created_at",
          { count: "exact" }
        )
        .order("created_at", { ascending: false })
        .range(from, to);

      if (search.trim()) {
        query = query.or(
          `name.ilike.%${search}%,specialty.ilike.%${search}%,stage.ilike.%${search}%`
        );
      }

      const { data, error, count } = await query;
      if (error) throw error;

      const doctors = (data ?? []).map((row) => ({
        id: row.id ?? "",
        name: row.name ?? "",
        specialty: row.specialty ?? "",
        stage: row.stage ?? "New Application",
        origin: row.origin ?? "",
        destination: row.destination ?? "",
        assignedTo: row.assigned_to ?? "",
        daysInStage: row.days_in_stage ?? 0,
        status: (["on-track", "delayed", "at-risk"].includes(row.status)
          ? row.status
          : "on-track") as Doctor["status"],
        license: row.license ?? "",
      }));

      return { doctors, total: count ?? 0 };
    },
    placeholderData: (prev) => prev,
  });
}
