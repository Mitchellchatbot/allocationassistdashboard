/**
 * backfill-hospital-websites — fill in `hospitals.website` from the website
 * links Zoho CRM already has on its Accounts (the partner-hospital records).
 *
 * `zoho-sync` fetches `Accounts[].Website` and caches it in zoho_cache row 2
 * (data->accounts[].Website), but nothing ever wrote it onto hospitals.website
 * (entered by hand only). This matches each hospital to its cached Account by
 * name and fills the blank website.
 *
 * SAFE BY DEFAULT — a plain call is a DRY RUN: it returns exactly what it WOULD
 * change and touches nothing. Send { "apply": true } to actually write.
 *   POST /functions/v1/backfill-hospital-websites
 *   body: { apply?: boolean, overwrite?: boolean }
 *     apply     — false (default) = dry run; true = perform the updates.
 *     overwrite — false (default) = only fill BLANK websites; true = also
 *                 replace a hospital's existing (differing) website.
 *
 * Matching: exact normalized name first, then a "core" name (strips
 * hospital/clinic/medical/centre/… stopwords) but ONLY when that core key maps
 * to a single Zoho website — an ambiguous core key is reported, never guessed.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// Same normalisation send-batch uses to join a hospital to its Zoho record.
function normName(s: string): string {
  return (s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
function coreName(s: string): string {
  return normName(s)
    .replace(/\b(hospital|hospitals|clinic|clinics|medical|centre|center|group|the|healthcare|health|university|llc|company)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
// Turn a Zoho Website value into a usable href. Zoho stores anything from
// "https://x.com" to "www.x.com" to "x.com" to junk. Require a dot and no
// spaces; prepend https:// when no scheme is present. Empty = unusable → skip.
function normWebsite(raw: string): string {
  let w = (raw || "").trim().replace(/^["'\s]+|["'\s]+$/g, "");
  if (!w || /\s/.test(w) || !/\./.test(w)) return "";
  if (!/^https?:\/\//i.test(w)) w = "https://" + w.replace(/^\/+/, "");
  return w;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  let body: Record<string, unknown> = {};
  try { body = req.method === "POST" ? await req.json() : {}; } catch { /* empty body → dry run */ }
  const apply = body.apply === true;
  const overwrite = body.overwrite === true;

  // 1. Cached Zoho Accounts (partner hospitals) with their Website.
  const { data: cacheRow, error: cErr } = await supabase
    .from("zoho_cache").select("accounts:data->accounts").eq("id", 2).maybeSingle();
  if (cErr) return json({ ok: false, error: `zoho_cache read failed: ${cErr.message}` }, 500);
  const accounts = (cacheRow?.accounts ?? []) as Array<Record<string, unknown>>;

  // name → website lookups (only accounts that actually carry a usable website).
  const byExact = new Map<string, { website: string; account: string }>();
  const byCore = new Map<string, { websites: Set<string>; account: string }>();
  let accountsWithWebsite = 0;
  for (const a of accounts) {
    const name = String(a.Account_Name ?? "").trim();
    const website = normWebsite(String(a.Website ?? ""));
    if (!name || !website) continue;
    accountsWithWebsite++;
    const ex = normName(name);
    if (ex && !byExact.has(ex)) byExact.set(ex, { website, account: name });
    const co = coreName(name);
    if (co) {
      const b = byCore.get(co) ?? { websites: new Set<string>(), account: name };
      b.websites.add(website);
      byCore.set(co, b);
    }
  }

  // 2. Hospitals on file.
  const { data: hospitals, error: hErr } = await supabase.from("hospitals").select("id, name, website");
  if (hErr) return json({ ok: false, error: `hospitals read failed: ${hErr.message}` }, 500);

  const toUpdate: Array<{ id: string; name: string; from: string | null; to: string; matchedAccount: string; via: string }> = [];
  const ambiguous: Array<{ name: string; matchedAccounts: number }> = [];
  const noMatch: string[] = [];
  let alreadyHave = 0;

  for (const h of hospitals ?? []) {
    const current = String(h.website ?? "").trim();
    if (current && !overwrite) { alreadyHave++; continue; }

    const ex = normName(String(h.name ?? ""));
    let matched: { website: string; account: string; via: string } | null = null;
    const exM = byExact.get(ex);
    if (exM) {
      matched = { website: exM.website, account: exM.account, via: "exact" };
    } else {
      const co = coreName(String(h.name ?? ""));
      const coM = co ? byCore.get(co) : undefined;
      if (coM) {
        if (coM.websites.size === 1) matched = { website: [...coM.websites][0], account: coM.account, via: "core" };
        else { ambiguous.push({ name: String(h.name ?? ""), matchedAccounts: coM.websites.size }); continue; }
      }
    }

    if (!matched) { noMatch.push(String(h.name ?? "")); continue; }
    // Idempotent: already exactly this website → nothing to do.
    if (current && current === matched.website) { alreadyHave++; continue; }
    toUpdate.push({ id: String(h.id), name: String(h.name ?? ""), from: current || null, to: matched.website, matchedAccount: matched.account, via: matched.via });
  }

  let updated = 0;
  const failures: Array<{ name: string; error: string }> = [];
  if (apply) {
    for (const u of toUpdate) {
      const { error } = await supabase.from("hospitals").update({ website: u.to }).eq("id", u.id);
      if (error) failures.push({ name: u.name, error: error.message });
      else updated++;
    }
  }

  return json({
    ok: true,
    dry_run: !apply,
    summary: {
      cached_accounts: accounts.length,
      accounts_with_website: accountsWithWebsite,
      hospitals_total: hospitals?.length ?? 0,
      already_have_website: alreadyHave,
      would_update: toUpdate.length,
      ambiguous: ambiguous.length,
      no_match: noMatch.length,
      ...(apply ? { updated, failed: failures.length } : {}),
    },
    to_update: toUpdate,
    ambiguous,
    no_match: noMatch,
    ...(apply && failures.length ? { failures } : {}),
  });
});
