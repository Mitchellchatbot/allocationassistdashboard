/**
 * Where the reset-password and invite emails land:
 *   /auth/confirm?token_hash=…&type=recovery|invite
 *
 * The token is only exchanged when the person presses Continue. Email
 * security scanners (Outlook Safe Links and friends) open links before the
 * recipient does; if we verified on page load, the scanner would use up the
 * one-time token and the real click would say "expired".
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { parseConfirmLink } from "@/lib/auth-links";
import { AuthLayout, AuthError, AuthNotice, AuthButton, AuthLink } from "@/components/auth/AuthLayout";

const AuthConfirm = () => {
  const navigate = useNavigate();
  const link = useMemo(() => parseConfirmLink(window.location.search, window.location.hash), []);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const invite = link.kind === "ok" && link.type === "invite";

  const handleContinue = async () => {
    if (link.kind !== "ok") return;
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ token_hash: link.tokenHash, type: link.type });
    if (error) { setFailed(true); setBusy(false); return; }
    navigate(`/set-password?type=${link.type}`, { replace: true });
  };

  if (link.kind !== "ok" || failed) {
    return (
      <AuthLayout title="This link no longer works">
        <div className="space-y-4">
          <AuthError>
            {link.kind === "expired" || failed
              ? "The link has expired or has already been used. Links work once and last an hour."
              : "The link is incomplete. Open it straight from the email, or request a new one."}
          </AuthError>
          <p className="text-[12px] text-muted-foreground">
            If this was an invite, ask the admin who added you to send a new one.
          </p>
          <div className="flex justify-between">
            <AuthLink to="/forgot-password">Request a new reset link</AuthLink>
            <AuthLink to="/login">Sign in</AuthLink>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={invite ? "You're invited" : "Reset your password"}
      subtitle={invite ? "Set up your Allocation Assist account" : "Confirm it's you to choose a new password"}
    >
      <div className="space-y-4">
        <AuthNotice>
          {invite
            ? "Press Continue to choose the password you'll sign in with."
            : "Press Continue, then choose a new password. You'll be signed out on your other devices."}
        </AuthNotice>
        <AuthButton type="button" onClick={handleContinue} loading={busy} loadingText="Checking link…">
          Continue →
        </AuthButton>
      </div>
    </AuthLayout>
  );
};

export default AuthConfirm;
