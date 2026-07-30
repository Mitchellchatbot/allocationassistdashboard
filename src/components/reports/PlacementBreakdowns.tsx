/**
 * Region · Specialties · Lifecycle breakdowns for the Reports page.
 *
 * Integrated sections (not a separate insights dashboard) that read the SAME
 * unified placement data — the imported monthly reports + live markings — and
 * respect the page's date filter + hospital/specialty filters. Answers the
 * stakeholder's asks: which REGION, which SPECIALTIES are getting jobs, and the
 * average LIFECYCLE of a doctor's journey.
 */
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { MapPin, Stethoscope, Clock, Building2 } from "lucide-react";
import { usePlacementAttempts, type PlacementAttempt } from "@/hooks/use-placement-attempts";
import { resolveHospitalRegion } from "@/lib/hospital-region";
import { groupSpecialty } from "@/lib/specialty-groups";

interface Props {
  range:      { from: Date; to: Date };
  hospital?:  string | null;
  specialty?: string | null;
}

const relocatedAt = (p: PlacementAttempt) => p.relocated_at ?? p.joined_at;

export function PlacementBreakdowns({ range, hospital, specialty }: Props) {
  const { data: all = [], isLoading } = usePlacementAttempts();

  const m = useMemo(() => {
    const from = range.from.getTime();
    const to   = range.to.getTime() + 86_400_000;   // inclusive end-of-day
    const inR = (iso: string | null | undefined) => {
      if (!iso) return false;
      const t = new Date(iso).getTime();
      return !isNaN(t) && t >= from && t < to;
    };
    const rows = all.filter(a => {
      if (hospital && !(a.hospital_name ?? "").toLowerCase().includes(hospital.toLowerCase())) return false;
      if (specialty && !(a.doctor_specialty ?? "").toLowerCase().includes(specialty.toLowerCase())) return false;
      return true;
    });

    const byCountry = new Map<string, number>();
    const byCity = new Map<string, number>();
    const byHospital = new Map<string, { placements: number; signed: number }>();
    const bySpecialty = new Map<string, number>();
    let s2sDays = 0, s2sN = 0, s2rDays = 0, s2rN = 0;

    for (const p of rows) {
      const reloc = relocatedAt(p);
      const active = inR(p.shortlisted_at) || inR(p.interviewed_at) || inR(p.offered_at) || inR(p.signed_at) || inR(reloc);
      if (active) {
        const reg = resolveHospitalRegion(p.hospital_name);
        byCountry.set(reg.country ?? "Unknown", (byCountry.get(reg.country ?? "Unknown") ?? 0) + 1);
        if (reg.city) byCity.set(reg.city, (byCity.get(reg.city) ?? 0) + 1);
        const h = byHospital.get(reg.hospital) ?? { placements: 0, signed: 0 };
        h.placements++; if (inR(p.signed_at)) h.signed++;
        byHospital.set(reg.hospital, h);
      }
      if ((inR(p.signed_at) || inR(reloc)) && p.doctor_specialty) {
        const g = groupSpecialty(p.doctor_specialty) || p.doctor_specialty;
        bySpecialty.set(g, (bySpecialty.get(g) ?? 0) + 1);
      }
      const diff = (a: string | null, b: string | null | undefined) =>
        a && b ? (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000 : null;
      if (inR(p.signed_at)) { const d = diff(p.shortlisted_at, p.signed_at); if (d != null && d >= 0) { s2sDays += d; s2sN++; } }
      if (inR(reloc))       { const d = diff(p.signed_at, reloc);            if (d != null && d >= 0) { s2rDays += d; s2rN++; } }
    }
    return {
      countries: [...byCountry].sort((a, b) => b[1] - a[1]),
      cities:    [...byCity].sort((a, b) => b[1] - a[1]).slice(0, 12),
      hospitals: [...byHospital].sort((a, b) => b[1].placements - a[1].placements).slice(0, 12),
      specialties: [...bySpecialty].sort((a, b) => b[1] - a[1]).slice(0, 12),
      avgS2S: s2sN ? Math.round(s2sDays / s2sN) : null,
      avgS2R: s2rN ? Math.round(s2rDays / s2rN) : null,
    };
  }, [all, range, hospital, specialty]);

  const maxCountry = Math.max(1, ...m.countries.map(c => c[1]));
  const maxSpec = Math.max(1, ...m.specialties.map(s => s[1]));
  const maxHosp = Math.max(1, ...m.hospitals.map(h => h[1].placements));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Region */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4 text-teal-600" /> By region</CardTitle>
          <CardDescription className="text-[11px]">Placements active in the window, by the hospital's country + city.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? <Loading /> : m.countries.length === 0 ? <Empty /> : (
            <>
              <div className="space-y-1.5">
                {m.countries.map(([c, n]) => <Bar key={c} label={c} value={n} max={maxCountry} />)}
              </div>
              {m.cities.length > 0 && (
                <div className="mt-3 pt-2 border-t border-slate-100 flex flex-wrap gap-1.5">
                  {m.cities.map(([city, n]) => (
                    <span key={city} className="text-[10px] rounded-full bg-slate-100 text-slate-600 px-2 py-0.5">{city} · {n}</span>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Specialties */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Stethoscope className="h-4 w-4 text-teal-600" /> Specialties getting jobs</CardTitle>
          <CardDescription className="text-[11px]">Doctors signed or relocated in the window, by specialty.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? <Loading /> : m.specialties.length === 0 ? <Empty /> : (
            <div className="space-y-1.5">
              {m.specialties.map(([s, n]) => <Bar key={s} label={s} value={n} max={maxSpec} tone="emerald" />)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Which hospitals */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4 text-teal-600" /> Which hospitals</CardTitle>
          <CardDescription className="text-[11px]">Placements active in the window, by hospital (clean names — includes the imported reports).</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? <Loading /> : m.hospitals.length === 0 ? <Empty /> : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
              {m.hospitals.map(([h, v]) => <Bar key={h} label={h} value={v.placements} max={maxHosp} sub={v.signed ? `${v.signed} signed` : undefined} />)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lifecycle */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4 text-teal-600" /> Average lifecycle</CardTitle>
          <CardDescription className="text-[11px]">How long each stage takes, for doctors who reached it in the window.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <LifeTile label="Shortlist → Sign" days={m.avgS2S} />
            <LifeTile label="Sign → Relocate" days={m.avgS2R} />
            <LifeTile label="Shortlist → Relocate" days={m.avgS2S != null && m.avgS2R != null ? m.avgS2S + m.avgS2R : null} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Bar({ label, value, max, tone = "teal", sub }: { label: string; value: number; max: number; tone?: string; sub?: string }) {
  const color = tone === "emerald" ? "bg-emerald-500" : "bg-teal-500";
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-slate-600 w-[44%] truncate" title={label}>{label}</span>
      <div className="flex-1 h-4 rounded bg-slate-100 overflow-hidden">
        <div className={`h-full ${color} rounded`} style={{ width: `${Math.max(4, (value / max) * 100)}%` }} />
      </div>
      <span className="text-[11px] font-medium text-slate-700 w-8 text-right tabular-nums">{value}</span>
      {sub && <span className="text-[9px] text-emerald-600 w-14 text-right shrink-0">{sub}</span>}
    </div>
  );
}
function LifeTile({ label, days }: { label: string; days: number | null }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
      <div className="text-[22px] font-bold leading-none text-amber-800">
        {days == null ? "—" : days}{days != null && <span className="text-[11px] font-normal ml-1">days</span>}
      </div>
      <div className="text-[9.5px] uppercase tracking-wider mt-1 text-amber-700/80">{label}</div>
    </div>
  );
}
function Loading() { return <div className="py-6 text-center text-[11px] text-muted-foreground">Loading…</div>; }
function Empty() { return <div className="py-6 text-center text-[11px] text-muted-foreground">No placements in this window.</div>; }
