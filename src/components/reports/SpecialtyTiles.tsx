/**
 * Specialties getting jobs — a tile map.
 *
 * Tile AREA is doctors placed (signed or relocated) in the selected period, so
 * the biggest specialty is simply the biggest block; shade deepens with volume.
 * Each tile carries its change vs the period before and how many roles are
 * still open for it on the vacancy list, so delivery and demand sit side by
 * side. Hover any tile for the breakdown.
 *
 * Above the tiles, three callouts answer the questions the stakeholder asks
 * first: what's placing most, what's growing, and where open roles are piling
 * up with too few placements. Below, specialties that have open roles but no
 * placements at all — they can't have a tile, so they get a chip.
 *
 * Same source as the rest of the page (placement_attempts), same counting rule
 * (distinct doctors).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Stethoscope, Trophy, TrendingUp, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlacementAttempts, type PlacementAttempt } from "@/hooks/use-placement-attempts";
import { useVacancies } from "@/hooks/use-vacancies";
import { groupSpecialty } from "@/lib/specialty-groups";
import { ts, inRange, type DateRange } from "@/lib/placement-reporting";
import { CardHead, Hint, HintTitle, HintGrid, HintNote } from "@/components/reports/HoverHint";

interface Spec {
  name:      string;
  placed:    number;
  signed:    number;
  relocated: number;
  prior:     number;
  open:      number;
  avgDays:   number | null;
  topHospital: string | null;
}

const MAX_TILES = 14;
const specOf = (raw: string | null | undefined) => (raw ? groupSpecialty(raw) || raw.trim() : null);
const relocatedAt = (p: PlacementAttempt) => p.relocated_at ?? p.joined_at;

function rollup(rows: PlacementAttempt[], range: DateRange) {
  const by = new Map<string, { placed: Set<string>; signed: Set<string>; relocated: Set<string>; days: number[]; hosp: Map<string, number> }>();
  for (const a of rows) {
    const s = specOf(a.doctor_specialty);
    if (!s) continue;
    const sg = ts(a.signed_at), rl = ts(relocatedAt(a));
    const inS = inRange(sg, range), inR = inRange(rl, range);
    if (!inS && !inR) continue;
    let e = by.get(s);
    if (!e) { e = { placed: new Set(), signed: new Set(), relocated: new Set(), days: [], hosp: new Map() }; by.set(s, e); }
    if (!e.placed.has(a.doctor_id)) e.hosp.set(a.hospital_name, (e.hosp.get(a.hospital_name) ?? 0) + 1);
    e.placed.add(a.doctor_id);
    if (inS) {
      e.signed.add(a.doctor_id);
      const sh = ts(a.shortlisted_at);
      if (sh != null && sg! >= sh) e.days.push((sg! - sh) / 86_400_000);
    }
    if (inR) e.relocated.add(a.doctor_id);
  }
  return by;
}

export function SpecialtyTiles({ range, prior, word }: { range: DateRange; prior: DateRange; word: string }) {
  const { data: rows = [], isLoading } = usePlacementAttempts();
  const { data: vacancies = [], isLoading: vl } = useVacancies();

  const { specs, unfilled, total } = useMemo(() => {
    const now = rollup(rows, range), before = rollup(rows, prior);
    const open = new Map<string, number>();
    for (const v of vacancies) {
      if (v.status !== "open") continue;
      const s = specOf(v.specialty);
      if (s) open.set(s, (open.get(s) ?? 0) + 1);
    }
    const specs: Spec[] = [...now].map(([name, e]) => ({
      name,
      placed:    e.placed.size,
      signed:    e.signed.size,
      relocated: e.relocated.size,
      prior:     before.get(name)?.placed.size ?? 0,
      open:      open.get(name) ?? 0,
      avgDays:   e.days.length ? Math.round(e.days.reduce((a, b) => a + b, 0) / e.days.length) : null,
      topHospital: [...e.hosp].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    })).sort((a, b) => b.placed - a.placed || b.open - a.open);
    const unfilled = [...open].filter(([n]) => !now.has(n)).sort((a, b) => b[1] - a[1]).slice(0, 8);
    return { specs, unfilled, total: specs.reduce((n, s) => n + s.placed, 0) };
  }, [rows, vacancies, range, prior]);

  const insights = useMemo(() => {
    const top = specs[0] ?? null;
    const rest = specs.slice(1);
    const grow = [...rest].sort((a, b) => (b.placed - b.prior) - (a.placed - a.prior))[0] ?? null;
    const gap = (s: { open: number; placed: number }) => s.open / (s.placed + 1);
    const behind = [...rest, ...unfilled.map(([name, open]) => ({ name, open, placed: 0 }))]
      .filter(s => s.open > 0).sort((a, b) => gap(b) - gap(a));
    return { top, grow: grow && grow.placed - grow.prior > 0 ? grow : null, behind: behind.slice(0, 3) };
  }, [specs, unfilled]);

  const loading = isLoading || vl;

  return (
    <Card className="shadow-sm border-border/50 hover:shadow-md transition-shadow" id="s-specialties">
      <CardHead
        icon={<Stethoscope className="h-4 w-4 text-emerald-600" />}
        title="Specialties getting jobs"
        info="Doctors signed or relocated in the selected period, grouped by specialty. Open roles come from the live vacancy list, so demand and delivery sit side by side."
        source="placement_attempts × vacancies."
        subtitle="Tile size = doctors placed · hover any tile for the full story"
      />
      <div className="px-4 pb-4 pt-2">
        {loading ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              {[0, 1, 2].map(i => <Skeleton key={i} className="h-[62px] rounded-lg" />)}
            </div>
            <Skeleton className="h-[300px] rounded-xl" />
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              <Insight
                tone="emerald" icon={<Trophy className="h-3 w-3" />} label="Top specialty"
                value={insights.top?.name ?? "—"}
                sub={insights.top ? `${insights.top.placed} placed · ${Math.round(insights.top.placed / Math.max(1, total) * 100)}% of all` : `Nothing placed this ${word}`}
                hint={insights.top ? <SpecHint s={insights.top} total={total} word={word} /> : null}
              />
              <Insight
                tone="sky" icon={<TrendingUp className="h-3 w-3" />} label="Growing fastest"
                value={insights.grow?.name ?? "—"}
                sub={insights.grow ? `+${insights.grow.placed - insights.grow.prior} on the ${word} before` : `No gains on the ${word} before`}
                hint={insights.grow ? <SpecHint s={insights.grow} total={total} word={word} /> : null}
              />
              <Insight
                tone="amber" icon={<AlertTriangle className="h-3 w-3" />} label="Falling behind"
                value={insights.behind[0]?.name ?? "—"}
                sub={insights.behind[0] ? `${insights.behind[0].open} open roles · ${insights.behind[0].placed} placed` : "Every open role is being placed against"}
                hint={insights.behind.length ? (
                  <>
                    <HintTitle>Most open roles per doctor placed</HintTitle>
                    {insights.behind.map(b => <p key={b.name}>• {b.name} — {b.open} open, {b.placed} placed</p>)}
                  </>
                ) : null}
              />
            </div>

            {specs.length === 0 ? (
              <div className="h-[200px] rounded-xl border border-dashed flex items-center justify-center text-[12px] text-muted-foreground">
                No doctors signed or relocated this {word}.
              </div>
            ) : (
              <Treemap specs={specs} total={total} word={word} />
            )}

            {unfilled.length > 0 && (
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/70">Open roles, nothing placed</span>
                {unfilled.map(([name, n]) => (
                  <Hint key={name} content={<><HintTitle>{name}</HintTitle>No doctors placed this {word}. <b className="text-amber-700">{n} open role{n === 1 ? "" : "s"}</b> on the vacancy list.</>}>
                    <span tabIndex={0} className="text-[11px] rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-slate-700 cursor-default">
                      {name} <span className="font-semibold text-amber-700">{n} open</span>
                    </span>
                  </Hint>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

const TONES = {
  emerald: { box: "bg-emerald-50 border-emerald-200", fg: "text-emerald-700" },
  sky:     { box: "bg-sky-50 border-sky-200",         fg: "text-sky-700" },
  amber:   { box: "bg-amber-50 border-amber-200",     fg: "text-amber-700" },
} as const;

function Insight({ tone, icon, label, value, sub, hint }: {
  tone: keyof typeof TONES; icon: React.ReactNode; label: string; value: string; sub: string; hint: React.ReactNode;
}) {
  const t = TONES[tone];
  return (
    <Hint content={hint}>
      <div tabIndex={0} className={`rounded-lg border px-3 py-2.5 cursor-default outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${t.box}`}>
        <div className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide ${t.fg}`}>{icon}{label}</div>
        <div className="text-[13px] font-semibold text-foreground mt-1 truncate">{value}</div>
        <div className="text-[10.5px] text-muted-foreground">{sub}</div>
      </div>
    </Hint>
  );
}

function SpecHint({ s, total, word }: { s: Spec; total: number; word: string }) {
  const d = s.placed - s.prior;
  const gap = s.open - s.placed;
  return (
    <>
      <HintTitle>{s.name}</HintTitle>
      <HintGrid rows={[
        ["Placed", <>{s.placed} <span className="font-normal text-muted-foreground">({Math.round(s.placed / Math.max(1, total) * 100)}% of all)</span></>],
        ["Signed / relocated", `${s.signed} / ${s.relocated}`],
        [`vs the ${word} before`, <span className={d > 0 ? "text-emerald-600" : d < 0 ? "text-rose-600" : ""}>{d > 0 ? `▲ +${d}` : d < 0 ? `▼ ${d}` : "no change"}</span>],
        ["Open roles now", s.open],
        ["Avg shortlist → sign", s.avgDays == null ? "—" : `${s.avgDays} days`],
      ]} />
      {(s.topHospital || gap > 0) && (
        <HintNote>
          {s.topHospital && <>Top hospital: {s.topHospital}</>}
          {s.topHospital && gap > 0 && " · "}
          {gap > 0 && <>{gap} more role{gap === 1 ? "" : "s"} open than placed</>}
        </HintNote>
      )}
    </>
  );
}

/* ── Squarified treemap ─────────────────────────────────────────────────── */

