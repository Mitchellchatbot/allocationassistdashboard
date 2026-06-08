import { useEffect, useMemo, useState, useMemo as useMemoReact } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mailbox, Plus, Send, X, CheckCircle2, Calendar, ChevronRight, ChevronDown, RefreshCw, AlertCircle, Sparkles, UserSquare, GripVertical, Star, Wand2, Pencil } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useScheduledBatches, useUpsertBatch, useUpdateBatch, useCancelBatch, useSendBatchNow,
  useSpecialtyRotation, useUpdateSpecialtyRotation,
  type ScheduledBatch, type BatchKind,
} from "@/hooks/use-scheduled-batches";
import { useHospitals } from "@/hooks/use-hospitals";
import { useZohoData, type ZohoLead, type ZohoDoctorOnBoard } from "@/hooks/use-zoho-data";
import { useDoctorLifecycleMap } from "@/hooks/use-doctor-lifecycle";
import { groupSpecialty } from "@/lib/specialty-groups";
import { rankBySpecialty, scoreSpecialty, type SpecialtyRankEntry } from "@/lib/match-score";

/**
 * Phase 6 — Recurring batch sends. Source: Saif Ullah, May 20 2026.
 *
 * Three kinds:
 *   - daily_duo        Mon-Fri 10:30 AM: 2 profiles to all 95 hospitals
 *   - tuesday_top_15   Tue: 15 mixed-specialty profiles
 *   - specialty_of_day Wed-Fri: rotates through ~60 specialties
 *
 * Doctors are picked manually here; the system handles assembling, BCC-ing,
 * and tracking. Specialty rotation auto-advances after each specialty_of_day
 * send.
 */
