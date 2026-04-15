import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import logo from "@/assets/logo.png";
import { Eye, EyeOff, Loader2 } from "lucide-react";

// ── Floating orb config ────────────────────────────────────────────────────────

const ORBS = [
  { size: 320, top: "-10%", left: "-8%",  delay: "0s",    duration: "8s",  opacity: 0.18 },
  { size: 200, top: "60%",  left: "70%",  delay: "1.5s",  duration: "10s", opacity: 0.12 },
  { size: 140, top: "30%",  left: "55%",  delay: "3s",    duration: "7s",  opacity: 0.10 },
  { size: 260, top: "75%",  left: "-12%", delay: "0.8s",  duration: "9s",  opacity: 0.14 },
  { size: 100, top: "15%",  left: "75%",  delay: "2.2s",  duration: "6s",  opacity: 0.09 },
  { size: 180, top: "45%",  left: "20%",  delay: "4s",    duration: "11s", opacity: 0.08 },
];

const DOTS = Array.from({ length: 28 }, (_, i) => ({
  top:  `${8 + (i * 13.7) % 85}%`,
  left: `${5 + (i * 19.3) % 88}%`,
  delay: `${(i * 0.37) % 3}s`,
  size: i % 3 === 0 ? 3 : i % 3 === 1 ? 2 : 1.5,
}));

