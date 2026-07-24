import { useCallback, useEffect, useMemo, useRef, useState, useMemo as useMemoReact, memo } from "react";
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
import { Mailbox, Plus, Send, X, CheckCircle2, Calendar, ChevronRight, ChevronDown, RefreshCw, AlertCircle, AlertTriangle, TestTube, Sparkles, UserSquare, GripVertical, Wand2, Pencil, Building2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useScheduledBatches, useUpsertBatch, useUpdateBatch, useCancelBatch, useSendBatchNow, useBatchPreview,
  useSpecialtyRotation, useUpdateSpecialtyRotation,
  type ScheduledBatch, type BatchKind, type BatchDoctorPreview, type BatchPerDoctorPreview,
} from "@/hooks/use-scheduled-batches";
import { useHospitals } from "@/hooks/use-hospitals";
import { useZohoData, type ZohoLead, type ZohoDoctorOnBoard } from "@/hooks/use-zoho-data";
import { useDoctorLifecycleMap } from "@/hooks/use-doctor-lifecycle";
import { groupSpecialty } from "@/lib/specialty-groups";
import { scoreCandidate, type MatchScore } from "@/lib/match-score";
import { useWpCandidates, usePublishedWpCandidates, wpCandidateProfileText, wpCandidateToTokens, type WpCandidate } from "@/hooks/use-wp-candidates";
import { buildProfileCardHtml } from "@/lib/profile-card-html";
import { buildDoctorProfileHtml, PROFILE_IMAGE_WIDTH } from "@/lib/doctor-profile-image";
import { captureAndUploadCard } from "@/lib/card-screenshot";
import { useDebounce } from "@/hooks/use-zoho-leads";
import { MatchScoreChip, MatchReasons } from "@/components/DoctorVacancyMatches";
import { EditableEmailPreview } from "@/components/EditableEmailPreview";
import { EmailPreviewStudio } from "@/components/EmailPreviewStudio";
import { CcBccPicker } from "@/components/automations/CcBccPicker";
import { AttachmentsPicker } from "@/components/automations/AttachmentsPicker";
import type { EmailAttachment } from "@/lib/email-attachments";
import { GulfClock, composeGulfDateTime } from "@/components/GulfClock";
import { cn } from "@/lib/utils";
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

  // Stable per-row edit handler so React.memo'd BatchRow rows don't re-render
  // on unrelated parent state changes (e.g. opening the dialog).
  const handleEditRow = useCallback((id: string) => setDialogTarget(id), []);

  const today = todayISO();
  const upcoming = useMemo(
    () => batches.filter(b => b.scheduled_for >= today && b.status !== "cancelled"),
    [batches, today],
  );
  const past = useMemo(
    () => batches.filter(b => b.scheduled_for <  today || b.status === "sent" || b.status === "cancelled"),
    [batches, today],
  );

  const eligibleRecipients = useMemo(
    () => hospitals.filter(h => !!h.primary_recruiter_email).length,
    [hospitals],
  );

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
                  <BatchRow key={b.id} batch={b} onEdit={handleEditRow} />
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
                  <BatchRow key={b.id} batch={b} onEdit={handleEditRow} compact />
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

