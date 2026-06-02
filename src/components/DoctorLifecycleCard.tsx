import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { CheckCircle2, Circle, AlertCircle, PauseCircle, PlayCircle, CalendarDays, Hash, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useDoctorLifecycle, useMarkLifecycle, type DoctorLifecycle } from "@/hooks/use-doctor-lifecycle";

interface Props {
  doctorId:   string;
  doctorName: string;
}

/**
 * Phase 4 — Doctor Status Lifecycle UI.
 *
 * Sits on the doctor profile editor. Shows:
 *   - 4-step milestone strip (Signed → Joined → Approved → Paid)
 *   - Buttons to mark the next milestone — each one wired to the side effect
 *     matrix in useMarkLifecycle (eligibility flip on signed, second-payment
 *     trigger on joined, Slack-archive notification on approved).
 *   - Availability panel: mark unavailable (with reason + check-in date),
 *     push the check-in further, or mark available again.
 *
 * Source: Saif Ullah meeting, May 20 2026 (Phase 4 of the spec).
 */
export function DoctorLifecycleCard({ doctorId, doctorName }: Props) {
  const { data: lifecycle, isLoading } = useDoctorLifecycle(doctorId);
  const mark = useMarkLifecycle();
  const [pauseOpen,   setPauseOpen]   = useState(false);
  const [pushOpen,    setPushOpen]    = useState(false);
  const [joinOpen,    setJoinOpen]    = useState(false);

  if (isLoading) return null;

  const lc: DoctorLifecycle | null = lifecycle ?? null;

  const doMark = async (action: Parameters<typeof mark.mutate>[0]["action"], success: string) => {
    try {
      await mark.mutateAsync({ doctorId, doctorName, action });
      toast.success(success);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  // Availability banner takes priority — the team paused this doctor.
  if (lc?.unavailable) {
    return (
      <>
        <Card className="border-orange-200 bg-orange-50/50">
          <CardContent className="py-3 px-4 space-y-2">
            <div className="flex items-center gap-2">
              <PauseCircle className="h-4 w-4 text-orange-600" />
              <span className="text-[12px] font-medium text-orange-900">Marked unavailable</span>
              <Badge variant="outline" className="text-[9px] bg-orange-100 text-orange-800 border-orange-300 uppercase tracking-wider">
                Paused
              </Badge>
            </div>
            {lc.unavailable_reason && (
              <div className="text-[11px] text-orange-900/80 italic">"{lc.unavailable_reason}"</div>
            )}
            <div className="text-[11px] text-orange-900/70 flex items-center gap-1.5">
              <CalendarDays className="h-3 w-3" />
              Re-confirm on <strong className="text-orange-900">{formatDate(lc.available_check_in_at)}</strong>
              {lc.last_availability_ping_at && (
                <span className="text-[10px]">· last nudge {formatDate(lc.last_availability_ping_at)}</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => doMark({ kind: "mark_available" }, "Doctor marked available.")}>
                <PlayCircle className="h-3.5 w-3.5 mr-1.5 text-emerald-600" /> Mark available
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPushOpen(true)}>
                Push check-in
              </Button>
            </div>
          </CardContent>
        </Card>
        <PushCheckInDialog
          open={pushOpen}
          onClose={() => setPushOpen(false)}
          current={lc.available_check_in_at}
          onSubmit={async (date) => doMark({ kind: "push_checkin", newCheckInAt: date }, "Check-in pushed.")}
        />
      </>
    );
  }

  return (
    <>
      <Card>
        <CardContent className="py-3 px-4 space-y-3">
          <div className="flex items-center gap-2">
            <Hash className="h-3.5 w-3.5 text-teal-600" />
            <span className="text-[12px] font-medium">Lifecycle</span>
            {!lc?.eligible_for_sending && (
              <Badge variant="outline" className="text-[9px] bg-slate-100 text-slate-700 border-slate-300 uppercase tracking-wider">
                Removed from send list
              </Badge>
            )}
          </div>

          <MilestoneStrip lc={lc} />

          <div className="flex flex-wrap gap-2 pt-1">
            {!lc?.signed_at && (
              <Button size="sm" variant="outline" onClick={() => doMark({ kind: "mark_signed" }, "Marked signed. Doctor removed from send list.")}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-teal-600" /> Mark signed
              </Button>
            )}
            {!lc?.joined_at && (
              <Button size="sm" variant="outline" onClick={() => setJoinOpen(true)}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-lime-600" /> Mark joined
              </Button>
            )}
            {lc?.joined_at && !lc?.approved_at && (
              <Button size="sm" variant="outline" onClick={() => doMark({ kind: "mark_approved" }, "Approved. Slack-archive reminder added to your notifications.")}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-emerald-600" /> Mark approved
              </Button>
            )}
            {lc?.joined_at && !lc?.paid_at && (
              <Button size="sm" variant="outline" onClick={() => doMark({ kind: "mark_paid" }, "Marked paid.")}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-emerald-700" /> Mark paid
              </Button>
            )}
            <Button size="sm" variant="ghost" className="text-orange-700 hover:bg-orange-50" onClick={() => setPauseOpen(true)}>
              <PauseCircle className="h-3.5 w-3.5 mr-1.5" /> Mark unavailable
            </Button>
          </div>

          {lc?.approved_at && (
            <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50/40 px-2.5 py-1.5 text-[11px] text-emerald-900">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-[2px]" />
              <span>
                <strong>Slack archive due.</strong> A reminder has been written to your notifications — archiving the
                channel stops the per-doctor subscription cost.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <PauseDialog
        open={pauseOpen}
        onClose={() => setPauseOpen(false)}
        onSubmit={async (reason, checkInAt) => doMark(
          { kind: "mark_unavailable", reason, checkInAt },
          "Doctor marked unavailable. We'll ping the team on the check-in date.",
        )}
      />
      <MarkJoinedDialog
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        onSubmit={async (joiningDate) => doMark(
          { kind: "mark_joined", joiningDate },
          "Marked joined. Second-payment flow scheduled for 15 days.",
        )}
      />
    </>
  );
}

function MilestoneStrip({ lc }: { lc: DoctorLifecycle | null }) {
  const steps: { key: keyof DoctorLifecycle; label: string; tone: string }[] = [
    { key: "signed_at",   label: "Signed",   tone: "text-teal-600" },
    { key: "joined_at",   label: "Joined",   tone: "text-lime-600" },
    { key: "approved_at", label: "Approved", tone: "text-emerald-600" },
    { key: "paid_at",     label: "Paid",     tone: "text-emerald-700" },
  ];
  return (
    <div className="flex items-center gap-2">
      {steps.map((s, idx) => {
        const done = !!(lc && lc[s.key]);
        const ts   = lc?.[s.key] as string | null | undefined;
        return (
          <div key={s.key} className="flex items-center gap-1 flex-1 min-w-0">
            {done ? <CheckCircle2 className={`h-4 w-4 shrink-0 ${s.tone}`} /> : <Circle className="h-4 w-4 text-slate-300 shrink-0" />}
            <div className="min-w-0">
              <div className={`text-[11px] truncate ${done ? "font-medium text-slate-800" : "text-slate-400"}`}>{s.label}</div>
              {done && ts && <div className="text-[9px] text-muted-foreground truncate">{formatDate(ts)}</div>}
            </div>
            {idx < steps.length - 1 && (
              <div className={`flex-1 h-px ${done ? "bg-slate-300" : "bg-slate-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function PauseDialog({ open, onClose, onSubmit }: {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: string, checkInAt: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const defaultCheckIn = (() => { const d = new Date(); d.setDate(d.getDate() + 14); return d.toISOString().slice(0, 10); })();
  const [date, setDate] = useState(defaultCheckIn);
  const [busy, setBusy] = useState(false);

  const handle = async () => {
    if (!date) { toast.error("Pick a check-in date."); return; }
    setBusy(true);
    try {
      await onSubmit(reason.trim(), new Date(date).toISOString());
      setReason(""); setDate(defaultCheckIn);
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PauseCircle className="h-5 w-5 text-orange-600" />
            Mark unavailable
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            Doctor pauses introductions. The system will ping the team on your check-in date to re-confirm.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-[11px]">Reason (optional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. on leave for 2 weeks; not responding; awaiting visa"
              rows={2}
              className="text-[12px]"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Re-confirm on</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 text-[12px]"
            />
            <p className="text-[10px] text-muted-foreground">
              You'll get a notification on this date asking to re-check availability.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={handle} disabled={busy}>{busy ? "Saving..." : "Mark unavailable"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PushCheckInDialog({ open, onClose, current, onSubmit }: {
  open:    boolean;
  onClose: () => void;
  current: string | null;
  onSubmit: (newCheckInAt: string) => Promise<void>;
}) {
  const defaultDate = (() => {
    const d = current ? new Date(current) : new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  })();
  const [date, setDate] = useState(defaultDate);
  const [busy, setBusy] = useState(false);

  const handle = async () => {
    if (!date) return;
    setBusy(true);
    try {
      await onSubmit(new Date(date).toISOString());
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Push check-in</DialogTitle>
          <DialogDescription className="text-[12px]">
            Still unavailable? Bump the next check-in further out.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1 py-2">
          <Label className="text-[11px]">New check-in date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 text-[12px]" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={handle} disabled={busy}>{busy ? "Saving..." : "Push check-in"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MarkJoinedDialog({ open, onClose, onSubmit }: {
  open: boolean;
  onClose: () => void;
  onSubmit: (joiningDate: string) => Promise<void>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);

  const handle = async () => {
    if (!date) return;
    setBusy(true);
    try {
      await onSubmit(new Date(date).toISOString());
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Mark joined</DialogTitle>
          <DialogDescription className="text-[12px]">
            The second-payment invoice will fire 15 calendar days after this date.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1 py-2">
          <Label className="text-[11px]">Joining date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 text-[12px]" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={handle} disabled={busy}>{busy ? "Saving..." : "Mark joined"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }
  catch { return iso; }
}

void AlertTriangle;
