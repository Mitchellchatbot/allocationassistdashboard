import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Session, User } from "@supabase/supabase-js";
import { isHiTeamMember, findHiMemberByEmail } from "@/lib/hi-team";

// Map short usernames → Supabase emails for convenient login
export const USERNAME_MAP: Record<string, string> = {
  admin:   "admin@allocationassist.com",
  worker:  "worker@allocationassist.com",
  worker2: "worker2@allocationassist.com",
};

// Worker email → full name as it appears in weekly_sales.member_name.
// Used as a fallback so the worker portal can still match performance rows
// when the user_profiles fetch times out or fails.
export const WORKER_EMAIL_TO_NAME: Record<string, string> = {
  "abraham@sales.com": "Abraham",
  "ahmed@sales.com":   "Ahmed",
  "asser@sales.com":   "Asser",
  "mohamed@sales.com": "Mohamed Othaman",
  "peter@sales.com":   "Peter",
  "sohaila@sales.com": "Sohaila",
  "sumia@sales.com":   "Sumia",
};

// All pages that exist in the app (used for admin fallback)
// /doctors is the unified shell — the old /leads-pipeline, /doctor-profiles
// and /wp-candidates URLs redirect into it, so they don't need their own
// entry in the access list. Anyone who can see "doctors" sees all three tabs.
export const ALL_PAGES = ["/", "/my-workspace", "/sales", "/marketing", "/doctors", "/team", "/finance", "/meta-ads", "/settings", "/worker", "/calls", "/follow-ups", "/automations", "/vacancies", "/reports", "/batches", "/import-bulk", "/connections", "/forms"];

// Hospital Introduction team page set. They land on /my-workspace and
// only see the surfaces that matter for moving doctors through the
// pipeline. Marketing/Sales/Finance/Admin tabs are hidden.
export const HI_MEMBER_PAGES = [
  "/",
  "/my-workspace",
  "/automations",
  "/doctors",
  "/vacancies",
  "/batches",
  "/reports",
  "/forms",
];

// Role presets — selected in the Add User dialog
export const ROLE_PRESETS: Record<string, string[]> = {
  admin:     ALL_PAGES,
  sales:     ["/", "/sales", "/marketing", "/doctors", "/team", "/calls"],
  finance:   ["/", "/finance"],
  worker:    ["/worker"],
  hi_member: HI_MEMBER_PAGES,
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

  // Fetch DB profile for a user. If the row exists, use it. If not / timeout,
  // fall back based on email pattern: @sales.com → worker, anything else → admin.
  async function fetchProfile(u: User) {
    const timeout = new Promise<{ data: null }>(resolve =>
      setTimeout(() => resolve({ data: null }), 8000)
    );
    function fallbackByEmail() {
      const email = (u.email ?? "").toLowerCase();
      // Sales workers always default to /worker only — never admin
      if (email.endsWith("@sales.com")) {
        const name = WORKER_EMAIL_TO_NAME[email] ?? email.split("@")[0];
        applyProfile({ role: "worker", allowedPages: ["/worker"], fullName: name });
        return;
      }
      // Hospital Introduction team — restricted to their workspace + the
      // tabs they actually work in. Falls through to admin for anyone else.
      const hi = findHiMemberByEmail(email);
      if (hi) {
        applyProfile({ role: "hi_member", allowedPages: HI_MEMBER_PAGES, fullName: hi.name });
        return;
      }
      applyProfile({ role: "admin", allowedPages: ALL_PAGES, fullName: null });
    }
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
        fallbackByEmail();
      }
    } catch {
      fallbackByEmail();
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
  // Default by email pattern so users don't briefly see admin nav before
  // the profile fetch resolves.
  const lowerEmail = (user?.email ?? "").toLowerCase();
  const emailBasedDefault = lowerEmail.endsWith("@sales.com")
    ? { role: "worker",    pages: ["/worker"] }
    : isHiTeamMember(lowerEmail)
      ? { role: "hi_member", pages: HI_MEMBER_PAGES }
      : { role: "admin",     pages: ALL_PAGES };
  const role         = effectiveProfile?.role         ?? emailBasedDefault.role;
  const allowedPages = effectiveProfile?.allowedPages ?? emailBasedDefault.pages;

  return { session, user, loading, signIn, signOut, role, allowedPages, profile };
}
