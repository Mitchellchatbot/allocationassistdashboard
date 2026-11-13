import { useCallback, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";
import { clearQueryCachePersist } from "@/lib/query-persist";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import {
  accessFromEmail, resolveFetchedAccess, resolveLoginEmail,
  type Access, type ProfileRow,
} from "@/lib/access";

// The page lists and role presets live in lib/access (pure, testable).
// Re-exported so existing `from "@/hooks/use-auth"` imports keep working.
export {
  USERNAME_MAP, WORKER_EMAIL_TO_NAME, ALL_PAGES, HI_MEMBER_PAGES, ROLE_PRESETS,
} from "@/lib/access";

type UserProfile = Access;

/*
 * Auth state is one shared store, not per-component state.
 *
 * useAuth() is called from ~30 components. When each call kept its own state,
 * each one read the session, subscribed to auth events and fetched the
 * profile — and its event handler awaited a Supabase query. Supabase fires
 * some auth events while holding its auth lock, and every query needs that
 * lock to read the token, so those handlers deadlocked until the library's
 * 5 s lock timeout broke them. Right after signing in, a dozen components
 * mounting at once queued behind each other and the spinner ran for minutes;
 * a page refresh (session already settled) "fixed" it.
 *
 * Now there is one subscription and one profile fetch, and the event handler
 * is synchronous: anything that calls Supabase is deferred with setTimeout,
 * as Supabase's docs recommend, so it runs after the lock is released.
 */

interface AuthState {
  session: Session | null;
  user:    User | null;
  loading: boolean;
  profile: UserProfile | null;
}

const PROFILE_TIMEOUT_MS = 8000;
// If Supabase never reports the initial session (GoTrue unreachable, a stuck
// lock), stop waiting and show the login screen instead of a spinner.
const INITIAL_SESSION_TIMEOUT_MS = 8000;

let state: AuthState = { session: null, user: null, loading: true, profile: null };
// Last known good profile, so a failed or timed-out re-fetch never changes
// what a signed-in user can see.
let profileCache: UserProfile | null = null;
// Bumped on every profile load and sign-out; a load that finishes after a
// newer one started (or after sign-out) is dropped.
let profileSeq = 0;
let started = false;
const listeners = new Set<() => void>();

function setState(patch: Partial<AuthState>) {
  state = { ...state, ...patch };
  listeners.forEach(l => l());
}

type RowResult =
  | { kind: "row"; row: ProfileRow }
  | { kind: "missing" }   // the database answered: there is no row
  | { kind: "failed" };   // timed out or errored: we don't know

const PROFILE_ATTEMPTS = 3;

async function fetchRow(u: User): Promise<RowResult> {
  const timeout = new Promise<"timeout">(resolve =>
    setTimeout(() => resolve("timeout"), PROFILE_TIMEOUT_MS)
  );
  try {
    const res = await Promise.race([
      supabase
        .from("user_profiles")
        .select("role, allowed_pages, full_name")
        .eq("id", u.id)
        .maybeSingle(),
      timeout,
    ]);
    if (res === "timeout" || res.error) return { kind: "failed" };
    return res.data ? { kind: "row", row: res.data as ProfileRow } : { kind: "missing" };
  } catch {
    return { kind: "failed" };
  }
}

// One profile load per user at a time. Supabase can report the same sign-in
// more than once; each report used to start its own query, and a slow
// duplicate could time out and overwrite the good answer.
let inflight: { userId: string; promise: Promise<void> } | null = null;

function loadProfile(u: User): Promise<void> {
  if (inflight?.userId === u.id) return inflight.promise;
  const seq = ++profileSeq;
  const promise = (async () => {
    let result: RowResult = { kind: "failed" };
    for (let i = 0; i < PROFILE_ATTEMPTS && result.kind === "failed"; i++) {
      // A known-good profile already on screen doesn't need retrying.
      if (i > 0 && profileCache) break;
      result = await fetchRow(u);
      if (seq !== profileSeq) return;
    }
    if (seq !== profileSeq) return;
    if (result.kind === "failed" && profileCache) return;  // keep what we have
    // A timeout is not "no row": only fall back by email (fail closed) once the
    // database has said there's no row, or every attempt failed.
    const row = result.kind === "row" ? result.row : null;
    profileCache = resolveFetchedAccess({ email: u.email, row, cached: profileCache });
    setState({ profile: profileCache });
  })().finally(() => {
    if (inflight?.promise === promise) inflight = null;
  });
  inflight = { userId: u.id, promise };
  return promise;
}

function handleAuthEvent(event: AuthChangeEvent, session: Session | null) {
  const u = session?.user ?? null;
  const sameUser = !!u && u.id === state.user?.id;
  setState({ session, user: u });

  if (!u) {
    profileCache = null;
    profileSeq++;
    inflight = null;
    setState({ profile: null, loading: false });
    return;
  }
  // A token refresh doesn't change who you are or what you can see.
  if (event === "TOKEN_REFRESHED" && sameUser && profileCache) {
    setState({ loading: false });
    return;
  }
  if (!sameUser) {
    // A different account: never show the previous one's access meanwhile.
    profileCache = null;
    setState({ profile: null });
  }
  void loadProfile(u).finally(() => setState({ loading: false }));
}

function start() {
  if (started) return;
  started = true;

  const giveUp = setTimeout(() => {
    if (state.loading) setState({ loading: false });
  }, INITIAL_SESSION_TIMEOUT_MS);

  supabase.auth.onAuthStateChange((event, session) => {
    // Synchronous on purpose — see the comment at the top. Never await a
    // Supabase call in here.
    if (event === "INITIAL_SESSION") clearTimeout(giveUp);
    setTimeout(() => handleAuthEvent(event, session), 0);
  });
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const getSnapshot = () => state;

export function useAuth() {
  const { session, user, loading, profile } = useSyncExternalStore(subscribe, getSnapshot);

  const signIn = useCallback((usernameOrEmail: string, password: string) =>
    supabase.auth.signInWithPassword({ email: resolveLoginEmail(usernameOrEmail), password }), []);

  // Drop the persisted query snapshot on sign-out so the next user on a shared
  // machine doesn't get handed the previous one's cached data.
  const signOut = useCallback(() => { clearQueryCachePersist(); return supabase.auth.signOut(); }, []);

  // Re-read the profile row, dropping the cache first so a row an admin has
  // just created (or a first load that timed out) actually takes effect.
  // Used by the no-access screen's Retry.
  const refreshProfile = useCallback(async () => {
    if (!state.user) return;
    profileCache = null;
    await loadProfile(state.user);
  }, []);

  // Until the profile resolves, default by email so nobody briefly sees nav
  // they shouldn't. Same restrictive rule as the fetch fallback — never admin.
  const emailBasedDefault = accessFromEmail(user?.email);
  const role         = profile?.role         ?? emailBasedDefault.role;
  const allowedPages = profile?.allowedPages ?? emailBasedDefault.allowedPages;
  const fullName     = profile?.fullName     ?? emailBasedDefault.fullName;

  return { session, user, loading, signIn, signOut, refreshProfile, role, allowedPages, fullName, profile };
}
