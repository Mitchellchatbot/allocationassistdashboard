import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { clearQueryCachePersist } from "@/lib/query-persist";
import type { Session, User } from "@supabase/supabase-js";
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

export function useAuth() {
  const [session, setSession]     = useState<Session | null>(null);
  const [user, setUser]           = useState<User | null>(null);
  const [loading, setLoading]     = useState(true);
  const [profile, setProfile]     = useState<UserProfile | null>(null);

  // Cache the last known good profile so nav never flashes empty during re-fetches
  const profileCache = useRef<UserProfile | null>(null);

  function applyProfile(p: UserProfile) {
    profileCache.current = p;
    setProfile(p);
  }

  // Fetch the user's user_profiles row. resolveFetchedAccess decides what a
  // missing row means: keep the cached profile on a re-fetch (a NULL there is
  // almost always the 8s timeout, and must never change what the user can
  // see), and only on first load fall back by email — which never grants
  // admin. An unknown email with no row gets no pages and the no-access screen.
  async function fetchProfile(u: User) {
    const timeout = new Promise<{ data: null }>(resolve =>
      setTimeout(() => resolve({ data: null }), 8000)
    );
    let row: ProfileRow | null = null;
    try {
      const { data } = await Promise.race([
        supabase
          .from("user_profiles")
          .select("role, allowed_pages, full_name")
          .eq("id", u.id)
          .maybeSingle(),
        timeout,
      ]);
      row = (data as ProfileRow | null) ?? null;
    } catch {
      row = null;
    }
    applyProfile(resolveFetchedAccess({ email: u.email, row, cached: profileCache.current }));
  }

  useEffect(() => {
    // getSession() is not guaranteed to settle. When GoTrue is unreachable it
    // retries the token refresh behind a Web Lock, so the promise can hang
    // indefinitely; a hard network failure rejects it instead. In both cases a
    // bare .then() never runs and setLoading(false) never fires, which strands
    // the app on ProtectedRoute's spinner. Race a timeout and swallow the
    // rejection so we always fall through to the login screen.
    type SessionResult = { data: { session: Session | null } };
    const sessionTimeout = new Promise<SessionResult>(resolve =>
      setTimeout(() => resolve({ data: { session: null } }), 8000)
    );

    Promise.race<SessionResult>([supabase.auth.getSession(), sessionTimeout])
      .catch(() => ({ data: { session: null } }))
      .then(async ({ data }) => {
        try {
          const s = data.session;
          setSession(s);
          setUser(s?.user ?? null);
          if (s?.user) await fetchProfile(s.user);
        } finally {
          setLoading(false);
        }
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      const u = newSession?.user ?? null;
      setUser(u);
      if (u) {
        await fetchProfile(u);
      } else {
        profileCache.current = null;
        setProfile(null);
      }
      // Note: setLoading(false) is NOT called here — loading is an initial-load concept
      // handled by getSession above. onAuthStateChange handles post-login auth events.
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = (usernameOrEmail: string, password: string) =>
    supabase.auth.signInWithPassword({ email: resolveLoginEmail(usernameOrEmail), password });

  // Drop the persisted query snapshot on sign-out so the next user on a shared
  // machine doesn't get handed the previous one's cached data.
  const signOut = () => { clearQueryCachePersist(); return supabase.auth.signOut(); };

  // Re-read the profile row, dropping the cache first so a row an admin has
  // just created (or a first load that timed out) actually takes effect.
  // Used by the no-access screen's Retry.
  const refreshProfile = useCallback(async () => {
    if (!user) return;
    profileCache.current = null;
    await fetchProfile(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Use cached profile if current profile is null (prevents nav flashing empty during re-fetches)
  const effectiveProfile = profile ?? profileCache.current;
  // Until the profile resolves, default by email so nobody briefly sees nav
  // they shouldn't. Same restrictive rule as the fetch fallback — never admin.
  const emailBasedDefault = accessFromEmail(user?.email);
  const role         = effectiveProfile?.role         ?? emailBasedDefault.role;
  const allowedPages = effectiveProfile?.allowedPages ?? emailBasedDefault.allowedPages;
  const fullName     = effectiveProfile?.fullName     ?? emailBasedDefault.fullName;

  return { session, user, loading, signIn, signOut, refreshProfile, role, allowedPages, fullName, profile };
}