interface Rect<T> { item: T; x: number; y: number; w: number; h: number }

/** Bruls et al. squarify: lays items (area `a`) into w×h keeping tiles near-square. */
function squarify<T extends { a: number }>(items: T[], x: number, y: number, w: number, h: number): Rect<T>[] {
  const out: Rect<T>[] = [];
  let row: T[] = [];
  const rest = items.slice();
  const sum = (r: T[]) => r.reduce((n, i) => n + i.a, 0);
  const worst = (r: T[], len: number) => {
    const s = sum(r), mx = Math.max(...r.map(i => i.a)), mn = Math.min(...r.map(i => i.a));
    return Math.max((len * len * mx) / (s * s), (s * s) / (len * len * mn));
  };
  const lay = () => {
    const s = sum(row);
    if (w >= h) {
      const cw = s / h; let yy = y;
      for (const i of row) { const hh = i.a / cw; out.push({ item: i, x, y: yy, w: cw, h: hh }); yy += hh; }
      x += cw; w -= cw;
    } else {
      const rh = s / w; let xx = x;
      for (const i of row) { const ww = i.a / rh; out.push({ item: i, x: xx, y, w: ww, h: rh }); xx += ww; }
      y += rh; h -= rh;
    }
    row = [];
  };
  while (rest.length) {
    const len = Math.min(w, h), c = rest[0];
    if (!row.length || worst([...row, c], len) <= worst(row, len)) { row.push(c); rest.shift(); }
    else lay();
  }
  if (row.length) lay();
  return out;
}

