import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, CheckCircle2, XCircle, HelpCircle, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useClassifyHospitalReply, type ClassifyResponse, type ReplyClassification } from "@/hooks/use-classify-hospital-reply";

interface Props {
  open:        boolean;
  onClose:     () => void;
  runId:       string;
  doctorName:  string;
  hospitalName?: string | null;
}

const CLASSIFICATION_META: Record<ReplyClassification, { label: string; icon: typeof CheckCircle2; cls: string; tone: string }> = {
  shortlisted:     { label: "Shortlisted",        icon: CheckCircle2, cls: "bg-emerald-50 border-emerald-200 text-emerald-900", tone: "emerald" },
  declined:        { label: "Declined",           icon: XCircle,      cls: "bg-slate-50 border-slate-200 text-slate-900",       tone: "slate" },
  needs_more_info: { label: "Needs more info",    icon: HelpCircle,   cls: "bg-amber-50 border-amber-200 text-amber-900",       tone: "amber" },
  unclear:         { label: "Unclear",            icon: AlertTriangle, cls: "bg-violet-50 border-violet-200 text-violet-900",   tone: "violet" },
  wrong_doctor:    { label: "Wrong doctor",       icon: AlertTriangle, cls: "bg-rose-50 border-rose-200 text-rose-900",         tone: "rose" },
};

export function ClassifyReplyDialog({ open, onClose, runId, doctorName, hospitalName }: Props) {
  const [replyText,    setReplyText]    = useState("");
  const [replySubject, setReplySubject] = useState("");
  const [replyFrom,    setReplyFrom]    = useState("");
  const [result,       setResult]       = useState<ClassifyResponse | null>(null);

  const classify = useClassifyHospitalReply();

  const reset = () => {
    setReplyText("");
    setReplySubject("");
    setReplyFrom("");
    setResult(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleClassify = async () => {
    if (!replyText.trim()) return;
    try {
      const res = await classify.mutateAsync({
        run_id:        runId,
        reply_text:    replyText.trim(),
        reply_subject: replySubject.trim() || undefined,
        reply_from:    replyFrom.trim()    || undefined,
      });
      setResult(res);
      if (res.classification === "shortlisted") {
        toast.success(`Shortlisted! Shortlist email auto-fired to ${doctorName}.`);
      } else if (res.classification === "declined") {
        toast.success("Logged as declined. Profile Sent run completed.");
      } else {
        toast.info(`Classified as "${res.classification}" — see details in the dialog.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Classification failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-[640px] max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-600" /> Classify Hospital Reply
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            Paste the hospital's reply about <strong>{doctorName}</strong>{hospitalName ? ` at ${hospitalName}` : ""}. Claude figures out whether they're shortlisting, declining, or asking for more — and advances the flow automatically.
          </DialogDescription>
        </DialogHeader>

        {!result && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">From (optional)</Label>
                <Input
                  value={replyFrom}
                  onChange={e => setReplyFrom(e.target.value)}
                  placeholder="recruiter@hospital.com"
                  className="mt-1 text-[12px]"
                />
              </div>
              <div>
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Subject (optional)</Label>
                <Input
                  value={replySubject}
                  onChange={e => setReplySubject(e.target.value)}
                  placeholder="Re: Candidate introduction…"
                  className="mt-1 text-[12px]"
                />
              </div>
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Reply text *</Label>
              <Textarea
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                placeholder="Paste the hospital's reply here. Quoted text below is fine — Claude focuses on the new content at the top."
                className="mt-1 text-[12px] min-h-[200px] font-mono"
                autoFocus
              />
              <div className="text-[10px] text-muted-foreground mt-1">
                {replyText.length} chars · max ~6,000 used for classification
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose} disabled={classify.isPending}>Cancel</Button>
              <Button onClick={handleClassify} disabled={!replyText.trim() || classify.isPending}>
                {classify.isPending ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Classifying...</>
                ) : (
                  <><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Classify with Claude</>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}

        {result && (
          <ClassifyResult
            result={result}
            doctorName={doctorName}
            onTryAnother={reset}
            onDone={handleClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ClassifyResult({ result, doctorName, onTryAnother, onDone }: {
  result: ClassifyResponse;
  doctorName: string;
  onTryAnother: () => void;
  onDone: () => void;
}) {
  const meta = CLASSIFICATION_META[result.classification];
  const Icon = meta.icon;

  return (
    <div className="space-y-4">
      <div className={`rounded-lg border-2 p-4 ${meta.cls}`}>
        <div className="flex items-start gap-3">
          <Icon className="h-6 w-6 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold">{meta.label}</div>
            <div className="text-[11px] opacity-75 mt-0.5">
              Confidence {(result.confidence * 100).toFixed(0)}%
            </div>
            <div className="text-[13px] mt-3 leading-relaxed">{result.summary}</div>
            {result.asked_for && (
              <div className="text-[12px] mt-2 leading-relaxed">
                <strong className="opacity-80">Asking for:</strong> {result.asked_for}
              </div>
            )}
            <div className="text-[12px] mt-3 leading-relaxed">
              <strong className="opacity-80">Suggested next step:</strong> {result.next_steps}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">What just happened</div>
        <div className="text-[12px] text-slate-700">{result.action_taken}</div>
        {result.classification === "shortlisted" && (
          <div className="text-[11px] text-emerald-700 mt-2 flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3" />
            Shortlist Confirmation email is on its way to {doctorName}.
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onTryAnother}>Classify another reply</Button>
        <Button onClick={onDone}>Done</Button>
      </DialogFooter>
    </div>
  );
}
