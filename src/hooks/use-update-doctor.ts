/**
 * useUpdateDoctorOnBoard — write edits to a Doctors-on-Board record back to Zoho
 * (the Contacts module) and optimistically patch the local ['zoho-data'] cache
 * so the UI reflects the change immediately. The cache only re-syncs from Zoho
 * every ~30 min, so without the optimistic patch an edit would appear to "snap
 * back" on the next render until the sync catches up.
 *
 * `id` is the RAW Zoho record id (no `dob:` prefix). `fields` are Zoho API
 * field names (e.g. First_Name, Email, Specialty_New).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { zohoPut } from "@/lib/zoho";

type DobRow = Record<string, unknown> & { id: string };

export function useUpdateDoctorOnBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, fields }: { id: string; fields: Record<string, unknown> }) => {
      const res = await zohoPut<{ data?: Array<{ code?: string; message?: string }> }>(
        `Contacts/${id}`, { data: [fields] },
      );
      const rec = res?.data?.[0];
      if (rec?.code && rec.code !== "SUCCESS") {
        throw new Error(rec.message || `Zoho rejected the update (${rec.code}).`);
      }
      return { id, fields };
    },
    onSuccess: ({ id, fields }) => {
      qc.setQueryData(["zoho-data"], (old: unknown) => {
        if (!old || typeof old !== "object") return old;
        const patchRows = (rows: DobRow[] | undefined): DobRow[] | undefined =>
          rows?.map(r => {
            if (String(r.id) !== String(id)) return r;
            const merged: DobRow = { ...r, ...fields };
            // Zoho derives Full_Name from First/Last — mirror that locally.
            if ("First_Name" in fields || "Last_Name" in fields) {
              const fn = String(merged.First_Name ?? "").trim();
              const ln = String(merged.Last_Name ?? "").trim();
              merged.Full_Name = `${fn} ${ln}`.trim() || merged.Full_Name;
            }
            return merged;
          });
        const o = old as Record<string, unknown>;
        return {
          ...o,
          rawDoctorsOnBoard:    patchRows(o.rawDoctorsOnBoard as DobRow[] | undefined) ?? o.rawDoctorsOnBoard,
          rawDoctorsOnBoardAll: patchRows(o.rawDoctorsOnBoardAll as DobRow[] | undefined) ?? o.rawDoctorsOnBoardAll,
        };
      });
    },
  });
}
