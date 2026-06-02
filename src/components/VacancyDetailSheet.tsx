import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserSquare, Mail, Phone, Plus, Link2, ClipboardList, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  useMatchingDoctors, useVacancyLinks,
  useLinkLeadToVacancy, useUnlinkLead,
  type Vacancy,
} from "@/hooks/use-vacancies";
import { MatchScoreChip } from "@/components/DoctorVacancyMatches";
import { DoctorLicensePills } from "@/components/DoctorLicensePills";
import { useAuth } from "@/hooks/use-auth";

interface Props {
  vacancy: Vacancy | null;
  open:    boolean;
  onClose: () => void;
}

/**
 * Phase 3 — Per-vacancy detail with TOP DOCTOR MATCHES.
 *
 * Opens when the team clicks a vacancy row. Shows the vacancy metadata at the
 * top, then the doctors ranked by the multi-signal match score (specialty +
 * license × city + training + experience + notice ↔ urgency + notes). One
 * click links the best fit; one click unlinks if it doesn't pan out.
 *
 * This is the reverse direction of the doctor → vacancies surfacing on the
 * Doctor Profiles page — same scorer, just rotated.
 */
export function VacancyDetailSheet({ vacancy, open, onClose }: Props) {
  const { user } = useAuth();
  const matches  = useMatchingDoctors(vacancy);
  const { data: existing = [] } = useVacancyLinks(vacancy?.id ?? null);
  const link   = useLinkLeadToVacancy();
  const unlink = useUnlinkLead();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!vacancy) return null;
  const linkedIds = new Set(existing.map(l => l.doctor_id));
  const strongMatches = matches.filter(m => m.score.tier === "strong");
  const decentMatches = matches.filter(m => m.score.tier === "decent");
  const weakMatches   = matches.filter(m => m.score.tier === "weak");

  const doLink = async (m: typeof matches[number]) => {
    if (!vacancy) return;
    setBusyId(m.doctor_id);
    try {
      await link.mutateAsync({
        vacancy_id:        vacancy.id,
        doctor_id:         m.doctor_id,
        doctor_name:       m.doctor_name,
        doctor_speciality: m.speciality,
        linked_by:         user?.email ?? null,
      });
      toast.success(`Linked ${m.doctor_name} to this vacancy.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Link failed");
    } finally {
      setBusyId(null);
    }
  };

  const doUnlink = async (linkId: string, name: string) => {
    setBusyId(linkId);
    try {
      await unlink.mutateAsync(linkId);
      toast.success(`Removed ${name} from this vacancy.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unlink failed");
    } finally {
      setBusyId(null);
    }
  };

  const daysOpen = Math.floor((Date.now() - new Date(vacancy.opened_at).getTime()) / 86_400_000);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[640px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-teal-600" />
            {vacancy.hospital_name}
            <Badge variant="outline" className={priorityCls(vacancy.priority)}>{vacancy.priority}</Badge>
          </SheetTitle>
          <SheetDescription className="text-[12px]">
            {vacancy.specialty} · open {daysOpen}d
            {vacancy.target_fill_days && <> · target {vacancy.target_fill_days}d</>}
            {vacancy.opened_by && <> · by {vacancy.opened_by}</>}
          </SheetDescription>
        </SheetHeader>

        {vacancy.notes && (
          <Card className="mt-3 border-amber-200 bg-amber-50/40">
            <CardContent className="py-2 px-3 text-[11px] text-amber-900">
              <span className="font-medium">Notes: </span>{vacancy.notes}
            </CardContent>
          </Card>
        )}

        {/* Currently linked candidates */}
        {existing.length > 0 && (
          <section className="mt-5">
            <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              Linked candidates · {existing.length}
            </h3>
            <div className="space-y-1.5">
              {existing.map(l => (
                <div key={l.id} className="flex items-center gap-2 rounded-md border bg-teal-50/40 border-teal-200 px-2.5 py-1.5">
                  <Link2 className="h-3 w-3 text-teal-700" />
                  <div className="flex-1 text-[12px] truncate">
                    <span className="font-medium">{l.doctor_name}</span>
                    {l.doctor_speciality && <span className="text-muted-foreground"> · {l.doctor_speciality}</span>}
                    {l.linked_by && <span className="text-[10px] text-muted-foreground"> · by {l.linked_by}</span>}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px] text-rose-600 hover:bg-rose-50"
                    disabled={busyId === l.id}
                    onClick={() => doUnlink(l.id, l.doctor_name)}
                  >
                    Unlink
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Top matches */}
        <section className="mt-5">
          <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-emerald-600" />
            Top matches · {matches.length}
            {strongMatches.length > 0 && (
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px] ml-1">
                {strongMatches.length} strong
              </Badge>
            )}
          </h3>

          {matches.length === 0 && (
            <div className="rounded-md border border-dashed py-6 text-center text-[12px] text-muted-foreground">
              No doctors match {vacancy.specialty} yet. They'll appear here as the team onboards them.
            </div>
          )}

          {strongMatches.length > 0 && (
            <MatchGroup
              label="Strong fits"
              tone="emerald"
              matches={strongMatches}
              linkedIds={linkedIds}
              busyId={busyId}
              onLink={doLink}
            />
          )}
          {decentMatches.length > 0 && (
            <MatchGroup
              label="Decent fits"
              tone="sky"
              matches={decentMatches}
              linkedIds={linkedIds}
              busyId={busyId}
              onLink={doLink}
            />
          )}
          {weakMatches.length > 0 && (
            <MatchGroup
              label="Long shots"
              tone="slate"
              matches={weakMatches.slice(0, 10)}
              linkedIds={linkedIds}
              busyId={busyId}
              onLink={doLink}
              // Only collapsible WHEN there's a stronger group above. If
              // every match landed in "weak", we render them expanded so
              // the user sees actual rows instead of just a count.
              collapsible={strongMatches.length + decentMatches.length > 0}
            />
          )}
        </section>
      </SheetContent>
    </Sheet>
  );
}

function MatchGroup({ label, tone, matches, linkedIds, busyId, onLink, collapsible = false }: {
  label:      string;
  tone:       "emerald" | "sky" | "slate";
  matches:    ReturnType<typeof useMatchingDoctors>;
  linkedIds:  Set<string>;
  busyId:     string | null;
  onLink:     (m: ReturnType<typeof useMatchingDoctors>[number]) => void;
  collapsible?: boolean;
}) {
  const [expanded, setExpanded] = useState(!collapsible);
  const toneCls = {
    emerald: "text-emerald-700",
    sky:     "text-sky-700",
    slate:   "text-slate-600",
  }[tone];

  return (
    <div className="mt-3">
      <button
        className={`text-[10px] uppercase tracking-wider font-medium ${toneCls} mb-1.5 flex items-center gap-1.5 hover:opacity-80`}
        onClick={() => collapsible && setExpanded(e => !e)}
        disabled={!collapsible}
      >
        {label} · {matches.length}
        {collapsible && <span className="text-muted-foreground">{expanded ? "▾" : "▸"}</span>}
      </button>
      {expanded && (
        <div className="space-y-1.5">
          {matches.map(m => {
            const linked = linkedIds.has(m.doctor_id);
            return (
              <div key={m.doctor_id} className="flex items-center gap-2 rounded-md border bg-white px-2.5 py-1.5">
                <UserSquare className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[12px] font-medium truncate">{m.doctor_name}</span>
                    <DoctorLicensePills
                      has_dha={m.has_dha}
                      has_doh={m.has_doh}
                      has_moh={m.has_moh}
                      license_text={m.license_text}
                      hideWhenEmpty
                    />
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate" title={m.score.factors.map(f => `${f.label} (${f.points > 0 ? "+" : ""}${f.points})`).join("  ·  ")}>
                    {m.score.summary || m.speciality}
                  </div>
                </div>
                <MatchScoreChip score={m.score} />
                {m.doctor_email && (
                  <a
                    href={`mailto:${m.doctor_email}`}
                    className="text-slate-400 hover:text-teal-600"
                    title={m.doctor_email}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Mail className="h-3 w-3" />
                  </a>
                )}
                {linked
                  ? <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200 text-[9px] uppercase tracking-wider">Linked</Badge>
                  : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] px-2"
                      disabled={busyId === m.doctor_id}
                      onClick={() => onLink(m)}
                    >
                      <Plus className="h-3 w-3 mr-0.5" /> Link
                    </Button>
                  )
                }
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function priorityCls(p: "high" | "medium" | "low"): string {
  return ({
    high:   "bg-rose-100 text-rose-700 border-rose-200",
    medium: "bg-amber-100 text-amber-700 border-amber-200",
    low:    "bg-slate-100 text-slate-700 border-slate-200",
  }[p]) + " text-[9px] uppercase tracking-wider";
}

void Phone;  // reserved for adding phone CTA next iteration
