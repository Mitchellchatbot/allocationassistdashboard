/**
 * Choose a password — the step after /auth/confirm has turned an email link
 * into a session. Used for both password resets and first-time invites.
 *
 * After saving we sign out every OTHER session, so whoever had the old
 * password is kicked out everywhere else.
 */
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { landingFor } from "@/lib/access";
import { validatePassword, MIN_PASSWORD_LENGTH } from "@/lib/password-policy";
import {
  AuthLayout, AuthLabel, AuthPasswordInput, AuthError, AuthButton, AuthLink,
} from "@/components/auth/AuthLayout";

const SetPassword = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const invite = params.get("type") === "invite";
  const { session, loading, profile } = useAuth();

  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <AuthLayout title="Your link has expired">
        <div className="space-y-4">
          <AuthError>Open the link from your email again, or request a new one.</AuthError>
          <div className="flex justify-between">
            <AuthLink to="/forgot-password">Request a new link</AuthLink>
            <AuthLink to="/login">Sign in</AuthLink>
          </div>
        </div>
      </AuthLayout>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validatePassword(password, confirm);
    if (problem) { setError(problem); return; }
    setError("");
    setSaving(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setError(err.message.includes("should be different")
        ? "Choose a password you haven't used before."
        : err.message);
      setSaving(false);
      return;
    }
    // Best-effort: a failure here shouldn't strand someone who just set a password.
    await supabase.auth.signOut({ scope: "others" }).catch(() => {});
    navigate(profile ? landingFor(profile) : "/", { replace: true });
  };

  return (
    <AuthLayout
      title={invite ? "Welcome — choose a password" : "Choose a new password"}
      subtitle={session.user.email ?? undefined}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <AuthLabel htmlFor="new-password">New password</AuthLabel>
          <AuthPasswordInput
            id="new-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
            required
            autoComplete="new-password"
            autoFocus
          />
        </div>
        <div>
          <AuthLabel htmlFor="confirm-password">Confirm password</AuthLabel>
          <AuthPasswordInput
            id="confirm-password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            required
            autoComplete="new-password"
          />
        </div>
        {error && <AuthError>{error}</AuthError>}
        <AuthButton loading={saving} loadingText="Saving…">
          {invite ? "Set password and continue →" : "Save new password →"}
        </AuthButton>
      </form>
    </AuthLayout>
  );
};

export default SetPassword;
