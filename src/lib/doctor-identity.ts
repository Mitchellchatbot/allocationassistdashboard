/**
 * One doctor_id per doctor, however the sheet spells them.
 *
 * The importer used to look names up in Zoho only, with an exact
 * case-insensitive match, and to invent a csv:<slug> otherwise. A doctor
 * already in placement_attempts under one id got a second id whenever the
 * sheet's spelling or the Zoho lookup differed — 632 doctors ended up counted
 * twice. Resolution order now:
 *
 *   1. The id this name already has in placement_attempts (a Zoho id is
 *      preferred over a csv: one), so re-imports land on the same doctor.
 *   2. A Zoho doctor on board, then a Zoho lead, with the same name.
 *   3. A new csv:<slug>.
 *
 * Names are compared by doctorKey (no accents, case, spaces or punctuation).
 * Two different ids for one name is never guessed between — it comes back as
 * ambiguous for a person to pick. Near-misses (a typo, a missing surname) are
 * never merged either; they come back as suggestions.
 */
import { doctorKey, doctorSlug } from "@/lib/parse-hammad-csv";

export interface KnownDoctor { id: string; name: string }

export type MatchSource = "existing" | "zoho_dob" | "zoho_lead" | "new";

export interface DoctorMatch {
  doctor_id: string;
  how:       MatchSource;
  /** Several ids share this exact name — doctor_id is only a placeholder
   *  until someone picks. */
  ambiguous: KnownDoctor[];
  /** For a new doctor: similar names already known — possibly the same
   *  person spelled differently. Never applied automatically. */
  near:      Array<KnownDoctor & { how: Exclude<MatchSource, "new"> }>;
}

export interface DoctorSources {
  existing:       Array<{ doctor_id: string; doctor_name: string }>;
  doctorsOnBoard: KnownDoctor[];
  leads:          KnownDoctor[];
}

/** Edit distance, stopping early once it can no longer be within `max`. */
function within(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

const wordList = (name: string) =>
  name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\u0131/g, "i").toLowerCase().split(/[^a-z]+/).filter(Boolean);

const words = (name: string) => new Set(wordList(name));

/**
 * A typo of the same name: the same words in the same order, with at most one
 * of them misspelled by a single letter ("Hicham Farha" / "Hicham Farhat",
 * "Craig McRobert" / "McRoberts"). Comparing whole names instead would pair
 * "Ali Hassan" with "Sami Hassan", who are two different doctors.
 */
function oneLetterOff(a: string[], b: string[]): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let differing = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    if (++differing > 1) return false;
    if (Math.min(a[i].length, b[i].length) < 4 || !within(a[i], b[i], 1)) return false;
  }
  return differing === 1;
}

/** "Gladys" and "Gladys Guillaume", "Anser" and "Anser Javed": every word of
 *  the shorter name is in the longer one. */
const wordsContained = (a: Set<string>, b: Set<string>) => {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  if (small.size === 0 || small.size === big.size) return false;
  for (const w of small) if (!big.has(w)) return false;
  return true;
};

export function buildDoctorResolver(sources: DoctorSources): (name: string) => DoctorMatch {
  type Entry = KnownDoctor & { how: Exclude<MatchSource, "new"> };
  const index = new Map<string, Entry[]>();
  const add = (e: Entry) => {
    const k = doctorKey(e.name);
    if (!k) return;
    const list = index.get(k) ?? [];
    if (!list.some(x => x.id === e.id)) list.push(e);
    index.set(k, list);
  };
  for (const r of sources.existing) add({ id: r.doctor_id, name: r.doctor_name, how: "existing" });
  for (const d of sources.doctorsOnBoard) add({ ...d, how: "zoho_dob" });
  for (const l of sources.leads) add({ ...l, how: "zoho_lead" });

  const all = [...index.entries()].map(([key, list]) => ({ key, words: words(list[0].name), list: list, parts: wordList(list[0].name) }));

  return (name: string) => {
    const key = doctorKey(name);
    const hits = index.get(key) ?? [];

    // Earlier sources win: a name already in the table keeps its id.
    for (const how of ["existing", "zoho_dob", "zoho_lead"] as const) {
      let pool = hits.filter(h => h.how === how);
      if (how === "existing" && pool.some(h => !h.id.startsWith("csv:"))) pool = pool.filter(h => !h.id.startsWith("csv:"));
      const ids = [...new Set(pool.map(h => h.id))];
      if (ids.length === 1) return { doctor_id: ids[0], how, ambiguous: [], near: [] };
      if (ids.length > 1) {
        const choices = ids.map(id => pool.find(h => h.id === id)!).map(({ id, name }) => ({ id, name }));
        return { doctor_id: ids.sort()[0], how, ambiguous: choices, near: [] };
      }
    }

    const mine = words(name);
    const myParts = wordList(name);
    const near: DoctorMatch["near"] = [];
    if (key) {
      for (const e of all) {
        if (e.key === key) continue;
        if (oneLetterOff(myParts, e.parts) || wordsContained(mine, e.words)) {
          const best = e.list[0];
          if (!near.some(n => n.id === best.id)) near.push(best);
        }
      }
    }
    return { doctor_id: doctorSlug(name), how: "new", ambiguous: [], near: near.slice(0, 3) };
  };
}
