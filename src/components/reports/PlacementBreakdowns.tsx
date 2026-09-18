/**
 * Pipeline · Region · Lifecycle panels for the Reports Overview.
 *
 * Integrated sections (not a separate insights dashboard) that read the SAME
 * placement data — the imported monthly reports + live markings — for the
 * page's selected period. Answers the stakeholder's asks: how many make it
 * through each stage, which REGION the placements are in, and the average
 * LIFECYCLE of a doctor's journey. (Specialties moved to SpecialtyTiles.)
 *
 * Styled after the Dashboard's own panels: the pipeline copies "How Doctors
 * Move Through the Process", the region list copies "Where Qualified Leads
 * Come From", and every row carries a hover card with the detail.
 */
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { MapPin, Clock, Filter } from "lucide-react";
import { usePlacementAttempts, type PlacementAttempt } from "@/hooks/use-placement-attempts";
import { resolveHospitalRegion } from "@/lib/hospital-region";
import { ts, inRange, STAGES, type DateRange, type StageTotals } from "@/lib/placement-reporting";
import { BarsSkeleton, TilesSkeleton } from "@/components/reports/Skeletons";
import { CardHead, Hint, HintTitle, HintNote } from "@/components/reports/HoverHint";

const relocatedAt = (p: PlacementAttempt) => p.relocated_at ?? p.joined_at;

const STAGE_MEANING: Record<string, string> = {
  shortlisted: "The hospital put the doctor on its shortlist.",
  interviewed: "The hospital interviewed the doctor.",
  offered:     "The hospital made an offer.",
  signed:      "The doctor signed the contract.",
  relocated:   "The doctor moved and started work (or the join was confirmed).",
  paid:        "The second-payment invoice was marked paid.",
};

/** Six-stage pipeline for the period — the "All metrics" totals as one funnel. */
export function StageFunnel({ totals, loading, word }: { totals: StageTotals; loading: boolean; word: string }) {
  const first = totals.shortlisted;
  return (
    <Card className="shadow-sm border-border/50 hover:shadow-md transition-shadow h-full" id="s-funnel">
      <CardHead
        icon={<Filter className="h-4 w-4 text-teal-600" />}
        title="How doctors move from shortlist to paid"
        info="Every total from 'All metrics' drawn as one pipeline. Hover a stage for how many made it through from the stage before."
        source="placement_attempts (distinct doctors)."
      />
      <div className="px-4 pb-4 pt-2 space-y-3">
        {loading ? <BarsSkeleton rows={6} /> : STAGES.map((s, i) => {
          const v = totals[s.key];
          const prev = i ? totals[STAGES[i - 1].key] : null;
          const pct = first ? Math.round((v / first) * 100) : 0;
          const conv = prev ? Math.round((v / prev) * 100) : null;
          return (
            <Hint key={s.key} align="start" content={
              <>
                <HintTitle>{s.label}: {v} doctor{v === 1 ? "" : "s"}</HintTitle>
                <p>{STAGE_MEANING[s.key]}</p>
                {conv != null && prev != null && (
                  <p className="mt-1"><b>{conv}%</b> of {STAGES[i - 1].label.toLowerCase()} made it here · {Math.max(0, prev - v)} didn't (yet)</p>
                )}
                <HintNote>{first ? `${pct}% of everyone shortlisted this ${word}` : `Nobody shortlisted this ${word}`}</HintNote>
              </>
            }>
              <div tabIndex={0} className="rounded-md -mx-1.5 px-1.5 py-0.5 hover:bg-muted/40 transition-colors cursor-default outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="inline-flex items-center gap-1 text-[13px] font-medium text-foreground">
                    {s.label}
                    {conv != null && <span className="text-[10px] font-normal text-muted-foreground ml-1">{conv}% from {STAGES[i - 1].label.toLowerCase()}</span>}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-semibold text-foreground tabular-nums">{v.toLocaleString()}</span>
                    <span className="text-[11px] text-muted-foreground w-8 text-right tabular-nums">{pct}%</span>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: `hsl(170, ${55 - i * 5}%, ${45 + i * 4}%)` }}
                  />
                </div>
              </div>
            </Hint>
          );
        })}
      </div>
    </Card>
  );
}

