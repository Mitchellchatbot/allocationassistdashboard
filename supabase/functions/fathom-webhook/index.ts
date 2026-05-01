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

interface FathomMeeting {
  id?:               string;
  recording_id?:     string;
  share_url?:        string;
  url?:              string;
  title?:            string;
  scheduled_start?:  string;
  scheduled_start_time?: string;
  recording_start?:  string;
  recording_start_time?: string;
  recording_end?:    string;
  recording_end_time?:   string;
  duration_seconds?: number;
  host?:             { email?: string; name?: string };
  invitees?:         Array<{ name?: string; email?: string; domain?: string }>;
  external_domains?: string[];
  summary?:          string;
  ai_summary?:       string;
  action_items?:     Array<unknown>;
  transcript?:       string | { segments?: Array<unknown>; plaintext?: string };
}

function pick<T>(...vals: (T | undefined | null)[]): T | null {
  for (const v of vals) if (v !== undefined && v !== null && v !== '') return v as T;
  return null;
}

function meetingToRow(m: FathomMeeting) {
  const fathomId = pick(m.id, m.recording_id);
  if (!fathomId) return null;

  // transcript can be a string OR { segments, plaintext }
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
