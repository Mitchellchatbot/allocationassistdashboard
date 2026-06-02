/**
 * Merge Zoho hospital records (authoritative) with Saif's contact overlay
 * (human knowledge) and upsert into the dashboard's `hospitals` table.
 *
 * Order of precedence:
 *   1. Zoho Account_Name           → hospital row identity
 *   2. Zoho Billing_City / Billing_Country  → city / country
 *   3. Zoho Email field            → primary_recruiter_email (when present)
 *   4. Overlay fills in everything Zoho doesn't have:
 *        cc_emails, active, owner_email, greeting, specialty_only/skip, notes
 *      Overlay's primary email is used as a fallback when Zoho's is blank.
 *
 * Overlay rows with no Zoho match are also inserted (so we don't lose the
 * niche entries like "NMC Hospital Dubai (Suresh group)" that aren't a
 * separate Zoho record).
 *
 * Run:
 *   SUPABASE_URL=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   bun run scripts/import-hospital-contacts.ts
 *
 * Override the Zoho field names if Saif's setup uses different ones:
 *   ZOHO_HOSPITAL_MODULE=Accounts            (default — change if hospitals live in a custom module)
 *   ZOHO_EMAIL_FIELD=Email                   (default — change to whatever the recruiter-email column is called)
 *   ZOHO_CITY_FIELD=Billing_City             (default)
 *   ZOHO_COUNTRY_FIELD=Billing_Country       (default)
 */

import { createClient } from "@supabase/supabase-js";
import { HOSPITAL_OVERLAY, findOverlayMatch, type HospitalOverlay } from "./data/hospital-overlay";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://elfkqmbwuspjaoorqggq.supabase.co";
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!SERVICE_KEY) throw new Error("Set SUPABASE_SERVICE_ROLE_KEY in env");

const ZOHO_HOSPITAL_MODULE = process.env.ZOHO_HOSPITAL_MODULE ?? "Accounts";
const ZOHO_EMAIL_FIELD     = process.env.ZOHO_EMAIL_FIELD     ?? "Email";
const ZOHO_CITY_FIELD      = process.env.ZOHO_CITY_FIELD      ?? "Billing_City";
const ZOHO_COUNTRY_FIELD   = process.env.ZOHO_COUNTRY_FIELD   ?? "Billing_Country";

interface ZohoAccount {
  id:           string;
  Account_Name: string;
  [k: string]:  unknown;
}

interface ZohoHospitalContact {
  id:            string;
  Name:          string;
  Email:         string | null;
  Phone:         string | null;
  Contact_Type:  string | null;          // "Primary" / "Secondary" / etc.
  Hospital:      { id: string; name: string } | null;  // lookup to parent Account
  Emirate?:      string | null;
}

interface MergedHospital {
  name:                    string;
  city:                    string | null;
  country:                 string | null;
  primary_recruiter_email: string | null;
  primary_contact_name:    string | null;
  cc_emails:               string[];
  active:                  boolean;
  owner_email:             string | null;
  greeting:                string | null;
  specialty_only:          string[];
  specialty_skip:          string[];
  notes:                   string | null;
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  console.log(`[hospital-merge] Pulling Zoho ${ZOHO_HOSPITAL_MODULE} module via zoho_cache…`);
  // zoho-sync writes Accounts into zoho_cache row 2. Pull from there so we
  // don't need a Zoho token in this script — the cache is already populated.
  const { data: cacheRows, error: cacheErr } = await supabase
    .from("zoho_cache").select("id, data").in("id", [1, 2]);
  if (cacheErr) throw cacheErr;
  const merged = (cacheRows ?? []).reduce<Record<string, unknown>>((acc, r) => Object.assign(acc, (r as { data: Record<string, unknown> }).data), {});
  const accounts = ((merged.accounts ?? []) as ZohoAccount[]);
  const contacts = ((merged.hospitalContacts ?? []) as ZohoHospitalContact[]);
  console.log(`[hospital-merge] ${accounts.length} Zoho hospitals · ${contacts.length} contacts · ${HOSPITAL_OVERLAY.length} overlay entries`);

  // Group contacts by parent hospital id. Primary first in each group so the
  // build step picks it for primary_recruiter_email.
  const contactsByHospitalId = new Map<string, ZohoHospitalContact[]>();
  for (const c of contacts) {
    const hid = c.Hospital?.id;
    if (!hid || !c.Email) continue;
    const arr = contactsByHospitalId.get(hid) ?? [];
    arr.push(c);
    contactsByHospitalId.set(hid, arr);
  }
  for (const arr of Array.from(contactsByHospitalId.values())) {
    arr.sort((a, b) => {
      const ap = (a.Contact_Type ?? "").toLowerCase() === "primary" ? 0 : 1;
      const bp = (b.Contact_Type ?? "").toLowerCase() === "primary" ? 0 : 1;
      return ap - bp;
    });
  }