const BatchRow = memo(function BatchRow({ batch, onEdit, compact = false }: { batch: ScheduledBatch; onEdit: (id: string) => void; compact?: boolean }) {
  const sendNow = useSendBatchNow();
  const cancel  = useCancelBatch();
  const kindLabel = KIND_LABEL[batch.kind];
  const dayLabel  = formatDate(batch.scheduled_for);
  const isToday   = batch.scheduled_for === todayISO();

  return (
    <div className={`px-4 py-3 flex items-center gap-3 ${isToday && batch.status === "draft" ? "bg-teal-50/30" : ""}`}>
      <KindIcon kind={batch.kind} />
      <button onClick={() => onEdit(batch.id)} className="flex-1 min-w-0 text-left">
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
});

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

  // Today's-pick ranking — re-scoring the full rankable roster is expensive,
  // so memoize on the exact inputs the computation reads (queue position +
  // roster + specialty groups). Output/order identical to the inline IIFE.
  const todaysPick = useMemoReact(() => {
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
    return { today, todayGroup, ranked };
  }, [rankableDoctors, queue, cursor, zohoSpecialties.groups]);

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
              const { today, todayGroup, ranked } = todaysPick;
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
export function ScheduledProfileSendsCard() {
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

const KIND_ICON_MAP: Record<BatchKind, { Icon: typeof Calendar; cls: string }> = {
  daily_duo:        { Icon: Calendar,  cls: "text-teal-600" },
  tuesday_top_15:   { Icon: Sparkles,  cls: "text-amber-600" },
  specialty_of_day: { Icon: RefreshCw, cls: "text-violet-600" },
};

function KindIcon({ kind }: { kind: BatchKind }) {
  const { Icon, cls } = KIND_ICON_MAP[kind];
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

/** Second-level tabs INSIDE a preview pane — "Hospital email" / "Doctor email"
 *  are the top-level tabs, and each holds one tab per doctor profile, since a
 *  Daily Duo sends a separate email per doctor on both legs.
 *
 *  Every pane stays MOUNTED (inactive ones are just hidden): the editors are
 *  contentEditable surfaces, and unmounting one would drop an in-progress edit
 *  when the user flicks between profiles. */
function ProfileSubTabs({ names, active, onSelect, panes }: {
  names: string[];
  active: number;
  onSelect: (i: number) => void;
  panes: React.ReactNode[];
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {names.length > 1 && (
        <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50/80 px-2 py-1.5">
          {names.map((n, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(i)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] font-medium transition",
                i === active
                  ? "bg-teal-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-200/70",
              )}
            >
              {n || `Profile ${i + 1}`}
            </button>
          ))}
        </div>
      )}
      {panes.map((p, i) => (
        <div key={i} className={cn("min-h-0 min-w-0 flex-1 flex-col", i === active ? "flex" : "hidden")}>{p}</div>
      ))}
    </div>
  );
}

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
  const [emailPreview, setEmailPreview] = useState<{ subject: string; html: string; text: string; bcc_count: number; doctor_email?: BatchDoctorPreview; per_doctor?: BatchPerDoctorPreview[]; doctor_emails?: BatchPerDoctorPreview[]; test_mode?: boolean; test_recipient?: string | null } | null>(null);
  // Daily Duo sends a SEPARATE profile-sent email per doctor, so each gets its
  // own editable pane. Index-aligned with emailPreview.per_doctor.
  const [perDoctor, setPerDoctor] = useState<Array<{ subject: string; html: string }>>([]);
  // Same for the working-opportunity leg — one editable email per doctor,
  // index-aligned with emailPreview.doctor_emails.
  const [perDoctorNote, setPerDoctorNote] = useState<Array<{ subject: string; html: string }>>([]);
  // Which profile sub-tab is open under each top-level tab.
  const [hospitalTab, setHospitalTab] = useState(0);
  const [doctorTab,   setDoctorTab]   = useState(0);
  // Editable-preview state: the team can tweak the subject/body before sending.
  // editSubject/editHtml are the live (possibly edited) values; emailPreview
  // holds the pristine template render so "Reset" + the edited-diff check work.
  const [editSubject, setEditSubject] = useState("");
  const [editHtml, setEditHtml] = useState("");
  // The optional doctor "working opportunity" email (editable second pane).
  const [editDoctorSubject, setEditDoctorSubject] = useState("");
  const [editDoctorHtml, setEditDoctorHtml] = useState("");
  const [previewResetTick, setPreviewResetTick] = useState(0);
  const [batchCc, setBatchCc] = useState<string[]>([]);
  const [batchBcc, setBatchBcc] = useState<string[]>([]);
  // Recruiter emails the team has EXCLUDED from this send — unchecked in the
  // "Sending to N hospitals" list. Passed as exclude_override so send-batch drops
  // them from the BCC (Sean: "exclusion ability for hospitals in email sends").
  const [excludedEmails, setExcludedEmails] = useState<string[]>([]);
  const isExcluded = (email: string | null | undefined) => {
    const e = (email ?? "").trim().toLowerCase();
    return !!e && excludedEmails.some(x => x === e);
  };
  const toggleExclude = (email: string | null | undefined) => {
    const e = (email ?? "").trim().toLowerCase();
    if (!e) return;
    const next = excludedEmails.includes(e) ? excludedEmails.filter(x => x !== e) : [...excludedEmails, e];
    setExcludedEmails(next);
    // Persist to the batch row so a SCHEDULED fire drops the same hospitals.
    if (editingBatch) update.mutate({ id: editingBatch.id, patch: { excluded_emails: next } });
  };
  // Click a hospital name to reveal its exact recruiter email (the address that
  // receives this batch) — click the email to copy it — AND preview that
  // hospital's personalised greeting ("Hello <name> team!" instead of "Team").
  const [emailShownFor, setEmailShownFor] = useState<Set<string>>(new Set());
  const [previewGreetId, setPreviewGreetId] = useState<string | null>(null);
  const toggleEmailShown = (id: string) => setEmailShownFor(prev => {
    const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });
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
  // Subject framing (Hasan 2026-07-20): "none" = legacy template subject;
  // "recap"/"specialty" swap in the "Excited to work in <hospital city>" headers.
  const [headerMode, setHeaderMode]     = useState<"none" | "recap" | "specialty">("none");
  const [creating, setCreating]         = useState(false);

  // Editor-only state.
  const [search, setSearch] = useState("");
  // Debounced search term drives the heavy whole-roster scan/score in
  // candidatePool; the <Input> below stays bound to the immediate `search`
  // so typing is instant. Once typing settles (200ms) the debounced value
  // catches up and the derived `q` — and everything keyed off it (list,
  // empty/no-results states, keyword labels) — matches the raw input, so
  // the final rendered result is identical; only the scan timing changes.
  const debouncedSearch = useDebounce(search, 200);
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
        // Recap/Specialty framings are Top-15 only — never persist one on any
        // other kind, even if it lingered in state from a kind switch.
        header_mode:   (kind === "tuesday_top_15" && headerMode !== "none") ? headerMode : null,
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

  // ── Recipient hospitals (shown in the preview's left rail) ──────────────
  // Mirrors send-batch's recipient resolution: every hospital with a recruiter
  // email, scoped to the batch's country when one is set. This is exactly the
  // BCC list that goes out, so the team can eyeball it before sending — and
  // add hospitals from OTHER countries on top (Hasan: "see the hospitals
  // selected on the left … ability to add more hospitals").
  const { data: previewHospitals = [] } = useHospitals();
  const eligibleHospitals = useMemo(() => {
    // Case-insensitive country match — hospital rows are entered by hand and a
    // "oman" / "Oman " mismatch would wrongly show 0 recipients for the area.
    const bc = (batch?.country ?? "").trim().toLowerCase();
    return previewHospitals
      .filter(h => !!h.primary_recruiter_email?.trim())
      .filter(h => !bc || (h.country ?? "").trim().toLowerCase() === bc)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [previewHospitals, batch?.country]);
  const eligibleEmails = useMemo(
    () => new Set(eligibleHospitals.map(h => h.primary_recruiter_email!.trim().toLowerCase())),
    [eligibleHospitals],
  );
  const bccSet = useMemo(() => new Set(batchBcc.map(e => e.trim().toLowerCase())), [batchBcc]);
  // Hospitals the user has manually added on top (their recruiter email is in
  // the extra-BCC list but they aren't already an eligible recipient).
  const addedHospitals = useMemo(
    () => previewHospitals.filter(h => {
      const e = h.primary_recruiter_email?.trim().toLowerCase();
      return e && bccSet.has(e) && !eligibleEmails.has(e);
    }),
    [previewHospitals, bccSet, eligibleEmails],
  );
  // The "+ Add another hospital" options — any hospital with a recruiter email
  // that isn't already receiving (different country) or already added.
  const addableHospitals = useMemo(
    () => previewHospitals
      .filter(h => !!h.primary_recruiter_email?.trim())
      .filter(h => {
        const e = h.primary_recruiter_email!.trim().toLowerCase();
        return !eligibleEmails.has(e) && !bccSet.has(e);
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
    [previewHospitals, eligibleEmails, bccSet],
  );
  // Regions present among the addable (not-yet-sending) hospitals — for the
  // "add a whole region at once" picker below.
  const REGION_SEP = "‖";
  const regionKeyOf = (h: { city: string | null; country: string | null }) =>
    `${(h.city ?? "").trim()}${REGION_SEP}${(h.country ?? "").trim()}`;
  const addRegions = useMemo(() => {
    const m = new Map<string, { key: string; label: string; count: number }>();
    for (const h of addableHospitals) {
      const city = (h.city ?? "").trim();
      if (!city) continue;
      const country = (h.country ?? "").trim();
      const key = regionKeyOf(h);
      const label = country && country.toLowerCase() !== city.toLowerCase() ? `${city} · ${country}` : city;
      const e = m.get(key) ?? { key, label, count: 0 };
      e.count++; m.set(key, e);
    }
    return [...m.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [addableHospitals]);
  const addHospitalBcc = (hospitalId: string) => {
    const h = previewHospitals.find(x => x.id === hospitalId);
    const email = h?.primary_recruiter_email?.trim();
    if (!email) return;
    setBatchBcc(prev => prev.some(e => e.toLowerCase() === email.toLowerCase()) ? prev : [...prev, email]);
    toast.success(`Added ${h!.name} to this send.`);
  };
  // Send to ONLY one region — an explicit recipient list that REPLACES the whole
  // batch-country scope (not additive). Null = use the batch's country default.
  const [regionOnly, setRegionOnly] = useState<{ key: string; label: string; emails: string[] } | null>(null);
  const selectRegionOnly = (regionKey: string) => {
    const inRegion = regionKey === "__all"
      ? addableHospitals
      : addableHospitals.filter(h => regionKeyOf(h) === regionKey);
    const emails = inRegion.map(h => h.primary_recruiter_email?.trim()).filter((e): e is string => !!e);
    if (emails.length === 0) { toast.error("No hospitals with a recruiter email in that region."); return; }
    const label = regionKey === "__all" ? "all addable regions" : (addRegions.find(r => r.key === regionKey)?.label ?? "this region");
    setRegionOnly({ key: regionKey, label, emails });
    setBatchBcc([]);            // region override replaces any manual additions
    setExcludedEmails([]);      // start fresh — nothing excluded within the region
    if (inRegion[0]?.id) setPreviewGreetId(inRegion[0].id);  // greet a region hospital in the sample
    toast.success(`Now sending to only ${label} (${emails.length} hospital${emails.length === 1 ? "" : "s"}).`);
  };
  const clearRegionOnly = () => { setRegionOnly(null); toast.message("Back to the batch's country hospitals."); };
  // The recipient list actually going out (before per-hospital exclusions): the
  // region override when set, else the batch-country eligible hospitals.
  const recipientOverrideEmails = regionOnly
    ? regionOnly.emails.filter(e => !isExcluded(e))
    : null;
  // Hospitals shown in the "Sending to…" list: the region's hospitals when a
  // region override is active, else the batch-country eligible ones. Region
  // override REPLACES the send, so manual single-adds are hidden while it's on.
  const regionHospitals = useMemo(
    () => regionOnly
      ? previewHospitals.filter(h => regionOnly.emails.includes((h.primary_recruiter_email ?? "").trim()))
      : [],
    [regionOnly, previewHospitals],
  );
  const displayHospitals = regionOnly ? regionHospitals : eligibleHospitals;
  const sendingCount = displayHospitals.filter(h => !isExcluded(h.primary_recruiter_email)).length
    + (regionOnly ? 0 : addedHospitals.length);
  const removeHospitalBcc = (email: string) =>
    setBatchBcc(prev => prev.filter(e => e.trim().toLowerCase() !== email.trim().toLowerCase()));

  // Personalised greeting per hospital (mirrors send-batch's greetingFor): the
  // hospital's contact person when it greets by contact, else "<Name> team".
  const batchGreeting = (h?: { name: string; primary_contact_name: string | null; greet_with_contact_name: boolean }) =>
    h ? ((h.greet_with_contact_name && h.primary_contact_name?.trim()) ? h.primary_contact_name.trim() : `${h.name} team`) : "Team";
  // Which hospital's greeting the preview shows (defaults to the first). Clicking
  // a hospital swaps the "Hello …!" line so the preview matches the copy that
  // hospital actually receives now that each gets its own email.
  const previewGreetHospital = (previewGreetId ? previewHospitals.find(h => h.id === previewGreetId) : null) ?? eligibleHospitals[0];
  const greetSwap = (h: string) => (previewGreetHospital && h)
    ? h.replace(/Hello <strong>[^<]*<\/strong>!/, `Hello <strong>${batchGreeting(previewGreetHospital)}</strong>!`)
    : h;
  const displayHtml = greetSwap(emailPreview?.html ?? "");
  // Daily Duo: each doctor is a separate email, so each has its own pristine
  // base + edited flag (a single html_override would send one doctor twice).
  const perDoctorList = emailPreview?.per_doctor ?? [];
  const perDoctorPristine = (i: number) => greetSwap(perDoctorList[i]?.html ?? "");
  const perDoctorEdited = (i: number) =>
    !!perDoctor[i] && (perDoctor[i].html !== perDoctorPristine(i) || perDoctor[i].subject !== (perDoctorList[i]?.subject ?? ""));
  // The working-opportunity leg, one email per doctor (no greeting swap — it's
  // addressed to the doctor, not a hospital).
  const doctorNoteList = emailPreview?.doctor_emails ?? [];
  const doctorNoteEdited = (i: number) =>
    !!perDoctorNote[i] && (perDoctorNote[i].html !== (doctorNoteList[i]?.html ?? "") || perDoctorNote[i].subject !== (doctorNoteList[i]?.subject ?? ""));
  // True once the team edited away from the (greeting-swapped) preview base —
  // gates the html_override on send and the "edited" hint.
  const batchEdited = !!emailPreview && (editSubject !== emailPreview.subject || editHtml !== displayHtml);
  const doctorEdited = !!emailPreview?.doctor_email && (editDoctorSubject !== emailPreview.doctor_email.subject || editDoctorHtml !== emailPreview.doctor_email.html);
  // id → DoctorOption lookup so resolving picked doctor_ids is O(picked)
  // instead of O(picked × allDoctors) on every render.
  const doctorById = useMemo(() => {
    const m = new Map<string, DoctorOption>();
    for (const d of allDoctors) m.set(d.id, d);
    return m;
  }, [allDoctors]);
  const picked = useMemo(
    () => batch ? batch.doctor_ids.map(id => doctorById.get(id)).filter((d): d is DoctorOption => !!d) : [],
    [batch, doctorById],
  );

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

  // Score EVERY doctor once, keyed only on the roster + the target specialty —
  // the score doesn't depend on which doctors are already picked, so caching it
  // here means adding/removing a doctor no longer re-scores the whole roster
  // (that per-add re-score was the lag when selecting). The pools below just
  // read from this map + do cheap filtering.
  const scoreById = useMemo(() => {
    const m = new Map<string, MatchScore>();
    const spec = effectiveSpecialty ?? "";
    for (const d of allDoctors) m.set(d.id, scoreDoctorForSpecialty(d, spec));
    return m;
  }, [allDoctors, effectiveSpecialty]);

  // Eligible + website-only pool, scored and sorted by readiness. Sorted ONCE
  // (no doctor_ids here) — the already-picked ones are excluded where consumed
  // (Auto-pick), so a click doesn't re-score/re-sort the whole roster.
  const rankedEligiblePool = useMemo(() => {
    return allDoctors
      .filter(d => d.eligible && (!websiteOnly || d.onWebsite))
      .map(d => ({ d, score: scoreById.get(d.id)?.score ?? 0 }))
      .sort((a, b) => b.score - a.score);
  }, [allDoctors, websiteOnly, scoreById]);

  // NOTE: derived from the DEBOUNCED search so the expensive candidatePool
  // scan only runs once typing settles. Every consumer of `q` (the memo dep,
  // the empty/no-results conditions, and the keyword-hit labels) reads this
  // same debounced value, so the list and its surrounding states stay in
  // lockstep and the final output is identical to the pre-debounce behaviour.
  const q = debouncedSearch.trim().toLowerCase();
  const candidatePool = useMemo(() => {
    if (!batch) return [];
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
    const scored = filtered.map(d => ({ ...d, _score: scoreById.get(d.id) ?? scoreDoctorForSpecialty(d, effectiveSpecialty ?? "") }));
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
  }, [batch, allDoctors, websiteOnly, specialtyOnly, effectiveSpecialty, q, scoreById]);

  // Daily Duo only — cache generated card image URLs per doctor id so reorders
  // and re-adds reuse the capture instead of re-rasterising. Lives for the
  // dialog session.
  const cardUrlCacheRef = useRef<Map<string, string>>(new Map());
  const [preparingCards, setPreparingCards] = useState(false);

  // Rasterise each Daily-Duo doctor's Profile-Sent card to an image URL, aligned
  // to `ids`. The scheduled send runs server-side (no browser), so we capture the
  // cards here for send-batch to embed. Non-fatal: a failed capture leaves an
  // empty slot and send-batch falls back to that doctor's HTML card, so the send
  // never breaks. Returns the URL list (also patched onto the batch).
  const generateCardUrls = async (ids: string[]): Promise<string[]> => {
    if (!batch) return [];
    setPreparingCards(true);
    try {
      const urls: string[] = [];
      for (const id of ids) {
        let url = cardUrlCacheRef.current.get(id);
        if (!url) {
          const opt = doctorById.get(id);
          if (opt) {
            try { url = await cardImageForOption(opt); cardUrlCacheRef.current.set(id, url); }
            catch { url = ""; }
          } else {
            url = "";  // not resolvable yet (roster still loading) → server falls back
          }
        }
        urls.push(url ?? "");
      }
      await update.mutateAsync({ id: batch.id, patch: { doctor_card_image_urls: urls } });
      return urls;
    } catch {
      return [];  // non-fatal — send-batch renders the HTML card for empty slots
    } finally {
      setPreparingCards(false);
    }
  };

  /** Capture any MISSING card images before a preview/send so a Daily Duo never
   *  goes out as the HTML fallback just because the images were never generated
   *  (e.g. a resend, or a batch opened without re-adding doctors). Skips work
   *  when every slot is already filled. */
  const ensureCardImages = async () => {
    if (!batch || batch.kind !== "daily_duo" || batch.doctor_ids.length === 0) return;
    const have = batch.doctor_card_image_urls ?? [];
    const complete = have.length === batch.doctor_ids.length && have.every(Boolean);
    if (!complete) await generateCardUrls(batch.doctor_ids);
  };

  const setDoctors = async (next: string[]) => {
    if (!batch) return;
    try { await update.mutateAsync({ id: batch.id, patch: { doctor_ids: next } }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Update failed"); return; }
    // For a Daily Duo, each doctor sends as their OWN Profile-Sent card image.
    if (batch.kind === "daily_duo") await generateCardUrls(next);
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
    // Match what the list shows — website-only when that toggle is on. Reuses
    // the shared, already-scored/sorted eligible pool (which now includes
    // picked doctors, so drop the already-queued ones here).
    const pickedSet = new Set(batch.doctor_ids);
    const pool = rankedEligiblePool
      .filter(x => !pickedSet.has(x.d.id))
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
                <Select value={kind} onValueChange={(v) => {
                  const k = v as BatchKind;
                  setKind(k);
                  // The Subject-header selector only exists for Top 15; clear any
                  // recap/specialty choice when leaving it so it can't be saved.
                  if (k !== "tuesday_top_15") setHeaderMode("none");
                }}>
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
              {/* Recap / Specialty subject framings are a Top-15 thing only —
                  a weekly round-up or a specialty blast. Daily Duo and
                  Specialty-of-the-day always use the default subject. */}
              {kind === "tuesday_top_15" && (
                <div className="space-y-1">
                  <Label className="text-[11px]">Subject header</Label>
                  <Select value={headerMode} onValueChange={(v) => setHeaderMode(v as "none" | "recap" | "specialty")}>
                    <SelectTrigger className="h-9 text-[12px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Default (Available &lt;specialty&gt; — Allocation Assist)</SelectItem>
                      <SelectItem value="recap">Recap — "This weeks available doctors … Excited to work in &lt;city&gt;"</SelectItem>
                      <SelectItem value="specialty">Specialty — "&lt;Specialty&gt; available … Excited to work in &lt;city&gt;"</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">
                    &lt;city&gt; is each recipient hospital's city. Use <strong>Recap</strong> for a weekly round-up of sent doctors, <strong>Specialty</strong> for a Top-15-by-specialty blast.
                  </p>
                </div>
              )}
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
              {batch.kind === "daily_duo" && (
                <div className="flex items-center justify-between gap-2 rounded-md border border-teal-200 bg-teal-50/50 px-2.5 py-1.5">
                  <div className="text-[10.5px] text-teal-800 leading-snug">
                    Each profile sends as its own image — same look as an individual Profile Sent.
                    {preparingCards
                      ? <span className="ml-1 inline-flex items-center gap-1 text-teal-700"><RefreshCw className="h-3 w-3 animate-spin" /> preparing…</span>
                      : picked.length > 0 && (
                          <span className="ml-1 text-teal-700">
                            {(batch.doctor_card_image_urls ?? []).filter(Boolean).length}/{picked.length} image{picked.length === 1 ? "" : "s"} ready.
                          </span>
                        )}
                  </div>
                  {picked.length > 0 && (
                    <Button size="sm" variant="ghost" className="h-6 text-[10px] shrink-0" disabled={preparingCards}
                      onClick={() => { cardUrlCacheRef.current.clear(); generateCardUrls(batch.doctor_ids); }}>
                      <RefreshCw className={`h-3 w-3 mr-1 ${preparingCards ? "animate-spin" : ""}`} /> Refresh images
                    </Button>
                  )}
                </div>
              )}
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
                // Allow attaching on DRAFT and SENT batches (sent → so a file can
                // ride a resend); only block cancelled batches and the moment
                // Daily-Duo card images are being rasterised. Previously this was
                // gated on the shared `update.isPending`, which greyed the button
                // out on every mutation (adding a doctor triggers card prep), AND
                // on `status !== "draft"`, which hid it on the common resend flow.
                disabled={preparingCards || (batch.status !== "draft" && batch.status !== "sent")}
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
                              <span className="text-teal-600"> · “{debouncedSearch.trim()}” in {keywordHitLabel(d, q)}</span>
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
                  <div className="text-[11px] text-muted-foreground italic">No WordPress profile matches “{debouncedSearch.trim()}”.</div>
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
                    // Make sure every Daily-Duo card image exists BEFORE we build
                    // the preview — otherwise a resend (or a batch opened without
                    // re-adding doctors) falls back to the HTML card, which is not
                    // what a Profile Sent looks like.
                    await ensureCardImages();
                    const p = await previewMut.mutateAsync(batch.status === "sent" ? { batchId: batch.id, force: true } : batch.id);
                    setEmailPreview({ subject: p.subject, html: p.html, text: p.text, bcc_count: p.bcc_count, doctor_email: p.doctor_email, per_doctor: p.per_doctor ?? [], doctor_emails: p.doctor_emails ?? [], test_mode: p.test_mode, test_recipient: p.test_recipient });
                    // Seed the exclusion list from the batch so a previously-saved
                    // (e.g. scheduled) exclusion shows pre-unchecked.
                    setExcludedEmails(batch.excluded_emails ?? []);
                    setPreviewGreetId(null);
                    setBatchCc([]); setBatchBcc([]);
                    setEditSubject(p.subject);
                    setEditHtml(p.html);
                    setEditDoctorSubject(p.doctor_email?.subject ?? "");
                    setEditDoctorHtml(p.doctor_email?.html ?? "");
                    // Daily Duo: one editable body per doctor (each is its own email).
                    setPerDoctor((p.per_doctor ?? []).map(d => ({ subject: d.subject, html: d.html })));
                    setPerDoctorNote((p.doctor_emails ?? []).map(d => ({ subject: d.subject, html: d.html })));
                    setHospitalTab(0); setDoctorTab(0);
                    setRegionOnly(null);   // each preview starts from the batch's country scope
                    setPreviewResetTick(t => t + 1);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Preview failed");
                  }
                }}
                disabled={previewMut.isPending || picked.length === 0}
              >
                {previewMut.isPending
                  ? <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Building preview…</>
                  : <><Mailbox className="h-3.5 w-3.5 mr-1.5" /> Preview{/* opens the review step — nothing sends until you click Send inside it */}</>}
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
    <EmailPreviewStudio
      open={!!emailPreview}
      onClose={() => setEmailPreview(null)}
      title="Batch email preview"
      subtitle={regionOnly
        ? `${sendingCount} hospital${sendingCount === 1 ? "" : "s"} · ${regionOnly.label} only`
        : typeof emailPreview?.bcc_count === "number" ? `BCC to ${emailPreview.bcc_count} hospital${emailPreview.bcc_count === 1 ? "" : "s"}` : undefined}
      headerExtra={
        <div className="space-y-2">
          {/* Where a send actually lands — the single most important thing to
              know before clicking Send. Green = safe (test inbox); red = live. */}
          {emailPreview && (emailPreview.test_mode
            ? <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-2.5 text-[11px] text-emerald-900 shadow-sm">
                <span className="inline-flex items-start gap-1.5"><TestTube className="h-3.5 w-3.5 mt-[1px] shrink-0" /><span><strong>Test mode is ON.</strong> Every copy goes to the test inbox (<strong>{emailPreview.test_recipient ?? "test recipient"}</strong>), <strong>not</strong> real hospitals — the "Hello &lt;hospital&gt; team" greetings are just personalised previews. Nothing reaches a real recruiter.</span></span>
              </div>
            : <div className="rounded-lg border border-rose-300 bg-rose-50 p-2.5 text-[11px] text-rose-900 shadow-sm">
                <span className="inline-flex items-start gap-1.5"><AlertTriangle className="h-3.5 w-3.5 mt-[1px] shrink-0" /><span><strong>LIVE mode.</strong> Clicking Send emails <strong>{emailPreview.bcc_count} real hospital{emailPreview.bcc_count === 1 ? "" : "s"}</strong>. There is no undo.</span></span>
              </div>)}
          <div className={`rounded-lg border p-2.5 text-[11px] space-y-1 shadow-sm ${batchEdited ? "border-amber-300 bg-amber-50 text-amber-900" : "border-sidebar-border/40 bg-white/95 text-slate-500"}`}>
            <div>
              {batchEdited
                ? <span className="inline-flex items-start gap-1.5"><Pencil className="h-3 w-3 mt-[2px] shrink-0" /><span><strong>Edited</strong> — this exact version goes to <strong>every</strong> hospital. Your edit replaces the per-hospital greeting, so all get the same "Hello …" line instead of their own name. Reset to send personalised greetings again.</span></span>
                : <>What you see is what goes out — click a hospital name to preview <em>its</em> greeting, or edit the subject/body before sending.</>}
            </div>
            {batch && (batch.attachments?.length ?? 0) > 0 && <div>{batch.attachments.length} attachment{batch.attachments.length === 1 ? "" : "s"} ride this send.</div>}
          </div>

          {/* Recipient hospitals — the exact BCC list, with an add-more picker. */}
          <div className="rounded-lg border border-sidebar-border/40 bg-white/95 p-2 shadow-sm">
            <div className="mb-1.5 flex items-center gap-1.5 px-0.5 text-[10px] font-medium text-slate-600">
              <Building2 className="h-3 w-3 text-teal-600" />
              Sending to {sendingCount} hospital{sendingCount === 1 ? "" : "s"}
              {regionOnly
                ? <span className="font-medium text-teal-600">· {regionOnly.label} only</span>
                : batch?.country ? <span className="font-normal text-slate-400">· {batch.country}</span> : null}
              {excludedEmails.length > 0 && <span className="font-normal text-rose-400">· {excludedEmails.length} excluded</span>}
            </div>
            {regionOnly && (
              <button type="button" onClick={clearRegionOnly}
                className="mb-1.5 inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-700 hover:bg-teal-100">
                <X className="h-2.5 w-2.5" /> Clear region — back to {batch?.country ?? "country"} hospitals
              </button>
            )}
            <div className="max-h-36 overflow-y-auto rounded-md border border-slate-100 bg-slate-50/60 p-1">
              {displayHospitals.length === 0 && (regionOnly || addedHospitals.length === 0) ? (
                <div className="px-1 py-2 text-center text-[10px] text-slate-400">
                  No hospitals with a recruiter email{regionOnly ? ` in ${regionOnly.label}` : batch?.country ? ` in ${batch.country}` : ""} yet.
                </div>
              ) : (
                <>
                  {displayHospitals.map(h => {
                    const excluded = isExcluded(h.primary_recruiter_email);
                    const shown = emailShownFor.has(h.id);
                    return (
                      <div key={h.id} className="group px-1 py-0.5 text-[10.5px]">
                        <div className="flex items-center gap-1.5">
                          <span className={`h-1 w-1 shrink-0 rounded-full ${excluded ? "bg-slate-300" : "bg-teal-500"}`} />
                          <button
                            type="button"
                            onClick={() => { toggleEmailShown(h.id); setPreviewGreetId(h.id); }}
                            title={`Preview ${h.name}'s email · ${h.primary_recruiter_email ?? "no recruiter email"}`}
                            className={`flex-1 truncate text-left ${excluded ? "text-slate-400 line-through" : previewGreetId === h.id ? "font-medium text-teal-700" : "text-slate-700 hover:text-teal-700"}`}
                          >
                            {h.name}
                          </button>
                          <button
                            type="button"
                            className={`shrink-0 ${excluded ? "text-teal-600 hover:text-teal-700" : "text-slate-300 hover:text-rose-600"}`}
                            title={excluded ? `Include ${h.name}` : `Exclude ${h.name} from this send`}
                            onClick={() => toggleExclude(h.primary_recruiter_email)}
                          >
                            {excluded ? <Plus className="h-3 w-3" /> : <X className="h-3 w-3" />}
                          </button>
                        </div>
                        {shown && (
                          <button
                            type="button"
                            onClick={() => { if (h.primary_recruiter_email) { navigator.clipboard.writeText(h.primary_recruiter_email); toast.success("Email copied."); } }}
                            title="Click to copy"
                            className="ml-3 mt-0.5 block max-w-full truncate text-[10px] text-teal-600 hover:underline"
                          >
                            {h.primary_recruiter_email ?? "no recruiter email on file"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {!regionOnly && addedHospitals.map(h => (
                    <div key={h.id} className="flex items-center gap-1.5 px-1 py-0.5 text-[10.5px] text-emerald-700">
                      <Plus className="h-2.5 w-2.5 shrink-0" />
                      <span className="flex-1 truncate">{h.name}</span>
                      <button
                        type="button"
                        className="shrink-0 text-slate-400 hover:text-rose-600"
                        title={`Remove ${h.name}`}
                        onClick={() => removeHospitalBcc(h.primary_recruiter_email!)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
            {addRegions.length > 0 && (
              <div className="mt-1.5 space-y-1.5">
                {/* Send to ONLY one region — REPLACES the whole recipient list. */}
                <Select value={regionOnly?.key ?? ""} onValueChange={v => v === "__clear" ? clearRegionOnly() : selectRegionOnly(v)} disabled={sendNow.isPending}>
                  <SelectTrigger className="h-7 text-[11px] text-slate-700"><SelectValue placeholder="Send to only a region…" /></SelectTrigger>
                  <SelectContent>
                    {regionOnly && <SelectItem value="__clear" className="text-[11px]">↩ Back to {batch?.country ?? "country"} hospitals</SelectItem>}
                    <SelectItem value="__all" className="text-[11px]">Every addable hospital ({addableHospitals.length})</SelectItem>
                    {addRegions.map(r => (
                      <SelectItem key={r.key} value={r.key} className="text-[11px]">Only {r.label} ({r.count})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* …or add a single hospital on top of the current list. */}
                {!regionOnly && addableHospitals.length > 0 && (
                  <Select value="" onValueChange={addHospitalBcc} disabled={sendNow.isPending}>
                    <SelectTrigger className="h-7 text-[11px] text-slate-700"><SelectValue placeholder="+ Add a single hospital…" /></SelectTrigger>
                    <SelectContent>
                      {addableHospitals.map(h => (
                        <SelectItem key={h.id} value={h.id} className="text-[11px]">
                          {h.name}{h.city ? ` · ${h.city}` : h.country ? ` · ${h.country}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-sidebar-border/40 bg-white/95 p-2 shadow-sm">
            <div className="mb-1 px-0.5 text-[10px] text-slate-500">Extra CC / BCC recipients (people, not hospitals):</div>
            <CcBccPicker cc={batchCc} bcc={batchBcc} onCcChange={setBatchCc} onBccChange={setBatchBcc} disabled={sendNow.isPending} />
          </div>
        </div>
      }
      emails={emailPreview ? [
      // Two levels of tabs: "Hospital email" / "Doctor email" on top, and one
      // tab per doctor profile inside each — a Daily Duo sends a separate email
      // per doctor on BOTH legs.
      {
        key: "hospital",
        label: "Hospital email",
        subLabel: "Hospital Intro <hospitalintro@allocationassist.com>",
        preview: perDoctorList.length ? (
          <ProfileSubTabs
            names={perDoctorList.map(d => d.name)}
            active={Math.min(hospitalTab, perDoctorList.length - 1)}
            onSelect={setHospitalTab}
            panes={perDoctorList.map((d, i) => (
              <EditableEmailPreview
                subject={perDoctor[i]?.subject ?? d.subject}
                html={perDoctorPristine(i)}
                onSubjectChange={(s: string) => setPerDoctor(prev => prev.map((p, j) => j === i ? { ...p, subject: s } : p))}
                onHtmlChange={(h: string) => setPerDoctor(prev => prev.map((p, j) => j === i ? { ...p, html: h } : p))}
                resetKey={`${previewResetTick}:${previewGreetId ?? "first"}:${i}`}
                edited={perDoctorEdited(i)}
                onReset={() => {
                  setPerDoctor(prev => prev.map((p, j) => j === i ? { subject: d.subject, html: perDoctorPristine(i) } : p));
                  setPreviewResetTick(t => t + 1);
                }}
                from="Hospital Intro <hospitalintro@allocationassist.com>"
                cc={batchCc}
                bcc={batchBcc}
                attachments={batch?.attachments ?? []}
                onAttachmentsChange={setAttachments}
                className="min-h-0 flex-1 border-0 rounded-none shadow-none"
              />
            ))}
          />
        ) : (
          <EditableEmailPreview
            subject={editSubject}
            html={displayHtml}
            onSubjectChange={setEditSubject}
            onHtmlChange={setEditHtml}
            resetKey={`${previewResetTick}:${previewGreetId ?? "first"}`}
            edited={batchEdited}
            onReset={() => {
              if (!emailPreview) return;
              setEditSubject(emailPreview.subject);
              setEditHtml(displayHtml);
              setPreviewResetTick(t => t + 1);
            }}
            from="Hospital Intro <hospitalintro@allocationassist.com>"
            cc={batchCc}
            bcc={batchBcc}
            attachments={batch?.attachments ?? []}
            onAttachmentsChange={setAttachments}
            className="min-h-0 flex-1 border-0 rounded-none shadow-none"
          />
        ),
      },
      ...(emailPreview.doctor_email && emailPreview.doctor_email.recipient_count > 0 ? [{
        key: "doctor",
        label: `Doctor email${batch?.include_doctor_email ? "" : " · off"}`,
        subLabel: `Working opportunity → ${emailPreview.doctor_email.recipient_count} doctor${emailPreview.doctor_email.recipient_count === 1 ? "" : "s"}`,
        preview: (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <label className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-slate-50 text-[12px] text-slate-700">
              <input type="checkbox" checked={!!batch?.include_doctor_email}
                onChange={e => batch && update.mutate({ id: batch.id, patch: { include_doctor_email: e.target.checked } })}
                className="h-3.5 w-3.5 accent-teal-600" />
              <span>Also send this to the <strong>{emailPreview.doctor_email.recipient_count}</strong> doctor{emailPreview.doctor_email.recipient_count === 1 ? "" : "s"} when the batch sends</span>
            </label>
            {doctorNoteList.length ? (
              <ProfileSubTabs
                names={doctorNoteList.map(d => d.name)}
                active={Math.min(doctorTab, doctorNoteList.length - 1)}
                onSelect={setDoctorTab}
                panes={doctorNoteList.map((d, i) => (
                  <EditableEmailPreview
                    subject={perDoctorNote[i]?.subject ?? d.subject}
                    html={d.html}
                    onSubjectChange={(s: string) => setPerDoctorNote(prev => prev.map((p, j) => j === i ? { ...p, subject: s } : p))}
                    onHtmlChange={(h: string) => setPerDoctorNote(prev => prev.map((p, j) => j === i ? { ...p, html: h } : p))}
                    resetKey={`${previewResetTick}:doc:${i}`}
                    edited={doctorNoteEdited(i)}
                    onReset={() => {
                      setPerDoctorNote(prev => prev.map((p, j) => j === i ? { subject: d.subject, html: d.html } : p));
                      setPreviewResetTick(t => t + 1);
                    }}
                    from="Allocation Assist Team <hello@allocationassist.com>"
                    className="min-h-0 flex-1 border-0 rounded-none shadow-none"
                  />
                ))}
              />
            ) : (
              <EditableEmailPreview
                subject={editDoctorSubject}
                html={editDoctorHtml}
                onSubjectChange={setEditDoctorSubject}
                onHtmlChange={setEditDoctorHtml}
                edited={doctorEdited}
                onReset={() => { if (emailPreview?.doctor_email) { setEditDoctorSubject(emailPreview.doctor_email.subject); setEditDoctorHtml(emailPreview.doctor_email.html); } }}
                from="Allocation Assist Team <hello@allocationassist.com>"
                className="min-h-0 flex-1 border-0 rounded-none shadow-none"
              />
            )}
          </div>
        ),
      }] : []),
      ] : []}
      footer={
        <>
          <Button variant="outline" onClick={() => setEmailPreview(null)}>Close preview</Button>
          {/* Send/resend straight from the preview — what you see is what goes out. */}
          <Button
            onClick={async () => {
              if (!batch) return;
              // Always confirm before firing — this is the real, irreversible send
              // (drafts used to go out on a single click with no prompt). Spell out
              // exactly where it lands: the test inbox in test mode, else the real
              // hospitals, so nobody sends to 86 hospitals thinking they're still
              // reviewing.
              // Region override sends to exactly those hospitals, so count them —
              // not the preview's country-default bcc_count.
              const hospCount = regionOnly ? sendingCount : (emailPreview?.bcc_count ?? picked.length);
              const emailCount = emailPreview?.per_doctor?.length
                ? hospCount * emailPreview.per_doctor.length
                : hospCount;
              const dest = emailPreview?.test_mode
                ? `the TEST inbox (${emailPreview.test_recipient ?? "test recipient"}) — NOT real hospitals`
                : `${hospCount} REAL hospital recruiter inbox${hospCount === 1 ? "" : "es"}${regionOnly ? ` in ${regionOnly.label}` : ""}`;
              const verb = batch.status === "sent" ? "Resend" : "Send";
              if (!confirm(`${verb} now?\n\n${emailCount} email${emailCount === 1 ? "" : "s"} will go to ${dest}.`)) return;
              try {
                const overrides = {
                  // Per-doctor mode ships one body per doctor; a single
                  // htmlOverride would put the same doctor in every email.
                  ...(perDoctorList.length
                    ? {
                        ...(perDoctorList.some((_, i) => perDoctorEdited(i))
                          ? { perDoctorHtmlOverride: perDoctorList.map((_, i) => perDoctorEdited(i) ? (perDoctor[i]?.html ?? "") : "") }
                          : {}),
                        ...(perDoctor[0] && perDoctor[0].subject !== perDoctorList[0].subject ? { subjectOverride: perDoctor[0].subject } : {}),
                      }
                    : (batchEdited ? { subjectOverride: editSubject, htmlOverride: editHtml } : {})),
                  // Doctor leg: per-profile bodies when we have them, else the
                  // single legacy body.
                  ...(batch.include_doctor_email
                    ? (doctorNoteList.length
                        ? {
                            ...(doctorNoteList.some((_, i) => doctorNoteEdited(i))
                              ? { doctorHtmlOverrides: doctorNoteList.map((_, i) => doctorNoteEdited(i) ? (perDoctorNote[i]?.html ?? "") : "") }
                              : {}),
                            ...(perDoctorNote[0] && perDoctorNote[0].subject !== doctorNoteList[0].subject
                              ? { doctorSubjectOverride: perDoctorNote[0].subject } : {}),
                          }
                        : (doctorEdited ? { doctorSubjectOverride: editDoctorSubject, doctorHtmlOverride: editDoctorHtml } : {}))
                    : {}),
                  ...(batchCc.length  ? { ccOverride:  batchCc }  : {}),
                  ...(batchBcc.length ? { bccOverride: batchBcc } : {}),
                  ...(excludedEmails.length ? { excludeOverride: excludedEmails } : {}),
                  ...(recipientOverrideEmails?.length ? { recipientEmailsOverride: recipientOverrideEmails } : {}),
                };
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
        </>
      }
    />
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
// The score depends ONLY on the doctor + the target specialty — nothing that
// changes while picking doctors — so it can be cached per doctor (see scoreById
// in BatchDialog) instead of re-scored on every add.
function scoreDoctorForSpecialty(d: DoctorOption, targetSpecialty: string): MatchScore {
  // One algorithm, one number across every surface: the picker shows the exact
  // same score as the Today's-Pick / Top-Ranked rotation preview and the vacancy
  // matcher (all go through scoreCandidate).
  return scoreCandidate(
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
}
function scoreDoctor(d: DoctorOption, batch: ScheduledBatch, effectiveSpecialty?: string | null): MatchScore {
  return scoreDoctorForSpecialty(d, batch.specialty ?? effectiveSpecialty ?? "");
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
  // ── The underlying published WP candidate (the pool spine). Kept so the
  //    Daily Duo can build each doctor's Profile-Sent card image client-side
  //    (needs photo/title/age/etc. that the flat option above doesn't carry).
  wp:                   WpCandidate | null;
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
        wp:                  c,
      });
    }
    return out;
  }, [zoho, lifecycleMap, wpCandidates]);
}

/** Build + upload the Profile-Sent card image for a queued doctor, returning its
 *  public PNG URL. Uses the SAME image as the single Profile-Sent send: the rich
 *  3:2 WordPress profile card when the doctor has a WP record (opt.wp), falling
 *  back to the legacy compact card (from tokens) when they don't. So a Daily Duo
 *  profile looks identical to an individual send. */
async function cardImageForOption(opt: DoctorOption): Promise<string> {
  if (opt.wp) {
    return captureAndUploadCard(buildDoctorProfileHtml(opt.wp), { width: PROFILE_IMAGE_WIDTH });
  }
  const t = wpCandidateToTokens(null);
  const vars: Record<string, string> = {
    ...t,
    doctor_name: (opt.name || "").replace(/^\s*Dr\.?\s+/i, "").trim() || (opt.name || "Candidate"),
    doctor_specialty:        opt.speciality       || "",
    doctor_speciality:       opt.speciality       || "",
    doctor_country_training: opt.country_training || "",
    doctor_nationality:      opt.nationality      || "",
    doctor_license:          opt.license          || "",
    doctor_years_experience: opt.years_experience != null ? String(opt.years_experience) : "",
  };
  return captureAndUploadCard(buildProfileCardHtml(vars));
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
