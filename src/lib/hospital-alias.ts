/**
 * Hospital spellings → one hospital, using the hospital_aliases table.
 *
 * The monthly sheets name one hospital many ways ("NMC-AUH", "NMC -AUH",
 * "NMC AUH"). Placement journeys are matched on (doctor, hospital name), so
 * every spelling variant used to start a duplicate journey. The importer now
 * runs each hospital cell through this resolver first: a known spelling
 * becomes the agreed sheet-style name; an unknown one is reported so a person
 * maps it once, and the mapping is remembered.
 */
import { cleanHospitalName } from "@/lib/parse-hammad-csv";

export interface HospitalAlias {
  alias:         string;
  alias_key:     string;
  hospital_name: string;
  hospital_id:   string | null;
}

/** Same key as the table's generated alias_key column: lower case, letters
 *  and digits only — spacing, hyphens, brackets and case never matter. */
export function hospitalKey(raw: string): string {
  return cleanHospitalName(raw).toLowerCase().replace(/[^a-z0-9]/g, "");
}

export interface ResolvedHospital {
  /** The cell as it was typed (tidied). */
  typed:         string;
  /** The name to store — the agreed name when known, else the typed text. */
  hospital_name: string;
  hospital_id:   string | null;
  /** false → no alias yet; the import preview asks someone to map it. */
  known:         boolean;
}

export function buildHospitalResolver(aliases: HospitalAlias[]): (raw: string) => ResolvedHospital {
  const byKey = new Map<string, HospitalAlias>();
  for (const a of aliases) byKey.set(a.alias_key || hospitalKey(a.alias), a);
  return (raw: string) => {
    const typed = cleanHospitalName(raw);
    const hit = byKey.get(hospitalKey(typed));
    return hit
      ? { typed, hospital_name: hit.hospital_name, hospital_id: hit.hospital_id, known: true }
      : { typed, hospital_name: typed, hospital_id: null, known: false };
  };
}
