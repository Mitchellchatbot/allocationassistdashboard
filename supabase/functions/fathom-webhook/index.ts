/**
 * Fathom Webhook — Supabase Edge Function
 *
 * Endpoint:   POST /functions/v1/fathom-webhook
 * Auth:       NONE — public endpoint. Authenticity is proved by HMAC.
 *
 * Fathom signs every delivery with HMAC-SHA256 over the raw request body,
 * keyed with FATHOM_WEBHOOK_SECRET. We constant-time compare the digest
 * against the `Fathom-Signature` header before doing anything else.
 *
 * Required Supabase secrets:
 *   FATHOM_WEBHOOK_SECRET   whsec_…
 *   FATHOM_API_KEY          (used to lazily fetch transcript if not in payload)
 *   SUPABASE_URL            (auto-set by Supabase)
 *   SUPABASE_SERVICE_ROLE_KEY (auto-set by Supabase)
 *
 * NOTE: when registering the webhook URL in the Fathom dashboard,
 *       check "Allow unauthenticated" — Supabase otherwise blocks the call
 *       with a 401 before our handler ever runs. Equivalent CLI:
 *           supabase functions deploy fathom-webhook --no-verify-jwt
 */

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WEBHOOK_SECRET = Deno.env.get('FATHOM_WEBHOOK_SECRET') ?? '';
const FATHOM_API_KEY = Deno.env.get('FATHOM_API_KEY')        ?? '';
const FATHOM_BASE    = 'https://api.fathom.ai/external/v1';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// ─── Signature verification ──────────────────────────────────────────────────

const enc = new TextEncoder();

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/**
 * Fathom's `Fathom-Signature` header has historically used either
 *   "t=…,v1=<hex>"   (Stripe-style) — older format
 *   "<hex>"          — newer format
 * We accept both: extract the hex, compare to HMAC(rawBody).
 */
function extractSig(header: string): string {
  const v1 = header.match(/v1=([a-f0-9]+)/i);
  if (v1) return v1[1].toLowerCase();
  return header.trim().replace(/^sha256=/i, '').toLowerCase();
}

// ─── Payload helpers ─────────────────────────────────────────────────────────

type FathomMeeting = Record<string, unknown>;

function pick<T>(...vals: (T | undefined | null)[]): T | null {
  for (const v of vals) if (v !== undefined && v !== null && v !== '') return v as T;
  return null;
}

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
}
function asStr(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null;
}
function asId(v: unknown): string | null {
  if (typeof v === 'string' && v) return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}
function asNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function meetingToRow(m: FathomMeeting) {
  const recording  = asObj(m.recording)   ?? {};
  const meeting    = asObj(m.meeting)     ?? {};
  const recordedBy = asObj(m.recorded_by) ?? asObj(m.fathom_user) ?? asObj(m.host) ?? {};

  // Coerce numeric ids to strings so this matches what the proxy produces.
  // Falling back to share_url would mint a different id and create dupes; we
  // extract the numeric id from the call URL as a stable last resort.
  const idFromUrl = ((): string | null => {
    const u = asStr(m.url) ?? asStr(recording.url) ?? asStr(m.share_url) ?? asStr(recording.share_url);
    if (!u) return null;
    const match = u.match(/\/calls\/(\d+)/) ?? u.match(/\/share\/([A-Za-z0-9_-]+)/);
    return match ? match[1] : null;
  })();
  const fathomId = pick(
    asId(m.id), asId(m.recording_id),
    asId(recording.id), asId(recording.recording_id),
    idFromUrl,
  );
  if (!fathomId) return null;

  const shareUrl = pick(
    asStr(m.share_url), asStr(m.url),
    asStr(recording.share_url), asStr(recording.recording_share_url),
    asStr(recording.url), asStr(recording.recording_url),
  );

  const title = pick(asStr(m.title), asStr(m.meeting_title), asStr(meeting.title));

  const scheduledStart = pick(
    asStr(m.scheduled_start), asStr(m.scheduled_start_time),
    asStr(meeting.scheduled_start_time), asStr(meeting.scheduled_start),
  );
  const recordingStart = pick(
    asStr(m.recording_start), asStr(m.recording_start_time),
    asStr(recording.recording_start_time), asStr(recording.start_time), asStr(recording.started_at),
    scheduledStart,
  );
  const recordingEnd = pick(
    asStr(m.recording_end), asStr(m.recording_end_time),
    asStr(recording.recording_end_time), asStr(recording.end_time), asStr(recording.ended_at),
  );

  const durMin = pick(
    asNum(m.recording_duration_in_minutes),
    asNum(recording.recording_duration_in_minutes),
    asNum(recording.duration_in_minutes),
    asNum(recording.duration_minutes),
  );
  const durSec = pick(
    asNum(m.duration_seconds),
    asNum(recording.duration_seconds),
    durMin !== null ? Math.round(durMin * 60) : null,
  );

  const hostEmail = pick(asStr(recordedBy.email), asStr(m.fathom_user_email), asStr(m.host_email));
  const hostName  = pick(asStr(recordedBy.name),  asStr(m.fathom_user_name),  asStr(m.host_name));

  const invitees = (Array.isArray(m.invitees)               ? m.invitees
                  : Array.isArray(m.calendar_invitees)      ? m.calendar_invitees
                  : Array.isArray(meeting.invitees)         ? meeting.invitees
                  : Array.isArray(meeting.calendar_invitees) ? meeting.calendar_invitees
                  : null) as unknown[] | null;

  const externalDomains = (Array.isArray(m.external_domains)       ? m.external_domains
                         : Array.isArray(meeting.external_domains) ? meeting.external_domains
                         : null) as string[] | null;

  const summary = pick(
    asStr(m.default_summary), asStr(m.summary), asStr(m.ai_summary),
    typeof m.ai_summary === 'object'
      ? asStr((asObj(m.ai_summary) ?? {}).markdown_formatted) ?? asStr((asObj(m.ai_summary) ?? {}).text)
      : null,
  );

  const actionItems = (Array.isArray(m.default_action_items) ? m.default_action_items
                     : Array.isArray(m.action_items)         ? m.action_items
                     : null) as unknown[] | null;

  let transcriptPlain: string | null = null;
  let transcriptSegs: unknown        = null;
  const t = m.transcript;
  if (typeof t === 'string')                       transcriptPlain = t;
  else if (t && typeof t === 'object') {
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

/** If the webhook fired before transcript was available, fetch it now. */
async function fetchTranscript(fathomId: string) {
  if (!FATHOM_API_KEY) return null;
  try {
    const r = await fetch(`${FATHOM_BASE}/meetings/${fathomId}/transcript`, {
      headers: { 'X-Api-Key': FATHOM_API_KEY, 'Accept': 'application/json' },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  if (!WEBHOOK_SECRET) {
    return new Response('Webhook secret not configured', { status: 500 });
  }

  const rawBody = await req.text();
  const header  = req.headers.get('fathom-signature')
               ?? req.headers.get('x-fathom-signature')
               ?? '';

  if (!header) return new Response('Missing signature', { status: 401 });

  const expected = await hmacSha256Hex(WEBHOOK_SECRET, rawBody);
  const got      = extractSig(header);
  if (!timingSafeEqual(expected, got)) {
    return new Response('Invalid signature', { status: 401 });
  }

  let payload: { event?: string; data?: FathomMeeting; meeting?: FathomMeeting } & FathomMeeting;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  // Fathom payloads have appeared as either { event, data: { … } }
  // or as the meeting object at the top level. Handle both.
  const meeting: FathomMeeting | undefined =
    payload.data ?? payload.meeting ?? (payload.id ? (payload as FathomMeeting) : undefined);

  if (!meeting) {
    return new Response('No meeting payload', { status: 200 }); // 200 so Fathom doesn't retry
  }

  const row = meetingToRow(meeting);
  if (!row) return new Response('No fathom_id', { status: 200 });

  // Fetch transcript on-demand if missing
  if (!row.transcript_plaintext) {
    const t = await fetchTranscript(row.fathom_id);
    if (t) {
      if (typeof t === 'string')                row.transcript_plaintext = t;
      else if (t && typeof t === 'object') {
        row.transcript_plaintext = (t as { plaintext?: string }).plaintext ?? null;
        row.transcript_segments  = (t as { segments?: unknown[] }).segments ?? row.transcript_segments;
      }
    }
  }

  const { error } = await supabase
    .from('fathom_calls')
    .upsert(row, { onConflict: 'fathom_id' });

  if (error) {
    console.error('[fathom-webhook] upsert failed', error);
    return new Response('DB error', { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true, fathom_id: row.fathom_id }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
