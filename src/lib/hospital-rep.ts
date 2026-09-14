/**
 * Resolve a free-text hospital name to the team member who represents it.
 *
 * Placement attempts store the hospital as free text, and the imported monthly
 * sheets abbreviate heavily ("NMC (Sharjah)", "Burjeel (Dubai)", "STMC"), so an
 * exact name match credits almost nothing. Matching is done on word tokens
 * instead: a candidate matches when one name's tokens are a subset of the
 * other's, which pairs "NMC (Sharjah)" with both "NMC Sharjah" and "NMC Sharjah
 * (Pauline)" while keeping it away from "NMC Hospital Dubai".
 *
 * When the surviving candidates disagree on the rep the answer is null. A bare
 * "Mediclinic" spans branches owned by different people, and crediting an
 * arbitrary one of them is worse than crediting nobody.
 */
import { findHiMemberByEmail, type HiTeamMember } from "@/lib/hi-team";

/** Words that carry no identity — dropping them lets "Burjeel Hospital - Dubai"
 *  meet "Burjeel (Dubai)". Deliberately short: "medical", "city" and the like
 *  do distinguish real hospitals from each other. */
const NOISE = new Set(["hospital", "hospitals", "the", "and", "of"]);

export function tokenize(name: string): Set<string> {
  return new Set(
    name.toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter(t => t && !NOISE.has(t)),
  );
}

const isSubset = (a: Set<string>, b: Set<string>) => {
  for (const t of a) if (!b.has(t)) return false;
  return true;
};

export interface RepLookup {
  (hospitalName: string | null | undefined): HiTeamMember | null;
}

export interface HospitalMatch {
  /** The team member who represents the matched hospital. */
  rep: HiTeamMember;
  /** The canonical hospitals-table name, when exactly one record matched.
   *  Null when several branches of the same rep's book matched and the free
   *  text can't pick between them (e.g. a bare "Burjeel" under one owner). */
  hospital: string | null;
}

export interface HospitalMatcher {
  (hospitalName: string | null | undefined): HospitalMatch | null;
}

/**
 * Same matching as buildRepLookup, but also reports WHICH hospital record the
 * free text resolved to. Reports' team view needs that to group a member's
 * activity under the hospitals actually allocated to them, rather than under
 * whatever spelling the monthly sheet happened to use.
 */
export function buildHospitalMatcher(
  hospitals: Array<{ name: string; owner_email: string | null }>,
): HospitalMatcher {
  const owned: Array<{ name: string; tokens: Set<string>; rep: HiTeamMember }> = [];
  for (const h of hospitals) {
    const rep = findHiMemberByEmail(h.owner_email);
    if (!rep) continue;
    const tokens = tokenize(h.name);
    if (tokens.size) owned.push({ name: h.name, tokens, rep });
  }

  const cache = new Map<string, HospitalMatch | null>();
  return (hospitalName) => {
    if (!hospitalName) return null;
    const key = hospitalName.toLowerCase().trim();
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    const tokens = tokenize(hospitalName);
    let hit: HospitalMatch | null = null;
    if (tokens.size) {
      // A name that matches a hospital word-for-word is not ambiguous, even
      // though "Al Ain Hospital" is also contained in "Burjeel Abu Dhabi and
      // Al Ain". Only fall back to the looser match when nothing matches exactly.
      const exact = owned.filter(o => o.tokens.size === tokens.size && isSubset(tokens, o.tokens));
      const near  = exact.length
        ? exact
        : owned.filter(o => isSubset(tokens, o.tokens) || isSubset(o.tokens, tokens));
      const reps = new Set(near.map(o => o.rep.email));
      if (reps.size === 1) {
        const names = new Set(near.map(o => o.name));
        hit = { rep: near[0].rep, hospital: names.size === 1 ? near[0].name : null };
      }
    }
    cache.set(key, hit);
    return hit;
  };
}

export function buildRepLookup(
  hospitals: Array<{ name: string; owner_email: string | null }>,
): RepLookup {
  const match = buildHospitalMatcher(hospitals);
  return (hospitalName) => match(hospitalName)?.rep ?? null;
}
