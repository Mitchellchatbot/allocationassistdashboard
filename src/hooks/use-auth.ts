import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Session, User } from "@supabase/supabase-js";

// Map usernames to Supabase emails
export const USERNAME_MAP: Record<string, string> = {
  admin:   "admin@allocationassist.com",
  worker:  "worker@allocationassist.com",
  worker2: "worker2@allocationassist.com",
};

// Determine role from email
export function getRole(email: string | undefined): "admin" | "worker" {
  if (!email) return "worker";
  return email === USERNAME_MAP.admin ? "admin" : "worker";
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = (usernameOrEmail: string, password: string) => {
    // Accept plain username (admin/worker) or full email
    const email = USERNAME_MAP[usernameOrEmail.toLowerCase()] ?? usernameOrEmail;
    return supabase.auth.signInWithPassword({ email, password });
  };

  const signOut = () => supabase.auth.signOut();

  const role = getRole(user?.email);

  return { session, user, loading, signIn, signOut, role };
}
