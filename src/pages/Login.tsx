import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import logo from "@/assets/logo.png";
import { Eye, EyeOff, Loader2 } from "lucide-react";

const Login = () => {
  const { signIn, session, role } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  // Already logged in → redirect by role
  useEffect(() => {
    if (session) {
      navigate(role === "admin" ? "/" : "/worker", { replace: true });
    }
  }, [session, role, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: authError, data } = await signIn(username.trim(), password);

    if (authError) {
      setError("Incorrect username or password.");
      setLoading(false);
    } else {
      const email = data.user?.email ?? "";
      const dest  = email === "admin@allocationassist.com" ? "/" : "/worker";
      navigate(dest, { replace: true });
    }
  };

  return (
    <div className="min-h-screen flex">

      {/* ── Left — brand panel ─────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[45%] flex-col items-center justify-center px-12 relative overflow-hidden"
        style={{ backgroundColor: "hsl(170, 45%, 28%)" }}
      >
        <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full opacity-10" style={{ backgroundColor: "hsl(170,55%,60%)" }} />
        <div className="absolute -bottom-32 -right-16 h-96 w-96 rounded-full opacity-10" style={{ backgroundColor: "hsl(170,55%,60%)" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full opacity-5 bg-white" />

        <div className="relative z-10 text-center">
          <img src={logo} alt="Allocation Assist" className="h-28 w-28 mx-auto mb-6 object-contain drop-shadow-2xl" />
          <h1 className="text-3xl font-bold text-white tracking-tight">Allocation Assist</h1>
          <p className="text-white/70 mt-2 text-[15px]">The source of workforce</p>
          <div className="my-8 h-px w-24 mx-auto bg-white/20" />
          <p className="text-white/60 text-[13px] leading-relaxed max-w-xs mx-auto">
            Placing world-class doctors across the GCC — powered by intelligent recruitment analytics.
          </p>
        </div>
      </div>

      {/* ── Right — form ───────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 sm:px-12 bg-background">

        <div className="lg:hidden mb-8 text-center">
          <img src={logo} alt="Allocation Assist" className="h-16 w-16 mx-auto mb-3 object-contain" />
          <h1 className="text-xl font-bold text-foreground">Allocation Assist</h1>
          <p className="text-[12px] text-muted-foreground">The source of workforce</p>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-foreground">Welcome back</h2>
            <p className="text-[13px] text-muted-foreground mt-1">Sign in to your portal</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label className="text-[12px] font-medium text-foreground block mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                required
                autoComplete="username"
                className="w-full h-10 rounded-lg border border-border bg-secondary/40 px-3 text-[13px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>

            {/* Password */}
            <div>
              <label className="text-[12px] font-medium text-foreground block mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full h-10 rounded-lg border border-border bg-secondary/40 px-3 pr-10 text-[13px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5">
                <p className="text-[12px] text-destructive">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 rounded-lg text-[13px] font-semibold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-60 hover:opacity-90"
              style={{ backgroundColor: "hsl(170, 45%, 28%)" }}
            >
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Signing in…</> : "Sign in"}
            </button>
          </form>

          <p className="text-center text-[11px] text-muted-foreground mt-8">
            Allocation Assist · Internal Portal
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
