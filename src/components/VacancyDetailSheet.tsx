import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserSquare, Mail, Phone, Plus, Link2, ClipboardList, Sparkles, Inbox, Pencil, Save, X } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  useMatchingDoctors, useVacancyLinks,
  useLinkLeadToVacancy, useUnlinkLead, useUpdateVacancy,
  type Vacancy, type VacancyStatus, type VacancyPriority,
} from "@/hooks/use-vacancies";
import { useHospitals } from "@/hooks/use-hospitals";
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
interface EditForm {
  hospital_id:      string;
  hospital_name:    string;
  specialty:        string;
  priority:         VacancyPriority;
  status:           VacancyStatus;
  target_fill_days: string;
  notes:            string;
}

export function VacancyDetailSheet({ vacancy, open, onClose }: Props) {
  const { user } = useAuth();
  const matches  = useMatchingDoctors(vacancy);
  const { data: existing = [] } = useVacancyLinks(vacancy?.id ?? null);
  const { data: hospitals = [] } = useHospitals();
  const link   = useLinkLeadToVacancy();
  const unlink = useUnlinkLead();
  const update = useUpdateVacancy();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [form, setForm]       = useState<EditForm | null>(null);

  // Drop out of edit mode whenever the sheet switches to a different vacancy
  // (or closes) so edits never bleed across rows.
  useEffect(() => { setEditing(false); }, [vacancy?.id, open]);

  if (!vacancy) return null;

  const startEdit = () => {
    setForm({
      hospital_id:      vacancy.hospital_id ?? "",
      hospital_name:    vacancy.hospital_name ?? "",
      specialty:        vacancy.specialty ?? "",
      priority:         vacancy.priority,
      status:           vacancy.status,
      target_fill_days: vacancy.target_fill_days != null ? String(vacancy.target_fill_days) : "",
      notes:            vacancy.notes ?? "",
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!form) return;
    if (!form.hospital_name.trim() || !form.specialty.trim()) {
      toast.error("Hospital and specialty are required.");
      return;
    }
    setSaving(true);
    try {
      await update.mutateAsync({
        id: vacancy.id,
        patch: {
          hospital_id:      form.hospital_id || null,
          hospital_name:    form.hospital_name.trim(),
          specialty:        form.specialty.trim(),
          priority:         form.priority,
          status:           form.status,
          target_fill_days: form.target_fill_days.trim() ? Number(form.target_fill_days) : null,
          notes:            form.notes.trim() || null,
        },
      });
      toast.success("Vacancy updated.");
      setEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };
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

        {!editing && (
          <div className="mt-2 flex justify-end">
            <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={startEdit}>
              <Pencil className="h-3 w-3 mr-1.5" /> Edit details
            </Button>
          </div>
        )}

        {editing && form && (
          <Card className="mt-3 border-teal-300 ring-1 ring-teal-100">
            <CardContent className="py-3 px-3 space-y-3">
              <div className="text-[10px] uppercase tracking-wider text-teal-700 font-semibold">Edit vacancy</div>

              <div className="space-y-1">
                <Label className="text-[11px]">Hospital</Label>
                <Select
                  value={form.hospital_id}
                  onValueChange={(v) => { const h = hospitals.find(x => x.id === v); setForm(f => f && ({ ...f, hospital_id: v, hospital_name: h?.name ?? f.hospital_name })); }}
                >
                  <SelectTrigger className="h-9 text-[12px]"><SelectValue placeholder="— pick a hospital —" /></SelectTrigger>
                  <SelectContent>
                    {hospitals.map(h => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input
                  value={form.hospital_name}
                  onChange={(e) => setForm(f => f && ({ ...f, hospital_name: e.target.value }))}
                  placeholder="…or type a hospital name"
                  className="h-9 text-[12px] mt-1"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px]">Specialty</Label>
                <Input
                  value={form.specialty}
                  onChange={(e) => setForm(f => f && ({ ...f, specialty: e.target.value }))}
                  placeholder="e.g. Cardiology"
                  className="h-9 text-[12px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px]">Priority</Label>
                  <Select value={form.priority} onValueChange={(v) => setForm(f => f && ({ ...f, priority: v as VacancyPriority }))}>
                    <SelectTrigger className="h-9 text-[12px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm(f => f && ({ ...f, status: v as VacancyStatus }))}>
                    <SelectTrigger className="h-9 text-[12px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="filled">Filled</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px]">Target fill (days)</Label>
                <Input
                  type="number"
                  value={form.target_fill_days}
                  onChange={(e) => setForm(f => f && ({ ...f, target_fill_days: e.target.value }))}
                  placeholder="e.g. 30"
                  className="h-9 text-[12px]"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px]">Notes</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm(f => f && ({ ...f, notes: e.target.value }))}
                  placeholder="Context, contacts, requirements…"
                  className="text-[12px] min-h-[60px]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving}>
                  <X className="h-3.5 w-3.5 mr-1" /> Cancel
                </Button>
                <Button size="sm" onClick={saveEdit} disabled={saving} className="bg-teal-600 hover:bg-teal-700 text-white">
                  <Save className="h-3.5 w-3.5 mr-1.5" /> {saving ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {!editing && vacancy.notes && (
          <Card className="mt-3 border-amber-200 bg-amber-50/40">
            <CardContent className="py-2 px-3 text-[11px] text-amber-900">
              <span className="font-medium">Notes: </span>{vacancy.notes}
            </CardContent>
          </Card>
        )}

        {/* ── Match tabs (Ammar 2026-06-03) ────────────────────────────
            Two separate surfaces:
              - Onboarded doctors → auto-scored from the ~1k AA roster
              - Leads             → manually linked by Sales (empty by
                                    default; Sales picks lead↔vacancy
                                    matches as their pipeline moves)
            Both lists share the same "link/unlink" buttons and the same
            scoring chips. */}
        <section className="mt-5">
          <Tabs defaultValue="onboarded">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="onboarded" className="text-[12px]">
                Onboarded doctors
                <Badge variant="outline" className="ml-1.5 bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px]">
                  {matches.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="leads" className="text-[12px]">
                Leads
                <Badge variant="outline" className="ml-1.5 bg-sky-50 text-sky-700 border-sky-200 text-[9px]">
                  {existing.length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            {/* ── Onboarded matches (auto-scored from rawDoctorsOnBoard) ── */}
            <TabsContent value="onboarded" className="mt-3 space-y-3">
              <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-emerald-600" />
                Auto-ranked from the AA doctor roster — Strong / Decent / Long-shot, by specialty + license + city + experience.
              </p>

              {matches.length === 0 && (
                <div className="rounded-md border border-dashed py-6 text-center text-[12px] text-muted-foreground">
                  No onboarded doctors match {vacancy.specialty} yet. They'll appear here as the team onboards them.
                </div>
              )}

              {strongMatches.length > 0 && (
                <MatchGroup label="Strong fits" tone="emerald" matches={strongMatches} linkedIds={linkedIds} busyId={busyId} onLink={doLink} />
              )}
              {decentMatches.length > 0 && (
                <MatchGroup label="Decent fits" tone="sky" matches={decentMatches} linkedIds={linkedIds} busyId={busyId} onLink={doLink} />
              )}
              {weakMatches.length > 0 && (
                <MatchGroup
                  label="Long shots" tone="slate"
                  matches={weakMatches.slice(0, 10)}
                  linkedIds={linkedIds} busyId={busyId} onLink={doLink}
                  collapsible={strongMatches.length + decentMatches.length > 0}
                />
              )}
            </TabsContent>

            {/* ── Leads (manually linked by Sales) ──────────────────────── */}
            <TabsContent value="leads" className="mt-3 space-y-2">
              <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
                <Link2 className="h-3 w-3 text-sky-600" />
                Filled by Sales as they speak with leads. HI + Sales both see this list.
              </p>

              {existing.length === 0 ? (
                <div className="rounded-md border border-dashed py-6 text-center">
                  <Inbox className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
                  <p className="text-[12px] text-muted-foreground">No leads linked yet.</p>
                  <p className="text-[10px] text-muted-foreground/80 mt-0.5">
                    Sales links leads from the Sales pipeline using <strong>Link to vacancy</strong>.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {existing.map(l => (
                    <div key={l.id} className="flex items-center gap-2 rounded-md border bg-sky-50/40 border-sky-200 px-2.5 py-1.5">
                      <Link2 className="h-3 w-3 text-sky-700" />
                      <div className="flex-1 text-[12px] truncate">
                        <span className="font-medium">{l.doctor_name}</span>
                        {l.doctor_speciality && <span className="text-muted-foreground"> · {l.doctor_speciality}</span>}
                        {l.linked_by && <span className="text-[10px] text-muted-foreground"> · linked by {l.linked_by}</span>}
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
              )}
            </TabsContent>
          </Tabs>
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
          {matches.map(m => (
            <MatchRow
              key={m.doctor_id}
              m={m}
              linked={linkedIds.has(m.doctor_id)}
              busy={busyId === m.doctor_id}
              onLink={onLink}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** A single doctor row in the matches list. Click the row to expand
 *  an inline details panel with the full score-factor breakdown,
 *  contact info, training country, years experience, nationality —
 *  every signal the matcher used, plus a deep-link to open the
 *  doctor's full profile in the Doctors page. Action buttons
 *  (mailto, Link) stay clickable without triggering the toggle. */
function MatchRow({ m, linked, busy, onLink }: {
  m:       ReturnType<typeof useMatchingDoctors>[number];
  linked:  boolean;
  busy:    boolean;
  onLink:  (m: ReturnType<typeof useMatchingDoctors>[number]) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border bg-white overflow-hidden">
      <div
        className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-slate-50/60 transition-colors"
        onClick={() => setOpen(o => !o)}
        title="Click to see this doctor's full match details"
      >
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
          <div className="text-[10px] text-muted-foreground truncate">
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
              disabled={busy}
              onClick={(e) => { e.stopPropagation(); onLink(m); }}
            >
              <Plus className="h-3 w-3 mr-0.5" /> Link
            </Button>
          )
        }
      </div>

      {open && (
        <div className="border-t bg-slate-50/60 px-3 py-2.5 space-y-2.5">
          {/* Contact + key fields */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <DetailField label="Specialty"        value={m.speciality} />
            <DetailField label="Country of training" value={m.country_training} />
            <DetailField label="Nationality"      value={m.nationality} />
            <DetailField label="Years experience" value={m.years_experience != null ? `${m.years_experience} years` : null} />
            <DetailField label="Notice period"    value={m.notice_period} />
            <DetailField label="License (raw)"    value={m.license_text} />
            <DetailField label="Email"            value={m.doctor_email} mono />
            <DetailField label="Phone"            value={m.doctor_phone} mono />
          </div>

          {/* Factor-by-factor breakdown of the match score */}
          <div>
            <div className="text-[9.5px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
              Score breakdown · {m.score.score}/{m.score.max}
            </div>
            <div className="space-y-0.5">
              {m.score.factors.length === 0 ? (
                <div className="text-[11px] text-muted-foreground italic">No matching factors.</div>
              ) : m.score.factors.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <span className={`tabular-nums font-semibold w-9 text-right shrink-0 ${f.negative ? "text-rose-600" : f.points > 0 ? "text-emerald-700" : "text-slate-500"}`}>
                    {f.points > 0 ? "+" : ""}{f.points}
                  </span>
                  <span className="text-slate-700">{f.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Deep-link to the full doctor profile (Doctors page) when
              available. Falls back to a name-search on Doctors so the
              team can pull up the rich profile editor. */}
          <div className="flex gap-2 pt-1">
            <a
              href={`/doctors?tab=profiles&q=${encodeURIComponent(m.doctor_email ?? m.doctor_name)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[10.5px] text-teal-700 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              Open full profile in Doctors →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailField({ label, value, mono = false }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="flex gap-2 min-w-0">
      <span className="text-muted-foreground shrink-0 w-[110px]">{label}</span>
      <span className={`text-slate-800 break-words min-w-0 ${mono ? "font-mono text-[10.5px]" : ""} ${!value ? "text-slate-300 italic" : ""}`}>
        {value || "—"}
      </span>
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
