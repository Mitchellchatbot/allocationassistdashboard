/**
 * Open vacancies at a glance on the Reports page — total open, by priority,
 * top specialties with openings, and by region (via the hospital normalizer),
 * with a link to the full /vacancies list. Answers the stakeholder's "vacancy
 * lists" ask without duplicating the dedicated page.
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Briefcase, ExternalLink } from "lucide-react";
import { useVacancies } from "@/hooks/use-vacancies";
import { resolveHospitalRegion } from "@/lib/hospital-region";
import { groupSpecialty } from "@/lib/specialty-groups";

export function VacanciesSummary() {
  const { data: vacancies = [], isLoading } = useVacancies();
  const navigate = useNavigate();

  const m = useMemo(() => {
    const open = vacancies.filter(v => v.status === "open");
    const bySpec = new Map<string, number>();
    const byRegion = new Map<string, number>();
    const priority = { high: 0, medium: 0, low: 0 };
    for (const v of open) {
      const g = groupSpecialty(v.specialty) || v.specialty || "—";
      bySpec.set(g, (bySpec.get(g) ?? 0) + 1);
      const c = resolveHospitalRegion(v.hospital_name).country ?? "Unknown";
      byRegion.set(c, (byRegion.get(c) ?? 0) + 1);
      if (v.priority === "high") priority.high++;
      else if (v.priority === "low") priority.low++;
      else priority.medium++;
    }
    return {
      total: open.length,
      specs: [...bySpec].sort((a, b) => b[1] - a[1]).slice(0, 12),
      regions: [...byRegion].sort((a, b) => b[1] - a[1]),
      priority,
    };
  }, [vacancies]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2"><Briefcase className="h-4 w-4 text-teal-600" /> Open vacancies</CardTitle>
            <CardDescription className="text-[11px]">Roles currently open — what the team is recruiting for.</CardDescription>
          </div>
          <button
            onClick={() => navigate("/vacancies")}
            className="inline-flex items-center gap-1 text-[11px] text-teal-700 hover:underline"
          >
            View all <ExternalLink className="h-3 w-3" />
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-6 text-center text-[11px] text-muted-foreground">Loading…</div>
        ) : m.total === 0 ? (
          <div className="py-6 text-center text-[11px] text-muted-foreground">No open vacancies right now.</div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[26px] font-bold leading-none text-slate-900 tabular-nums">{m.total}</span>
              <span className="text-[11px] text-muted-foreground">open</span>
              <div className="flex items-center gap-1.5 ml-1">
                {m.priority.high > 0   && <Chip cls="bg-rose-50 text-rose-700 border-rose-200">{m.priority.high} high</Chip>}
                {m.priority.medium > 0 && <Chip cls="bg-amber-50 text-amber-700 border-amber-200">{m.priority.medium} medium</Chip>}
                {m.priority.low > 0    && <Chip cls="bg-slate-50 text-slate-600 border-slate-200">{m.priority.low} low</Chip>}
              </div>
              <div className="flex items-center gap-1.5 ml-auto flex-wrap">
                {m.regions.map(([c, n]) => <Chip key={c} cls="bg-teal-50 text-teal-700 border-teal-200">{c} · {n}</Chip>)}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">By specialty</div>
              <div className="flex flex-wrap gap-1.5">
                {m.specs.map(([s, n]) => (
                  <span key={s} className="text-[11px] rounded-md border border-slate-200 bg-slate-50/60 px-2 py-0.5 text-slate-700">
                    {s} <span className="font-semibold text-slate-900">{n}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Chip({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={`text-[9.5px] rounded-full border px-1.5 py-0.5 font-medium ${cls}`}>{children}</span>;
}
