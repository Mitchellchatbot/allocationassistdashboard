// Canonicalise a country label so alias variants collapse to one value — a
// filter set to "Saudi Arabia" then matches hospitals saved as "KSA" / "K.S.A." /
// "Kingdom of Saudi Arabia"; "UAE" matches "United Arab Emirates"; etc.
//
// This is the CLIENT mirror of `normCountry` in
// supabase/functions/send-batch/index.ts — the two MUST stay in sync so a
// preview's country filter narrows to exactly the hospitals the server would
// send to. Previously the client compared with plain `.trim().toLowerCase()`,
// so alias drift silently dropped hospitals from a preview that the server kept.
export function normCountry(c: string | null | undefined): string {
  const s = (c || "").toLowerCase().replace(/[._]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return "";
  if (s.includes("saudi")   || s === "ksa" || s === "sa") return "saudi arabia";
  if (s.includes("emirat")  || s === "uae")               return "uae";
  if (s.includes("qatar")   || s === "qa")                return "qatar";
  if (s.includes("oman")    || s === "om")                return "oman";
  if (s.includes("kuwait")  || s === "kw")                return "kuwait";
  if (s.includes("bahrain") || s === "bh")                return "bahrain";
  return s;
}

/** True when two country labels refer to the same country, tolerating alias
 *  drift (KSA ≡ Saudi Arabia, UAE ≡ United Arab Emirates, …). */
export function sameCountry(a: string | null | undefined, b: string | null | undefined): boolean {
  return normCountry(a) === normCountry(b);
}

/** A human-facing label to show for a normalised country key, so the filter
 *  dropdown reads "Saudi Arabia" / "UAE" rather than raw stored variants. */
const CANONICAL_LABEL: Record<string, string> = {
  "saudi arabia": "Saudi Arabia",
  "uae": "UAE",
  "qatar": "Qatar",
  "oman": "Oman",
  "kuwait": "Kuwait",
  "bahrain": "Bahrain",
};

/** Canonical display label for a raw country value ("KSA" → "Saudi Arabia",
 *  "united arab emirates" → "UAE"). Empty string when there's no country. Used
 *  to keep the working-op email's location groupings from splitting on aliases. */
export function canonicalCountryLabel(c: string | null | undefined): string {
  const key = normCountry(c);
  if (!key) return "";
  return CANONICAL_LABEL[key] ?? (c ?? "").trim().replace(/\b\w/g, m => m.toUpperCase());
}

/** Build the deduped country options for a filter dropdown from a list of raw
 *  hospital country labels. Returns `{ value, label }` where `value` is the
 *  normalised key (feed it straight to `normCountry(h.country) === value`) and
 *  `label` is a tidy display name. Sorted alphabetically by label. */
export function countryFilterOptions(rawCountries: Array<string | null | undefined>): Array<{ value: string; label: string }> {
  const byKey = new Map<string, string>();
  for (const raw of rawCountries) {
    const key = normCountry(raw);
    if (!key) continue;
    if (!byKey.has(key)) {
      // Prefer a known canonical label; otherwise Title-Case the raw value.
      const label = CANONICAL_LABEL[key] ?? (raw ?? "").trim().replace(/\b\w/g, m => m.toUpperCase());
      byKey.set(key, label || key);
    }
  }
  return [...byKey.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
