import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { landingFor } from "@/lib/access";
import {
  AuthLayout, AuthLabel, AuthInput, AuthPasswordInput, AuthError, AuthButton, AuthLink,
} from "@/components/auth/AuthLayout";

const Login = () => {
  const { signIn, session, profile } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  // Redirect once both session and profile are loaded, so we never navigate
  // before the role is known. HI members land on their workspace; a user with
  // no pages lands on the no-access screen.
  useEffect(() => {
    if (session && profile) navigate(landingFor(profile), { replace: true });
  }, [session, profile, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error: authError } = await signIn(username, password);
    if (authError) {
      setError("Incorrect username or password.");
      setLoading(false);
    }
    // On success: leave the spinner showing — the effect above redirects.
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your account to continue">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <AuthLabel htmlFor="login-username">Username</AuthLabel>
          <AuthInput
            id="login-username"
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Enter your username or email"
            required
            autoComplete="username"
          />
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <AuthLabel htmlFor="login-password">Password</AuthLabel>
            <AuthLink to="/forgot-password">Forgot password?</AuthLink>
          </div>
          <AuthPasswordInput
            id="login-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
          />
        </div>

        {error && <AuthError>{error}</AuthError>}

        <AuthButton loading={loading} loadingText="Signing in…">Sign in →</AuthButton>
      </form>
    </AuthLayout>
  );
};

export default Login;
