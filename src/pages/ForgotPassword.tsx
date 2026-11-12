/**
 * "Forgot password?" — asks Supabase to email a reset link.
 *
 * The message after sending is the same whether or not the email has an
 * account, so this page can't be used to find out who works here.
 *
 * @sales.com logins have no inbox behind them, so for those we send nothing
 * and point the person at an admin, who can set a password from
 * Settings → Users.
 */
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { resolveLoginEmail, canSelfReset } from "@/lib/access";
import { confirmUrl } from "@/lib/auth-links";
import {
  AuthLayout, AuthLabel, AuthInput, AuthError, AuthNotice, AuthButton, AuthLink,
} from "@/components/auth/AuthLayout";

type State = "idle" | "sending" | "sent" | "ask-admin";

const ForgotPassword = () => {
  const [value, setValue] = useState("");
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const email = resolveLoginEmail(value);
    if (!canSelfReset(email)) { setState("ask-admin"); return; }

    setState("sending");
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: confirmUrl() });
    // A 429 is the only failure worth surfacing — anything about the address
    // itself would leak whether the account exists.
    if (err && err.status === 429) {
      setError("Too many reset requests. Wait a few minutes and try again.");
      setState("idle");
      return;
    }
    setState("sent");
  };

  return (
    <AuthLayout title="Reset your password" subtitle="We'll email you a link to choose a new one">
      {state === "sent" ? (
        <div className="space-y-4">
          <AuthNotice>
            If an account exists for <strong>{resolveLoginEmail(value)}</strong>, a reset link is on its way.
            It works once and expires in an hour. Check your spam folder if it doesn't arrive.
          </AuthNotice>
          <div className="text-center"><AuthLink to="/login">← Back to sign in</AuthLink></div>
        </div>
      ) : state === "ask-admin" ? (
        <div className="space-y-4">
          <AuthNotice>
            This login doesn't have an inbox we can email. Ask an admin to set a new password for you
            from <strong>Settings → Users</strong>.
          </AuthNotice>
          <div className="flex justify-between">
            <button type="button" onClick={() => setState("idle")} className="text-[11px] text-muted-foreground hover:underline">
              Try a different email
            </button>
            <AuthLink to="/login">← Back to sign in</AuthLink>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <AuthLabel htmlFor="forgot-email">Email or username</AuthLabel>
            <AuthInput
              id="forgot-email"
              type="text"
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="you@allocationassist.com"
              required
              autoComplete="username"
              autoFocus
            />
          </div>
          {error && <AuthError>{error}</AuthError>}
          <AuthButton loading={state === "sending"} loadingText="Sending…">Send reset link</AuthButton>
          <div className="text-center"><AuthLink to="/login">← Back to sign in</AuthLink></div>
        </form>
      )}
    </AuthLayout>
  );
};

export default ForgotPassword;
