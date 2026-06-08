/**
 * "My vacancies" for My Workspace — enriched over the old plain list:
 *   - Each row shows a strong-match badge counted from the same scorer
 *     VacancyDetailSheet uses (useMatchingDoctors → tier === "strong").
 *   - Clicking a row opens the VacancyDetailSheet in-place instead of
 *     routing away to /vacancies — same sheet the Vacancies page uses.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CardListSkeleton } from "@/components/ui/data-skeleton";
import { statusClasses } from "@/lib/status-colors";
import { ClipboardList, ChevronRight, Sparkles } from "lucide-react";
import { useMatchingDoctors, type Vacancy } from "@/hooks/use-vacancies";
import { VacancyDetailSheet } from "@/components/VacancyDetailSheet";
import { relativeAge } from "@/components/workspace/workspace-time";

export function MyVacanciesCard({ vacancies, isLoading }: {
  vacancies: Vacancy[];
  isLoading: boolean;
}) {
  const navigate = useNavigate();
  const [openVacancy, setOpenVacancy] = useState<Vacancy | null>(null);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-orange-600" />
          My vacancies
        </CardTitle>
        <CardDescription className="text-[11px] mt-1">
          Open roles you logged, or hospitals you own. Click for ranked doctor matches.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading && <div className="px-4"><CardListSkeleton rows={3} /></div>}
        {!isLoading && vacancies.length === 0 && (
          <EmptyState
            icon={ClipboardList}
            title="No open vacancies"
            body="When a hospital you own has an open role, it'll show up here."
            size="sm"
            action={<Button size="sm" variant="outline" onClick={() => navigate("/vacancies")}>Open Vacancies</Button>}
          />
        )}
        {!isLoading && vacancies.length > 0 && (
          <div className="divide-y divide-border/40 max-h-[420px] overflow-y-auto">
            {vacancies.map(v => (
              <VacancyRow key={v.id} v={v} onOpen={() => setOpenVacancy(v)} />
            ))}
          </div>
        )}
      </CardContent>

      <VacancyDetailSheet
        vacancy={openVacancy}
        open={!!openVacancy}
        onClose={() => setOpenVacancy(null)}
      />
    </Card>
  );
}

function VacancyRow({ v, onOpen }: { v: Vacancy; onOpen: () => void }) {
  // Same scorer as VacancyDetailSheet — count the strong tier so the team
  // can see at a glance which open roles already have a great fit waiting.
  const matches = useMatchingDoctors(v);
  const strong = matches.filter(m => m.score.tier === "strong").length;
  return (
    <button
      onClick={onOpen}
      className="w-full px-3 py-2 flex items-center gap-3 text-left hover:bg-slate-50 transition-colors"
    >
      <ClipboardList className="h-3.5 w-3.5 text-slate-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium truncate flex items-center gap-1.5">
          {v.hospital_name} · {v.specialty}
          {strong > 0 && (
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px] uppercase tracking-wider">
              <Sparkles className="h-2.5 w-2.5 mr-0.5" /> {strong} strong
            </Badge>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground truncate">
          <Badge variant="outline" className={`text-[9px] uppercase tracking-wider mr-1.5 ${statusClasses(v.priority)}`}>
            {v.priority}
          </Badge>
          opened {relativeAge(v.opened_at)}
        </div>
      </div>
      <ChevronRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />
    </button>
  );
}
