/**
 * Auto-link wordpress_candidates → AA doctor IDs.
 *
 * The WP candidate mirror doesn't know about Zoho/AA's internal
 * doctor_id scheme (`lead:<zoho_id>` / `dob:<zoho_id>`). This function
 * fills in that linkage automatically wherever it can confidently
 * match a WP candidate to an existing Zoho record.
 *
 * Strategy (highest confidence first):
 *   1. Email match — exact, case-insensitive. Stops at first hit.
 *   2. Name match  — normalised "first last", but ONLY if the
 *      normalised name resolves uniquely (no two Zoho records share
 *      it). Anything ambiguous is skipped — HI can link it manually.
 *
 * Precedence: DoB > Lead (a person who's already a Doctor on Board is
 * further down the funnel than a raw Lead). Same precedence rule used
 * by the typeform / form webhooks.
 *
 * Only updates rows where doctor_id is currently NULL — manual links
 * are sacred, we never overwrite them.
 *
 * Returns { ok, scanned, matched_by_email, matched_by_name, skipped_ambiguous, durationMs }.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase    = createClient(supabaseUrl, serviceKey);

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ZohoLeadLike {
  id?: string;
  Full_Name?: string | null;
  First_Name?: string | null;
  Last_Name?: string | null;
  Email?: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return json({ ok: false, error: "Method not allowed" }, 405);

  const started = Date.now();

  // 1. Pull Zoho cache (id=1 holds leads, id=2 holds everything else
  //    including the Contacts/DoB list).
  const { data: cacheRows, error: cacheErr } = await supabase
    .from("zoho_cache")
    .select("id, data")
    .in("id", [1, 2]);
  if (cacheErr) return json({ ok: false, error: `zoho_cache fetch: ${cacheErr.message}` }, 500);

  const merged: Record<string, unknown> = {};
  for (const r of (cacheRows ?? []) as Array<{ id: number; data: Record<string, unknown> }>) {
    Object.assign(merged, r.data ?? {});
  }
  const leads        = (merged.leads        as ZohoLeadLike[]) ?? [];
  const doctorsOnBoard = (merged.doctorsOnBoard as ZohoLeadLike[])
                      ?? (merged.contacts as ZohoLeadLike[])
                      ?? (merged.doctors_on_board as ZohoLeadLike[])
                      ?? [];

  // 2. Build lookup indices — DoB written second so it wins on key
  //    collision (the precedence rule documented above).
  const emailIdx    = new Map<string, string>();          // normalised email → "lead:X" / "dob:X"
  const nameIdx     = new Map<string, string[]>();        // normalised name → list of matching doctor_ids
  const indexRecord = (r: ZohoLeadLike, prefix: "lead" | "dob") => {
    if (!r.id) return;
    const doctorId = `${prefix}:${r.id}`;
    const email = normaliseEmail(r.Email);
    if (email) emailIdx.set(email, doctorId);
    const name = normaliseName(r.Full_Name ?? `${r.First_Name ?? ""} ${r.Last_Name ?? ""}`);
    if (name) {
      const existing = nameIdx.get(name);
      if (existing) {
        if (!existing.includes(doctorId)) existing.push(doctorId);
      } else {
        nameIdx.set(name, [doctorId]);
      }
    }
  };
  for (const r of leads)            indexRecord(r, "lead");
  for (const r of doctorsOnBoard)   indexRecord(r, "dob");

  // 3. Page through unlinked WP candidates.
  const PAGE = 1000;
  let scanned = 0;
  let matchedByEmail = 0;
  let matchedByName  = 0;
  let skippedAmbiguous = 0;
  const updates: Array<{ id: number; doctor_id: string }> = [];

  for (let from = 0; from < 50_000; from += PAGE) {
    const { data, error } = await supabase
      .from("wordpress_candidates")
      .select("id, full_name, title, email")
      .is("doctor_id", null)
      .range(from, from + PAGE - 1);
    if (error) return json({ ok: false, error: `candidates fetch: ${error.message}` }, 500);
    const batch = (data ?? []) as Array<{ id: number; full_name: string | null; title: string | null; email: string | null }>;
    if (batch.length === 0) break;
    scanned += batch.length;

    for (const c of batch) {
      // Try email first.
      const cEmail = normaliseEmail(c.email);
      const cName  = normaliseName(c.full_name ?? c.title ?? "");
      if (cEmail && emailIdx.has(cEmail)) {
        updates.push({ id: c.id, doctor_id: emailIdx.get(cEmail)! });
        matchedByEmail++;
        continue;
      }
      if (cName) {
        const hits = nameIdx.get(cName);
        if (hits && hits.length === 1) {
          updates.push({ id: c.id, doctor_id: hits[0] });
          matchedByName++;
        } else if (hits && hits.length > 1) {
          skippedAmbiguous++;
        }
      }
    }
    if (batch.length < PAGE) break;
  }

  // 4. Bulk-apply updates via the wordpress_candidates_bulk_link RPC.
  //    PostgREST upsert can't do partial-row updates (NOT NULL columns
  //    on wp_slug/wp_link trip the INSERT validator), so we route the
  //    whole batch through one SQL UPDATE. The RPC also has the
  //    "doctor_id IS NULL" guard built in, so manual links never get
  //    overwritten.
  let updated = 0;
  if (updates.length > 0) {
    const { data: affected, error: rpcErr } = await supabase.rpc("wordpress_candidates_bulk_link", {
      updates: updates as unknown as Record<string, unknown>[],
    });
    if (rpcErr) {
      console.error("[wordpress-candidates-link] rpc failed", rpcErr);
      return json({ ok: false, error: `RPC: ${rpcErr.message}`, scanned, proposed: updates.length }, 500);
    }
    updated = typeof affected === "number" ? affected : 0;
  }

  return json({
    ok:                true,
    scanned,
    proposed:          updates.length,
    updated,
    matched_by_email:  matchedByEmail,
    matched_by_name:   matchedByName,
    skipped_ambiguous: skippedAmbiguous,
    zoho_leads_indexed: emailIdx.size,
    zoho_records_total: leads.length + doctorsOnBoard.length,
    durationMs:        Date.now() - started,
  }, 200);
});

function normaliseEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const e = String(raw).trim().toLowerCase();
  return e.includes("@") ? e : null;
}

/** Lowercase, strip "Dr.", strip honorifics, collapse whitespace, drop
 *  accents/punctuation. Two records collide here if and only if their
 *  human-readable names look the same. */
function normaliseName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = String(raw).normalize("NFD").replace(/[̀-ͯ]/g, "");   // strip diacritics
  s = s.toLowerCase()
       .replace(/^(dr|doctor|prof|mr|mrs|ms|miss)\.?\s+/i, "")             // strip honorifics
       .replace(/[^\w\s]/g, " ")                                            // strip punctuation
       .replace(/\s+/g, " ")
       .trim();
  // Demand at least two name tokens — a single token like "Ahmed" matches
  // too many records to be useful.
  return s.split(" ").length >= 2 ? s : null;
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
