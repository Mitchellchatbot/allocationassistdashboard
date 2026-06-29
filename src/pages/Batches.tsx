import { useEffect, useMemo, useState, useMemo as useMemoReact } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { DocLink } from "@/components/DocLink";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mailbox, Plus, Send, X, CheckCircle2, Calendar, ChevronRight, ChevronDown, RefreshCw, AlertCircle, Sparkles, UserSquare, GripVertical, Wand2, Pencil } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useScheduledBatches, useUpsertBatch, useUpdateBatch, useCancelBatch, useSendBatchNow, useBatchPreview,
  useSpecialtyRotation, useUpdateSpecialtyRotation,
  type ScheduledBatch, type BatchKind,
} from "@/hooks/use-scheduled-batches";
import { useHospitals } from "@/hooks/use-hospitals";
import { useZohoData, type ZohoLead, type ZohoDoctorOnBoard } from "@/hooks/use-zoho-data";
import { useDoctorLifecycleMap } from "@/hooks/use-doctor-lifecycle";
import { groupSpecialty } from "@/lib/specialty-groups";
import { scoreCandidate, type MatchScore } from "@/lib/match-score";
import { useWpCandidates, usePublishedWpCandidates, wpCandidateProfileText, type WpCandidate } from "@/hooks/use-wp-candidates";
import { MatchScoreChip, MatchReasons } from "@/components/DoctorVacancyMatches";
import { EditableEmailPreview } from "@/components/EditableEmailPreview";
import { AttachmentsPicker } from "@/components/automations/AttachmentsPicker";
import type { EmailAttachment } from "@/lib/email-attachments";
import { GulfClock, composeGulfDateTime } from "@/components/GulfClock";
import { useScheduledProfileSends, useCancelScheduledProfileSend } from "@/hooks/use-scheduled-profile-sends";
import { UserSquare2 } from "lucide-react";

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
              <DocLink slug="hospital-introduction/batch-sends" />
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

        <ScheduledProfileSendsCard />

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
          {batch.scheduled_at_time && (
            <Badge variant="outline" className="text-[9px] bg-teal-50 text-teal-700 border-teal-200 tracking-wider">
              {batch.scheduled_at_time.slice(0, 5)} GST
            </Badge>
          )}
          {batch.recurrence?.freq === "weekly" && (
            <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-200 uppercase tracking-wider">Weekly</Badge>
          )}
          {batch.country && (
            <Badge variant="outline" className="text-[9px] bg-sky-50 text-sky-700 border-sky-200 uppercase tracking-wider">
              {batch.country} · {workWeekLabel(batch.country)}
            </Badge>
          )}
          {batch.specialty && (
            <Badge variant="outline" className="text-[9px] bg-violet-50 text-violet-700 border-violet-200 uppercase tracking-wider">
              {batch.specialty}
            </Badge>
          )}
          <StatusBadge status={batch.status} />
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
          <span>{batch.doctor_ids.length} doctor{batch.doctor_ids.length === 1 ? "" : "s"} queued</span>
          {batch.hospital_count != null && <span>· {batch.hospital_count} hospital recipients</span>}
          {batch.status === "draft" && batch.scheduled_at_time && (
            <><span>·</span><GulfClock when={composeGulfDateTime(batch.scheduled_for, batch.scheduled_at_time.slice(0, 5))} /></>
          )}
          {batch.sent_at && <span>· sent {formatDate(batch.sent_at)}</span>}
          {batch.error && <span className="text-rose-600">· {batch.error}</span>}
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
  const { data: wpCandidates = [] } = useWpCandidates();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState("");

  // Doctor roster for the Today's-Pick "Closest matches" tile.
  // Carries the FULL match-input shape so scoreCandidate ranks these
  // doctors with the same algorithm the batch picker uses — same
  // numbers in both places (user's spec: 'rank these by whatever
  // shows up when you click the doctors view').
  const rankableDoctors = useMemoReact(() => {
    const z = zoho as { rawLeads?: ZohoLead[]; rawDoctorsOnBoard?: ZohoDoctorOnBoard[] } | undefined;
    const eligible = (id: string) => lifecycleMap[id]?.eligible_for_sending !== false;
    const yes = (v: unknown) => typeof v === "string" && /^y/i.test(v.trim());

    // WP candidate lookup so the rank picks up the rich post-publish
    // fields (country of training, license status, years experience,
    // etc.) instead of dead-ending at Zoho's sparser snapshot.
    const wpByDoctorId = new Map<string, WpCandidate>();
    const wpByEmail    = new Map<string, WpCandidate>();
    for (const c of wpCandidates) {
      if (c.doctor_id) wpByDoctorId.set(c.doctor_id, c);
      if (c.email)     wpByEmail.set(c.email.toLowerCase().trim(), c);
    }
    const findWp = (id: string, email: string | null): WpCandidate | null =>
      wpByDoctorId.get(id) ??
      (email ? wpByEmail.get(email.toLowerCase().trim()) ?? null : null);
    const pickStr = (...vs: Array<string | null | undefined>): string | null => {
      for (const v of vs) if (v != null && v !== "") return v;
      return null;
    };
    const pickNum = (...vs: Array<number | null | undefined>): number | null => {
      for (const v of vs) if (v != null) return v;
      return null;
    };

    interface R {
      id:               string;
      name:             string;
      speciality:       string | null;
      source:           "lead" | "dob";
      license:          string | null;
      has_dha:          boolean;
      has_doh:          boolean;
      has_moh:          boolean;
      country_training: string | null;
      nationality:      string | null;
      years_experience: number | null;
      notice_period:    string | null;
      area_of_interest: string | null;
      bio:              string | null;
    }
    const out: R[] = [];
    for (const d of z?.rawDoctorsOnBoard ?? []) {
      const name = d.Full_Name || `${d.First_Name ?? ""} ${d.Last_Name ?? ""}`.trim();
      const id   = `dob:${d.id}`;
      if (!name || !eligible(id)) continue;
      const wp = findWp(id, d.Email);
      const dRich = d as Record<string, unknown>;
      const dStr = (k: string) => typeof dRich[k] === "string" && (dRich[k] as string).trim() ? (dRich[k] as string) : null;
      const dNum = (k: string) => typeof dRich[k] === "number" && Number.isFinite(dRich[k] as number) ? (dRich[k] as number) : null;
      out.push({
        id,
        name:             pickStr(wp?.full_name, name) ?? name,
        speciality:       pickStr(wp?.specialty, d.Specialty_New, d.Speciality),
        source:           "dob",
        license:          pickStr(wp?.license_status, d.License),
        has_dha:          yes(dRich.Has_DHA) || /dha/i.test(wp?.license_status ?? ""),
        has_doh:          yes(dRich.Has_DOH) || /doh/i.test(wp?.license_status ?? ""),
        has_moh:          yes(dRich.Has_MOH) || /moh/i.test(wp?.license_status ?? ""),
        country_training: pickStr(wp?.country_of_training, dStr("Country_of_Specialty_training")),
        nationality:      pickStr(wp?.nationality, dStr("Nationality")),
        years_experience: pickNum(wp?.years_experience, dNum("Years_of_Experience")),
        notice_period:    pickStr(wp?.notice_period, dStr("Notice_Period")),
        area_of_interest: pickStr(wp?.area_of_interest, dStr("Area_of_Interest")),
        bio:              dStr("Bio"),
      });
    }
    for (const l of z?.rawLeads ?? []) {
      const name = l.Full_Name || `${l.First_Name ?? ""} ${l.Last_Name ?? ""}`.trim();
      const id   = `lead:${l.id}`;
      if (!name || !eligible(id)) continue;
      const wp = findWp(id, l.Email);
      const lRich = l as Record<string, unknown>;
      const lStr = (k: string) => typeof lRich[k] === "string" && (lRich[k] as string).trim() ? (lRich[k] as string) : null;
      const lNum = (k: string) => typeof lRich[k] === "number" && Number.isFinite(lRich[k] as number) ? (lRich[k] as number) : null;
      out.push({
        id,
        name:             pickStr(wp?.full_name, name) ?? name,
        speciality:       pickStr(wp?.specialty, l.Specialty, l.Specialty_New),
        source:           "lead",
        license:          pickStr(wp?.license_status, l.License),
        has_dha:          yes(l.Has_DHA) || /dha/i.test(wp?.license_status ?? ""),
        has_doh:          yes(l.Has_DOH) || /doh/i.test(wp?.license_status ?? ""),
        has_moh:          yes(l.Has_MOH) || /moh/i.test(wp?.license_status ?? ""),
        country_training: pickStr(wp?.country_of_training, l.Country_of_Specialty_training),
        nationality:      pickStr(wp?.nationality, lStr("Nationality")),
        years_experience: pickNum(wp?.years_experience, lNum("Years_of_Experience")),
        notice_period:    pickStr(wp?.notice_period, lStr("Notice_Period")),
        area_of_interest: pickStr(wp?.area_of_interest, lStr("Area_of_Interest")),
        bio:              lStr("Bio"),
      });
    }
    return out;
  }, [zoho, lifecycleMap, wpCandidates]);

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
              // Use the canonical scoreCandidate so this ranking matches
              // exactly what shows up when the team clicks into the
              // doctor picker. Same algorithm, same numbers, same tier
              // badges across all surfaces.
              const ranked = today
                ? rankableDoctors
                    .map(r => ({ r, m: scoreCandidate(r, today, {}) }))
                    .filter(x => x.m.score > 0)
                    .sort((a, b) => b.m.score - a.m.score)
                    .slice(0, 5)
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
                          ? <>{todayGroup.doctorCount} eligible doctor{todayGroup.doctorCount === 1 ? "" : "s"} in this bucket · top {Math.min(5, ranked.length)} ranked below</>
                          : ranked.length > 0
                            ? <>Top {ranked.length} ranked doctor{ranked.length === 1 ? "" : "s"} below</>
                            : "Nothing in Zoho — pick doctors manually"}
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

                  {/* Top matches by the canonical scoreCandidate. Same
                      algorithm + same numbers as the doctor picker. */}
                  {ranked.length > 0 && (
                    <div className="rounded-lg border border-violet-200/70 bg-white px-3 py-2">
                      <div className="text-[9.5px] uppercase tracking-wider text-violet-700/80 font-semibold mb-1.5">
                        {todayGroup ? "Top-ranked doctors" : "Closest matches in Zoho"}
                      </div>
                      <div className="space-y-1">
                        {ranked.map(({ r, m }) => (
                          <div key={r.id} className="text-[11px]">
                            <div className="flex items-center gap-2">
                              <MatchScoreChip score={m} />
                              <span className="font-medium text-slate-800 truncate">{r.name}</span>
                              <span className="text-muted-foreground truncate">· {r.speciality ?? "—"}</span>
                              <span className="ml-auto text-[9px] uppercase tracking-wider text-muted-foreground shrink-0">{r.source}</span>
                            </div>
                            <MatchReasons score={m} className="pl-[3.1rem]" />
                          </div>
                        ))}
                      </div>
                      <div className="text-[9.5px] text-muted-foreground mt-1.5">
                        Tier: <span className="text-emerald-700">strong ≥70</span> · <span className="text-teal-700">decent ≥40</span> · <span className="text-amber-700">weak &lt;40</span>
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

// Scheduled Send-Profile campaigns (Amir #5) — future hospital+doctor sends
// queued from the Send Profile dialog. Cron firing is deploy-gated; the queue
// is fully visible + cancellable in the UI now.
function ScheduledProfileSendsCard() {
  const { data: scheduled = [], isLoading, isError, refetch } = useScheduledProfileSends();
  const cancel = useCancelScheduledProfileSend();
  if (isLoading) return null;
  // Always render once loaded — even with nothing queued — so a send you just
  // scheduled has a guaranteed home on this page. (Previously this returned null
  // when empty, which read as "my scheduled email vanished" if the list hadn't
  // refetched yet.) A manual Refresh covers any missed realtime event.
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <UserSquare2 className="h-4 w-4 text-teal-600" /> Scheduled profile sends
          <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-200">{scheduled.length}</Badge>
          <button
            type="button"
            onClick={() => refetch()}
            className="ml-auto inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium text-slate-500 hover:bg-slate-50"
            title="Refresh the queue"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </CardTitle>
        <CardDescription className="text-[11px]">
          Future hospital + doctor sends queued from Send Profile. The scheduler sends each automatically at its scheduled slot (checked every ~5 min). Cancel one below to stop it.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {scheduled.length === 0 ? (
          <div className="px-4 py-6 text-center text-[12px] text-muted-foreground">
            {isError
              ? <>Couldn't load the queue. <button onClick={() => refetch()} className="text-teal-600 hover:underline">Try again</button>.</>
              : <>Nothing scheduled yet. Sends you queue from <span className="font-medium text-slate-600">Send Profile → Schedule for later</span> show up here.</>}
          </div>
        ) : (
        <div className="divide-y">
          {scheduled.map(s => (
            <div key={s.id} className="px-4 py-3 flex items-center gap-3">
              <UserSquare2 className="h-4 w-4 text-slate-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[12px] font-medium truncate">{s.doctor_name}</span>
                  <Badge variant="outline" className="text-[9px] bg-slate-50 uppercase tracking-wider">{s.hospital_ids.length} hospital{s.hospital_ids.length === 1 ? "" : "s"}</Badge>
                  {s.template_overrides && <Badge variant="outline" className="text-[9px] bg-pink-50 text-pink-700 border-pink-200">custom template</Badge>}
                  {(s.attachments?.length ?? 0) > 0 && <Badge variant="outline" className="text-[9px] bg-teal-50 text-teal-700 border-teal-200">{s.attachments.length} attachment{s.attachments.length === 1 ? "" : "s"}</Badge>}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <span>{s.doctor_speciality ?? "—"}</span>
                  <span>·</span>
                  <GulfClock when={composeGulfDateTime(s.scheduled_for, (s.scheduled_at_time ?? "09:00").slice(0, 5))} />
                </div>
              </div>
              <Button
                size="sm" variant="ghost" className="h-7 text-[10px] text-rose-600 hover:bg-rose-50"
                onClick={async () => { if (confirm(`Cancel the scheduled send for ${s.doctor_name}?`)) { try { await cancel.mutateAsync(s.id); toast.success("Cancelled."); } catch (e) { toast.error(e instanceof Error ? e.message : "Cancel failed"); } } }}
              >
                Cancel
              </Button>
            </div>
          ))}
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

// Gulf work weeks differ by country: UAE runs Mon–Fri (Sat–Sun weekend) while
// Saudi + the other GCC desks run Sun–Thu (Fri–Sat weekend). The batch's
// country picks the work week, so the Saudi team sees their own schedule.
const SUN_THU_COUNTRIES = new Set(["saudi arabia", "ksa", "saudi", "qatar", "oman", "kuwait", "bahrain"]);
function workWeekLabel(country: string | null | undefined): string {
  return SUN_THU_COUNTRIES.has((country ?? "").toLowerCase().trim()) ? "Sun–Thu" : "Mon–Fri";
}
/** Weekday numbers (0=Sun…6=Sat) for the country's work week — used for the
 *  "every weekday" recurrence so a Saudi schedule recurs Sun–Thu. */
function workWeekdays(country: string | null | undefined): number[] {
  return SUN_THU_COUNTRIES.has((country ?? "").toLowerCase().trim())
    ? [0, 1, 2, 3, 4]   // Sun–Thu
    : [1, 2, 3, 4, 5];  // Mon–Fri
}

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
  const previewMut = useBatchPreview();
  const [emailPreview, setEmailPreview] = useState<{ subject: string; html: string; text: string; bcc_count: number } | null>(null);
  // Editable-preview state: the team can tweak the subject/body before sending.
  // editSubject/editHtml are the live (possibly edited) values; emailPreview
  // holds the pristine template render so "Reset" + the edited-diff check work.
  const [editSubject, setEditSubject] = useState("");
  const [editHtml, setEditHtml] = useState("");
  const [previewResetTick, setPreviewResetTick] = useState(0);
  // True once the team has actually changed the subject or body away from the
  // template render — gates the override on send and the "edited" UI hints.
  const batchEdited = !!emailPreview && (editSubject !== emailPreview.subject || editHtml !== emailPreview.html);
  const { data: zoho } = useZohoData();
  const lifecycleMap = useDoctorLifecycleMap();
  // Pool = WP PUBLISHED candidates only (the website), augmented from Zoho.
  // Drafts/private + leads are excluded from the batch picker.
  const { data: wpCandidates = [] } = usePublishedWpCandidates();
  const allDoctors = useMemoDoctors(zoho, lifecycleMap, wpCandidates);

  // Create-form local state — only used while target === "new".
  const [kind, setKind] = useState<BatchKind>("daily_duo");
  const [scheduledFor, setScheduledFor] = useState<string>(todayISO());
  // Time-of-day + recurrence (Amir #5) — Gulf time. Two daily batches at
  // different times become two rows on the same date+country.
  const [scheduledTime, setScheduledTime] = useState<string>("09:00");
  const [recurrenceFreq, setRecurrenceFreq] = useState<"none" | "weekly">("none");
  const [specialty, setSpecialty]       = useState<string>("");
  // Country defaults to UAE — that's the highest-volume target and matches
  // Ammar's spec (one batch per country, sent to all hospitals in that
  // country). Empty string = broadcast to all hospitals (legacy fallback).
  const [country,   setCountry]         = useState<string>("UAE");
  const [creating, setCreating]         = useState(false);

  // Editor-only state.
  const [search, setSearch] = useState("");
  // specialtyOnly defaults ON whenever there's a specialty to scope to —
  // the batch's own specialty (specialty_of_day) OR today's rotation
  // specialty for the open-ended kinds (daily_duo / tuesday_top_15). The
  // team can uncheck it to widen the pool.
  const [specialtyOnly, setSpecialtyOnly] = useState(true);
  // Website-only pool — default ON. Ammar 2026-06-09: batches should pull
  // from doctors who are actually live on the AA website (have a matching
  // WP candidate), not the whole Zoho roster. Toggle off to widen the pool.
  const [websiteOnly, setWebsiteOnly] = useState(true);
  // Which rows have their score breakdown expanded (collapsed by default so
  // the candidate list stays short — click a row to see the why).
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => setExpandedDocs(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // When the dialog swaps to a different batch, default specialtyOnly ON
  // whenever there's a specialty to scope to — the batch's own specialty,
  // or today's rotation specialty for the open-ended kinds (daily_duo /
  // tuesday_top_15). Only OFF when no effective specialty exists at all.
  useEffect(() => {
    if (!editingBatch) return;
    const hasSpecialtyScope = !!(editingBatch.specialty
      || (editingBatch.kind !== "specialty_of_day" && suggestedSpecialty));
    setSpecialtyOnly(hasSpecialtyScope);
  }, [editingBatch?.id, editingBatch?.specialty, editingBatch?.kind, suggestedSpecialty]);

  const close = () => {
    onTargetChange(null);
    setKind("daily_duo"); setScheduledFor(todayISO()); setSpecialty(""); setCountry("UAE"); setSearch("");
    setScheduledTime("09:00"); setRecurrenceFreq("none");
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
      // Duplicate detection now includes the TIME (Amir #5) so two same-day
      // same-country batches at different times are NOT collapsed into one.
      const existing = batches.find(b =>
        b.kind === kind &&
        b.scheduled_for === scheduledFor &&
        (b.specialty ?? "") === (finalSpecialty ?? "") &&
        (b.country   ?? "") === (country.trim() || "") &&
        ((b.scheduled_at_time ?? "").slice(0, 5) || "") === scheduledTime &&
        b.status !== "cancelled",
      );
      if (existing) {
        toast.info("A batch for this date + country + time already exists — opening it.");
        onTargetChange(existing.id);
        setCreating(false); return;
      }
      const created = await upsert.mutateAsync({
        kind,
        scheduled_for: scheduledFor,
        scheduled_at_time: scheduledTime,
        timezone: "Asia/Dubai",
        recurrence: recurrenceFreq === "weekly"
          ? { freq: "weekly", weekdays: workWeekdays(country) }
          : { freq: "none" },
        specialty:     finalSpecialty,
        country:       country.trim() || null,
      });
      toast.success("Batch created. Pick doctors below.");
      // Stay in the dialog — swap into doctor-picker mode.
      onTargetChange(created.id);
    } catch (e) {
      // Surface the actual Postgres / Supabase error so users see "duplicate
      // key" or RLS rejections instead of a generic "[object Object]".
      const msg = e instanceof Error ? e.message
        : (e && typeof e === "object" && "message" in e) ? String((e as { message?: unknown }).message)
        : String(e);
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
    // Default pool = doctors live on the AA website (have a WP candidate).
    // Toggle off to fall back to the full Zoho roster.
    const base = allDoctors.filter(d =>
      d.eligible &&
      !batch.doctor_ids.includes(d.id) &&
      (!websiteOnly || d.onWebsite),
    );

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

    // Search bypasses EVERY filter (Amir 2026-06-26: "not even eligible —
    // just every person with a profile on WordPress"). The website / specialty
    // toggles and the eligibility gate shape the DEFAULT ranked suggestions,
    // but typing a name/keyword is the user explicitly asking for a specific
    // person, so we scan the whole pool. allDoctors is built spine-first from
    // the published WP candidates, so this IS "everyone with a WordPress
    // profile" — only the already-queued ones are removed. Keyword search hits
    // the doctor's WHOLE profile blob (headline specialty + sub-specialty +
    // area of interest + bio + WP education / experience / job-title text).
    const filtered = !q
      ? specialtyFiltered
      : allDoctors.filter(d =>
          !batch.doctor_ids.includes(d.id) &&
          (d.profileText.includes(q) || (d.email ?? "").toLowerCase().includes(q)),
        );
    const scored = filtered.map(d => ({ ...d, _score: scoreDoctor(d, batch, effectiveSpecialty) }));
    // When the user is searching, rank by WHERE the keyword hit first
    // (sub-specialty > area of interest > headline specialty > anywhere in
    // the profile), then by readiness score — so the doctor who genuinely
    // owns that sub-specialty is the top recommendation, not just whoever
    // scores highest overall.
    scored.sort((a, b) =>
      (q ? keywordRelevance(b, q) - keywordRelevance(a, q) : 0) ||
      b._score.score - a._score.score,
    );
    // Show more when searching — an explicit lookup shouldn't get truncated
    // at the same shortlist length as the ranked default view.
    return scored.slice(0, q ? 100 : 30);
  })();

  const setDoctors = async (next: string[]) => {
    if (!batch) return;
    try { await update.mutateAsync({ id: batch.id, patch: { doctor_ids: next } }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Update failed"); }
  };
  const setAttachments = async (next: EmailAttachment[]) => {
    if (!batch) return;
    try { await update.mutateAsync({ id: batch.id, patch: { attachments: next } }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Attachment update failed"); }
  };
  // Dedupe guard: doctor_ids comes from the query cache, so a fast double-
  // click before the refetch lands could otherwise queue the same doctor
  // twice (→ two identical cards in the send).
  const add    = (id: string) => batch && !batch.doctor_ids.includes(id) && setDoctors([...batch.doctor_ids, id]);
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
    // Match what the list shows — website-only when that toggle is on.
    const pool = allDoctors
      .filter(d => d.eligible && !batch.doctor_ids.includes(d.id))
      .filter(d => !websiteOnly || d.onWebsite)
      .map(d => ({ d, score: scoreDoctor(d, batch, effectiveSpecialty).score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, need)
      .map(x => x.d.id);
    if (pool.length === 0) { toast.error("No eligible candidates to auto-pick."); return; }
    setDoctors([...batch.doctor_ids, ...pool]);
    toast.success(`Auto-picked top ${pool.length} by rank.`);
  };

  const countWarning = batch && batch.status === "draft" && picked.length !== expectedCount;

  return (
    <>
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
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">Date</Label>
                  <Input type="date" value={scheduledFor} onChange={e => setScheduledFor(e.target.value)} className="h-9 text-[12px]" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] flex items-center gap-1">Time <span className="text-slate-400 normal-case">(GST)</span></Label>
                  <Input type="time" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} className="h-9 text-[12px]" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Repeat</Label>
                <Select value={recurrenceFreq} onValueChange={(v) => setRecurrenceFreq(v as "none" | "weekly")}>
                  <SelectTrigger className="h-9 text-[12px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">One-time</SelectItem>
                    <SelectItem value="weekly">Every working day ({workWeekLabel(country)})</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  Tip: schedule one <strong>duo at 09:00</strong> and a second <strong>at 14:00</strong> for the same day — both are kept as separate sends.
                </p>
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
                <div className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-sky-50 px-2 py-1 text-[10px] text-sky-700">
                  <Calendar className="h-3 w-3" />
                  {country === "UAE" ? "UAE team" : `${country} team`} work week: <strong>{workWeekLabel(country)}</strong>
                  <span className="text-sky-600/70">({workWeekLabel(country) === "Sun–Thu" ? "Fri–Sat weekend" : "Sat–Sun weekend"})</span>
                </div>
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
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleExpand(d.id)}>
                      <div className="text-[12px] font-medium truncate flex items-center gap-1.5">
                        {d.name}
                        <MatchScoreChip score={s} />
                        <SourceBadge source={d.source} />
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">{d.speciality ?? "—"}{d.email && ` · ${d.email}`}</div>
                      {expandedDocs.has(d.id) && <MatchReasons score={s} max={20} wrap className="mt-1" />}
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

            <section className="pt-3 border-t">
              <AttachmentsPicker
                attachments={batch.attachments ?? []}
                onChange={setAttachments}
                disabled={batch.status !== "draft" || update.isPending}
                hint="CV, logbook, etc. — attached to every hospital in this batch"
              />
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
                  <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
                    <Checkbox
                      checked={websiteOnly}
                      onCheckedChange={(v) => setWebsiteOnly(!!v)}
                    />
                    On website only
                  </label>
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
                  placeholder="Search ANY WordPress profile by name, specialty, area of interest, or email"
                  className="h-9 text-[12px]"
                />
                {q && (
                  <div className="text-[10px] text-muted-foreground px-0.5">
                    Searching every doctor with a WordPress profile — the filters above and the eligibility gate don't apply while you search, so you can queue anyone.
                  </div>
                )}
                {candidatePool.length > 0 && (
                  <div className="rounded-md border max-h-[300px] overflow-y-auto divide-y">
                    {candidatePool.map(d => {
                      const isOpen = expandedDocs.has(d.id);
                      return (
                      <div
                        key={d.id}
                        onClick={() => toggleExpand(d.id)}
                        className="px-3 py-2 hover:bg-slate-50 flex items-start gap-2 cursor-pointer"
                      >
                        {/* + adds to the batch; click anywhere else expands the breakdown */}
                        <button
                          onClick={(e) => { e.stopPropagation(); add(d.id); }}
                          title="Add to batch"
                          className="shrink-0 mt-0.5 flex h-5 w-5 items-center justify-center rounded text-teal-600 hover:bg-teal-100 transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-medium truncate flex items-center gap-1.5">
                            {d.name}
                            <MatchScoreChip score={d._score} />
                            <SourceBadge source={d.source} />
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {d.speciality ?? "—"}{d.email && ` · ${d.email}`}
                            {q && keywordHitLabel(d, q) && (
                              <span className="text-teal-600"> · “{search.trim()}” in {keywordHitLabel(d, q)}</span>
                            )}
                          </div>
                          {isOpen && <MatchReasons score={d._score} max={20} wrap className="mt-1" />}
                        </div>
                        <ChevronDown className={`h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </div>
                      );
                    })}
                  </div>
                )}
                {!q && candidatePool.length === 0 && specialtyOnly && effectiveSpecialty && (
                  <div className="text-[11px] text-muted-foreground italic px-1">
                    No doctors in the <strong>{effectiveSpecialty}</strong> bucket. Uncheck "{effectiveSpecialty} only" to see all candidates.
                  </div>
                )}
                {!q && candidatePool.length === 0 && websiteOnly && !(specialtyOnly && effectiveSpecialty) && (
                  <div className="text-[11px] text-muted-foreground italic px-1">
                    No website-listed doctors here. Uncheck "On website only" to include doctors not yet on the AA website.
                  </div>
                )}
                {q && candidatePool.length === 0 && (
                  <div className="text-[11px] text-muted-foreground italic">No WordPress profile matches “{search.trim()}”.</div>
                )}
              </section>
            )}

            <DialogFooter>
              {/* Primary action is PREVIEW — it builds the email and opens
                  the preview modal, from which the user actually sends. */}
              <Button
                onClick={async () => {
                  if (picked.length === 0) { toast.error("Queue at least one doctor to preview."); return; }
                  try {
                    const p = await previewMut.mutateAsync(batch.status === "sent" ? { batchId: batch.id, force: true } : batch.id);
                    setEmailPreview({ subject: p.subject, html: p.html, text: p.text, bcc_count: p.bcc_count });
                    setEditSubject(p.subject);
                    setEditHtml(p.html);
                    setPreviewResetTick(t => t + 1);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Preview failed");
                  }
                }}
                disabled={previewMut.isPending || picked.length === 0}
              >
                {previewMut.isPending
                  ? <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Building preview…</>
                  : <><Mailbox className="h-3.5 w-3.5 mr-1.5" /> {batch.status === "sent" ? "Preview & resend" : "Preview & send"}</>}
              </Button>
              <Button variant="outline" onClick={close}>Close</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>

    {/* Email preview — the exact HTML hospitals will receive (send-batch
        dry_run), shown in a sandboxed iframe so the email's own styles
        can't leak into the dashboard. */}
    <Dialog open={!!emailPreview} onOpenChange={(v) => !v && setEmailPreview(null)}>
      <DialogContent className="sm:max-w-[820px] max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">Email preview</DialogTitle>
          <DialogDescription className="text-xs">
            {batchEdited
              ? <span className="font-medium text-teal-700">Edited — your version sends, not the template.</span>
              : "What you see is what goes out — edit the subject or body below before sending."}
            {typeof emailPreview?.bcc_count === "number" && (<> · BCC to {emailPreview.bcc_count} hospital{emailPreview.bcc_count === 1 ? "" : "s"}</>)}
            {batch && (batch.attachments?.length ?? 0) > 0 && (
              <> · {batch.attachments.length} attachment{batch.attachments.length === 1 ? "" : "s"}</>
            )}
          </DialogDescription>
        </DialogHeader>
        {emailPreview && (
          <EditableEmailPreview
            subject={editSubject}
            html={emailPreview.html}
            onSubjectChange={setEditSubject}
            onHtmlChange={setEditHtml}
            resetKey={previewResetTick}
            edited={batchEdited}
            onReset={() => {
              if (!emailPreview) return;
              setEditSubject(emailPreview.subject);
              setEditHtml(emailPreview.html);
              setPreviewResetTick(t => t + 1);
            }}
            from="Hospital Intro <hospitalintro@allocationassist.com>"
            className="flex-1 min-h-[62vh]"
          />
        )}
        <DialogFooter>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setEmailPreview(null)}>Close preview</Button>
            {/* Send/resend straight from the preview — what you see is what goes out. */}
            <Button
              onClick={async () => {
                if (!batch) return;
                if (batch.status === "sent"
                  && !confirm(`Resend this batch? Same ${picked.length} doctor${picked.length === 1 ? "" : "s"} will go out again.`)) return;
                try {
                  const overrides = batchEdited
                    ? { subjectOverride: editSubject, htmlOverride: editHtml }
                    : {};
                  const res = await sendNow.mutateAsync(
                    batch.status === "sent"
                      ? { batchId: batch.id, force: true, ...overrides }
                      : { batchId: batch.id, ...overrides },
                  );
                  toast.success(`${batch.status === "sent" ? "Resent" : "Sent"}. ${res.doctor_count} doctors → ${res.bcc_count} hospitals.`);
                  setEmailPreview(null);
                  close();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Send failed");
                }
              }}
              disabled={sendNow.isPending}
            >
              <Send className="h-3.5 w-3.5 mr-1.5" />
              {sendNow.isPending ? "Sending…" : (batch?.status === "sent" ? "Resend now" : "Send now")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

/** Where the doctor's record lives in Zoho — "Doctors on Board" rows are
 *  doctors who've been placed at least once and tend to be higher-quality
 *  candidates than raw Leads. */
function SourceBadge({ source }: { source: "lead" | "dob" | "wp" }) {
  const meta = source === "dob"
    ? { label: "DoB",  title: "Matched to Zoho Doctors on Board (previously placed)", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" }
    : source === "lead"
    ? { label: "Lead", title: "Matched to a Zoho Lead (raw applicant)",                cls: "bg-sky-50 text-sky-700 border-sky-200" }
    : { label: "Web",  title: "Live on the website — no Zoho match found",             cls: "bg-violet-50 text-violet-700 border-violet-200" };
  return (
    <span
      title={meta.title}
      className={`inline-flex items-center rounded-full border px-1.5 py-[1px] text-[9px] font-medium uppercase tracking-wider ${meta.cls}`}
    >
      {meta.label}
    </span>
  );
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
/** Returns the canonical MatchScore for a doctor against a batch.
 *  Single algorithm — same as the vacancy matcher, Today's Pick tile,
 *  Doctor → Vacancies rank, everything. Picker UIs feed this straight
 *  into MatchScoreChip so every number reads X/100 with the same
 *  strong / decent / weak tier colours. */
function scoreDoctor(d: DoctorOption, batch: ScheduledBatch, effectiveSpecialty?: string | null): MatchScore {
  const targetSpecialty = batch.specialty ?? effectiveSpecialty ?? "";
  const ms = scoreCandidate(
    {
      id:               d.id,
      name:             d.name,
      speciality:       d.speciality,
      license:          d.license,
      has_dha:          d.has_dha,
      has_doh:          d.has_doh,
      has_moh:          d.has_moh,
      country_training: d.country_training,
      nationality:      d.nationality,
      years_experience: d.years_experience,
      notice_period:    d.notice_period,
      area_of_interest: d.area_of_interest,
      bio:              d.bio,
      profile_text:     d.profileText,
    },
    targetSpecialty,
    {},
  );
  // One algorithm, one number across every surface: the picker now shows
  // the exact same score as the Today's-Pick / Top-Ranked rotation preview
  // and the vacancy matcher (all go through scoreCandidate). We used to
  // halve the specialty factor here for open-ended batches, which made the
  // same doctor score differently in the picker vs the preview — confusing.
  return ms;
}

function normaliseSpec(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** How strongly a doctor's profile matches the search keyword, weighted
 *  by WHERE it hit. A sub-specialty / area-of-interest hit is a far
 *  stronger "this is their thing" signal than a passing mention in the
 *  bio or experience blurb, so it ranks higher. `q` is already lowercased. */
function keywordRelevance(d: DoctorOption, q: string): number {
  if (!q) return 0;
  let r = 0;
  if ((d.subspecialty ?? "").toLowerCase().includes(q))     r += 4;
  if ((d.area_of_interest ?? "").toLowerCase().includes(q)) r += 3;
  if ((d.speciality ?? "").toLowerCase().includes(q))       r += 2;
  if ((d.bio ?? "").toLowerCase().includes(q))              r += 1;
  return r;
}

/** Short label for WHERE the search keyword hit a doctor's profile, so
 *  the recommendation is explainable ("‘electrophysiology’ in
 *  sub-specialty"). Mirrors keywordRelevance's priority order. */
function keywordHitLabel(d: DoctorOption, q: string): string | null {
  if (!q) return null;
  if ((d.subspecialty ?? "").toLowerCase().includes(q))     return "sub-specialty";
  if ((d.area_of_interest ?? "").toLowerCase().includes(q)) return "area of interest";
  if ((d.speciality ?? "").toLowerCase().includes(q))       return "specialty";
  if (d.profileText.includes(q))                            return "profile";
  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────

interface DoctorOption {
  id:                   string;
  name:                 string;
  email:                string | null;
  speciality:           string | null;
  eligible:             boolean;
  source:               "lead" | "dob" | "wp";
  // ── Full match-score input fields. Surfaced so the picker can
  //    call the shared scoreCandidate() with the same shape as
  //    vacancy matching, keeping one algorithm across all surfaces.
  license:              string | null;
  has_dha:              boolean;
  has_doh:              boolean;
  has_moh:              boolean;
  country_training:     string | null;
  nationality:          string | null;
  years_experience:     number | null;
  notice_period:        string | null;
  area_of_interest:     string | null;
  subspecialty:         string | null;
  bio:                  string | null;
  // ── Full profile free-text blob (name + WP education/experience/job
  //    title + Zoho bio/area). Powers the "search the whole profile for a
  //    sub-specialty keyword" filter + the scorer's sub-specialty bonus.
  profileText:          string;
  // ── Whether this doctor is live on the AA website (i.e. has a matching
  //    WP candidate). The picker defaults to website-only per Ammar's
  //    2026-06-09 spec — batches should feature doctors who actually
  //    appear on the site, not the whole Zoho roster.
  onWebsite:            boolean;
  // ── Legacy boolean shortcuts kept for the small set of UI bits
  //    that still read them (badge colours, source filter, etc.).
  hasLicense:           boolean;
  highPriority:         boolean;
  primeClassification:  string | null;
  createdAt:            number | null;   // ms epoch
}

function useMemoDoctors(
  zoho:          unknown,
  lifecycleMap:  Record<string, { eligible_for_sending: boolean }>,
  wpCandidates:  WpCandidate[] = [],
): DoctorOption[] {
  return useMemoReact(() => {
    const z = zoho as { rawLeads?: ZohoLead[]; rawDoctorsOnBoard?: ZohoDoctorOnBoard[] } | undefined;
    const out: DoctorOption[] = [];
    const eligibleOf = (id: string) => lifecycleMap[id]?.eligible_for_sending !== false;
    const toMs = (s: string | null | undefined) => {
      if (!s) return null;
      const t = new Date(s).getTime();
      return Number.isFinite(t) ? t : null;
    };

    // Pool SPINE = the website (published WP candidates). Each is matched to
    // a Zoho record — Doctors on Board first, then Leads — by PHONE → EMAIL →
    // NAME (Ammar 2026-06-11: "the spine should be website, match it to zoho
    // by phone, then email, then name"). So EVERY published doctor appears,
    // enriched with Zoho data when we can find them; WP fields always win.
    const pickStr = (...vs: Array<string | null | undefined>): string | null => {
      for (const v of vs) if (v != null && v !== "") return v;
      return null;
    };
    const pickNum = (...vs: Array<number | null | undefined>): number | null => {
      for (const v of vs) if (v != null) return v;
      return null;
    };
    const normName = (n: string | null | undefined) => (n ?? "").toLowerCase().replace(/\s+/g, " ").trim();
    // Last 9 digits — ignores country-code / formatting differences.
    const phoneKey = (p: string | null | undefined) => {
      const d = (p ?? "").replace(/\D/g, "");
      return d.length >= 9 ? d.slice(-9) : (d || null);
    };
    const yes = (v: unknown) => typeof v === "string" && /^y/i.test(v.trim());

    // Phone / email / name indexes over Zoho DoB + Leads (first writer wins).
    type ZIdx<T> = { phone: Map<string, T>; email: Map<string, T>; name: Map<string, T> };
    const buildIdx = <T extends Record<string, unknown>>(rows: T[]): ZIdx<T> => {
      const idx: ZIdx<T> = { phone: new Map(), email: new Map(), name: new Map() };
      for (const r of rows) {
        const ph = phoneKey((r.Phone ?? r.Mobile) as string | null); if (ph && !idx.phone.has(ph)) idx.phone.set(ph, r);
        const em = String(r.Email ?? "").toLowerCase().trim();        if (em && !idx.email.has(em)) idx.email.set(em, r);
        const nm = normName((r.Full_Name as string) || `${r.First_Name ?? ""} ${r.Last_Name ?? ""}`); if (nm && !idx.name.has(nm)) idx.name.set(nm, r);
      }
      return idx;
    };
    const idxDob  = buildIdx((z?.rawDoctorsOnBoard ?? []) as unknown as Array<Record<string, unknown>>);
    const idxLead = buildIdx((z?.rawLeads ?? []) as unknown as Array<Record<string, unknown>>);
    const matchZoho = <T,>(c: WpCandidate, idx: ZIdx<T>): T | null => {
      const ph = phoneKey(c.phone);            if (ph && idx.phone.has(ph)) return idx.phone.get(ph)!;
      const em = (c.email ?? "").toLowerCase().trim(); if (em && idx.email.has(em)) return idx.email.get(em)!;
      const nm = normName(c.full_name);        if (nm && idx.name.has(nm)) return idx.name.get(nm)!;
      return null;
    };

    const usedIds = new Set<string>();
    for (const c of wpCandidates) {
      const dob  = matchZoho(c, idxDob);
      const lead = dob ? null : matchZoho(c, idxLead);
      const zr   = (dob ?? lead ?? {}) as Record<string, unknown>;
      const zStr = (k: string): string | null => { const v = zr[k]; return typeof v === "string" && v.trim() ? v : null; };
      const zNum = (k: string): number | null => { const v = zr[k]; return typeof v === "number" && Number.isFinite(v) ? v : null; };
      // Stable id: prefer the matched Zoho record so existing batch
      // references keep resolving; else the WP candidate's own id.
      let id = dob ? `dob:${(dob as { id: string }).id}` : lead ? `lead:${(lead as { id: string }).id}` : `wp:${c.id}`;
      if (usedIds.has(id)) id = `wp:${c.id}`;     // two WP rows → same Zoho match
      if (usedIds.has(id)) continue;
      usedIds.add(id);
      const name = pickStr(c.full_name, zStr("Full_Name")) ?? `${zStr("First_Name") ?? ""} ${zStr("Last_Name") ?? ""}`.trim();
      if (!name) continue;
      const license = pickStr(c.license_status, zStr("License"));
      out.push({
        id, name,
        email:       pickStr(c.email, zStr("Email")),
        speciality:  pickStr(c.specialty, zStr("Specialty_New"), zStr("Speciality"), zStr("Specialty")),
        eligible:    eligibleOf(id),
        source:      dob ? "dob" : lead ? "lead" : "wp",
        license,
        has_dha:     /dha/i.test(license ?? "")      || (c.license_types ?? []).some(t => /dha/i.test(t))      || yes(zr.Has_DHA),
        has_doh:     /doh|haad/i.test(license ?? "") || (c.license_types ?? []).some(t => /doh|haad/i.test(t)) || yes(zr.Has_DOH),
        has_moh:     /moh/i.test(license ?? "")      || (c.license_types ?? []).some(t => /moh/i.test(t))      || yes(zr.Has_MOH),
        country_training:    pickStr(c.country_of_training, zStr("Country_of_Specialty_training")),
        nationality:         pickStr(c.nationality, zStr("Nationality")),
        years_experience:    pickNum(c.years_experience, zNum("Years_of_Experience")),
        notice_period:       pickStr(c.notice_period, zStr("Notice_Period")),
        area_of_interest:    pickStr(c.area_of_interest, zStr("Area_of_Interest")),
        subspecialty:        c.subspecialty ?? null,
        bio:                 zStr("Bio"),
        profileText:         [c.full_name, wpCandidateProfileText(c), zStr("Area_of_Interest"), zStr("Bio"), c.specialty ?? ""].filter(Boolean).join(" ").toLowerCase(),
        onWebsite:           true,
        hasLicense:          !!license || yes(zr.Has_DHA) || yes(zr.Has_DOH) || yes(zr.Has_MOH),
        highPriority:        false,
        primeClassification: null,
        createdAt:           toMs(zStr("Modified_Time") ?? zStr("Created_Time")),
      });
    }
    return out;
  }, [zoho, lifecycleMap, wpCandidates]);
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