export default function Batches() {
  const { data: batches = [], isLoading } = useScheduledBatches();
  const { data: rotation } = useSpecialtyRotation();
  const { data: hospitals = [] } = useHospitals();

  // Unified dialog: "new" = create-then-pick flow, a uuid = editing an
  // existing row, null = closed. The dialog itself swaps between create
  // form and doctor-picker without unmounting, so creating a batch flows
  // straight into queueing doctors with no popup hop.
  const [dialogTarget, setDialogTarget] = useState<"new" | string | null>(null);

  const today = todayISO();
  const upcoming = batches.filter(b => b.scheduled_for >= today && b.status !== "cancelled");
  const past     = batches.filter(b => b.scheduled_for <  today || b.status === "sent" || b.status === "cancelled");

  const eligibleRecipients = hospitals.filter(h => !!h.primary_recruiter_email).length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Mailbox className="h-6 w-6 text-teal-600" />
              Batch sends
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              The daily, Tuesday, and specialty-of-the-day blasts to all hospital recruiters. Pick doctors, hit send.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] bg-slate-50">
              {eligibleRecipients} hospital{eligibleRecipients === 1 ? "" : "s"} with recruiter email
            </Badge>
            <Button size="sm" onClick={() => setDialogTarget("new")}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> New batch
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-teal-600" />
              Upcoming &amp; today
            </CardTitle>
            <CardDescription className="text-[11px]">
              Queue doctors into each row. Hit "Send now" to fire immediately, or wait for the scheduler.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading && <div className="px-4 py-6 text-[12px] text-muted-foreground">Loading...</div>}
            {!isLoading && upcoming.length === 0 && (
              <div className="px-4 py-12 text-center text-[12px] text-muted-foreground">
                No upcoming batches. Click <strong>New batch</strong> to schedule the next send.
              </div>
            )}
            {!isLoading && upcoming.length > 0 && (
              <div className="divide-y">
                {upcoming.map(b => (
                  <BatchRow key={b.id} batch={b} onEdit={() => setDialogTarget(b.id)} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <SpecialtyRotationCard rotation={rotation} />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Past sends</CardTitle>
            <CardDescription className="text-[11px]">Last 30 days of completed or cancelled batches.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {past.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12px] text-muted-foreground">Nothing yet.</div>
            ) : (
              <div className="divide-y">
                {past.slice(0, 20).map(b => (
                  <BatchRow key={b.id} batch={b} onEdit={() => setDialogTarget(b.id)} compact />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <BatchDialog
        target={dialogTarget}
        onTargetChange={setDialogTarget}
        batches={batches}
        suggestedSpecialty={rotation && rotation.queue.length > 0 ? rotation.queue[rotation.effective_cursor_index] ?? null : null}
      />
    </DashboardLayout>
  );
}

function BatchRow({ batch, onEdit, compact = false }: { batch: ScheduledBatch; onEdit: () => void; compact?: boolean }) {
  const sendNow = useSendBatchNow();
  const cancel  = useCancelBatch();
  const kindLabel = KIND_LABEL[batch.kind];
  const dayLabel  = formatDate(batch.scheduled_for);
  const isToday   = batch.scheduled_for === todayISO();

  return (
    <div className={`px-4 py-3 flex items-center gap-3 ${isToday && batch.status === "draft" ? "bg-teal-50/30" : ""}`}>
      <KindIcon kind={batch.kind} />
      <button onClick={onEdit} className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] font-medium">{kindLabel}</span>
          <Badge variant="outline" className="text-[9px] bg-slate-50 uppercase tracking-wider">{dayLabel}</Badge>
          {batch.country && (
            <Badge variant="outline" className="text-[9px] bg-sky-50 text-sky-700 border-sky-200 uppercase tracking-wider">
              {batch.country}
            </Badge>
          )}
          {batch.specialty && (
            <Badge variant="outline" className="text-[9px] bg-violet-50 text-violet-700 border-violet-200 uppercase tracking-wider">
              {batch.specialty}
            </Badge>
          )}
          <StatusBadge status={batch.status} />
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          {batch.doctor_ids.length} doctor{batch.doctor_ids.length === 1 ? "" : "s"} queued
          {batch.hospital_count != null && <> · {batch.hospital_count} hospital recipients</>}
          {batch.sent_at && <> · sent {formatDate(batch.sent_at)}</>}
          {batch.error && <span className="text-rose-600"> · {batch.error}</span>}
        </div>
      </button>
      {batch.status === "sent" && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[10px]"
          disabled={sendNow.isPending || batch.doctor_ids.length === 0}
          onClick={async () => {
            if (!confirm(`Resend this batch? Same ${batch.doctor_ids.length} doctor${batch.doctor_ids.length === 1 ? "" : "s"} will be sent again to every hospital.`)) return;
            try {
              const res = await sendNow.mutateAsync({ batchId: batch.id, force: true });
              toast.success(`Resent. ${res.doctor_count} doctors → ${res.bcc_count} hospitals.`);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Resend failed");
            }
          }}
        >
          <RefreshCw className={`h-3 w-3 mr-1 text-teal-600 ${sendNow.isPending ? "animate-spin" : ""}`} /> Resend
        </Button>
      )}
      {!compact && batch.status === "draft" && (
        <>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[10px]"
            disabled={sendNow.isPending || batch.doctor_ids.length === 0}
            onClick={async () => {
              try {
                const res = await sendNow.mutateAsync(batch.id);
                toast.success(`Batch sent. ${res.doctor_count} doctors → ${res.bcc_count} hospitals.`);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Send failed");
              }
            }}
          >
            <Send className="h-3 w-3 mr-1 text-teal-600" /> Send now
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[10px] text-rose-600 hover:bg-rose-50"
            onClick={async () => {
              if (!confirm("Cancel and delete this batch? Doctors won't be sent.")) return;
              try { await cancel.mutateAsync(batch.id); toast.success("Batch cancelled."); }
              catch (e) { toast.error(e instanceof Error ? e.message : "Cancel failed"); }
            }}
          >
            Cancel
          </Button>
        </>
      )}
      <ChevronRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />
    </div>
  );
}

function SpecialtyRotationCard({ rotation }: { rotation: ReturnType<typeof useSpecialtyRotation>["data"] }) {
  const update = useUpdateSpecialtyRotation();
  const { data: zoho } = useZohoData();
  const lifecycleMap  = useDoctorLifecycleMap();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState("");

  // Doctor roster used by the fuzzy-match fallback below the Today's-pick
  // tile. Lighter shape than DoctorOption since the rank only needs id +
  // name + speciality + source.
  const rankableDoctors = useMemoReact(() => {
    const z = zoho as { rawLeads?: ZohoLead[]; rawDoctorsOnBoard?: ZohoDoctorOnBoard[] } | undefined;
    const eligible = (id: string) => lifecycleMap[id]?.eligible_for_sending !== false;
    const out: { id: string; name: string; speciality: string | null; source: "lead" | "dob" }[] = [];
    for (const d of z?.rawDoctorsOnBoard ?? []) {
      const name = d.Full_Name || `${d.First_Name ?? ""} ${d.Last_Name ?? ""}`.trim();
      const id   = `dob:${d.id}`;
      if (!name || !eligible(id)) continue;
      out.push({ id, name, speciality: d.Specialty_New ?? d.Speciality ?? null, source: "dob" });
    }
    for (const l of z?.rawLeads ?? []) {
      const name = l.Full_Name || `${l.First_Name ?? ""} ${l.Last_Name ?? ""}`.trim();
      const id   = `lead:${l.id}`;
      if (!name || !eligible(id)) continue;
      out.push({ id, name, speciality: l.Specialty ?? l.Specialty_New ?? null, source: "lead" });
    }
    return out;
  }, [zoho, lifecycleMap]);

  const queue = rotation?.queue ?? [];
  // Use the derived cursor — the daily-walked position. The persisted
  // cursor_index is the anchor; today's pick is anchor + days_since.
  // Falls back to cursor_index for a rotation that just rolled over
  // before the hook recomputes.
  const cursor = rotation?.effective_cursor_index ?? rotation?.cursor_index ?? 0;
  // Wrap the next-up preview so we don't run off the end of the queue
  // mid-cycle (the next 4 specialties wrap to the start of the queue).
  const upcoming = Array.from({ length: Math.min(5, queue.length) }, (_, i) => queue[(cursor + i) % queue.length]).filter(Boolean);

  // Collapse Zoho's thousands of raw specialty strings into ~60 canonical
  // buckets via groupSpecialty(). For each bucket we keep:
  //   - doctorCount: number of distinct doctors in it (de-duped per-doctor)
  //   - sources:     the raw Zoho strings that mapped in, with their counts,
  //                  so the UI can expand a group and show what's inside.
  // Sorted by doctorCount desc so the most-stocked groups surface first.
  const zohoSpecialties = useMemoReact(() => {
    const z = zoho as { rawLeads?: ZohoLead[]; rawDoctorsOnBoard?: ZohoDoctorOnBoard[] } | undefined;
    interface Bucket { name: string; doctorCount: number; sources: Map<string, number>; }
    const buckets = new Map<string, Bucket>();
    const unmappedStrings = new Map<string, number>();
    let unmapped = 0;
    const noteUnmapped = (raw: string | null | undefined) => {
      if (!raw) return;
      const t = raw.trim();
      if (!t) return;
      if (/^(other|unknown|n\/?a|none|tbd)$/i.test(t)) return;
      unmappedStrings.set(t, (unmappedStrings.get(t) ?? 0) + 1);
    };

    const addSource = (bucket: Bucket, raw: string) => {
      const key = raw.trim();
      if (!key) return;
      bucket.sources.set(key, (bucket.sources.get(key) ?? 0) + 1);
    };
    const bumpDoctor = (matches: Map<string, string[]>) => {
      if (matches.size === 0) { unmapped++; return; }
      for (const [name, rawsForThisDoctor] of matches) {
        let b = buckets.get(name);
        if (!b) { b = { name, doctorCount: 0, sources: new Map() }; buckets.set(name, b); }
        b.doctorCount++;
        for (const raw of rawsForThisDoctor) addSource(b, raw);
      }
    };

    for (const l of z?.rawLeads ?? []) {
      // Per-doctor map: groupName → [raws that contributed to this group].
      const m = new Map<string, string[]>();
      const consider = (raw: string | null | undefined) => {
        if (!raw) return;
        const g = groupSpecialty(raw);
        if (!g) { noteUnmapped(raw); return; }
        const arr = m.get(g) ?? []; arr.push(raw); m.set(g, arr);
      };
      consider(l.Specialty); consider(l.Specialty_New);
      bumpDoctor(m);
    }
    for (const d of z?.rawDoctorsOnBoard ?? []) {
      const m = new Map<string, string[]>();
      const dobSpec = d.Specialty_New || d.Speciality || null;
      if (dobSpec) {
        const g = groupSpecialty(dobSpec);
        if (g) m.set(g, [dobSpec]);
        else noteUnmapped(dobSpec);
      }
      bumpDoctor(m);
    }

    const groups = Array.from(buckets.values())
      .sort((a, b) => b.doctorCount - a.doctorCount)
      .map(b => ({
        name:        b.name,
        doctorCount: b.doctorCount,
        sources:     Array.from(b.sources.entries())
          .sort((x, y) => y[1] - x[1])
          .map(([raw, count]) => ({ raw, count })),
      }));
    const unmappedTop = Array.from(unmappedStrings.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([raw, count]) => ({ raw, count }));
    return { groups, unmapped, unmappedTop };
  }, [zoho]);

  const [showUnmapped, setShowUnmapped] = useState(false);

  const autofillFromZoho = () => {
    if (zohoSpecialties.groups.length === 0) {
      toast.error("No specialties found in Zoho data yet — sync first.");
      return;
    }
    // Merge with whatever the user has typed: keep their order, append the
    // grouped specialties that aren't already present. This tops up rather
    // than nuking custom edits.
    const existing = new Set(draft.split("\n").map(s => s.trim().toLowerCase()).filter(Boolean));
    const additions = zohoSpecialties.groups
      .map(s => s.name)
      .filter(s => !existing.has(s.toLowerCase()));
    const merged = [
      ...draft.split("\n").map(s => s.trim()).filter(Boolean),
      ...additions,
    ];
    setDraft(merged.join("\n"));
    toast.success(`Added ${additions.length} grouped specialties · ${merged.length} total.`);
  };

  // The draft is the source of truth — we sync the selectedGroups Set
  // derived from it on every render so toggling checkboxes in the group
  // browser stays consistent with manual textarea edits.
  const draftLines = draft.split("\n").map(s => s.trim()).filter(Boolean);
  const selectedGroups = new Set(draftLines.map(s => s.toLowerCase()));

  const toggleGroup = (name: string, on: boolean) => {
    if (on) {
      if (selectedGroups.has(name.toLowerCase())) return;
      setDraft([...draftLines, name].join("\n"));
    } else {
      setDraft(draftLines.filter(l => l.toLowerCase() !== name.toLowerCase()).join("\n"));
    }
  };

  const [showRawEditor, setShowRawEditor] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const startEdit = () => {
    setDraft(queue.join("\n"));
    setEditing(true);
    setShowRawEditor(false);
    setExpandedGroup(null);
  };
  const save = async () => {
    const newQueue = draft.split("\n").map(s => s.trim()).filter(Boolean);
    try {
      await update.mutateAsync({ queue: newQueue, cursor_index: Math.min(cursor, Math.max(0, newQueue.length - 1)) });
      toast.success(`Rotation saved · ${newQueue.length} specialties.`);
      setEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  return (
    <Card data-tour="batches-rotation">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-violet-600" />
              Specialty-of-the-day rotation
            </CardTitle>
            <CardDescription className="text-[11px]">
              The Wed-Fri queue. Paste your full list once; today's pick advances by one calendar day on its own. Click <em>Advance</em> any time to skip ahead manually.
            </CardDescription>
          </div>
          {!editing && (
            <Button size="sm" variant="outline" onClick={startEdit}>
              <GripVertical className="h-3.5 w-3.5 mr-1.5" /> Edit queue
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Label className="text-[11px]">
                {showRawEditor ? "One specialty per line, in send order" : "Pick which specialty groups to include"}
              </Label>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[10px]"
                  onClick={autofillFromZoho}
                  disabled={zohoSpecialties.groups.length === 0}
                  title={zohoSpecialties.groups.length === 0
                    ? "No Zoho data loaded yet"
                    : `Adds all ${zohoSpecialties.groups.length} canonical specialty buckets. ${zohoSpecialties.unmapped} doctor${zohoSpecialties.unmapped === 1 ? "" : "s"} fall outside any bucket.`}
                >
                  <Wand2 className="h-3 w-3 mr-1 text-violet-600" /> Select all
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[10px]"
                  onClick={() => setShowRawEditor(v => !v)}
                  title="Switch between visual group picker and raw text editor"
                >
                  <Pencil className="h-3 w-3 mr-1" />
                  {showRawEditor ? "Group picker" : "Raw text"}
                </Button>
              </div>
            </div>

            {showRawEditor ? (
              <Textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                rows={Math.min(20, Math.max(8, draft.split("\n").length + 1))}
                className="text-[12px] font-mono"
                placeholder={`Cardiology\nPediatrics\nUrology\nDermatology\n...`}
              />
            ) : (
              <div className="rounded-md border max-h-[420px] overflow-y-auto divide-y bg-white">
                {zohoSpecialties.groups.length === 0 && (
                  <div className="px-3 py-6 text-center text-[11px] text-muted-foreground italic">
                    No Zoho data loaded yet. Use the Raw text mode to type a list manually.
                  </div>
                )}
                {zohoSpecialties.groups.map(g => {
                  const checked  = selectedGroups.has(g.name.toLowerCase());
                  const expanded = expandedGroup === g.name;
                  return (
                    <div key={g.name} className="bg-white">
                      <div className="flex items-center gap-2 px-3 py-2">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => toggleGroup(g.name, !!v)}
                        />
                        <button
                          type="button"
                          onClick={() => setExpandedGroup(expanded ? null : g.name)}
                          className="flex-1 min-w-0 flex items-center gap-2 text-left"
                        >
                          {expanded
                            ? <ChevronDown className="h-3 w-3 text-slate-400 shrink-0" />
                            : <ChevronRight className="h-3 w-3 text-slate-400 shrink-0" />}
                          <span className="text-[12px] font-medium truncate">{g.name}</span>
                          <Badge variant="outline" className="text-[9px] bg-slate-50 tabular-nums shrink-0">
                            {g.doctorCount} doctor{g.doctorCount === 1 ? "" : "s"}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {g.sources.length} variant{g.sources.length === 1 ? "" : "s"}
                          </span>
                        </button>
                      </div>
                      {expanded && (
                        <div className="px-9 pb-2.5 pt-0.5 space-y-1">
                          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
                            Zoho strings that map to this group
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {g.sources.slice(0, 60).map(src => (
                              <span
                                key={src.raw}
                                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-[1px] text-[10px] text-slate-700"
                                title={`${src.count} doctor${src.count === 1 ? "" : "s"}`}
                              >
                                {src.raw}
                                <span className="text-[9px] text-slate-500 tabular-nums">{src.count}</span>
                              </span>
                            ))}
                            {g.sources.length > 60 && (
                              <span className="text-[10px] text-muted-foreground">…+{g.sources.length - 60} more</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {zohoSpecialties.unmapped > 0 && (
                  <div className="bg-amber-50/40 border-t border-amber-200">
                    <button
                      type="button"
                      onClick={() => setShowUnmapped(v => !v)}
                      className="w-full px-3 py-2 flex items-center gap-2 text-left text-[10px] text-amber-800 hover:bg-amber-50"
                    >
                      {showUnmapped
                        ? <ChevronDown className="h-2.5 w-2.5" />
                        : <ChevronRight className="h-2.5 w-2.5" />}
                      <AlertCircle className="h-2.5 w-2.5" />
                      <span>
                        {zohoSpecialties.unmapped} doctor-specialt{zohoSpecialties.unmapped === 1 ? "y entry fell" : "y entries fell"} outside every bucket
                        ({zohoSpecialties.unmappedTop.length} unique). Click to see what to add to <code className="bg-amber-100 px-1">specialty-groups.ts</code>.
                      </span>
                    </button>
                    {showUnmapped && (
                      <div className="px-3 pb-3 pt-1 space-y-1">
                        <div className="text-[9px] uppercase tracking-wider text-amber-700">
                          Top unmapped raw strings — counts are # of doctors with that exact value
                        </div>
                        <div className="flex flex-wrap gap-1 max-h-[240px] overflow-y-auto">
                          {zohoSpecialties.unmappedTop.slice(0, 80).map(s => (
                            <span
                              key={s.raw}
                              className="inline-flex items-center gap-1 rounded-full border border-amber-300/70 bg-white px-2 py-[1px] text-[10px] text-amber-900"
                            >
                              {s.raw}
                              <span className="text-[9px] text-amber-600 tabular-nums">{s.count}</span>
                            </span>
                          ))}
                          {zohoSpecialties.unmappedTop.length > 80 && (
                            <span className="text-[10px] text-amber-700">…+{zohoSpecialties.unmappedTop.length - 80} more</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button size="sm" onClick={save} disabled={update.isPending}>
                {update.isPending ? "Saving..." : "Save rotation"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              <span className="text-[10px] text-muted-foreground ml-auto">
                {draftLines.length} selected
              </span>
            </div>
          </div>
        ) : queue.length === 0 ? (
          <div className="space-y-2">
            <div className="text-[12px] text-muted-foreground italic">
              No rotation set up yet. Click <strong>Edit queue</strong> to paste your list — or grab them straight from Zoho:
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setDraft(""); setEditing(true); setTimeout(autofillFromZoho, 0); }}
              disabled={zohoSpecialties.groups.length === 0}
            >
              <Wand2 className="h-3.5 w-3.5 mr-1.5 text-violet-600" />
              Autofill {zohoSpecialties.groups.length} from Zoho
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Today's pick — hero card. The cursor specialty is what the
                scheduler will fire next, i.e. today's send. When no exact
                bucket exists in Zoho, fall back to the multi-tier specialty
                matcher (exact → group → substring → parent → token-overlap)
                so 'Cardiac Surgery' surfaces Cardiothoracic Surgeons etc.
                instead of dead-ending at 'pick doctors manually'. */}
            {(() => {
              const today = queue[cursor] ?? null;
              const todayGroup = today ? zohoSpecialties.groups.find(g => g.name.toLowerCase() === today.toLowerCase()) : null;
              const ranked: SpecialtyRankEntry[] = today && !todayGroup
                ? rankBySpecialty(rankableDoctors, today, 5)
                : [];
              return today ? (
                <div className="space-y-2">
                  <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50/40 px-4 py-3 flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
                      <Sparkles className="h-4 w-4 text-violet-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[9px] uppercase tracking-[0.12em] text-violet-700/80 font-semibold">
                        Today's pick
                      </div>
                      <div className="text-[15px] font-semibold text-violet-900 truncate">{today}</div>
                      <div className="text-[10px] text-violet-700/80 mt-0.5">
                        {todayGroup
                          ? <>{todayGroup.doctorCount} eligible doctor{todayGroup.doctorCount === 1 ? "" : "s"} in this bucket · {todayGroup.sources.length} Zoho variant{todayGroup.sources.length === 1 ? "" : "s"}</>
                          : ranked.length > 0
                            ? <>No exact bucket — {ranked.length} closest match{ranked.length === 1 ? "" : "es"} below</>
                            : "Not currently in Zoho — pick doctors manually"}
                      </div>
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end gap-2">
                      <div>
                        <div className="text-[9px] uppercase tracking-wider text-violet-700/70">Day</div>
                        <div className="text-[14px] font-semibold text-violet-900 tabular-nums">{cursor + 1}<span className="text-[10px] text-violet-700/60">/{queue.length}</span></div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px] gap-1 border-violet-300 text-violet-800 hover:bg-violet-100"
                        onClick={async () => {
                          const next = (cursor + 1) % queue.length;
                          try {
                            await update.mutateAsync({ cursor_index: next });
                            toast.success(`Advanced to ${queue[next]}`);
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Advance failed");
                          }
                        }}
                        disabled={update.isPending || queue.length === 0}
                        title="Skip to the next specialty"
                      >
                        <ChevronRight className="h-2.5 w-2.5" /> Advance
                      </Button>
                    </div>
                  </div>

                  {/* Fuzzy-match suggestions when there's no exact Zoho
                      bucket. Pulls partial / canonical-group / parent /
                      token-overlap matches via scoreSpecialty so the team
                      isn't dead-ended on rare specialties (Cardiac Surgery
                      → Cardiothoracic Surgeons, etc.). */}
                  {!todayGroup && ranked.length > 0 && (
                    <div className="rounded-lg border border-violet-200/70 bg-white px-3 py-2">
                      <div className="text-[9.5px] uppercase tracking-wider text-violet-700/80 font-semibold mb-1.5">
                        Closest matches in Zoho
                      </div>
                      <div className="space-y-1">
                        {ranked.map(r => (
                          <div key={r.doctor_id} className="flex items-center gap-2 text-[11px]">
                            <Badge
                              variant="outline"
                              className={`shrink-0 text-[9px] tabular-nums ${
                                r.tier === "exact"   ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                r.tier === "group"   ? "bg-teal-50    text-teal-700    border-teal-200"    :
                                r.tier === "partial" ? "bg-sky-50     text-sky-700     border-sky-200"     :
                                r.tier === "parent"  ? "bg-amber-50   text-amber-700   border-amber-200"   :
                                                       "bg-slate-100  text-slate-600   border-slate-200"
                              }`}
                              title={r.reason}
                            >
                              {r.points}/50
                            </Badge>
                            <span className="font-medium text-slate-800 truncate">{r.doctor_name}</span>
                            <span className="text-muted-foreground truncate">· {r.speciality ?? "—"}</span>
                            <span className="ml-auto text-[9px] uppercase tracking-wider text-muted-foreground shrink-0">{r.source}</span>
                          </div>
                        ))}
                      </div>
                      <div className="text-[9.5px] text-muted-foreground mt-1.5">
                        Tier scale: <span className="text-emerald-700">exact 50</span> · <span className="text-teal-700">group 40</span> · <span className="text-sky-700">substring 35</span> · <span className="text-amber-700">parent 30</span> · <span className="text-slate-600">keyword 25</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : null;
            })()}

            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Next up</div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {upcoming.slice(1, 6).map((s) => (
                  <Badge
                    key={s}
                    variant="outline"
                    className="bg-slate-50 text-slate-700 border-slate-200 text-[10px] uppercase tracking-wider"
                  >
                    {s}
                  </Badge>
                ))}
                {queue.length > upcoming.length && (
                  <span className="text-[10px] text-muted-foreground">…+{queue.length - upcoming.length} more · cycles every {queue.length} working days</span>
                )}
              </div>
            </div>
            <div className="text-[10px] text-muted-foreground">
              Last sent: {rotation?.last_sent_specialty ?? "—"}{rotation?.last_sent_at && ` · ${formatDate(rotation.last_sent_at)}`}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: ScheduledBatch["status"] }) {
  const cls =
    status === "sent"      ? "bg-emerald-100 text-emerald-800 border-emerald-200" :
    status === "draft"     ? "bg-amber-100 text-amber-800 border-amber-200" :
    status === "cancelled" ? "bg-slate-100 text-slate-700 border-slate-200" :
                             "bg-rose-100 text-rose-800 border-rose-200";
  return <Badge variant="outline" className={`${cls} text-[9px] uppercase tracking-wider`}>{status}</Badge>;
}

function KindIcon({ kind }: { kind: BatchKind }) {
  const map: Record<BatchKind, { Icon: typeof Calendar; cls: string }> = {
    daily_duo:        { Icon: Calendar,  cls: "text-teal-600" },
    tuesday_top_15:   { Icon: Sparkles,  cls: "text-amber-600" },
    specialty_of_day: { Icon: RefreshCw, cls: "text-violet-600" },
  };
  const { Icon, cls } = map[kind];
  return <Icon className={`h-4 w-4 ${cls} shrink-0`} />;
}

const KIND_LABEL: Record<BatchKind, string> = {
  daily_duo:        "Daily duo (2 profiles)",
  tuesday_top_15:   "Tuesday top 15",
  specialty_of_day: "Specialty of the day",
};

// ── Unified create / edit dialog ─────────────────────────────────────────
//
// Single modal that handles both "create new batch" and "queue doctors into
// an existing batch". When the user clicks New batch, the form starts in
// create mode; on submit, we swap the body in place to the doctor picker
// using the newly-created row's id — no close + reopen popup hop.

function BatchDialog({ target, onTargetChange, batches, suggestedSpecialty }: {
  target: "new" | string | null;
  onTargetChange: (next: "new" | string | null) => void;
  batches: ScheduledBatch[];
  suggestedSpecialty: string | null;
}) {
  const open = target !== null;
  const editingBatch = target && target !== "new" ? batches.find(b => b.id === target) ?? null : null;

  const upsert = useUpsertBatch();
  const update = useUpdateBatch();
  const sendNow = useSendBatchNow();
  const { data: zoho } = useZohoData();
  const lifecycleMap = useDoctorLifecycleMap();
  const allDoctors = useMemoDoctors(zoho, lifecycleMap);

  // Create-form local state — only used while target === "new".
  const [kind, setKind] = useState<BatchKind>("daily_duo");
  const [scheduledFor, setScheduledFor] = useState<string>(todayISO());
  const [specialty, setSpecialty]       = useState<string>("");
  // Country defaults to UAE — that's the highest-volume target and matches
  // Ammar's spec (one batch per country, sent to all hospitals in that
  // country). Empty string = broadcast to all hospitals (legacy fallback).
  const [country,   setCountry]         = useState<string>("UAE");
  const [creating, setCreating]         = useState(false);

  // Editor-only state.
  const [search, setSearch] = useState("");
  // specialtyOnly defaults TRUE for specialty_of_day (batch.specialty is
  // the whole point of the send) and FALSE for daily_duo / tuesday_top_15
  // — those kinds aren't specialty-bound, so we only score-boost the
  // rotation match instead of filtering by it.
  const [specialtyOnly, setSpecialtyOnly] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<"all" | "lead" | "dob">("all");

  // When the dialog swaps to a different batch, default specialtyOnly to
  // ON for specialty_of_day (batch is explicitly that specialty) and OFF
  // for the open-ended kinds (rotation hint still ranks doctors but
  // doesn't hard-filter).
  useEffect(() => {
    if (!editingBatch) return;
    setSpecialtyOnly(!!editingBatch.specialty);
  }, [editingBatch?.id, editingBatch?.specialty]);

  const close = () => {
    onTargetChange(null);
    setKind("daily_duo"); setScheduledFor(todayISO()); setSpecialty(""); setCountry("UAE"); setSearch("");
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const finalSpecialty = kind === "specialty_of_day"
        ? (specialty.trim() || suggestedSpecialty || "")
        : null;
      if (kind === "specialty_of_day" && !finalSpecialty) {
        toast.error("Pick a specialty for this send.");
        setCreating(false); return;
      }
      // A non-cancelled row already exists for this (kind, date, specialty) —
      // the DB has a unique index that would reject a duplicate. Detect it
      // client-side so we can switch the dialog to editing the existing row
      // instead of bouncing the user with a constraint-violation toast.
      const existing = batches.find(b =>
        b.kind === kind &&
        b.scheduled_for === scheduledFor &&
        (b.specialty ?? "") === (finalSpecialty ?? "") &&
        (b.country   ?? "") === (country.trim() || "") &&
        b.status !== "cancelled",
      );
      if (existing) {
        toast.info("A batch for this date + country already exists — opening it.");
        onTargetChange(existing.id);
        setCreating(false); return;
      }
      const created = await upsert.mutateAsync({
        kind,
        scheduled_for: scheduledFor,
        specialty:     finalSpecialty,
        country:       country.trim() || null,
      });
      toast.success("Batch created. Pick doctors below.");
      // Stay in the dialog — swap into doctor-picker mode.
      onTargetChange(created.id);
    } catch (e) {
      // Surface the actual Postgres / Supabase error so users see "duplicate
      // key" or RLS rejections instead of a generic "Create failed".
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Create failed: ${msg}`);
      console.error("[Batches] create failed:", e);
    } finally { setCreating(false); }
  };

  // ── Doctor-picker logic (only when editingBatch is set) ─────────────────
  const batch = editingBatch;
  const picked = batch ? batch.doctor_ids.map(id => allDoctors.find(d => d.id === id)).filter((d): d is DoctorOption => !!d) : [];

  const expectedCount = batch ? (batch.kind === "daily_duo" ? 2 : batch.kind === "tuesday_top_15" ? 15 : 1) : 0;

  // Pool of eligible candidates, ranked by score so the strongest profiles
  // surface first. When the user types, we also filter by the query. When
  // they don't, we still show the top 20 so the editor isn't empty.
  //
  // For daily_duo / tuesday_top_15 (no explicit specialty on the batch),
  // we still bias toward TODAY's rotation specialty so the team sees
  // relevant doctors first. The team can switch off "X only" if they
  // want the full pool ranked by readiness alone.
  const effectiveSpecialty = batch?.specialty
    ?? (batch && batch.kind !== "specialty_of_day" ? suggestedSpecialty : null);

  const q = search.trim().toLowerCase();
  const candidatePool = !batch ? [] : (() => {
    const batchGroup = effectiveSpecialty ? (groupSpecialty(effectiveSpecialty) ?? effectiveSpecialty) : null;
    const base = allDoctors.filter(d => d.eligible && !batch.doctor_ids.includes(d.id));

    // When the batch (or today's rotation) has a specialty + the user opts
    // in, restrict to doctors whose specialty falls in the SAME canonical
    // bucket (so a "Cardio Consultant" lead is included for a Cardiology
    // batch). User can toggle off to see the full pool.
    const specialtyFiltered = specialtyOnly && batchGroup
      ? base.filter(d => {
          if (!d.speciality) return false;
          const g = groupSpecialty(d.speciality);
          return g === batchGroup || normaliseSpec(d.speciality) === normaliseSpec(batchGroup);
        })
      : base;

    const sourceFiltered = sourceFilter === "all"
      ? specialtyFiltered
      : specialtyFiltered.filter(d => d.source === sourceFilter);

    const filtered = !q ? sourceFiltered : sourceFiltered.filter(d =>
      d.name.toLowerCase().includes(q) ||
      (d.speciality ?? "").toLowerCase().includes(q) ||
      (d.email ?? "").toLowerCase().includes(q)
    );
    const scored = filtered.map(d => ({ ...d, _score: scoreDoctor(d, batch, effectiveSpecialty) }));
    scored.sort((a, b) => b._score.total - a._score.total);
    return scored.slice(0, 30);
  })();

  const setDoctors = async (next: string[]) => {
    if (!batch) return;
    try { await update.mutateAsync({ id: batch.id, patch: { doctor_ids: next } }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Update failed"); }
  };
  const add    = (id: string) => batch && setDoctors([...batch.doctor_ids, id]);
  const remove = (id: string) => batch && setDoctors(batch.doctor_ids.filter(x => x !== id));
  const move   = (id: string, dir: -1 | 1) => {
    if (!batch) return;
    const i = batch.doctor_ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= batch.doctor_ids.length) return;
    const next = batch.doctor_ids.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setDoctors(next);
  };

  /** One-click: queue the top N highest-scoring eligible doctors that
   *  aren't already in the batch. Respects the kind's expected count. */
  const autoPickTop = () => {
    if (!batch) return;
    const need = Math.max(0, expectedCount - batch.doctor_ids.length);
    if (need === 0) { toast.info("Already at the target count."); return; }
    // Respect the same source filter the user has on the candidate list —
    // auto-pick should match what they're seeing.
    const pool = allDoctors
      .filter(d => d.eligible && !batch.doctor_ids.includes(d.id))
      .filter(d => sourceFilter === "all" || d.source === sourceFilter)
      .map(d => ({ d, score: scoreDoctor(d, batch, effectiveSpecialty).total }))
      .sort((a, b) => b.score - a.score)
      .slice(0, need)
      .map(x => x.d.id);
    if (pool.length === 0) { toast.error("No eligible candidates to auto-pick."); return; }
    setDoctors([...batch.doctor_ids, ...pool]);
    toast.success(`Auto-picked top ${pool.length} by rank.`);
  };

  const countWarning = batch && batch.status === "draft" && picked.length !== expectedCount;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className={batch ? "sm:max-w-[680px] max-h-[88vh] overflow-y-auto" : "sm:max-w-[460px]"}>
        {!batch ? (
          // ─── Create form ─────────────────────────────────────────────
          <>
            <DialogHeader>
              <DialogTitle>New batch send</DialogTitle>
              <DialogDescription className="text-[12px]">
                Choose a kind and a date. You'll queue doctors right after — no popup hop.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label className="text-[11px]">Kind</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as BatchKind)}>
                  <SelectTrigger className="h-9 text-[12px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily_duo">Daily duo (Mon-Fri · 2 profiles)</SelectItem>
                    <SelectItem value="tuesday_top_15">Tuesday top 15</SelectItem>
                    <SelectItem value="specialty_of_day">Specialty of the day (Wed-Fri)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Date</Label>
                <Input type="date" value={scheduledFor} onChange={e => setScheduledFor(e.target.value)} className="h-9 text-[12px]" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Country</Label>
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger className="h-9 text-[12px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UAE">UAE</SelectItem>
                    <SelectItem value="Saudi Arabia">Saudi Arabia</SelectItem>
                    <SelectItem value="Qatar">Qatar</SelectItem>
                    <SelectItem value="Oman">Oman</SelectItem>
                    <SelectItem value="Kuwait">Kuwait</SelectItem>
                    <SelectItem value="Bahrain">Bahrain</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  This batch only sends to hospitals in the chosen country. Create one batch per country per day (Ammar 2026-06-03 spec).
                </p>
              </div>
              {kind === "specialty_of_day" && (
                <div className="space-y-1">
                  <Label className="text-[11px]">Specialty</Label>
                  <Input
                    value={specialty}
                    onChange={e => setSpecialty(e.target.value)}
                    placeholder={suggestedSpecialty ? `Default: ${suggestedSpecialty}` : "e.g. Cardiology"}
                    className="h-9 text-[12px]"
                  />
                  {suggestedSpecialty && (
                    <p className="text-[10px] text-muted-foreground">
                      Suggested from rotation cursor: <strong>{suggestedSpecialty}</strong>. Leave blank to use it.
                    </p>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={close} disabled={creating}>Cancel</Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? "Creating..." : "Create & pick doctors"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          // ─── Doctor picker ────────────────────────────────────────────
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                <Mailbox className="h-5 w-5 text-teal-600" />
                {KIND_LABEL[batch.kind]} · {formatDate(batch.scheduled_for)}
                {batch.country   && <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 text-[9px] uppercase tracking-wider ml-1">{batch.country}</Badge>}
                {batch.specialty && <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200 text-[9px] uppercase tracking-wider ml-1">{batch.specialty}</Badge>}
                <StatusBadge status={batch.status} />
              </DialogTitle>
              <DialogDescription className="text-[12px]">
                Queue {expectedCount} doctor{expectedCount === 1 ? "" : "s"}. Order is the order they'll appear in the email. Candidates are ranked by readiness — see the score next to each name.
              </DialogDescription>
            </DialogHeader>

            {countWarning && (
              <div className="rounded-md border border-amber-200 bg-amber-50/50 px-3 py-2 flex items-start gap-2">
                <AlertCircle className="h-3.5 w-3.5 text-amber-700 shrink-0 mt-[2px]" />
                <div className="text-[11px] text-amber-900">
                  Spec calls for <strong>{expectedCount}</strong> doctor{expectedCount === 1 ? "" : "s"}. You have <strong>{picked.length}</strong>.
                </div>
              </div>
            )}

            <section className="space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Queued · {picked.length}</div>
              {picked.length === 0 && (
                <div className="text-[11px] text-muted-foreground italic">Nothing queued yet. Search below, or use Auto-pick top {expectedCount} above.</div>
              )}
              {picked.map((d, idx) => {
                const s = scoreDoctor(d, batch, effectiveSpecialty);
                return (
                  <div key={d.id} className="flex items-center gap-2 rounded-md border bg-white px-2.5 py-1.5">
                    <span className="text-[10px] tabular-nums text-muted-foreground w-5 text-right">{idx + 1}.</span>
                    <UserSquare className="h-3.5 w-3.5 text-slate-400" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium truncate flex items-center gap-1.5">
                        {d.name}
                        <ScoreBadge score={s.total} reasons={s.reasons} />
                        <SourceBadge source={d.source} />
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">{d.speciality ?? "—"}{d.email && ` · ${d.email}`}</div>
                    </div>
                    {batch.status === "draft" && (
                      <>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-slate-500" onClick={() => move(d.id, -1)} disabled={idx === 0}>↑</Button>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-slate-500" onClick={() => move(d.id, +1)} disabled={idx === picked.length - 1}>↓</Button>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-rose-500 hover:bg-rose-50" onClick={() => remove(d.id)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                );
              })}
            </section>

            {batch.status === "draft" && (
              <section className="space-y-2 pt-3 border-t">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <Label className="text-[11px]">
                    {q ? "Search results" : "Top ranked eligible doctors"}
                  </Label>
                  <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={autoPickTop}>
                    <Wand2 className="h-3 w-3 mr-1 text-violet-600" /> Auto-pick top {Math.max(1, expectedCount - picked.length)}
                  </Button>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Source segmented toggle — All / Leads / Doctors on Board. */}
                  <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-0.5 text-[10px]">
                    {(["all", "lead", "dob"] as const).map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setSourceFilter(opt)}
                        className={`px-2.5 py-1 rounded-full font-medium transition-colors ${
                          sourceFilter === opt
                            ? opt === "lead"
                              ? "bg-sky-100 text-sky-700 shadow-sm"
                              : opt === "dob"
                                ? "bg-emerald-100 text-emerald-700 shadow-sm"
                                : "bg-white text-slate-800 shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        {opt === "all" ? "Both" : opt === "lead" ? "Leads only" : "Doctors on Board"}
                      </button>
                    ))}
                  </div>
                  {effectiveSpecialty && (
                    <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
                      <Checkbox
                        checked={specialtyOnly}
                        onCheckedChange={(v) => setSpecialtyOnly(!!v)}
                      />
                      {effectiveSpecialty} only
                      {!batch.specialty && (
                        <span className="text-[9px] text-violet-600 ml-0.5">(today's rotation)</span>
                      )}
                    </label>
                  )}
                </div>
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Filter by name, specialty, or email..."
                  className="h-9 text-[12px]"
                />
                {candidatePool.length > 0 && (
                  <div className="rounded-md border max-h-[300px] overflow-y-auto divide-y">
                    {candidatePool.map(d => (
                      <button
                        key={d.id}
                        onClick={() => add(d.id)}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2"
                      >
                        <Plus className="h-3 w-3 text-teal-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-medium truncate flex items-center gap-1.5">
                            {d.name}
                            <ScoreBadge score={d._score.total} reasons={d._score.reasons} />
                            <SourceBadge source={d.source} />
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">{d.speciality ?? "—"}{d.email && ` · ${d.email}`}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {!q && candidatePool.length === 0 && specialtyOnly && effectiveSpecialty && (
                  <div className="text-[11px] text-muted-foreground italic px-1">
                    No doctors in the <strong>{effectiveSpecialty}</strong> bucket. Uncheck "{effectiveSpecialty} only" to see all candidates.
                  </div>
                )}
                {q && candidatePool.length === 0 && (
                  <div className="text-[11px] text-muted-foreground italic">No matches.</div>
                )}
              </section>
            )}

            <DialogFooter>
              {batch.status === "draft" && (
                <Button
                  onClick={async () => {
                    if (picked.length === 0) { toast.error("Queue at least one doctor."); return; }
                    try {
                      const res = await sendNow.mutateAsync(batch.id);
                      toast.success(`Sent. ${res.doctor_count} doctors → ${res.bcc_count} hospitals.`);
                      close();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Send failed");
                    }
                  }}
                  disabled={sendNow.isPending || picked.length === 0}
                >
                  <Send className="h-3.5 w-3.5 mr-1.5" /> {sendNow.isPending ? "Sending..." : "Send now"}
                </Button>
              )}
              {batch.status === "sent" && (
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (!confirm(`Resend this batch? Same ${picked.length} doctor${picked.length === 1 ? "" : "s"} will go out again.`)) return;
                    try {
                      const res = await sendNow.mutateAsync({ batchId: batch.id, force: true });
                      toast.success(`Resent. ${res.doctor_count} doctors → ${res.bcc_count} hospitals.`);
                      close();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Resend failed");
                    }
                  }}
                  disabled={sendNow.isPending || picked.length === 0}
                >
                  <RefreshCw className={`h-3.5 w-3.5 mr-1.5 text-teal-600 ${sendNow.isPending ? "animate-spin" : ""}`} />
                  {sendNow.isPending ? "Resending..." : "Resend"}
                </Button>
              )}
              <Button variant="outline" onClick={close}>Close</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Where the doctor's record lives in Zoho — "Doctors on Board" rows are
 *  doctors who've been placed at least once and tend to be higher-quality
 *  candidates than raw Leads. */
function SourceBadge({ source }: { source: "lead" | "dob" }) {
  const isDob = source === "dob";
  return (
    <span
      title={isDob ? "From Zoho Doctors on Board (previously placed)" : "From Zoho Leads (raw applicant)"}
      className={`inline-flex items-center rounded-full border px-1.5 py-[1px] text-[9px] font-medium uppercase tracking-wider ${
        isDob
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : "bg-sky-50 text-sky-700 border-sky-200"
      }`}
    >
      {isDob ? "DoB" : "Lead"}
    </span>
  );
}

/** Tiny pill that shows a doctor's readiness score and the criteria that
 *  contributed to it (tooltip on hover via the native title attribute). */
function ScoreBadge({ score, reasons }: { score: number; reasons: string[] }) {
  const tone =
    score >= 70 ? "bg-emerald-100 text-emerald-800 border-emerald-200" :
    score >= 40 ? "bg-amber-100 text-amber-800 border-amber-200" :
                  "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <span
      title={reasons.length ? reasons.join(" · ") : "No bonuses"}
      className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-[1px] text-[9px] font-semibold tabular-nums ${tone}`}
    >
      <Star className="h-2.5 w-2.5" />
      {score}
    </span>
  );
}

interface DoctorScore {
  total:   number;
  reasons: string[];   // human-readable contributors, for the tooltip
}

/** Rank a doctor's readiness for a batch send.
 *
 *  Signals (highest → lowest weight):
 *   - Specialty matches the batch's target specialty (+40)           ← only for specialty_of_day
 *   - Source = Doctor on Board (placed before, validated) (+20)
 *   - Has at least one license / certification (DOH/DHA/MOH/License) (+20)
 *   - High-priority lead status (+15)
 *   - Prime classification flagged "premium"-ish (+10)
 *   - Profile completeness: email + specialty filled (+5 each)
 *   - Created in last 90 days (+10)                                  ← freshness
 *
 *  Numbers are deliberately small + bounded so users still recognise the
 *  rank order intuitively. Score caps at 100. */
function scoreDoctor(d: DoctorOption, batch: ScheduledBatch, effectiveSpecialty?: string | null): DoctorScore {
  const reasons: string[] = [];
  let total = 0;

  // Prefer the batch's own specialty (specialty_of_day) when set; otherwise
  // fall back to the caller's hint (typically today's rotation specialty,
  // so even daily_duo / tuesday_top_15 ranks rotation-matching doctors up).
  const targetSpecialty = batch.specialty ?? effectiveSpecialty ?? null;
  if (targetSpecialty && d.speciality) {
    const docGroup   = groupSpecialty(d.speciality);
    const batchGroup = groupSpecialty(targetSpecialty) ?? targetSpecialty;
    const directHit  = normaliseSpec(d.speciality) === normaliseSpec(targetSpecialty);
    const bucketHit  = !!docGroup && normaliseSpec(docGroup) === normaliseSpec(batchGroup);
    // Promote rare-spec / cousin matches via the canonical scoreSpecialty
    // ladder: catches partial / parent / token-overlap cases the raw
    // exact-bucket compare above would miss (e.g. 'Cardiothoracic
    // Surgery' ↔ 'Cardiac Surgery'). Anchored at 1/4 of the bucket boost
    // for the weakest tier so it never outranks a clean directHit.
    const specPts50 = scoreSpecialty(d.speciality, targetSpecialty);
    if (directHit || bucketHit) {
      const pts = batch.specialty ? 40 : 20;
      total += pts;
      reasons.push(`+${pts} ${batch.specialty ? "specialty matches" : "rotation pick"} "${targetSpecialty}"${bucketHit && !directHit ? ` (via ${docGroup} bucket)` : ""}`);
    } else if (specPts50 > 0) {
      // Map the 0-50 ladder onto the batch-picker's narrower 0-25 boost
      // so a partial / parent / token match still moves the doctor up
      // the list without outranking exact-bucket peers above.
      const pts = Math.round((specPts50 / 50) * (batch.specialty ? 25 : 12));
      total += pts;
      const tierLabel =
        specPts50 === 35 ? "substring match" :
        specPts50 === 30 ? "same parent specialty" :
                           "specialty keyword overlap";
      reasons.push(`+${pts} ${tierLabel} ("${d.speciality}" ↔ "${targetSpecialty}")`);
    }
  }
  if (d.source === "dob") {
    total += 20; reasons.push("+20 placed before (Doctor on Board)");
  }
  if (d.hasLicense) {
    total += 20; reasons.push("+20 has DOH/DHA/MOH or other license");
  }
  if (d.highPriority) {
    total += 15; reasons.push("+15 high-priority lead");
  }
  if (d.primeClassification) {
    total += 10; reasons.push(`+10 prime classification (${d.primeClassification})`);
  }
  if (d.email)     { total += 5; reasons.push("+5 has email"); }
  if (d.speciality){ total += 5; reasons.push("+5 specialty filled"); }
  if (d.createdAt) {
    const days = (Date.now() - d.createdAt) / 86_400_000;
    if (days <= 90) { total += 10; reasons.push("+10 added in last 90 days"); }
  }

  return { total: Math.min(100, total), reasons };
}

function normaliseSpec(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ── Helpers ───────────────────────────────────────────────────────────────

interface DoctorOption {
  id:                   string;
  name:                 string;
  email:                string | null;
  speciality:           string | null;
  eligible:             boolean;
  // Ranking signals — see scoreDoctor().
  source:               "lead" | "dob";
  hasLicense:           boolean;
  highPriority:         boolean;
  primeClassification:  string | null;
  createdAt:            number | null;   // ms epoch
}

function useMemoDoctors(zoho: unknown, lifecycleMap: Record<string, { eligible_for_sending: boolean }>): DoctorOption[] {
  return useMemoReact(() => {
    const z = zoho as { rawLeads?: ZohoLead[]; rawDoctorsOnBoard?: ZohoDoctorOnBoard[] } | undefined;
    const out: DoctorOption[] = [];
    const eligibleOf = (id: string) => lifecycleMap[id]?.eligible_for_sending !== false;
    const toMs = (s: string | null | undefined) => {
      if (!s) return null;
      const t = new Date(s).getTime();
      return Number.isFinite(t) ? t : null;
    };

    // Build lookup tables from Leads so DoB rows missing their own
    // Specialty field can fall back to the matching Lead's specialty.
    // Match by email, phone (digits only), or normalised name.
    const leadSpecByEmail = new Map<string, string>();
    const leadSpecByPhone = new Map<string, string>();
    const leadSpecByName  = new Map<string, string>();
    const normPhone = (p: string | null | undefined) => (p ?? "").replace(/\D/g, "");
    const normName  = (n: string | null | undefined) => (n ?? "").toLowerCase().trim();
    for (const l of z?.rawLeads ?? []) {
      const sp = l.Specialty || l.Specialty_New;
      if (!sp) continue;
      if (l.Email) leadSpecByEmail.set(l.Email.toLowerCase().trim(), sp);
      const ph = normPhone(l.Phone ?? l.Mobile);
      if (ph) leadSpecByPhone.set(ph, sp);
      const nm = normName(l.Full_Name || `${l.First_Name ?? ""} ${l.Last_Name ?? ""}`);
      if (nm) leadSpecByName.set(nm, sp);
    }

    for (const d of z?.rawDoctorsOnBoard ?? []) {
      const name = d.Full_Name || `${d.First_Name ?? ""} ${d.Last_Name ?? ""}`.trim();
      if (!name) continue;
      const id = `dob:${d.id}`;
      // Prefer the DoB's own Specialty fields (Zoho uses British spelling
      // `Speciality` + a `Specialty_New` override), then cross-reference a
      // matching Lead. Without this fallback the picker shows "—" for
      // older DoB rows that have no specialty set.
      const dobSpec = d.Specialty_New || d.Speciality || null;
      const fallbackSpec = dobSpec ? null : (
        (d.Email && leadSpecByEmail.get(d.Email.toLowerCase().trim())) ||
        (() => { const p = normPhone(d.Phone ?? d.Mobile); return p ? leadSpecByPhone.get(p) : null; })() ||
        leadSpecByName.get(normName(name)) ||
        null
      );
      out.push({
        id, name,
        email:       d.Email,
        speciality:  dobSpec ?? fallbackSpec,
        eligible:    eligibleOf(id),
        source:      "dob",
        // DoB rows don't carry license fields — but being a DoB at all is
        // already validation (they were placed somewhere before).
        hasLicense:          false,
        highPriority:        false,
        primeClassification: null,
        createdAt:           toMs(d.Modified_Time ?? d.Created_Time),
      });
    }
    for (const l of z?.rawLeads ?? []) {
      const name = l.Full_Name || `${l.First_Name ?? ""} ${l.Last_Name ?? ""}`.trim();
      if (!name) continue;
      const id = `lead:${l.id}`;
      const hasLic = !!(l.Has_DOH || l.Has_DHA || l.Has_MOH || l.License);
      const prime  = (l.Prime_Classification ?? "").trim();
      out.push({
        id, name,
        email:       l.Email,
        speciality:  l.Specialty ?? l.Specialty_New,
        eligible:    eligibleOf(id),
        source:      "lead",
        hasLicense:  hasLic,
        highPriority:        /high/i.test(l.Lead_Status ?? ""),
        primeClassification: prime || null,
        createdAt:           toMs(l.Created_Time),
      });
    }
    return out;
  }, [zoho, lifecycleMap]);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }); }
  catch { return iso; }
}

// silence unused suspects we kept for symmetry
void CheckCircle2; void useMemo;