function Treemap({ specs, total, word }: { specs: Spec[]; total: number; word: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Long tails become one "N more" tile so small specialties stay legible.
  const items = useMemo(() => {
    const head = specs.slice(0, MAX_TILES);
    const tail = specs.slice(MAX_TILES);
    const list: Array<Spec & { other?: Spec[] }> = [...head];
    if (tail.length) {
      list.push({
        name: `${tail.length} more`, placed: tail.reduce((n, s) => n + s.placed, 0),
        signed: tail.reduce((n, s) => n + s.signed, 0), relocated: tail.reduce((n, s) => n + s.relocated, 0),
        prior: tail.reduce((n, s) => n + s.prior, 0), open: tail.reduce((n, s) => n + s.open, 0),
        avgDays: null, topHospital: null, other: tail,
      });
    }
    return list;
  }, [specs]);

  const rects = useMemo(() => {
    if (!size.w || !size.h) return [];
    const sum = items.reduce((n, s) => n + s.placed, 0) || 1;
    return squarify(items.map(s => ({ ...s, a: (s.placed / sum) * size.w * size.h })), 0, 0, size.w, size.h);
  }, [items, size]);

  const max = Math.max(1, ...items.map(s => s.placed));

  return (
    <div ref={box} className="relative w-full h-[320px]">
      {rects.map(({ item: s, x, y, w, h }) => {
        const k = s.placed / max;
        const light = Math.round(62 - k * 32);                     // emerald scale
        const dark = light < 50;
        const small = w < 110 || h < 70, tiny = w < 64 || h < 44;
        const d = s.placed - s.prior;
        const other = s.other;
        return (
          <div
            key={s.name}
            className="absolute p-[3px]"
            style={{ left: `${(x / size.w) * 100}%`, top: `${(y / size.h) * 100}%`, width: `${(w / size.w) * 100}%`, height: `${(h / size.h) * 100}%` }}
          >
            <Hint content={other
              ? <><HintTitle>{other.length} smaller specialties</HintTitle>{other.slice(0, 8).map(o => <p key={o.name}>• {o.name} — {o.placed}</p>)}{other.length > 8 && <HintNote>+{other.length - 8} more</HintNote>}</>
              : <SpecHint s={s} total={total} word={word} />}
            >
              <div
                tabIndex={0}
                className="h-full w-full rounded-xl p-2.5 flex flex-col justify-between overflow-hidden cursor-default outline-none transition-[filter,box-shadow] duration-150 hover:brightness-105 hover:shadow-[0_0_0_2px_#fff,0_0_0_4px_hsl(var(--primary)/0.5)] focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_hsl(var(--primary)/0.5)]"
                style={{ background: `hsl(158 ${48 + k * 10}% ${light}%)`, color: dark ? "#fff" : "#064e3b" }}
              >
                {tiny ? (
                  <div className="text-[11px] font-bold tabular-nums">{s.placed}</div>
                ) : (
                  <>
                    <div className="min-w-0">
                      <div className={`${small ? "text-[10.5px]" : "text-[12.5px]"} font-semibold leading-tight truncate`}>{s.name}</div>
                      {!small && (
                        <div className="text-[10px] mt-0.5" style={{ color: dark ? "rgba(255,255,255,.82)" : "rgba(6,78,59,.75)" }}>
                          {d > 0 ? `▲ +${d}` : d < 0 ? `▼ ${d}` : "— no change"} vs before
                        </div>
                      )}
                    </div>
                    <div className="flex items-end justify-between gap-1">
                      <div className={`${small ? "text-[16px]" : "text-[28px]"} font-bold leading-none tabular-nums`}>{s.placed}</div>
                      {!small && s.open > 0 && (
                        <span className="text-[10px] rounded-full px-1.5 py-0.5 font-medium" style={{ background: dark ? "rgba(255,255,255,.18)" : "rgba(255,255,255,.6)" }}>
                          {s.open} open role{s.open === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </Hint>
          </div>
        );
      })}
    </div>
  );
}
