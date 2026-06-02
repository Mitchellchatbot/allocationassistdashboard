/**
 * Distinct doctor specialties across BOTH Zoho leads and Doctors-on-Board,
 * with counts so the dropdown can show "Oncology (24)" and rank common
 * specialties at the top. Drives the specialty combobox on the Vacancy
 * creation dialog so vacancy.specialty matches what's actually in Zoho —
 * otherwise the matcher can't fuzzy-match against the team's spelling.
 */
import { useMemo } from "react";
import { useZohoData } from "@/hooks/use-zoho-data";
import type { ZohoLead, ZohoDoctorOnBoard } from "@/hooks/use-zoho-data";

export interface SpecialtyOption {
  value: string;       // canonical (trimmed) name to store
  label: string;       // pretty label for the dropdown
  count: number;       // how many doctors carry this specialty
}

export function useDoctorSpecialties(): SpecialtyOption[] {
  const zoho = useZohoData();

  return useMemo<SpecialtyOption[]>(() => {
    const z = zoho.data as { rawLeads?: ZohoLead[]; rawDoctorsOnBoard?: ZohoDoctorOnBoard[] } | undefined;
    const counts = new Map<string, number>();   // key = lower-cased, value = count
    const display = new Map<string, string>();  // key = lower-cased, value = first-seen original casing

    const bump = (raw: string | null | undefined) => {
      if (!raw) return;
      const trimmed = raw.trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (!display.has(key)) display.set(key, trimmed);
    };

    for (const l of z?.rawLeads ?? []) {
      // Specialty_New is the newer field — prefer it but also count Specialty
      // when New is blank so older leads aren't lost.
      bump(l.Specialty_New ?? l.Specialty);
    }
    for (const d of z?.rawDoctorsOnBoard ?? []) {
      // Zoho's Contacts module uses British `Speciality` plus a
      // `Specialty_New` override. Read both with override-first precedence.
      bump(d.Specialty_New ?? d.Speciality);
    }

    const out: SpecialtyOption[] = [];
    for (const [key, n] of counts) {
      const label = display.get(key) ?? key;
      out.push({ value: label, label: `${label} (${n})`, count: n });
    }
    // Most common first, then alphabetical tiebreak.
    out.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    return out;
  }, [zoho.data]);
}
