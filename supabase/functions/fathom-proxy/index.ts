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

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fathomGet(
  path: string,
  params: Record<string, string> = {},
  retriesLeft = 3,
): Promise<unknown> {
  const url = new URL(`${FATHOM_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const r = await fetch(url.toString(), {
    headers: { 'X-Api-Key': FATHOM_API_KEY, 'Accept': 'application/json' },
  });

  // Handle rate-limit with up to 3 retries honouring Retry-After.
  // Exponential fallback if header missing: 5s → 15s → 45s.
  if (r.status === 429 && retriesLeft > 0) {
    const attempt = 3 - retriesLeft;
    const ra = r.headers.get('retry-after');
    const waitSec = ra
      ? Math.min(90, parseInt(ra, 10) || 5)
      : Math.min(45, 5 * Math.pow(3, attempt));
    console.warn(`[fathom-proxy] 429 — sleeping ${waitSec}s then retry ${attempt + 1}/3 on ${path}`);
    await sleep(waitSec * 1000);
    return fathomGet(path, params, retriesLeft - 1);
  }

  const text = await r.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }

  if (!r.ok) {
    if (r.status === 429) {
      const ra = r.headers.get('retry-after');
      throw new Error(`Fathom rate limit (429) — wait ${ra ?? '60'}s before next sync`);
    }
    const snippet = typeof body === 'string'
      ? body.slice(0, 200)
      : JSON.stringify(body).slice(0, 200);
    throw new Error(`Fathom ${r.status} on ${path}: ${snippet}`);
  }
  return body;
}

// ─── Row mapping (mirrors fathom-webhook) ───────────────────────────────────

// Fathom's external API has shipped two shapes (flat and nested) plus
// per-account variations. We accept all reasonable spellings.
type FathomMeeting = Record<string, unknown>;

function pick<T>(...vals: (T | undefined | null)[]): T | null {
  for (const v of vals) if (v !== undefined && v !== null && v !== '') return v as T;
  return null;
}

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
}

// Strings only — does NOT coerce numbers (used for non-id fields).
function asStr(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null;
}

// Accepts strings AND numbers (Fathom returns numeric ids like 657945804).
// Coerces to string to keep fathom_id stable across syncs.
function asId(v: unknown): string | null {
  if (typeof v === 'string' && v) return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

// Accepts numbers AND numeric strings (Fathom sometimes serialises floats as strings).
function asNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

// Recursively walk an object looking for any numeric key whose name contains
// the given substring. Returns the first match (depth-first, breadth-second).
// Used as a fallback when known field names don't match — Fathom has shipped
// duration under several different names across API versions / accounts.
function findNumericByKey(obj: unknown, needle: string, depth = 0): number | null {
  if (!obj || depth > 4) return null;
  if (typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  for (const k of Object.keys(o)) {
    if (k.toLowerCase().includes(needle)) {
      const n = asNum(o[k]);
      if (n !== null) return n;
    }
  }
  for (const v of Object.values(o)) {
    if (v && typeof v === 'object') {
      const found = findNumericByKey(v, needle, depth + 1);
      if (found !== null) return found;
    }
  }
  return null;
}

// Same idea but pulls the first matching string. Used for finding fields like
// "domain" or "transcript" under unexpected paths.
function findStringByKey(obj: unknown, needle: string, depth = 0): string | null {
  if (!obj || depth > 4) return null;
  if (typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  for (const k of Object.keys(o)) {
    if (k.toLowerCase().includes(needle)) {
      const s = asStr(o[k]);
      if (s !== null) return s;
    }
  }
  for (const v of Object.values(o)) {
    if (v && typeof v === 'object') {
      const found = findStringByKey(v, needle, depth + 1);
      if (found !== null) return found;
    }
  }
  return null;
}

function meetingToRow(m: FathomMeeting) {
  // Sub-objects in the new shape
  const recording  = asObj(m.recording)   ?? {};
  const meeting    = asObj(m.meeting)     ?? {};
  const recordedBy = asObj(m.recorded_by) ?? asObj(m.fathom_user) ?? asObj(m.host) ?? {};

  // ── ID ──
  // Use asId so numeric ids (Fathom returns 657945804 as a number) are coerced
  // to string. Falling back to share_url would mint a different id than the
  // numeric one and create duplicate rows on re-sync — so we extract the
  // numeric id from the call URL instead, which is the same value Fathom uses
  // internally and matches what the OLD mapper produced.
  const idFromUrl = ((): string | null => {
    const u = asStr(m.url) ?? asStr(recording.url) ?? asStr(m.share_url) ?? asStr(recording.share_url);
    if (!u) return null;
    const match = u.match(/\/calls\/(\d+)/) ?? u.match(/\/share\/([A-Za-z0-9_-]+)/);
    return match ? match[1] : null;
  })();

  const fathomId = pick(
    asId(m.id),
    asId(m.recording_id),
    asId(recording.id),
    asId(recording.recording_id),
    idFromUrl,
  );
  if (!fathomId) return null;

  // ── URLs ──
  const shareUrl = pick(
    asStr(m.share_url),
    asStr(m.url),
    asStr(recording.share_url),
    asStr(recording.recording_share_url),
    asStr(recording.url),
    asStr(recording.recording_url),
  );

  // ── Title ──
  const title = pick(
    asStr(m.title),
    asStr(m.meeting_title),
    asStr(meeting.title),
  );

  // ── Times (try flat, then nested) ──
  const scheduledStart = pick(
    asStr(m.scheduled_start),
    asStr(m.scheduled_start_time),
    asStr(meeting.scheduled_start_time),
    asStr(meeting.scheduled_start),
  );
  const recordingStart = pick(
    asStr(m.recording_start),
    asStr(m.recording_start_time),
    asStr(recording.recording_start_time),
    asStr(recording.start_time),
    asStr(recording.started_at),
    scheduledStart,
  );
  const recordingEnd = pick(
    asStr(m.recording_end),
    asStr(m.recording_end_time),
    asStr(recording.recording_end_time),
    asStr(recording.end_time),
    asStr(recording.ended_at),
  );

  // ── Duration (Fathom returns minutes; we store seconds) ──
  // Try known field names first, then fall back to "any numeric field with
  // 'duration' in the name" — Fathom has shipped duration under at least
  // 4 different keys across API versions, and accounts sometimes only get
  // one of them. The recursive scan also catches it under nested objects
  // we didn't pre-flatten.
  const durMin = pick(
    asNum(m.recording_duration_in_minutes),
    asNum(recording.recording_duration_in_minutes),
    asNum(recording.duration_in_minutes),
    asNum(recording.duration_minutes),
    asNum(meeting.recording_duration_in_minutes),
    asNum(meeting.duration_in_minutes),
  );
  const durSecExplicit = pick(
    asNum(m.duration_seconds),
    asNum(recording.duration_seconds),
    asNum(meeting.duration_seconds),
  );
  // Computed-from-start/end fallback if we have both timestamps.
  const durSecComputed = ((): number | null => {
    if (!recordingStart) return null;
    const re = pick(asStr(m.recording_end), asStr(m.recording_end_time),
                    asStr(recording.recording_end_time), asStr(recording.end_time),
                    asStr(recording.ended_at));
    if (!re) return null;
    const ms = new Date(re).getTime() - new Date(recordingStart).getTime();
    return ms > 0 ? Math.round(ms / 1000) : null;
  })();
  // Last-resort: scan any field with "duration" in the name.
  const durFallback = findNumericByKey(m, 'duration');
  let durSec = pick(
    durSecExplicit,
    durMin !== null ? Math.round(durMin * 60) : null,
    durSecComputed,
  );
  // If the fallback came in as minutes (< 1000) and we have nothing else,
  // assume minutes. Otherwise treat it as seconds. This is heuristic but
  // safer than guessing wrong by an order of magnitude.
  if (durSec === null && durFallback !== null) {
    durSec = durFallback < 1000 ? Math.round(durFallback * 60) : Math.round(durFallback);
  }

  // ── Host ──
  const hostEmail = pick(
    asStr(recordedBy.email),
    asStr(m.fathom_user_email),
    asStr(m.host_email),
  );
  const hostName = pick(
    asStr(recordedBy.name),
    asStr(m.fathom_user_name),
    asStr(m.host_name),
  );

  // ── Invitees ──
  const invitees = (Array.isArray(m.invitees)            ? m.invitees
                  : Array.isArray(m.calendar_invitees)   ? m.calendar_invitees
                  : Array.isArray(meeting.invitees)      ? meeting.invitees
                  : Array.isArray(meeting.calendar_invitees) ? meeting.calendar_invitees
                  : null) as unknown[] | null;

  // External domains can come pre-computed as a string[] OR have to be derived
  // from the invitee list. If neither, derive by extracting domains from any
  // email-shaped strings in the payload that aren't on the host's domain.
  let externalDomains: string[] | null = (Array.isArray(m.external_domains)       ? m.external_domains
                                        : Array.isArray(meeting.external_domains) ? meeting.external_domains
                                        : null) as string[] | null;
  if (!externalDomains || externalDomains.length === 0) {
    const hostDomain = hostEmail ? hostEmail.split('@')[1]?.toLowerCase() : null;
    const set = new Set<string>();
    const scanForEmails = (v: unknown, depth = 0): void => {
      if (depth > 4 || !v) return;
      if (typeof v === 'string') {
        const m = v.match(/[a-zA-Z0-9._%+\-]+@([a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g);
        if (m) for (const email of m) {
          const dom = email.split('@')[1]?.toLowerCase();
          if (dom && dom !== hostDomain) set.add(dom);
        }
      } else if (Array.isArray(v)) {
        for (const item of v) scanForEmails(item, depth + 1);
      } else if (typeof v === 'object') {
        for (const val of Object.values(v as Record<string, unknown>)) scanForEmails(val, depth + 1);
      }
    };
    scanForEmails(invitees);
    if (set.size > 0) externalDomains = Array.from(set);
  }

  // ── Summary ──
  const summary = pick(
    asStr(m.default_summary),
    asStr(m.summary),
    asStr(m.ai_summary),
    typeof m.ai_summary === 'object'
      ? asStr((asObj(m.ai_summary) ?? {}).markdown_formatted) ?? asStr((asObj(m.ai_summary) ?? {}).text)
      : null,
  );

  // ── Action items ──
  const actionItems = (Array.isArray(m.default_action_items) ? m.default_action_items
                     : Array.isArray(m.action_items)         ? m.action_items
                     : null) as unknown[] | null;

  // ── Transcript ──
  let transcriptPlain: string | null = null;
  let transcriptSegs: unknown        = null;
  const t = m.transcript;
  if (typeof t === 'string') {
    transcriptPlain = t;
  } else if (t && typeof t === 'object') {
    transcriptPlain = asStr((asObj(t) ?? {}).plaintext);
    const segs      = (asObj(t) ?? {}).segments;
    transcriptSegs  = Array.isArray(segs) ? segs : null;
  }
  transcriptPlain = transcriptPlain ?? asStr(m.transcript_plaintext);

  return {
    fathom_id:            fathomId,
    share_url:            shareUrl,
    title:                title,
    scheduled_start:      scheduledStart,
    recording_start:      recordingStart,
    recording_end:        recordingEnd,
    duration_seconds:     durSec,
    host_email:           hostEmail,
    host_name:            hostName,
    invitees:             invitees,
    external_domains:     externalDomains,
    summary:              summary,
    action_items:         actionItems,
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

/** Inner sync loop. Pages through Fathom and upserts in chunks. The bigger
 *  page size (100 vs old 50) halves request count; the 100ms throttle (vs
 *  old 400ms) is still well under Fathom's 60 RPM cap because each page
 *  takes ~1s anyway. Stops when cursor is null OR the time budget is hit. */
async function syncLoop(since: string | null, timeBudgetMs: number) {
  const startedAt = Date.now();
  const rows: Array<ReturnType<typeof meetingToRow>> = [];
  let cursor: string | null = null;
  let pages = 0;
  let raw   = 0;
  let timedOut = false;

  while (true) {
    if (Date.now() - startedAt > timeBudgetMs) {
      console.warn(`[fathom-proxy] time budget hit at page ${pages} — stopping early. Next sync resumes from cursor.`);
      timedOut = true;
      break;
    }

    const params: Record<string, string> = { limit: '100' };
    if (since)  params.created_after = since;
    if (cursor) params.cursor        = cursor;

    const data = await fathomGet('/meetings', params);

    let items: FathomMeeting[] = [];
    let nextCursor: string | null = null;
    if (Array.isArray(data)) {
      items = data as FathomMeeting[];
    } else if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>;
      items = (d.items ?? d.data ?? d.meetings ?? d.recordings ?? d.results ?? []) as FathomMeeting[];
      nextCursor = (d.next_cursor as string | undefined)
                ?? (d.cursor      as string | undefined)
                ?? (d.next        as string | undefined)
                ?? null;
    }

    raw += items.length;
    const pageRows: Array<ReturnType<typeof meetingToRow>> = [];
    for (const m of items) {
      const row = meetingToRow(m);
      if (row) { rows.push(row); pageRows.push(row); }
    }

    // Upsert each page as it arrives instead of waiting for the entire walk
    // to finish — gives the user partial data immediately if the loop is
    // interrupted, and keeps memory bounded for very large backfills.
    if (pageRows.length > 0) {
      const { error } = await supabase
        .from('fathom_calls')
        .upsert(pageRows, { onConflict: 'fathom_id' });
      if (error) console.error('[fathom-proxy] page upsert failed:', error.message);
    }

    cursor = nextCursor;
    pages += 1;
    if (!cursor || pages > 200) break;
    // 1.1s throttle keeps us safely under Fathom's 60 RPM cap. Combined
    // with the per-page fetch latency (~1-2s), that's ~25-35 RPM in
    // practice — comfortable headroom against bursty rate-limit windows.
    await sleep(1100);
  }

  return { synced: rows.length, pages, raw, timedOut };
}

async function actionSync(since: string | null, opts: { background: boolean }) {
  // Foreground (incremental) sync — used when `since` is supplied. Bounded,
  // returns synchronously with full result. 90s budget leaves headroom under
  // the 150s Edge Function idle-timeout.
  if (!opts.background) {
    return syncLoop(since, 90_000);
  }

  // Background (full backfill) — runs detached so the request returns in
  // <100ms. EdgeRuntime.waitUntil keeps the worker alive for up to 400s
  // after the response. Anything that wasn't synced in that window will be
  // picked up by the next sync tick (cursor-resumable on the Fathom side).
  const promise = syncLoop(since, 380_000)
    .then(r => console.log('[fathom-proxy] background sync done:', r))
    .catch(e => console.error('[fathom-proxy] background sync failed:', e));
  // @ts-ignore — EdgeRuntime is a Supabase Edge global, not in @types.
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(promise);
  }
  return { synced: 0, pages: 0, raw: 0, started: true, background: true };
}

/** Diagnostic: returns the first page from Fathom unmodified so we can see
 *  the actual field shape (used when the mapper still produces empty rows). */
async function actionDebug() {
  const data = await fathomGet('/meetings', { limit: '1' });
  return { raw_response: data };
}

/** Re-runs the mapper on every existing row's stored `raw` payload. Useful
 *  after a mapper bugfix — fixes already-stored rows without re-hitting Fathom. */
async function actionRebuild() {
  const { data, error } = await supabase
    .from('fathom_calls')
    .select('id, fathom_id, raw');
  if (error) throw new Error(error.message);

  const rows: Array<{ old_id: string; new: ReturnType<typeof meetingToRow> }> = [];
  for (const r of data ?? []) {
    const row = meetingToRow((r.raw ?? {}) as FathomMeeting);
    if (row) rows.push({ old_id: r.fathom_id, new: row });
  }

  // Dedupe: if rebuild produces a different fathom_id than the row's current one,
  // the old row will be deleted; the new mapped row is upserted.
  const idsToDelete = rows.filter(r => r.new!.fathom_id !== r.old_id).map(r => r.old_id);
  if (idsToDelete.length > 0) {
    const { error: delErr } = await supabase
      .from('fathom_calls')
      .delete()
      .in('fathom_id', idsToDelete);
    if (delErr) throw new Error(`delete failed: ${delErr.message}`);
  }

  const upserts = rows.map(r => r.new!);
  const CHUNK = 100;
  for (let i = 0; i < upserts.length; i += CHUNK) {
    const slice = upserts.slice(i, i + CHUNK);
    const { error: upErr } = await supabase
      .from('fathom_calls')
      .upsert(slice, { onConflict: 'fathom_id' });
    if (upErr) throw new Error(`upsert failed: ${upErr.message}`);
  }

  return { rebuilt: rows.length, deleted_old_ids: idsToDelete.length };
}

/** Walks rows that are missing duration_seconds and fetches `/meetings/{id}`
 *  for each to populate it from the detail endpoint. Throttled to ~1 call/sec
 *  to stay safely under Fathom's 60 RPM cap. Designed to run detached via
 *  EdgeRuntime.waitUntil so it can finish a 500-row enrichment in the
 *  background (~9 minutes). Idempotent — safe to call repeatedly. */
async function syncEnrichLoop(timeBudgetMs: number, limit: number) {
  const startedAt = Date.now();
  const { data: rows, error } = await supabase
    .from('fathom_calls')
    .select('fathom_id')
    .is('duration_seconds', null)
    .limit(limit);
  if (error) throw new Error(`enrich select failed: ${error.message}`);
  if (!rows || rows.length === 0) return { enriched: 0, scanned: 0 };

  let enriched = 0;
  let scanned  = 0;
  for (const r of rows) {
    if (Date.now() - startedAt > timeBudgetMs) {
      console.warn(`[fathom-proxy] enrich time budget hit after ${enriched}/${scanned} rows.`);
      break;
    }
    scanned++;
    try {
      const m = await fathomGet(`/meetings/${r.fathom_id}`) as FathomMeeting;
      const row = meetingToRow(m);
      if (row && row.duration_seconds !== null) {
        const { error: upErr } = await supabase
          .from('fathom_calls')
          .upsert(row, { onConflict: 'fathom_id' });
        if (upErr) console.error(`[fathom-proxy] enrich upsert failed for ${r.fathom_id}:`, upErr.message);
        else enriched++;
      }
    } catch (e) {
      console.warn(`[fathom-proxy] enrich fetch failed for ${r.fathom_id}:`, (e as Error).message);
    }
    await sleep(1100);
  }
  return { enriched, scanned, remaining: rows.length === limit };
}

async function actionEnrich(opts: { background: boolean; limit: number }) {
  if (!opts.background) {
    return syncEnrichLoop(90_000, opts.limit);
  }
  const promise = syncEnrichLoop(380_000, opts.limit)
    .then(r => console.log('[fathom-proxy] background enrich done:', r))
    .catch(e => console.error('[fathom-proxy] background enrich failed:', e));
  // @ts-ignore — EdgeRuntime is a Supabase Edge global.
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(promise);
  }
  return { enriched: 0, scanned: 0, started: true, background: true };
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
        // Full backfills (no `since`) run detached so the request can't hit
        // the 150s idle timeout. Incremental syncs (with `since`) stay
        // synchronous because they're bounded and finish quickly.
        const background = !since;
        return json(await actionSync(since, { background }));
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
      case 'debug': {
        return json(await actionDebug());
      }
      case 'rebuild': {
        return json(await actionRebuild());
      }
      case 'enrich': {
        // Default: detach so the 500-row walk can run for up to 380s without
        // hitting the request idle timeout. Pass ?fg=1 to wait inline (useful
        // for small enrichments via curl).
        const background = url.searchParams.get('fg') !== '1';
        const limit = Math.min(1000, parseInt(url.searchParams.get('limit') ?? '500', 10) || 500);
        return json(await actionEnrich({ background, limit }));
      }
      default:
        return json({
          error: 'Unknown action',
          actions: ['sync', 'resync', 'transcript', 'debug', 'rebuild', 'enrich'],
        }, 400);
    }
  } catch (e) {
    console.error('[fathom-proxy]', e);
    return json({ error: (e as Error).message }, 500);
  }
});
