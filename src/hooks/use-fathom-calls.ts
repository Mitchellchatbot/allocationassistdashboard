import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL      as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Re-run a backfill sync this often while the page is open (silent).
// Set high to stay well under Fathom's per-key rate limit.
const AUTO_SYNC_MS = 10 * 60_000;
// Re-read the table this often (catches webhook inserts even without a sync).
const AUTO_REFETCH_MS = 30_000;
// Skip the initial-mount auto-sync if the table already has this many rows
// — webhooks keep things fresh without us hammering the REST API.
const SKIP_INITIAL_SYNC_THRESHOLD = 1;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FathomInvitee {
  name?:   string;
  email?:  string;
  domain?: string;
}

export interface FathomActionItem {
  text?:     string;
  assignee?: string;
  [key: string]: unknown;
}

export interface FathomTranscriptSegment {
  ts?:      number | string;   // seconds offset OR formatted timestamp
  speaker?: string;
  text?:    string;
}

export interface FathomCall {
  id:                   string;
  fathom_id:            string;
  share_url:            string | null;
  title:                string | null;
  scheduled_start:      string | null;
  recording_start:      string | null;
  recording_end:        string | null;
  duration_seconds:     number | null;
  host_email:           string | null;
  host_name:            string | null;
  invitees:             FathomInvitee[] | null;
  external_domains:     string[] | null;
  summary:              string | null;
  action_items:         FathomActionItem[] | null;
  transcript_plaintext: string | null;
  transcript_segments:  FathomTranscriptSegment[] | null;
  matched_lead_id:      string | null;
  matched_doctor_name:  string | null;
  created_at:           string;
  updated_at:           string;
}

// ─── List query ──────────────────────────────────────────────────────────────

export interface FathomCallsFilters {
  from?:   string | null;   // ISO date
  to?:     string | null;
  host?:   string | null;   // host_email
  search?: string | null;   // simple title/transcript search
}

export const FATHOM_CALLS_KEY = ["fathom-calls"] as const;

export function useFathomCalls(filters: FathomCallsFilters = {}) {
  return useQuery({
    queryKey: [...FATHOM_CALLS_KEY, filters],
    queryFn: async () => {
      let q = supabase
        .from("fathom_calls")
        .select("*")
        .order("recording_start", { ascending: false, nullsFirst: false })
        .limit(500);

      if (filters.from) q = q.gte("recording_start", filters.from);
      if (filters.to)   q = q.lte("recording_start", filters.to);
      if (filters.host) q = q.eq("host_email", filters.host);

      const { data, error } = await q;
      if (error) throw error;

      let rows = (data ?? []) as FathomCall[];

      // Client-side text search across title / summary / transcript
      const s = filters.search?.trim().toLowerCase();
      if (s) {
        rows = rows.filter(r =>
          (r.title?.toLowerCase().includes(s)) ||
          (r.summary?.toLowerCase().includes(s)) ||
          (r.transcript_plaintext?.toLowerCase().includes(s)) ||
          (r.host_name?.toLowerCase().includes(s)) ||
          (r.host_email?.toLowerCase().includes(s))
        );
      }
      return rows;
    },
    staleTime: 15_000,
    refetchInterval: AUTO_REFETCH_MS,
    refetchIntervalInBackground: false,
  });
}

// ─── Single call (with lazy transcript fetch) ───────────────────────────────

export function useFathomCall(fathomId: string | null) {
  return useQuery({
    queryKey: ["fathom-call", fathomId],
    enabled:  !!fathomId,
    queryFn: async () => {
      if (!fathomId) return null;
      const { data, error } = await supabase
        .from("fathom_calls")
        .select("*")
        .eq("fathom_id", fathomId)
        .maybeSingle();
      if (error) throw error;

      // If transcript wasn't stored at webhook time, fetch it on demand.
      if (data && !data.transcript_plaintext) {
        try {
          const session = (await supabase.auth.getSession()).data.session;
          const token = session?.access_token ?? SUPABASE_ANON_KEY;
          const res = await fetch(
            `${SUPABASE_URL}/functions/v1/fathom-proxy?action=transcript&id=${encodeURIComponent(fathomId)}`,
            {
              headers: {
                "apikey":         SUPABASE_ANON_KEY,
                "Authorization": `Bearer ${token}`,
              },
            },
          );
          if (res.ok) return (await res.json()) as FathomCall;
        } catch (e) {
          console.warn("[fathom] transcript fetch failed", e);
        }
      }
      return data as FathomCall | null;
    },
    staleTime: 5 * 60_000,
  });
}

// ─── Sync (admin button) ─────────────────────────────────────────────────────

export interface FathomSyncResult {
  synced: number;
  pages:  number;
}

async function callSync(since?: string): Promise<FathomSyncResult> {
  const session = (await supabase.auth.getSession()).data.session;
  const token   = session?.access_token ?? SUPABASE_ANON_KEY;
  const url     = new URL(`${SUPABASE_URL}/functions/v1/fathom-proxy`);
  url.searchParams.set("action", "sync");
  if (since) url.searchParams.set("since", since);

  const res = await fetch(url.toString(), {
    headers: {
      "apikey":         SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Fathom sync failed: ${res.status} ${t}`);
  }
  return (await res.json()) as FathomSyncResult;
}

/** Fires the backend `enrich` action — walks rows with null duration_seconds
 *  and fetches per-meeting detail to fill them in. Returns immediately; the
 *  actual work runs detached on the Edge Function side via waitUntil. */
async function callEnrich(): Promise<void> {
  const session = (await supabase.auth.getSession()).data.session;
  const token   = session?.access_token ?? SUPABASE_ANON_KEY;
  const url     = new URL(`${SUPABASE_URL}/functions/v1/fathom-proxy`);
  url.searchParams.set("action", "enrich");
  await fetch(url.toString(), {
    headers: {
      "apikey":         SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${token}`,
    },
  }).catch(e => console.warn("[fathom enrich] kickoff failed:", e));
}

