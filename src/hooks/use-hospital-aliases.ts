/**
 * The agreed hospital spellings (hospital_aliases). Read by the placement
 * importer; written when someone maps a new spelling in the import preview.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { HospitalAlias } from "@/lib/hospital-alias";

const KEY = ["hospital-aliases"] as const;

export function useHospitalAliases() {
  return useQuery<HospitalAlias[]>({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hospital_aliases")
        .select("alias, alias_key, hospital_name, hospital_id");
      if (error) throw error;
      return (data ?? []) as HospitalAlias[];
    },
    staleTime: 60_000,
  });
}

export interface AddAliasInput {
  alias:         string;
  hospital_name: string;
  hospital_id?:  string | null;
}

/** Remember that a spelling means a hospital. A spelling already mapped is
 *  left as it is — changing an agreed mapping is a deliberate edit, not a
 *  side effect of an import. */
export function useAddHospitalAlias() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddAliasInput) => {
      const { data: sess } = await supabase.auth.getSession();
      const { error } = await supabase
        .from("hospital_aliases")
        .upsert({
          alias:         input.alias,
          hospital_name: input.hospital_name,
          hospital_id:   input.hospital_id ?? null,
          created_by:    sess.session?.user.email ?? null,
        }, { onConflict: "alias_key", ignoreDuplicates: true });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
