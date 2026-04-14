/**
 * embed-leads — Supabase Edge Function
 *
 * Reads leads from zoho_cache, converts each to a rich text blob,
 * generates OpenAI embeddings in batches of 50, and upserts them into
 * the lead_embeddings table so match_leads() can do vector search.
 *
 * Supports incremental embedding: skips leads already indexed.
 * Supports chunked processing via optional `offset` + `limit` body params.
 *
 * Secrets required:
 *   OPENAI_API_KEY
 *   SUPABASE_URL            (injected automatically)
 *   SUPABASE_SERVICE_ROLE_KEY (injected automatically)
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const OPENAI_KEY  = Deno.env.get('OPENAI_API_KEY')!;
const EMBED_MODEL = 'text-embedding-3-small'; // 1536-dim, fast, cheap
const BATCH       = 50;                        // smaller batch = safer on CPU time

// ── Helpers ───────────────────────────────────────────────────────────────────

function leadToText(l: Record<string, unknown>): string {
  const name =
    (l.Full_Name as string) ||
    [(l.First_Name ?? ''), (l.Last_Name ?? '')].filter(Boolean).join(' ') ||
    'Unknown';

  const licenses = [
    l.Has_DOH && l.Has_DOH !== 'No' ? `DOH:${l.Has_DOH}` : null,
    l.Has_DHA && l.Has_DHA !== 'No' ? `DHA:${l.Has_DHA}` : null,
    l.Has_MOH && l.Has_MOH !== 'No' ? `MOH:${l.Has_MOH}` : null,
  ].filter(Boolean).join(' ') || 'None';

  return [
    `Name: ${name}`,
    `Specialty: ${l.Specialty || l.Specialty_New || 'Unknown'}`,
    `Status: ${l.Lead_Status || 'Unknown'}`,
    `Source: ${l.Lead_Source || 'Unknown'}`,
    `Recruiter: ${(l.Owner as Record<string, string>)?.name || 'Unknown'}`,
    `Country: ${l.Country_of_Specialty_training || 'Unknown'}`,
    `Created: ${((l.Created_Time as string) ?? '').slice(0, 10) || 'Unknown'}`,
    `Licenses: ${licenses}`,
    `Classification: ${l.Prime_Classification || 'Unknown'}`,
    `Age: ${l.Age || 'Unknown'}`,
  ].join('. ');
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embeddings error ${res.status}: ${err}`);
  }

  const json = await res.json();
  return (json.data as Array<{ embedding: number[] }>).map(d => d.embedding);
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS });
  }

  try {
    // Optional body params for chunked processing
    let offset = 0;
    let limit  = 500; // embed at most 500 leads per call
    let onlyNew = true; // skip already-indexed leads by default

    try {
      const body = await req.json();
      if (typeof body.offset  === 'number') offset  = body.offset;
      if (typeof body.limit   === 'number') limit   = body.limit;
      if (typeof body.onlyNew === 'boolean') onlyNew = body.onlyNew;
    } catch { /* no body — use defaults */ }

    // Read leads from zoho_cache
    const { data: cache, error: cacheErr } = await supabase
      .from('zoho_cache')
      .select('data')
      .eq('id', 1)
      .single();

    if (cacheErr || !cache?.data?.leads) {
      return new Response(
        JSON.stringify({ error: 'No leads in zoho_cache. Run zoho-sync first.' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    let leads = (cache.data.leads as Record<string, unknown>[]).slice(offset, offset + limit);
    const totalInWindow = leads.length;

    // Skip already-indexed leads
    if (onlyNew && leads.length > 0) {
      const ids = leads.map(l => l.id as string).filter(Boolean);

      // Fetch existing IDs in this window
      const { data: existing } = await supabase
        .from('lead_embeddings')
        .select('id')
        .in('id', ids);

      if (existing && existing.length > 0) {
        const existingSet = new Set(existing.map((r: { id: string }) => r.id));
        leads = leads.filter(l => !existingSet.has(l.id as string));
      }
    }

    let embedded = 0;

    // Process in batches
    for (let i = 0; i < leads.length; i += BATCH) {
      const batch = leads.slice(i, i + BATCH);
      const texts = batch.map(leadToText);
      const vecs  = await embedBatch(texts);

      const rows = batch.map((lead, j) => {
        const owner = (lead.Owner as Record<string, string>) ?? {};
        const name  =
          (lead.Full_Name as string) ||
          [(lead.First_Name ?? ''), (lead.Last_Name ?? '')].filter(Boolean).join(' ') ||
          'Unknown';

        return {
          id:        (lead.id as string) ?? `unknown-${offset + i + j}`,
          content:   texts[j],
          embedding: vecs[j],
          metadata: {
            name,
            status:    lead.Lead_Status    ?? null,
            source:    lead.Lead_Source    ?? null,
            recruiter: owner.name          ?? null,
            specialty: (lead.Specialty || lead.Specialty_New) ?? null,
            created:   ((lead.Created_Time as string) ?? '').slice(0, 10) || null,
          },
          updated_at: new Date().toISOString(),
        };
      });

      const { error: upsertErr } = await supabase
        .from('lead_embeddings')
        .upsert(rows, { onConflict: 'id' });

      if (upsertErr) throw new Error(`Upsert failed: ${upsertErr.message}`);
      embedded += batch.length;
    }

    const totalLeads = (cache.data.leads as unknown[]).length;

    return new Response(
      JSON.stringify({
        ok:          true,
        embedded,
        skipped:     totalInWindow - embedded,
        offset,
        limit,
        totalLeads,
        done:        offset + limit >= totalLeads,
      }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[embed-leads]', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }
});