  // Build the merged list. Index overlay matches by overlay name so we know
  // which overlay rows still need to be inserted (those without Zoho match).
  const matchedOverlayNames = new Set<string>();
  const out: MergedHospital[] = [];

  for (const acct of accounts) {
    const zohoName = (acct.Account_Name ?? "").trim();
    if (!zohoName) continue;
    const overlay = findOverlayMatch(zohoName);
    if (overlay) matchedOverlayNames.add(overlay.name);

    const zohoCity    = ((acct[ZOHO_CITY_FIELD] as string)    ?? "").trim() || null;
    const zohoCountry = ((acct[ZOHO_COUNTRY_FIELD] as string) ?? "").trim() || null;

    // Pull the related Hospital Contacts for this account. Primary (sorted
    // first) drives primary_recruiter_email + primary_contact_name; the
    // rest become cc_emails.
    const linked = contactsByHospitalId.get(acct.id) ?? [];
    const primaryContact = linked.find(c => (c.Contact_Type ?? "").toLowerCase() === "primary") ?? linked[0] ?? null;
    const zohoPrimary     = primaryContact?.Email ?? null;
    const zohoPrimaryName = primaryContact?.Name?.trim() || null;
    const zohoCcs = linked
      .filter(c => c.Email && c.Email !== zohoPrimary)
      .map(c => c.Email as string);

    out.push(buildMerged(zohoName, zohoCity, zohoCountry, zohoPrimary, zohoPrimaryName, zohoCcs, overlay));
  }

  // Overlay-only entries (no matching Zoho account).
  for (const overlay of HOSPITAL_OVERLAY) {
    if (matchedOverlayNames.has(overlay.name)) continue;
    out.push(buildMerged(overlay.name, overlay.city ?? null, overlay.country ?? null, null, null, [], overlay));
  }

  console.log(`[hospital-merge] ${out.length} merged rows ready to upsert`);

  let created = 0; let updated = 0; let errors = 0;
  for (const row of out) {
    const { data: existing } = await supabase
      .from("hospitals").select("id").ilike("name", row.name).maybeSingle();
    const payload = { ...row, updated_at: new Date().toISOString() };
    if (existing) {
      const { error } = await supabase.from("hospitals").update(payload).eq("id", existing.id);
      if (error) { console.error(`  ✗ ${row.name}:`, error.message); errors++; }
      else { updated++; }
    } else {
      const { error } = await supabase.from("hospitals").insert(payload);
      if (error) { console.error(`  ✗ ${row.name}:`, error.message); errors++; }
      else { created++; }
    }
  }

  console.log(`\n[hospital-merge] done · created ${created} · updated ${updated} · errors ${errors}`);
  const unmatched = HOSPITAL_OVERLAY.length - matchedOverlayNames.size;
  if (unmatched > 0) {
    console.log(`[hospital-merge] ${unmatched} overlay rows had no Zoho match — inserted standalone.`);
    console.log(`[hospital-merge]   (If you see lots of these, the Zoho Account_Name spellings probably don't match Saif's list — check normaliseHospitalName in data/hospital-overlay.ts)`);
  }
}

function buildMerged(
  name:    string,
  city:    string | null,
  country: string | null,
  primaryEmail:        string | null,
  primaryContactName:  string | null,
  zohoCcs: string[],
  overlay: HospitalOverlay | null,
): MergedHospital {
  // Zoho's contacts wins for primary + CC when present (it's the canonical
  // source). Overlay primary/CC are only used when Zoho has nothing.
  const finalPrimary = primaryEmail ?? overlay?.primary_recruiter_email ?? null;
  const finalCcs = zohoCcs.length > 0
    ? Array.from(new Set(zohoCcs))           // de-dup
    : (overlay?.cc_emails ?? []);
  return {
    name,
    city:                    city    ?? overlay?.city    ?? null,
    country:                 country ?? overlay?.country ?? null,
    primary_recruiter_email: finalPrimary,
    primary_contact_name:    primaryContactName,
    cc_emails:               finalCcs,
    active:                  overlay?.active ?? true,
    owner_email:             overlay?.owner_email ?? null,
    greeting:                overlay?.greeting ?? null,
    specialty_only:          overlay?.specialty_only ?? [],
    specialty_skip:          overlay?.specialty_skip ?? [],
    notes:                   overlay?.notes ?? null,
  };
}

main().catch(e => { console.error(e); process.exit(1); });
