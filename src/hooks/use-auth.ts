import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Session, User } from "@supabase/supabase-js";

// Map short usernames → Supabase emails for convenient login
export const USERNAME_MAP: Record<string, string> = {
  admin:   "admin@allocationassist.com",
  worker:  "worker@allocationassist.com",
  worker2: "worker2@allocationassist.com",
};

// All pages that exist in the app (used for admin fallback)
export const ALL_PAGES = ["/", "/sales", "/marketing", "/leads-pipeline", "/team", "/finance", "/operations", "/meta-ads", "/settings"];

// Role presets — selected in the Add User dialog
export const ROLE_PRESETS: Record<string, string[]> = {
  admin:   ALL_PAGES,
  sales:   ["/", "/sales", "/marketing", "/leads-pipeline", "/team"],
  finance: ["/", "/finance"],
  worker:  ["/worker"],
};

interface UserProfile {
  role: string;
  allowedPages: string[];
  fullName: string | null;
}

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

  // Fetch DB profile for a user; fall back to admin if no row exists or on any error.
  // Has a 5-second timeout so a hung DB connection never blocks the app indefinitely.
  async function fetchProfile(u: User) {
    const timeout = new Promise<{ data: null }>(resolve =>
      setTimeout(() => resolve({ data: null }), 5000)
    );
    try {
      const { data } = await Promise.race([
        supabase
          .from("user_profiles")
          .select("role, allowed_pages, full_name")
          .eq("id", u.id)
          .maybeSingle(),
        timeout,
      ]);

      if (data) {
        applyProfile({
          role:         data.role,
          allowedPages: data.allowed_pages ?? [],
          fullName:     data.full_name ?? null,
        });
      } else {
        // No profile row (or timeout) → legacy admin account
        applyProfile({ role: "admin", allowedPages: ALL_PAGES, fullName: null });
      }
    } catch {
      // Any DB error → fail open as admin so the app doesn't hang
      applyProfile({ role: "admin", allowedPages: ALL_PAGES, fullName: null });
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
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

  const signIn = (usernameOrEmail: string, password: string) => {
    const email = USERNAME_MAP[usernameOrEmail.toLowerCase()] ?? usernameOrEmail;
    return supabase.auth.signInWithPassword({ email, password });
  };

  const signOut = () => supabase.auth.signOut();

  // Use cached profile if current profile is null (prevents nav flashing empty during re-fetches)
  const effectiveProfile = profile ?? profileCache.current;
  const role         = effectiveProfile?.role         ?? "admin";
  const allowedPages = effectiveProfile?.allowedPages ?? ALL_PAGES;

  return { session, user, loading, signIn, signOut, role, allowedPages, profile };
}
