/**
 * Shown to someone who can sign in but has no pages — an auth user with no
 * user_profiles row whose email we don't recognise, or a profile with an
 * empty page list. Before this screen existed such users were quietly given
 * the admin page set.
 *
 * Retry re-reads the profile, which covers both "an admin just set me up" and
 * a first load where the profile fetch timed out.
 */
import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { hasAnyAccess, landingFor } from "@/lib/access";
import { AuthLayout, AuthNotice, AuthButton } from "@/components/auth/AuthLayout";

const NoAccess = () => {
  const { session, loading, user, role, allowedPages, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [retrying, setRetrying] = useState(false);

  const access = { role, allowedPages };
  const allowed = hasAnyAccess(access);

  // Once access appears (after Retry, or a slow first fetch), move on.
  useEffect(() => {
    if (!loading && session && allowed) navigate(landingFor(access), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session, allowed]);

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;

  const retry = async () => {
    setRetrying(true);
    await refreshProfile();
    setRetrying(false);
  };

  return (
    <AuthLayout title="No access yet" subtitle={user?.email ?? undefined}>
      <div className="space-y-4">
        <AuthNotice>
          Your account is signed in but hasn't been given access to any part of the dashboard.
          Ask an admin to set your role in <strong>Settings → Users</strong>, then press Retry.
        </AuthNotice>
        <AuthButton type="button" onClick={retry} loading={retrying} loadingText="Checking…">Retry</AuthButton>
        <button
          type="button"
          onClick={async () => { await signOut(); navigate("/login", { replace: true }); }}
          className="w-full text-center text-[11px] text-muted-foreground hover:underline"
        >
          Sign out
        </button>
      </div>
    </AuthLayout>
  );
};

export default NoAccess;