function useBreakdowns(range: DateRange) {
  const { data: all = [], isLoading } = usePlacementAttempts();
  const m = useMemo(() => {
    const inR = (iso: string | null | undefined) => inRange(ts(iso), range);
    const byCountry = new Map<string, { n: number; cities: Map<string, number> }>();
    const byCity = new Map<string, number>();
    const s2s: number[] = [], s2r: number[] = [];

    for (const p of all) {
      const reloc = relocatedAt(p);
      const active = inR(p.shortlisted_at) || inR(p.interviewed_at) || inR(p.offered_at) || inR(p.signed_at) || inR(reloc);
      if (active) {
        const reg = resolveHospitalRegion(p.hospital_name);
        const c = reg.country ?? "Unknown";
        const e = byCountry.get(c) ?? { n: 0, cities: new Map() };
        e.n++;
        if (reg.city) e.cities.set(reg.city, (e.cities.get(reg.city) ?? 0) + 1);
        byCountry.set(c, e);
        if (reg.city) byCity.set(reg.city, (byCity.get(reg.city) ?? 0) + 1);
      }
      const diff = (a: string | null, b: string | null | undefined) =>
        a && b ? (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000 : null;
      if (inR(p.signed_at)) { const d = diff(p.shortlisted_at, p.signed_at); if (d != null && d >= 0) s2s.push(d); }
      if (inR(reloc))       { const d = diff(p.signed_at, reloc);            if (d != null && d >= 0) s2r.push(d); }
    }
    const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
    const span = (xs: number[]) => (xs.length ? { min: Math.round(Math.min(...xs)), max: Math.round(Math.max(...xs)), n: xs.length } : null);
    return {
      countries: [...byCountry].sort((a, b) => b[1].n - a[1].n),
      cities:    [...byCity].sort((a, b) => b[1] - a[1]).slice(0, 12),
      avgS2S: avg(s2s), avgS2R: avg(s2r),
      spanS2S: span(s2s), spanS2R: span(s2r),
    };
  }, [all, range]);
  return { m, isLoading };
}

/** Placements by the hospital's country, with the top cities underneath. */
export function RegionCard({ range, word }: { range: DateRange; word: string }) {
  const { m, isLoading } = useBreakdowns(range);
  const max = Math.max(1, ...m.countries.map(c => c[1].n));
  return (
    <Card className="shadow-sm border-border/50 hover:shadow-md transition-shadow h-full" id="s-region">
      <CardHead
        icon={<MapPin className="h-4 w-4 text-teal-600" />}
        title="By region"
        info="Placements active in the period, by the hospital's country + city. 'Unknown' means the hospital name has no region yet — see Data quality on the Hospitals tab."
        source="placement_attempts × the hospital region map."
      />
      <div className="px-4 pb-4">
        {isLoading ? <BarsSkeleton /> : m.countries.length === 0 ? (
          <p className="py-6 text-center text-[11px] text-muted-foreground">No placements this {word}.</p>
        ) : (
          <>
            <div className="divide-y divide-border/30">
              {m.countries.map(([c, e]) => (
                <Hint key={c} align="start" content={
                  <>
                    <HintTitle>{c} · {e.n} placement{e.n === 1 ? "" : "s"}</HintTitle>
                    {c === "Unknown"
                      ? <p>Hospital names with no region yet. Map them from Data quality on the Hospitals tab.</p>
                      : e.cities.size
                        ? <p>{[...e.cities].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([city, n]) => `${city} ${n}`).join(" · ")}</p>
                        : <p className="text-muted-foreground">No city recorded.</p>}
                  </>
                }>
                  <div tabIndex={0} className="py-2 cursor-default outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-sm">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <MapPin className={`h-3.5 w-3.5 ${c === "Unknown" ? "text-amber-500" : "text-teal-600"}`} />
                        <span className="text-[13px] font-medium text-foreground">{c}</span>
                      </div>
                      <span className="text-[14px] font-semibold tabular-nums">{e.n.toLocaleString()}</span>
                    </div>
                    <div className="h-1 bg-muted/60 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${c === "Unknown" ? "bg-amber-400" : "bg-primary"}`} style={{ width: `${(e.n / max) * 100}%` }} />
                    </div>
                  </div>
                </Hint>
              ))}
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
      </div>
    </Card>
  );
}

/** Average days between stages, with the fastest / slowest on hover. */
export function LifecycleCard({ range, word }: { range: DateRange; word: string }) {
  const { m, isLoading } = useBreakdowns(range);
  const tiles: Array<{ label: string; days: number | null; hint: React.ReactNode }> = [
    { label: "Shortlist → Sign", days: m.avgS2S, hint: m.spanS2S ? <>Fastest {m.spanS2S.min} days · slowest {m.spanS2S.max} days<br />across {m.spanS2S.n} signing{m.spanS2S.n === 1 ? "" : "s"} this {word}</> : `No signings this ${word}` },
    { label: "Sign → Relocate", days: m.avgS2R, hint: m.spanS2R ? <>Fastest {m.spanS2R.min} days · slowest {m.spanS2R.max} days<br />across {m.spanS2R.n} relocation{m.spanS2R.n === 1 ? "" : "s"} this {word}</> : `No relocations this ${word}` },
    { label: "Shortlist → Relocate", days: m.avgS2S != null && m.avgS2R != null ? m.avgS2S + m.avgS2R : null, hint: "End to end: the two averages added together." },
  ];
  return (
    <Card className="shadow-sm border-border/50 hover:shadow-md transition-shadow" id="s-lifecycle">
      <CardHead
        icon={<Clock className="h-4 w-4 text-teal-600" />}
        title="Average lifecycle"
        info="How long each stage takes, for doctors who reached it in the period. Hover a tile for the fastest and slowest."
        source="placement_attempts (stage dates)."
      />
      <div className="px-4 pb-4 pt-2">
        {isLoading ? <TilesSkeleton count={3} cols="sm:grid-cols-3" /> : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {tiles.map(t => (
              <Hint key={t.label} content={<><HintTitle>{t.label}{t.days != null && `: ${t.days} days on average`}</HintTitle><p>{t.hint}</p></>}>
                <div tabIndex={0} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 cursor-default outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                  <div className="text-[22px] font-bold leading-none text-amber-800">
                    {t.days == null ? "—" : t.days}{t.days != null && <span className="text-[11px] font-normal ml-1">days</span>}
                  </div>
                  <div className="text-[9.5px] uppercase tracking-wider mt-1 text-amber-700/80">{t.label}</div>
                </div>
              </Hint>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