const Login = () => {
  const { signIn, session, profile, allowedPages } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [mounted,  setMounted]  = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Redirect once both session and profile are loaded — uses actual allowedPages
  // so every role lands on the correct first page (not hardcoded /worker)
  useEffect(() => {
    if (session && profile) {
      navigate(allowedPages[0] ?? "/", { replace: true });
    }
  }, [session, profile, allowedPages, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error: authError } = await signIn(username.trim(), password);
    if (authError) {
      setError("Incorrect username or password.");
      setLoading(false);
    }
    // On success: leave loading spinner showing — the useEffect above redirects
    // once the profile finishes loading (avoids navigating before role is known)
  };

  return (
    <>
      {/* ── Keyframe styles ──────────────────────────────────────────────────── */}
      <style>{`
        @keyframes floatY {
          0%, 100% { transform: translateY(0px) scale(1); }
          50%       { transform: translateY(-22px) scale(1.04); }
        }
        @keyframes floatX {
          0%, 100% { transform: translateX(0px); }
          50%       { transform: translateX(14px); }
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 0.25; transform: scale(1); }
          50%       { opacity: 0.65; transform: scale(1.4); }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .orb {
          position: absolute;
          border-radius: 50%;
          background: radial-gradient(circle at 35% 35%, rgba(255,255,255,0.35), transparent 65%);
          backdrop-filter: blur(0px);
          animation: floatY var(--dur) ease-in-out infinite var(--delay);
          pointer-events: none;
        }
        .orb:nth-child(even) { animation-name: floatX; }
        .dot {
          position: absolute;
          border-radius: 50%;
          background: rgba(255,255,255,0.5);
          animation: pulse-dot 3s ease-in-out infinite var(--delay);
          pointer-events: none;
        }
        .shimmer-text {
          background: linear-gradient(90deg, rgba(255,255,255,0.7) 0%, #fff 40%, rgba(255,255,255,0.7) 100%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer 4s linear infinite;
        }
        .fade-up { animation: fadeUp 0.6s ease both; }
        .fade-in { animation: fadeIn 0.5s ease both; }
      `}</style>

      <div className="min-h-screen flex">

        {/* ── Left — animated brand panel ────────────────────────────────────── */}
        <div
          className="hidden lg:flex lg:w-[48%] flex-col items-center justify-center relative overflow-hidden"
          style={{ backgroundColor: "hsl(170, 45%, 24%)" }}
        >
          {/* Floating orbs */}
          {ORBS.map((o, i) => (
            <div
              key={i}
              className="orb"
              style={{
                width:   o.size,
                height:  o.size,
                top:     o.top,
                left:    o.left,
                opacity: o.opacity,
                backgroundColor: "hsl(170, 60%, 55%)",
                ["--dur" as string]:   o.duration,
                ["--delay" as string]: o.delay,
              }}
            />
          ))}

          {/* Floating dots grid */}
          {DOTS.map((d, i) => (
            <div
              key={i}
              className="dot"
              style={{
                width:  d.size,
                height: d.size,
                top:    d.top,
                left:   d.left,
                ["--delay" as string]: d.delay,
              }}
            />
          ))}

          {/* Diagonal light streak */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.04) 50%, transparent 60%)",
            }}
          />

          {/* Brand content */}
          <div className="relative z-10 text-center px-12" style={{ opacity: mounted ? 1 : 0, transition: "opacity 0.8s ease" }}>
            <div className="relative inline-block mb-8">
              {/* Glow ring behind logo */}
              <div
                className="absolute inset-0 rounded-full blur-2xl"
                style={{ backgroundColor: "hsl(170, 60%, 50%)", opacity: 0.35, transform: "scale(1.6)" }}
              />
              <img
                src={logo}
                alt="Allocation Assist"
                className="relative h-28 w-28 object-contain drop-shadow-2xl"
                style={{ filter: "drop-shadow(0 0 24px rgba(255,255,255,0.25))" }}
              />
            </div>

            <h1 className="shimmer-text text-4xl font-bold tracking-tight leading-tight mb-3">
              Allocation Assist
            </h1>
            <p className="text-white/60 text-[15px] tracking-wide mb-10">
              The source of workforce
            </p>

            <div className="h-px w-20 mx-auto mb-10" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)" }} />

            <p className="text-white/50 text-[13px] leading-relaxed max-w-[280px] mx-auto">
              Placing world-class doctors across the GCC — powered by intelligent recruitment analytics.
            </p>

            {/* Stat pills */}
            <div className="flex justify-center gap-3 mt-10">
              {[["GCC", "Region"], ["24/7", "Support"], ["100%", "Secure"]].map(([val, lbl]) => (
                <div
                  key={lbl}
                  className="rounded-xl px-4 py-2.5 text-center"
                  style={{ backgroundColor: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}
                >
                  <p className="text-white font-bold text-[15px] leading-none">{val}</p>
                  <p className="text-white/45 text-[9px] mt-0.5 uppercase tracking-widest">{lbl}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right — form panel ──────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 sm:px-12 bg-background relative overflow-hidden">

          {/* Subtle background texture */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: "radial-gradient(circle at 80% 20%, hsl(170,45%,28%,0.06) 0%, transparent 55%), radial-gradient(circle at 10% 80%, hsl(170,45%,28%,0.04) 0%, transparent 50%)",
            }}
          />

          {/* Mobile logo */}
          <div className="lg:hidden mb-8 text-center relative z-10">
            <img src={logo} alt="Allocation Assist" className="h-14 w-14 mx-auto mb-3 object-contain" />
            <h1 className="text-xl font-bold text-foreground">Allocation Assist</h1>
            <p className="text-[11px] text-muted-foreground">The source of workforce</p>
          </div>

          <div
            className="w-full max-w-sm relative z-10 fade-up"
            style={{ animationDelay: "0.1s" }}
          >
            {/* Form card */}
            <div
              className="rounded-2xl p-8 shadow-xl"
              style={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                boxShadow: "0 8px 40px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              {/* Header */}
              <div className="mb-7">
                <div
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold mb-4"
                  style={{ backgroundColor: "hsl(170,45%,28%,0.1)", color: "hsl(170,45%,28%)" }}
                >
                  <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: "hsl(170,45%,28%)" }} />
                  Internal Portal
                </div>
                <h2 className="text-[22px] font-bold text-foreground leading-tight">Welcome back</h2>
                <p className="text-[12px] text-muted-foreground mt-1">Sign in to your account to continue</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Username */}
                <div>
                  <label className="text-[11px] font-semibold text-foreground/80 block mb-1.5 uppercase tracking-wide">Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="Enter your username"
                    required
                    autoComplete="username"
                    className="w-full h-11 rounded-xl border border-border bg-muted/30 px-3.5 text-[13px] text-foreground placeholder:text-muted-foreground/40 outline-none transition-all"
                    style={{ boxShadow: "none" }}
                    onFocus={e => { e.target.style.borderColor = "hsl(170,45%,28%)"; e.target.style.boxShadow = "0 0 0 3px hsl(170,45%,28%,0.12)"; }}
                    onBlur={e  => { e.target.style.borderColor = ""; e.target.style.boxShadow = ""; }}
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="text-[11px] font-semibold text-foreground/80 block mb-1.5 uppercase tracking-wide">Password</label>
                  <div className="relative">
                    <input
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      autoComplete="current-password"
                      className="w-full h-11 rounded-xl border border-border bg-muted/30 px-3.5 pr-11 text-[13px] text-foreground placeholder:text-muted-foreground/40 outline-none transition-all"
                      style={{ boxShadow: "none" }}
                      onFocus={e => { e.target.style.borderColor = "hsl(170,45%,28%)"; e.target.style.boxShadow = "0 0 0 3px hsl(170,45%,28%,0.12)"; }}
                      onBlur={e  => { e.target.style.borderColor = ""; e.target.style.boxShadow = ""; }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      tabIndex={-1}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div className="rounded-xl bg-destructive/8 border border-destructive/20 px-3.5 py-2.5 fade-in">
                    <p className="text-[11px] text-destructive font-medium">{error}</p>
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 rounded-xl text-[13px] font-semibold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-60 mt-1"
                  style={{
                    background: "linear-gradient(135deg, hsl(170,50%,30%), hsl(170,45%,22%))",
                    boxShadow: "0 4px 14px hsl(170,45%,28%,0.4)",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 20px hsl(170,45%,28%,0.55)"; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 14px hsl(170,45%,28%,0.4)"; (e.currentTarget as HTMLButtonElement).style.transform = ""; }}
                >
                  {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Signing in…</> : "Sign in →"}
                </button>
              </form>
            </div>

            <p className="text-center text-[10px] text-muted-foreground/50 mt-5">
              Allocation Assist · Internal Portal · All rights reserved
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default Login;
