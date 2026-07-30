/**
 * Placement analytics — the leadership view over placement_attempts (the
 * imported monthly reports + live markings). Unlike the KPI strip up top
 * (flow-run based, 90-day window), this reads the milestone DATES directly and
 * has its own period selector covering the full history, so the imported
 * Jan–Jul placements actually surface.
 *
 * Answers the stakeholder's asks: weekly/monthly results (shortlisted /
 * interviewed / signed / relocated), by REGION (Dubai / Abu Dhabi / … / Saudi /
 * Qatar), which HOSPITALS, which SPECIALTIES are getting jobs, and the average
 * LIFECYCLE of a doctor's journey.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, MapPin, Building2, Stethoscope, Clock, TrendingUp } from "lucide-react";
import { usePlacementAttempts, type PlacementAttempt } from "@/hooks/use-placement-attempts";
import { resolveHospitalRegion } from "@/lib/hospital-region";
import { groupSpecialty } from "@/lib/specialty-groups";

type PeriodKey = "this_month" | "last_month" | "this_year" | "all";
const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "this_year",  label: "This year" },
  { key: "all",        label: "All time" },
];

/** Inclusive-from / exclusive-to window for a period, relative to `now`. */
function periodRange(key: PeriodKey, now: Date): { from: number; to: number } {
  const y = now.getFullYear(), m = now.getMonth();
  if (key === "this_month") return { from: Date.UTC(y, m, 1), to: Date.UTC(y, m + 1, 1) };
  if (key === "last_month") return { from: Date.UTC(y, m - 1, 1), to: Date.UTC(y, m, 1) };
  if (key === "this_year")  return { from: Date.UTC(y, 0, 1), to: Date.UTC(y + 1, 0, 1) };
  return { from: 0, to: Number.MAX_SAFE_INTEGER };
}
const inRange = (iso: string | null, r: { from: number; to: number }) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= r.from && t < r.to;
};
/** "Relocated" = the explicit relocated marking, else the actual join (started). */
const relocatedAt = (p: PlacementAttempt) => (p as { relocated_at?: string | null }).relocated_at ?? p.joined_at;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function PlacementAnalytics() {
  const { data: placements = [], isLoading } = usePlacementAttempts();
  const [period, setPeriod] = useState<PeriodKey>("this_year");
  // Fixed "now" per render is fine; report data isn't second-sensitive.
  const now = useMemo(() => new Date(), []);
  const range = useMemo(() => periodRange(period, now), [period, now]);

  const m = useMemo(() => {
    const kpi = { shortlisted: 0, interviewed: 0, offered: 0, signed: 0, relocated: 0 };
    const byCountry = new Map<string, number>();
    const byCity = new Map<string, { country: string; n: number }>();
    const bySpecialty = new Map<string, number>();   // signed+relocated (jobs) by grouped specialty
    const byHospital = new Map<string, { placements: number; signed: number }>();
    const byMonth = new Map<number, { shortlisted: number; signed: number; relocated: number }>();
    let shortToSignDays = 0, shortToSignN = 0, signToJoinDays = 0, signToJoinN = 0;

    for (const p of placements) {
      const reloc = relocatedAt(p);
      // Outcome tiles + monthly trend keyed on the date that falls in-period.
      if (inRange(p.shortlisted_at, range)) kpi.shortlisted++;
      if (inRange(p.interviewed_at, range)) kpi.interviewed++;
      if (inRange(p.offered_at, range))     kpi.offered++;
      if (inRange(p.signed_at, range))      kpi.signed++;
      if (inRange(reloc, range))            kpi.relocated++;

      const reg = resolveHospitalRegion(p.hospital_name);
      // A placement "belongs" to the period if ANY of its milestones is in it.
      const active = inRange(p.shortlisted_at, range) || inRange(p.interviewed_at, range)
        || inRange(p.offered_at, range) || inRange(p.signed_at, range) || inRange(reloc, range);
      if (active) {
        const country = reg.country ?? "Unknown";
        byCountry.set(country, (byCountry.get(country) ?? 0) + 1);
        if (reg.city) {
          const c = byCity.get(reg.city) ?? { country, n: 0 };
          c.n++; byCity.set(reg.city, c);
        }
        const h = byHospital.get(reg.hospital) ?? { placements: 0, signed: 0 };
        h.placements++; if (p.signed_at) h.signed++;
        byHospital.set(reg.hospital, h);
      }
      // "Getting jobs" = signed OR relocated in period, by specialty.
      if ((inRange(p.signed_at, range) || inRange(reloc, range)) && p.doctor_specialty) {
        const g = groupSpecialty(p.doctor_specialty) || p.doctor_specialty;
        bySpecialty.set(g, (bySpecialty.get(g) ?? 0) + 1);
      }
      // Monthly trend (within period): by the milestone month.
      const bump = (iso: string | null, k: "shortlisted" | "signed" | "relocated") => {
        if (!inRange(iso, range) || !iso) return;
        const mo = new Date(iso).getUTCMonth();
        const row = byMonth.get(mo) ?? { shortlisted: 0, signed: 0, relocated: 0 };
        row[k]++; byMonth.set(mo, row);
      };
      bump(p.shortlisted_at, "shortlisted"); bump(p.signed_at, "signed"); bump(reloc, "relocated");
      // Lifecycle: only when both ends fall in the period.
      const days = (a: string | null, b: string | null) =>
        a && b ? (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000 : null;
      if (inRange(p.signed_at, range)) {
        const d1 = days(p.shortlisted_at, p.signed_at);
        if (d1 != null && d1 >= 0) { shortToSignDays += d1; shortToSignN++; }
      }
      if (inRange(reloc, range)) {
        const d2 = days(p.signed_at, reloc);
        if (d2 != null && d2 >= 0) { signToJoinDays += d2; signToJoinN++; }
      }
    }
    return {
      kpi,
      countries: [...byCountry].sort((a, b) => b[1] - a[1]),
      cities:    [...byCity].sort((a, b) => b[1].n - a[1].n),
      specialties: [...bySpecialty].sort((a, b) => b[1] - a[1]).slice(0, 12),
      hospitals: [...byHospital].sort((a, b) => b[1].placements - a[1].placements).slice(0, 12),
      months:    [...byMonth].sort((a, b) => a[0] - b[0]),
      avgShortToSign: shortToSignN ? Math.round(shortToSignDays / shortToSignN) : null,
      avgSignToJoin:  signToJoinN ? Math.round(signToJoinDays / signToJoinN) : null,
      total: placements.length,
    };
  }, [placements, range]);

  const maxCountry = Math.max(1, ...m.countries.map(c => c[1]));
  const maxSpecialty = Math.max(1, ...m.specialties.map(s => s[1]));
  const maxHosp = Math.max(1, ...m.hospitals.map(h => h[1].placements));
  const maxMonth = Math.max(1, ...m.months.map(([, r]) => Math.max(r.shortlisted, r.signed, r.relocated)));

  return (
    <Card className="border-teal-200">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-teal-600" /> Placement results
            </CardTitle>
            <CardDescription className="text-[11px]">
              From every recorded placement ({m.total.toLocaleString()} total) — shortlisted → interviewed → signed → relocated, by region, hospital, specialty and lifecycle.
            </CardDescription>
          </div>
          <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
            {PERIODS.map(p => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                  period === p.key ? "bg-teal-600 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
              >{p.label}</button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="py-10 text-center text-[12px] text-muted-foreground">Loading placements…</div>
        ) : (
          <>
            {/* Outcome tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <Tile label="Shortlisted" value={m.kpi.shortlisted} tone="sky" />
              <Tile label="Interviewed" value={m.kpi.interviewed} tone="indigo" />
              <Tile label="Offered"     value={m.kpi.offered} tone="violet" />
              <Tile label="Signed"      value={m.kpi.signed} tone="emerald" />
              <Tile label="Relocated"   value={m.kpi.relocated} tone="teal" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Region */}
              <Section icon={<MapPin className="h-3.5 w-3.5 text-teal-600" />} title="By region">
                {m.countries.length === 0 ? <Empty /> : m.countries.map(([c, n]) => (
                  <BarRow key={c} label={c} value={n} max={maxCountry} />
                ))}
                {m.cities.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap gap-1.5">
                    {m.cities.slice(0, 10).map(([city, v]) => (
                      <span key={city} className="text-[10px] rounded-full bg-slate-100 text-slate-600 px-2 py-0.5">{city} · {v.n}</span>
                    ))}
                  </div>
                )}
              </Section>

              {/* Specialties */}
              <Section icon={<Stethoscope className="h-3.5 w-3.5 text-teal-600" />} title="Specialties getting jobs" hint="signed or relocated">
                {m.specialties.length === 0 ? <Empty /> : m.specialties.map(([s, n]) => (
                  <BarRow key={s} label={s} value={n} max={maxSpecialty} tone="emerald" />
                ))}
              </Section>

              {/* Hospitals */}
              <Section icon={<Building2 className="h-3.5 w-3.5 text-teal-600" />} title="Top hospitals" hint="by placements">
                {m.hospitals.length === 0 ? <Empty /> : m.hospitals.map(([h, v]) => (
                  <BarRow key={h} label={h} value={v.placements} max={maxHosp} sub={v.signed ? `${v.signed} signed` : undefined} />
                ))}
              </Section>

              {/* Lifecycle + monthly trend */}
              <Section icon={<Clock className="h-3.5 w-3.5 text-teal-600" />} title="Average lifecycle & trend">
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <Tile label="Shortlist → Sign" value={m.avgShortToSign ?? 0} suffix="days" tone="amber" small />
                  <Tile label="Sign → Relocate" value={m.avgSignToJoin ?? 0} suffix="days" tone="amber" small />
                </div>
                <div className="flex items-end gap-1 h-24">
                  {m.months.map(([mo, r]) => (
                    <div key={mo} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full flex items-end justify-center gap-[2px] h-20">
                        <span className="w-1.5 rounded-t bg-sky-400" style={{ height: `${(r.shortlisted / maxMonth) * 100}%` }} title={`${r.shortlisted} shortlisted`} />
                        <span className="w-1.5 rounded-t bg-emerald-500" style={{ height: `${(r.signed / maxMonth) * 100}%` }} title={`${r.signed} signed`} />
                        <span className="w-1.5 rounded-t bg-teal-500" style={{ height: `${(r.relocated / maxMonth) * 100}%` }} title={`${r.relocated} relocated`} />
                      </div>
                      <span className="text-[9px] text-muted-foreground">{MONTHS[mo]}</span>
                    </div>
                  ))}
                  {m.months.length === 0 && <Empty />}
                </div>
                <div className="flex items-center gap-3 mt-1 text-[9px] text-muted-foreground">
                  <Legend color="bg-sky-400" label="Shortlisted" />
                  <Legend color="bg-emerald-500" label="Signed" />
                  <Legend color="bg-teal-500" label="Relocated" />
                </div>
              </Section>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

const TONES: Record<string, string> = {
  sky: "bg-sky-50 text-sky-700 border-sky-200",
  indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
  violet: "bg-violet-50 text-violet-700 border-violet-200",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  teal: "bg-teal-50 text-teal-700 border-teal-200",
  amber: "bg-amber-50 text-amber-800 border-amber-200",
};
function Tile({ label, value, tone, suffix, small }: { label: string; value: number; tone: string; suffix?: string; small?: boolean }) {
  return (
    <div className={`rounded-lg border px-2.5 py-2 ${TONES[tone]}`}>
      <div className={`font-semibold leading-none ${small ? "text-[18px]" : "text-[22px]"}`}>{value.toLocaleString()}{suffix && <span className="text-[11px] font-normal ml-1">{suffix}</span>}</div>
      <div className="text-[9.5px] uppercase tracking-wider mt-1 opacity-80">{label}</div>
    </div>
  );
}
function Section({ icon, title, hint, children }: { icon: ReactNode; title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-center gap-1.5 mb-2.5">
        {icon}
        <span className="text-[12px] font-semibold text-slate-700">{title}</span>
        {hint && <span className="text-[10px] text-muted-foreground">· {hint}</span>}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}
function BarRow({ label, value, max, sub, tone = "teal" }: { label: string; value: number; max: number; sub?: string; tone?: string }) {
  const barColor = tone === "emerald" ? "bg-emerald-500" : "bg-teal-500";
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-slate-600 w-[42%] truncate" title={label}>{label}</span>
      <div className="flex-1 h-4 rounded bg-slate-100 overflow-hidden">
        <div className={`h-full ${barColor} rounded`} style={{ width: `${Math.max(4, (value / max) * 100)}%` }} />
      </div>
      <span className="text-[11px] font-medium text-slate-700 w-9 text-right tabular-nums">{value}</span>
      {sub && <span className="text-[9px] text-emerald-600 w-14 text-right">{sub}</span>}
    </div>
  );
}
function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1"><span className={`inline-block h-2 w-2 rounded-sm ${color}`} />{label}</span>;
}
function Empty() { return <div className="text-[11px] text-muted-foreground py-2">No data in this period.</div>; }