export function useFathomSync() {
  const qc = useQueryClient();
  return useMutation<FathomSyncResult, Error, string | undefined>({
    mutationFn: callSync,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: FATHOM_CALLS_KEY });
    },
  });
}

/**
 * Background auto-sync.
 *  - Fires once on mount (so opening the Calls page kicks off a backfill silently)
 *  - Then refires every AUTO_SYNC_MS as long as the component is mounted.
 *  - Pauses while the tab is hidden to avoid burning Fathom rate-limit.
 *  - Errors are swallowed and logged; the table still updates from webhook inserts.
 */
export function useFathomAutoSync(): {
  lastSyncAt: number | null;
  syncing:    boolean;
  lastError:  string | null;
  /** True while the backend is actively filling in null-duration rows. UI
   *  uses this to render an inline spinner in cells where data is pending. */
  enriching:  boolean;
} {
  const qc = useQueryClient();
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [syncing,    setSyncing]    = useState(false);
  const [lastError,  setLastError]  = useState<string | null>(null);
  const [enriching,  setEnriching]  = useState(false);

  useEffect(() => {
    let alive   = true;
    let running = false;

    // Compute a sensible `since` so auto-sync ticks are incremental, not
    // full backfills. We use the most recent recording_start in the table
    // minus 24h (covers late-arriving meetings + clock skew). If the table
    // is empty, leave `since` undefined → backend does a background full
    // backfill via EdgeRuntime.waitUntil.
    const computeSince = async (): Promise<string | undefined> => {
      const { data } = await supabase
        .from("fathom_calls")
        .select("recording_start")
        .order("recording_start", { ascending: false })
        .limit(1)
        .maybeSingle();
      const latest = data?.recording_start;
      if (!latest) return undefined;
      const t = new Date(latest);
      t.setUTCDate(t.getUTCDate() - 1);
      return t.toISOString().slice(0, 10);
    };

    const run = async () => {
      if (!alive || running) return;
      if (typeof document !== "undefined" && document.hidden) return;
      running = true;
      setSyncing(true);
      try {
        const since = await computeSince();
        await callSync(since);
        if (!alive) return;
        setLastSyncAt(Date.now());
        setLastError(null);
        qc.invalidateQueries({ queryKey: FATHOM_CALLS_KEY });
      } catch (e) {
        console.warn("[fathom auto-sync]", e);
        if (alive) setLastError((e as Error).message);
      } finally {
        running = false;
        if (alive) setSyncing(false);
      }
    };

    // Skip the initial sync if the table already has data — webhooks keep
    // it fresh in normal operation, and a needless sync just burns rate
    // limit (which is what 429'd us during development).
    //
    // Separately, kick off `enrich` whenever there are rows with null
    // duration_seconds — Fathom's list endpoint doesn't return duration on
    // every account, so we backfill it via per-meeting detail calls. The
    // backend detaches the work and returns instantly; rows fill in over
    // time and the auto-refetch picks them up.
    (async () => {
      const { count } = await supabase
        .from("fathom_calls")
        .select("id", { head: true, count: "exact" });
      if ((count ?? 0) < SKIP_INITIAL_SYNC_THRESHOLD) {
        run();
      }

      const { count: missingDuration } = await supabase
        .from("fathom_calls")
        .select("id", { head: true, count: "exact" })
        .is("duration_seconds", null);
      if ((missingDuration ?? 0) > 0) {
        console.log(`[fathom auto-sync] ${missingDuration} calls missing duration — kicking off enrich`);
        setEnriching(true);
        callEnrich();

        // Poll every 5s while enrichment is active. Each tick: refresh the
        // null-duration count + invalidate the calls query so newly-enriched
        // rows replace their spinners with real data. We stop polling when
        // the count hits zero, OR when it hasn't decreased for 60 seconds
        // (i.e. enrichment is stalled or fathom isn't returning duration
        // even from the detail endpoint — no point spinning forever).
        let lastCount = missingDuration ?? 0;
        let stalledTicks = 0;
        const poll = setInterval(async () => {
          if (!alive) { clearInterval(poll); return; }
          const { count } = await supabase
            .from("fathom_calls")
            .select("id", { head: true, count: "exact" })
            .is("duration_seconds", null);
          const c = count ?? 0;
          qc.invalidateQueries({ queryKey: FATHOM_CALLS_KEY });
          if (c === 0) {
            clearInterval(poll);
            setEnriching(false);
            return;
          }
          if (c >= lastCount) {
            stalledTicks++;
            // 12 ticks × 5s = 60s of no progress → give up
            if (stalledTicks >= 12) {
              clearInterval(poll);
              setEnriching(false);
            }
          } else {
            stalledTicks = 0;
            lastCount = c;
          }
        }, 5000);
      }
    })();

    const timer = setInterval(run, AUTO_SYNC_MS);

    // No more on-visibility re-fire — that was contributing to the 429.

    return () => {
      alive = false;
      clearInterval(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { lastSyncAt, syncing, lastError, enriching };
}
