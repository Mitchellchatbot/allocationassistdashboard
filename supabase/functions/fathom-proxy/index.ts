/**
 * Fathom Proxy — Supabase Edge Function
 *
 * Authenticated reads + on-demand sync from the Fathom REST API.
 * Frontend calls this so the API key never leaves the server.
 *
 * Routes (query params):
 *   ?action=sync&since=YYYY-MM-DD     paginated backfill of every meeting
 *                                     since the given date — upserts into
 *                                     fathom_calls. Idempotent.
 *   ?action=resync&id=<fathom_id>     force-refresh one meeting + transcript.
 *   ?action=transcript&id=<fathom_id> ensure transcript is stored, return row.
 *
 * Required secrets:
 *   FATHOM_API_KEY
 *   SUPABASE_URL              (auto)
 *   SUPABASE_SERVICE_ROLE_KEY (auto)
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FATHOM_API_KEY = Deno.env.get('FATHOM_API_KEY') ?? '';
const FATHOM_BASE    = 'https://api.fathom.ai/external/v1';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ─── Fathom API helpers ──────────────────────────────────────────────────────

async function fathomGet(path: string, params: Record<string, string> = {}) {
  const url = new URL(`${FATHOM_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const r = await fetch(url.toString(), {
    headers: { 'X-Api-Key': FATHOM_API_KEY, 'Accept': 'application/json' },
  });

  const text = await r.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }

  if (!r.ok) {
    throw new Error(`Fathom ${r.status} on ${path}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return body as Record<string, unknown>;
}

// ─── Row mapping (mirrors fathom-webhook) ───────────────────────────────────

interface FathomMeeting {
  id?: string; recording_id?: string;
  share_url?: string; url?: string;
  title?: string;
  scheduled_start?: string; scheduled_start_time?: string;
  recording_start?: string; recording_start_time?: string;
  recording_end?: string;   recording_end_time?: string;
  duration_seconds?: number;
  host?: { email?: string; name?: string };
  invitees?: Array<{ name?: string; email?: string; domain?: string }>;
  external_domains?: string[];
  summary?: string; ai_summary?: string;
  action_items?: Array<unknown>;
  transcript?: string | { segments?: unknown[]; plaintext?: string };
}

function pick<T>(...vals: (T | undefined | null)[]): T | null {
  for (const v of vals) if (v !== undefined && v !== null && v !== '') return v as T;
  return null;
}

function meetingToRow(m: FathomMeeting) {
  const fathomId = pick(m.id, m.recording_id);
  if (!fathomId) return null;

  let transcriptPlain: string | null = null;
  let transcriptSegs: unknown        = null;
  if (typeof m.transcript === 'string') {
    transcriptPlain = m.transcript;
  } else if (m.transcript && typeof m.transcript === 'object') {
    transcriptPlain = (m.transcript as { plaintext?: string }).plaintext ?? null;
    transcriptSegs  = (m.transcript as { segments?: unknown[] }).segments ?? null;
  }

  return {
    fathom_id:            fathomId,
    share_url:            pick(m.share_url, m.url),
    title:                m.title ?? null,
    scheduled_start:      pick(m.scheduled_start, m.scheduled_start_time),
    recording_start:      pick(m.recording_start, m.recording_start_time),
    recording_end:        pick(m.recording_end,   m.recording_end_time),
    duration_seconds:     m.duration_seconds ?? null,
    host_email:           m.host?.email ?? null,
    host_name:            m.host?.name  ?? null,
    invitees:             m.invitees ?? null,
    external_domains:     m.external_domains ?? null,
    summary:              pick(m.summary, m.ai_summary),
    action_items:         m.action_items ?? null,
    transcript_plaintext: transcriptPlain,
    transcript_segments:  transcriptSegs,
    raw:                  m,
  };
}

async function ensureTranscript(row: ReturnType<typeof meetingToRow>) {
  if (!row || row.transcript_plaintext) return row;
  try {
    const t = await fathomGet(`/meetings/${row.fathom_id}/transcript`);
    if (typeof t === 'string') row.transcript_plaintext = t as unknown as string;
    else if (t && typeof t === 'object') {
      row.transcript_plaintext = (t as { plaintext?: string }).plaintext ?? null;
      row.transcript_segments  = (t as { segments?: unknown[] }).segments ?? row.transcript_segments;
    }
  } catch (e) {
    console.warn('[fathom-proxy] transcript fetch failed', row.fathom_id, e);
  }
  return row;
}

// ─── Actions ─────────────────────────────────────────────────────────────────

async function actionSync(since: string | null) {
  const rows: Array<ReturnType<typeof meetingToRow>> = [];
  let cursor: string | null = null;
  let pages = 0;

  // Fathom paginates with `cursor` on most accounts, `page` on others.
  // We try cursor-style first; if the response has neither, we stop after one page.
  while (true) {
    const params: Record<string, string> = { limit: '50' };
    if (since)  params.created_after = since;
    if (cursor) params.cursor        = cursor;

    const data = await fathomGet('/meetings', params) as {
      items?: FathomMeeting[];
      data?:  FathomMeeting[];
      meetings?: FathomMeeting[];
      next_cursor?: string;
      has_more?: boolean;
    };

    const items = data.items ?? data.data ?? data.meetings ?? [];
    for (const m of items) {
      const row = meetingToRow(m);
      if (row) rows.push(row);
    }

    cursor = data.next_cursor ?? null;
    pages += 1;
    if (!cursor || !data.has_more || pages > 100) break;  // 100×50 = 5000 cap, safety
  }

  if (rows.length === 0) return { synced: 0, pages };

  // Chunked upsert (Postgres has param limits)
  const CHUNK = 100;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from('fathom_calls')
      .upsert(slice, { onConflict: 'fathom_id' });
    if (error) throw new Error(`upsert failed: ${error.message}`);
  }

  return { synced: rows.length, pages };
}

async function actionResync(fathomId: string) {
  const m   = await fathomGet(`/meetings/${fathomId}`) as FathomMeeting;
  const row = await ensureTranscript(meetingToRow(m));
  if (!row) return { ok: false, error: 'no row' };
  const { error } = await supabase.from('fathom_calls').upsert(row, { onConflict: 'fathom_id' });
  if (error) throw new Error(error.message);
  return { ok: true, fathom_id: row.fathom_id };
}

async function actionTranscript(fathomId: string) {
  // Cheap path: if we already have it stored, return it.
  const { data: existing } = await supabase
    .from('fathom_calls')
    .select('*')
    .eq('fathom_id', fathomId)
    .maybeSingle();

  if (existing?.transcript_plaintext) return existing;

  // Otherwise fetch + store.
  const m   = await fathomGet(`/meetings/${fathomId}`) as FathomMeeting;
  const row = await ensureTranscript(meetingToRow(m));
  if (!row) return null;
  await supabase.from('fathom_calls').upsert(row, { onConflict: 'fathom_id' });
  const { data } = await supabase.from('fathom_calls').select('*').eq('fathom_id', fathomId).maybeSingle();
  return data;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  if (!FATHOM_API_KEY) return json({ error: 'FATHOM_API_KEY not configured' }, 500);

  // Require an authenticated dashboard user. Supabase enforces JWT
  // verification by default for non-public functions, but we double-check.
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.toLowerCase().startsWith('bearer ')) {
    return json({ error: 'Missing Authorization' }, 401);
  }

  try {
    const url    = new URL(req.url);
    const action = url.searchParams.get('action');

    switch (action) {
      case 'sync': {
        const since = url.searchParams.get('since');
        return json(await actionSync(since));
      }
      case 'resync': {
        const id = url.searchParams.get('id');
        if (!id) return json({ error: 'id required' }, 400);
        return json(await actionResync(id));
      }
      case 'transcript': {
        const id = url.searchParams.get('id');
        if (!id) return json({ error: 'id required' }, 400);
        return json(await actionTranscript(id));
      }
      default:
        return json({
          error: 'Unknown action',
          actions: ['sync', 'resync', 'transcript'],
        }, 400);
    }
  } catch (e) {
    console.error('[fathom-proxy]', e);
    return json({ error: (e as Error).message }, 500);
  }
});
