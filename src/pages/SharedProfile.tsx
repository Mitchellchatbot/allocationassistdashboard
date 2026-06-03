/**
 * Public doctor-profile view — Ammar 2026-06-03.
 *
 * Hospitals receive a tokenised URL in the profile_sent email. This
 * page calls the shared-profile-public edge function with the token,
 * which validates expiry + revocation + bumps the view counter, then
 * renders the doctor's profile in the same magazine layout as the
 * email — so the hospital sees a continuous brand experience from
 * inbox to web.
 *
 * No auth required. Doesn't touch Supabase directly.
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertCircle, Loader2, Mail, Phone, GraduationCap, Award, Globe, Calendar, Briefcase } from "lucide-react";
import logo from "@/assets/logo.png";

interface SharedProfile {
  doctor_id:          string;
  title?:             string | null;
  bio?:               string | null;
  area_of_interest?:  string | null;
  country_training?:  string | null;
  years_experience?:  number | null;
  nationality?:       string | null;
  age?:               number | null;
  marital_status?:    string | null;
  family_status?:     string | null;
  license?:           string | null;
  salary_expectation?: string | null;
  notice_period?:     string | null;
}

interface Meta {
  doctor_name:    string | null;
  hospital:       string | null;
  view_count:     number;
  expires_at:     string;
}

interface ApiResponse {
  ok:      boolean;
  error?:  string;
  profile?: SharedProfile | null;
  meta?:    Meta;
}

export default function SharedProfile() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [profile, setProfile] = useState<SharedProfile | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;

  useEffect(() => {
    if (!token) { setState("error"); setErrorMsg("Missing token"); return; }
    let cancelled = false;
    fetch(`${supabaseUrl}/functions/v1/shared-profile-public?token=${encodeURIComponent(token)}`)
      .then(async r => {
        const body = (await r.json().catch(() => ({}))) as ApiResponse;
        if (cancelled) return;
        if (!r.ok || !body.ok) {
          setState("error");
          setErrorMsg(body.error ?? `Could not load profile (HTTP ${r.status})`);
          return;
        }
        setProfile(body.profile ?? null);
        setMeta(body.meta ?? null);
        setState("ok");
      })
      .catch(e => {
        if (cancelled) return;
        setState("error");
        setErrorMsg(e instanceof Error ? e.message : String(e));
      });
    return () => { cancelled = true; };
  }, [token, supabaseUrl]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Branded header — mirrors the email banner so the hospital
          sees one continuous brand experience inbox → web. */}
      <header className="bg-gradient-to-br from-teal-600 to-teal-700 text-white">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Allocation Assist" className="h-8 w-auto" />
            <div>
              <div className="text-[16px] font-semibold leading-none">Allocation Assist</div>
              <div className="text-[10px] uppercase tracking-wider opacity-90 mt-1">Healthcare placement · UAE · KSA · Qatar</div>
            </div>
          </div>
          <a href="https://www.allocationassist.com" className="text-[11px] px-3 py-1.5 rounded-full border border-white/40 text-white hover:bg-white/10 transition-colors">
            allocationassist.com
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        {state === "loading" && (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading profile…
          </div>
        )}

        {state === "error" && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-8 text-center">
            <AlertCircle className="h-8 w-8 text-amber-600 mx-auto mb-3" />
            <h2 className="text-[16px] font-semibold mb-1">Profile unavailable</h2>
            <p className="text-[13px] text-muted-foreground">{errorMsg}</p>
            <p className="text-[12px] text-muted-foreground/80 mt-4">
              If you believe this is a mistake, reply to the email you received from Allocation Assist and we'll re-issue a link.
            </p>
          </div>
        )}

        {state === "ok" && profile && meta && (
          <article className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            {/* Hero — name as the magazine headline */}
            <div className="px-8 py-7 border-b border-slate-100 bg-gradient-to-b from-slate-50/50 to-white">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Doctor Profile</div>
              <h1 className="text-[28px] font-bold tracking-tight mt-2 leading-tight">{meta.doctor_name ?? "—"}</h1>
              <p className="text-[14px] text-slate-600 mt-1">
                {profile.title ?? "—"}{profile.country_training && <> · {profile.country_training} trained</>}
              </p>
            </div>

            {/* Bio */}
            {profile.bio && (
              <div className="px-8 py-6 text-[14px] leading-relaxed text-slate-700">
                {profile.bio}
              </div>
            )}

            {/* Facts grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-slate-100 border-t border-slate-100">
              <Fact icon={<Award       className="h-3.5 w-3.5 text-teal-600" />} label="Area of Interest"  value={profile.area_of_interest} />
              <Fact icon={<GraduationCap className="h-3.5 w-3.5 text-teal-600" />} label="UAE License"     value={profile.license} />
              <Fact icon={<Briefcase    className="h-3.5 w-3.5 text-teal-600" />} label="Years experience" value={profile.years_experience != null ? `${profile.years_experience}` : undefined} />
              <Fact icon={<Globe        className="h-3.5 w-3.5 text-teal-600" />} label="Nationality"      value={profile.nationality} />
              <Fact icon={<Calendar     className="h-3.5 w-3.5 text-teal-600" />} label="Age"              value={profile.age != null ? `${profile.age}` : undefined} />
              <Fact icon={<Calendar     className="h-3.5 w-3.5 text-teal-600" />} label="Marital"          value={profile.marital_status} />
              <Fact icon={<Briefcase    className="h-3.5 w-3.5 text-teal-600" />} label="Salary expectation" value={profile.salary_expectation} />
              <Fact icon={<Calendar     className="h-3.5 w-3.5 text-teal-600" />} label="Notice period"    value={profile.notice_period} />
            </div>

            {/* Footer with view metadata */}
            <div className="px-8 py-5 border-t border-slate-100 bg-slate-50/60 text-[11px] text-slate-600 leading-relaxed">
              <div>
                {meta.hospital ? <>This profile was shared with <strong>{meta.hospital}</strong>. </> : null}
                Link expires {new Date(meta.expires_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}.
              </div>
              <div className="mt-1.5">
                <strong>Allocation Assist DMCC</strong> · 2604 Reef Tower, JLT, Dubai, UAE ·{" "}
                <a href="https://www.allocationassist.com" className="text-teal-700 hover:underline">allocationassist.com</a>
              </div>
            </div>
          </article>
        )}
      </main>
    </div>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null | undefined }) {
  return (
    <div className="bg-white px-6 py-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
        {icon}{label}
      </div>
      <div className="text-[13px] text-slate-800 mt-1">{value ?? "—"}</div>
    </div>
  );
}
