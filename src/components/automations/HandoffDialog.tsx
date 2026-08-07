/**
 * HandoffDialog — bulk team handoff in three steps.
 *
 *   1 Select work      · who → whom, plus a checklist of their ACTIVE runs
 *                        (all ticked by default; deselect what stays behind)
 *   2 Reason & duration · required reason, temporary/permanent, end date
 *   3 Confirm           · counted summary, then commit
 *
 * Sits alongside the single-run Reassign dropdown rather than replacing it:
 * the quick path stays quick, this is the heavier path for leave cover,
 * escalation and permanent ownership transfer.
 *
 * Splitting a queue across several people is done by repeating the handoff
 * (move 9 to Mohamed, reopen, move the rest to Sohaila) rather than a
 * per-row assignee picker — each batch then carries its own reason and dates,
 * and one batch_id keeps meaning one coherent act.
 *
 * Opened from: ReassignButton's overflow item, and My Workspace's
 * "Hand off my work" header action.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight, Loader2, Users, CalendarClock, AlertTriangle, ArrowLeftRight,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useAutomationFlowRuns, useBulkHandoff, type FlowRun } from "@/hooks/use-automation-flows";
import { HI_TEAM_MEMBERS, findHiMemberByEmail } from "@/lib/hi-team";
import { FLOW_DEFINITIONS, type FlowKey } from "@/lib/automation-flows";
import { HANDOFF_REASONS, type HandoffReason, type HandoffType } from "@/lib/handoff";

interface Props {
  open:         boolean;
  onClose:      () => void;
  /** Whose work is being handed off. Defaults to the signed-in user. */
  initialFrom?: string | null;
}

/** Stage that means "mid-conversation with a hospital" — worth a second
 *  thought before moving, so those rows are flagged in the picker. */
const LIVE_STAGE = "awaiting_response";

