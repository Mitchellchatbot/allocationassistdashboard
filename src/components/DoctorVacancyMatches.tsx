import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Plus, Link2, X, ClipboardList, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import {
  useMatchingVacancies, useVacancyLinksByDoctor,
  useLinkLeadToVacancy, useUnlinkLead,
  type Vacancy,
} from "@/hooks/use-vacancies";
import type { MatchScore } from "@/lib/match-score";
import { useAuth } from "@/hooks/use-auth";

interface Props {
  doctorId:        string;
  doctorName:      string;
  doctorSpeciality: string | null | undefined;
}

/**
 * Phase 3 — Cross-team visibility on the doctor profile.
 *
 * Surfaces, ranked by the multi-signal match scorer:
 *   - Vacancies the doctor is already linked to (with unlink).
 *   - Suggestions ranked by score, with a tooltip explaining why.
 *   - One-click "Link to vacancy" for any match not already linked.
 *
 * Now scores on specialty + license × region + training + experience + notice
 * vs priority + notes-keyword overlap, not just specialty fuzzy match.
 */
export function DoctorVacancyMatches({ doctorId, doctorName, doctorSpeciality }: Props) {
  const { user } = useAuth();
  const scored = useMatchingVacancies(doctorId);
  const { data: linked = [] } = useVacancyLinksByDoctor(doctorId);
  const link   = useLinkLeadToVacancy();
  const unlink = useUnlinkLead();
  const [busyId, setBusyId] = useState<string | null>(null);

  const linkedIds = new Set(linked.map(l => l.vacancy_id));
  const unlinked = scored.filter(s => !linkedIds.has(s.vacancy.id));
  const strongCount = unlinked.filter(s => s.score.tier === "strong").length;

  if (linked.length === 0 && unlinked.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-3 px-4 flex items-center gap-2 text-[11px] text-muted-foreground">
          <ClipboardList className="h-3.5 w-3.5" />
          {doctorSpeciality
            ? <>No open vacancies match <span className="font-medium text-slate-700">{doctorSpeciality}</span>.</>
            : "Set a specialty to see matching vacancies."}
          <Link to="/vacancies" className="ml-auto text-teal-600 hover:underline">View all →</Link>
        </CardContent>
      </Card>
    );
  }

  const doLink = async (v: Vacancy) => {
    setBusyId(v.id);
    try {
      await link.mutateAsync({
        vacancy_id:        v.id,
        doctor_id:         doctorId,
        doctor_name:       doctorName,
        doctor_speciality: doctorSpeciality ?? null,
        linked_by:         user?.email ?? null,
      });
      toast.success(`Linked ${doctorName} to ${v.hospital_name} vacancy.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Link failed");
    } finally {
      setBusyId(null);
    }
  };

  const doUnlink = async (linkId: string, label: string) => {
    setBusyId(linkId);
    try {
      await unlink.mutateAsync(linkId);
      toast.success(`Removed ${label} link.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unlink failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardContent className="py-3 px-4 space-y-2">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-3.5 w-3.5 text-teal-600" />
          <span className="text-[12px] font-medium">Vacancy matches</span>
          {strongCount > 0 && (
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px] uppercase tracking-wider">
              <Sparkles className="h-2.5 w-2.5 mr-0.5" /> {strongCount} strong
            </Badge>
          )}
          <Link to="/vacancies" className="ml-auto text-[10px] text-muted-foreground hover:text-teal-600">View all →</Link>
        </div>

        {linked.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Linked</div>
            {linked.map(l => (
              <div key={l.id} className="flex items-center gap-2 rounded-md border bg-teal-50/40 border-teal-200 px-2.5 py-1.5">
                <Link2 className="h-3 w-3 text-teal-700" />
                <div className="flex-1 text-[11px] truncate">
                  <span className="font-medium">{l.vacancy?.hospital_name ?? "(deleted hospital)"}</span>
                  {l.vacancy && <> · {l.vacancy.specialty}</>}
                </div>
                {l.vacancy && <PriorityChip priority={l.vacancy.priority} />}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-rose-500 hover:bg-rose-50"
                  disabled={busyId === l.id}
                  onClick={() => doUnlink(l.id, l.vacancy?.hospital_name ?? "vacancy")}
                  title="Unlink"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {unlinked.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {linked.length > 0 ? "Other matches" : "Suggestions"}
              <span className="ml-1 text-muted-foreground/60">· ranked by specialty + license + training + experience</span>
            </div>
            {unlinked.map(s => (
              <ScoredVacancyRow
                key={s.vacancy.id}
                vacancy={s.vacancy}
                score={s.score}
                disabled={busyId === s.vacancy.id}
                onLink={() => doLink(s.vacancy)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ScoredVacancyRow({ vacancy, score, disabled, onLink }: {
  vacancy: Vacancy;
  score: MatchScore;
  disabled: boolean;
  onLink: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-white px-2.5 py-1.5">
      <Building2 className="h-3 w-3 text-slate-400" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium truncate">{vacancy.hospital_name}</span>
          <span className="text-[11px] text-muted-foreground">· {vacancy.specialty}</span>
        </div>
        <div className="text-[10px] text-muted-foreground truncate" title={score.factors.map(f => `${f.label} (${f.points > 0 ? "+" : ""}${f.points})`).join("  ·  ")}>
          {score.summary || "Specialty match"}
        </div>
      </div>
      <MatchScoreChip score={score} />
      <PriorityChip priority={vacancy.priority} />
      <Button
        size="sm"
        variant="outline"
        className="h-6 text-[10px] px-2"
        disabled={disabled}
        onClick={onLink}
      >
        <Plus className="h-3 w-3 mr-0.5" /> Link
      </Button>
    </div>
  );
}

export function MatchScoreChip({ score }: { score: MatchScore }) {
  const cls =
    score.tier === "strong" ? "bg-emerald-100 text-emerald-800 border-emerald-200" :
    score.tier === "decent" ? "bg-sky-100      text-sky-800      border-sky-200"      :
                              "bg-slate-100    text-slate-700    border-slate-200";
  const tooltip = score.factors
    .map(f => `${f.label} (${f.points > 0 ? "+" : ""}${f.points})`)
    .join("\n");
  return (
    <Badge
      variant="outline"
      className={`${cls} text-[9px] uppercase tracking-wider tabular-nums`}
      title={tooltip}
    >
      {score.pct}
    </Badge>
  );
}

function PriorityChip({ priority }: { priority: "high" | "medium" | "low" }) {
  const cls = {
    high:   "bg-rose-100 text-rose-700 border-rose-200",
    medium: "bg-amber-100 text-amber-700 border-amber-200",
    low:    "bg-slate-100 text-slate-700 border-slate-200",
  }[priority];
  return <Badge variant="outline" className={`${cls} text-[9px] uppercase tracking-wider`}>{priority}</Badge>;
}