function displayName(email: string | null | undefined): string {
  if (!email) return "Unassigned";
  return findHiMemberByEmail(email)?.name ?? email.split("@")[0];
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(iso: string | null): string {
  if (!iso) return "—";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return "today";
  return `${d}d`;
}

export function HandoffDialog({ open, onClose, initialFrom }: Props) {
  const { user } = useAuth();
  const { data: runs = [], isLoading } = useAutomationFlowRuns();
  const handoff = useBulkHandoff();

  const [step,       setStep]       = useState<1 | 2 | 3>(1);
  const [fromEmail,  setFromEmail]  = useState<string>("");
  const [toEmail,    setToEmail]    = useState<string>("");
  const [selected,   setSelected]   = useState<Set<string>>(new Set());
  const [reason,     setReason]     = useState<HandoffReason | null>(null);
  const [reasonNote, setReasonNote] = useState("");
  const [type,       setType]       = useState<HandoffType>("temporary");
  const [startsAt,   setStartsAt]   = useState(todayIso());
  const [endsAt,     setEndsAt]     = useState("");

  // Reset every time the dialog opens so a previous run's state can't leak
  // into a new handoff.
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setFromEmail(initialFrom ?? user?.email ?? "");
    setToEmail("");
    setReason(null);
    setReasonNote("");
    setType("temporary");
    setStartsAt(todayIso());
    setEndsAt("");
  }, [open, initialFrom, user?.email]);

  /** Active runs currently owned by `fromEmail`. Filtered client-side over
   *  the same cached query the flow board uses (volume is in the hundreds). */
  const candidates = useMemo(() => {
    const owner = fromEmail.trim().toLowerCase();
    if (!owner) return [];
    return runs
      .filter(r => r.status === "active" && (r.assigned_to ?? "").toLowerCase() === owner)
      .sort((a, b) =>
        a.flow_key.localeCompare(b.flow_key) ||
        a.doctor_name.localeCompare(b.doctor_name));
  }, [runs, fromEmail]);

  // Tick everything by default whenever the candidate set changes, so the
  // common "move it all" case is a single click.
  useEffect(() => {
    setSelected(new Set(candidates.map(r => r.id)));
  }, [candidates]);

  const grouped = useMemo(() => {
    const by = new Map<FlowKey, FlowRun[]>();
    for (const r of candidates) {
      const list = by.get(r.flow_key) ?? [];
      list.push(r);
      by.set(r.flow_key, list);
    }
    return [...by.entries()];
  }, [candidates]);

  const selectedRuns = useMemo(
    () => candidates.filter(r => selected.has(r.id)),
    [candidates, selected],
  );
  const liveCount = selectedRuns.filter(r => r.current_stage === LIVE_STAGE).length;
  const staying   = candidates.length - selectedRuns.length;

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const canContinue = toEmail && toEmail.toLowerCase() !== fromEmail.toLowerCase()
    && selectedRuns.length > 0;
  const canReview =
    !!reason &&
    (reason !== "other" || reasonNote.trim().length > 0) &&
    (type === "permanent" || (!!endsAt && (!startsAt || endsAt > startsAt)));

  const commit = async () => {
    if (!reason) return;
    try {
      const res = await handoff.mutateAsync({
        run_ids:     selectedRuns.map(r => r.id),
        from_email:  fromEmail || null,
        to_email:    toEmail,
        reason,
        reason_note: reason === "other" ? reasonNote.trim() : (reasonNote.trim() || null),
        type,
        starts_at:   type === "temporary" ? (startsAt || null) : null,
        ends_at:     type === "temporary" ? endsAt : null,
        actor_email: user?.email ?? null,
      });
      toast.success(
        `Moved ${res.moved} run${res.moved === 1 ? "" : "s"} to ${displayName(toEmail)}` +
        (staying > 0 ? ` · ${staying} stayed with ${displayName(fromEmail)}` : ""),
      );
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Handoff failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[620px] max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-teal-600" /> Hand off work
          </DialogTitle>
          <DialogDescription>
            {step === 1 && "Choose what moves, and to whom."}
            {step === 2 && "Why the work is moving, and for how long."}
            {step === 3 && "Review before anything changes hands."}
          </DialogDescription>
        </DialogHeader>

        {/* Step rail */}
        <div className="flex gap-1.5">
          {(["Select work", "Reason & duration", "Confirm"] as const).map((lbl, i) => {
            const n = (i + 1) as 1 | 2 | 3;
            return (
              <span
                key={lbl}
                className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border ${
                  step === n
                    ? "bg-teal-600 border-teal-600 text-white font-semibold"
                    : "border-border text-muted-foreground"
                }`}
              >
                {n} {lbl}
              </span>
            );
          })}
        </div>

        {/* ── Step 1 · select work ─────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wide">From</Label>
                <Select value={fromEmail} onValueChange={setFromEmail}>
                  <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="Pick a person" /></SelectTrigger>
                  <SelectContent>
                    {HI_TEAM_MEMBERS.map(m => (
                      <SelectItem key={m.email} value={m.email} className="text-[13px]">{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground mb-2.5" />
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wide">
                  To <span className="text-rose-600">*</span>
                </Label>
                <Select value={toEmail} onValueChange={setToEmail}>
                  <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="Pick a person" /></SelectTrigger>
                  <SelectContent>
                    {HI_TEAM_MEMBERS
                      .filter(m => m.email.toLowerCase() !== fromEmail.toLowerCase())
                      .map(m => (
                        <SelectItem key={m.email} value={m.email} className="text-[13px]">{m.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-[12px] font-semibold tabular-nums">
                {selectedRuns.length} of {candidates.length} selected
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="text-[11px] text-teal-700 font-semibold hover:underline"
                  onClick={() => setSelected(new Set(candidates.map(r => r.id)))}
                >
                  Select all
                </button>
                <span className="text-[11px] text-muted-foreground">·</span>
                <button
                  type="button"
                  className="text-[11px] text-teal-700 font-semibold hover:underline"
                  onClick={() => setSelected(new Set())}
                >
                  Clear
                </button>
              </div>
            </div>

            {isLoading ? (
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground py-6 justify-center">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading runs…
              </div>
            ) : candidates.length === 0 ? (
              <div className="text-[12px] text-muted-foreground py-6 text-center border rounded-lg">
                {fromEmail
                  ? `${displayName(fromEmail)} has no active runs to hand off.`
                  : "Pick who the work is coming from."}
              </div>
            ) : (
              <div className="border rounded-lg divide-y max-h-[280px] overflow-y-auto">
                {grouped.map(([flow, list]) => (
                  <div key={flow} className="p-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold px-1 pb-1">
                      {FLOW_DEFINITIONS[flow]?.shortName ?? flow} · {list.length}
                    </p>
                    {list.map(r => (
                      <label
                        key={r.id}
                        className="flex items-start gap-2.5 px-1 py-1.5 rounded hover:bg-muted/50 cursor-pointer"
                      >
                        <Checkbox
                          checked={selected.has(r.id)}
                          onCheckedChange={() => toggle(r.id)}
                          className="mt-0.5"
                        />
                        <span className="flex-1 min-w-0">
                          <span className={`block text-[12px] font-medium truncate ${
                            selected.has(r.id) ? "" : "text-muted-foreground line-through"
                          }`}>
                            {r.doctor_name}
                          </span>
                          <span className="block text-[10px] text-muted-foreground font-mono truncate">
                            {r.hospital ?? "no hospital"} · {r.current_stage} · {daysAgo(r.last_event_at)}
                          </span>
                        </span>
                        {r.current_stage === LIVE_STAGE && (
                          <Badge variant="outline" className="text-[9px] border-amber-300 bg-amber-50 text-amber-800 shrink-0">
                            LIVE REPLY
                          </Badge>
                        )}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Step 2 · reason & duration ───────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide">
                Reason <span className="text-rose-600">*</span>
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {HANDOFF_REASONS.map(r => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setReason(r.key)}
                    className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                      reason === r.key
                        ? "bg-teal-50 border-teal-600 text-teal-900 font-semibold"
                        : "border-border text-muted-foreground hover:bg-muted/60"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {reason === "other" && (
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wide">
                  Say why <span className="text-rose-600">*</span>
                </Label>
                <Input
                  value={reasonNote}
                  onChange={e => setReasonNote(e.target.value)}
                  placeholder="Short note for the timeline"
                  className="h-9 text-[13px]"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide">
                Handoff type <span className="text-rose-600">*</span>
              </Label>
              <div className="flex border rounded-md overflow-hidden">
                {(["temporary", "permanent"] as HandoffType[]).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`flex-1 text-[12px] py-1.5 capitalize transition-colors ${
                      type === t ? "bg-teal-600 text-white font-semibold" : "text-muted-foreground hover:bg-muted/60"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {type === "temporary" ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] uppercase tracking-wide">Starts</Label>
                    <Input type="date" value={startsAt} onChange={e => setStartsAt(e.target.value)} className="h-9 text-[13px]" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] uppercase tracking-wide">
                      Ends <span className="text-rose-600">*</span>
                    </Label>
                    <Input type="date" value={endsAt} min={startsAt || undefined} onChange={e => setEndsAt(e.target.value)} className="h-9 text-[13px]" />
                  </div>
                </div>
                <div className="border-l-2 border-teal-600 bg-teal-50/70 px-3 py-2 rounded-r text-[11.5px]">
                  <b className="text-teal-800">Returns automatically.</b>{" "}
                  {endsAt
                    ? `On ${endsAt} these ${selectedRuns.length} run${selectedRuns.length === 1 ? "" : "s"} go back to ${displayName(fromEmail)} unless they were handed on again in the meantime.`
                    : "Pick an end date and the runs go back on their own."}
                </div>
              </>
            ) : (
              <div className="border-l-2 border-teal-600 bg-teal-50/70 px-3 py-2 rounded-r text-[11.5px]">
                <b className="text-teal-800">Full ownership transfer.</b>{" "}
                {displayName(toEmail)} becomes the owner of these runs. Nothing reverts.
              </div>
            )}

          </div>
        )}

        {/* ── Step 3 · confirm ─────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-3">
            <div className="border rounded-lg divide-y text-[12px]">
              <Row k="Moving">
                <b>{selectedRuns.length} of {candidates.length} active runs</b>
              </Row>
              {staying > 0 && (
                <Row k="Staying">{staying} run{staying === 1 ? "" : "s"} remain with {displayName(fromEmail)}</Row>
              )}
              <Row k="From → To">
                <b>{displayName(fromEmail)}</b> → <b>{displayName(toEmail)}</b>
              </Row>
              <Row k="Reason">
                {HANDOFF_REASONS.find(r => r.key === reason)?.label}
                {reasonNote.trim() && ` — ${reasonNote.trim()}`}
              </Row>
              <Row k="Type">
                <b className="capitalize">{type}</b>
                {type === "temporary" && ` · ${startsAt || "today"} → ${endsAt}`}
              </Row>
              {type === "temporary" && <Row k="Reverts">{endsAt}, automatically</Row>}
            </div>

            {liveCount > 0 && (
              <div className="border-l-2 border-amber-500 bg-amber-50/70 px-3 py-2 rounded-r text-[11.5px] flex gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-700 shrink-0 mt-0.5" />
                <span>
                  <b className="text-amber-800">This affects live conversations.</b>{" "}
                  {liveCount} of the selected run{liveCount === 1 ? " is" : "s are"} waiting on a hospital reply.
                </span>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-[12px]"
            onClick={() => (step === 1 ? onClose() : setStep((step - 1) as 1 | 2))}
            disabled={handoff.isPending}
          >
            {step === 1 ? "Cancel" : "Back"}
          </Button>

          {step === 1 && (
            <Button size="sm" className="h-8 text-[12px] gap-1.5" disabled={!canContinue} onClick={() => setStep(2)}>
              <Users className="h-3 w-3" /> Continue with {selectedRuns.length}
            </Button>
          )}
          {step === 2 && (
            <Button size="sm" className="h-8 text-[12px] gap-1.5" disabled={!canReview} onClick={() => setStep(3)}>
              <CalendarClock className="h-3 w-3" /> Review handoff
            </Button>
          )}
          {step === 3 && (
            <Button size="sm" className="h-8 text-[12px] gap-1.5" disabled={handoff.isPending} onClick={commit}>
              {handoff.isPending
                ? <><Loader2 className="h-3 w-3 animate-spin" /> Moving…</>
                : <>Move {selectedRuns.length} run{selectedRuns.length === 1 ? "" : "s"} to {displayName(toEmail)}</>}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[92px_1fr] gap-2 px-3 py-1.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold pt-0.5">{k}</span>
      <span>{children}</span>
    </div>
  );
}
