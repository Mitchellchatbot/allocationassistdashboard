/**
 * "Queued profile & CV work" — the staging side of My Workspace.
 *
 * Two sub-lists:
 *   - Staged WP profiles I created, still awaiting publish to WordPress.
 *     Click → /doctors?tab=profiles (the Profiles hub where staging lives).
 *   - CV uploads to chase: pending (doctor hasn't uploaded) + failed
 *     (extraction errored). Each pending/failed row gets a "Resend link"
 *     affordance backed by useSendCvUploadLink (mints a fresh token + emails
 *     the doctor) — same plumbing the Doctor Profiles page uses.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CardListSkeleton } from "@/components/ui/data-skeleton";
import { toast } from "sonner";
import { Layers, UserPlus, FileWarning, FileClock, ChevronRight, Send, ArrowRight } from "lucide-react";
import type { StagedProfile } from "@/hooks/use-wp-candidates";
import { type CvUpload, useSendCvUploadLink } from "@/hooks/use-cv-uploads";
import { relativeAge } from "@/components/workspace/workspace-time";

export function QueuedProfileCvCard({ staged, cvChase, isLoading, scoped, myEmail }: {
  staged:    StagedProfile[];
  cvChase:   CvUpload[];
  isLoading: boolean;
  scoped:    boolean;
  myEmail:   string;
}) {
  const navigate = useNavigate();
  const empty = staged.length === 0 && cvChase.length === 0;

  return (
    <Card data-tour="workspace-queued">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="h-4 w-4 text-indigo-600" />
              Queued profile &amp; CV work
            </CardTitle>
            <CardDescription className="text-[11px] mt-1">
              Profiles staged for publishing + CV requests waiting on the doctor.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate("/doctors?tab=profiles")}>
            Open profiles <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {isLoading && <CardListSkeleton rows={3} />}
        {!isLoading && empty && (
          <EmptyState
            icon={Layers}
            title="Nothing queued"
            body={scoped
              ? "No staged profiles to publish and no CVs to chase right now."
              : "No staged profiles or pending CV uploads across the team."}
            size="sm"
          />
        )}

        {!isLoading && staged.length > 0 && (
          <Section
            label="Staged profiles to publish"
            count={staged.length}
            icon={UserPlus}
            cls="bg-indigo-50/40 border-indigo-200"
            blurb="Awaiting publish to WordPress"
          >
            {staged.slice(0, 6).map(p => (
              <button
                key={p.id}
                onClick={() => navigate("/doctors?tab=profiles")}
                className="w-full text-left px-3 py-2 hover:bg-white/60 transition-colors flex items-center gap-3"
              >
                <UserPlus className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium text-slate-900 truncate">{p.full_name ?? "(unnamed)"}</div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {[p.specialty, p.current_location].filter(Boolean).join(" · ") || p.source}
                    {" · staged "}{relativeAge(p.created_at)}
                  </div>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              </button>
            ))}
            {staged.length > 6 && (
              <Overflow n={staged.length - 6} noun="staged profile" onClick={() => navigate("/doctors?tab=profiles")} />
            )}
          </Section>
        )}

        {!isLoading && cvChase.length > 0 && (
          <Section
            label="CV uploads to chase"
            count={cvChase.length}
            icon={FileClock}
            cls="bg-amber-50/40 border-amber-200"
            blurb="Link sent or extraction failed"
          >
            {cvChase.slice(0, 6).map(c => <CvChaseRow key={c.id} cv={c} myEmail={myEmail} />)}
            {cvChase.length > 6 && (
              <Overflow n={cvChase.length - 6} noun="CV request" onClick={() => navigate("/doctors?tab=profiles")} />
            )}
          </Section>
        )}
      </CardContent>
    </Card>
  );
}

function Section({ label, count, icon: Icon, cls, blurb, children }: {
  label:    string;
  count:    number;
  icon:     React.ComponentType<{ className?: string }>;
  cls:      string;
  blurb:    string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-md border ${cls}`}>
      <div className="px-3 py-2 flex items-center gap-2 border-b border-current/10">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[12px] font-medium">{label}</span>
        <Badge variant="outline" className="text-[10px] ml-1">{count}</Badge>
        <span className="text-[10px] text-muted-foreground ml-auto">{blurb}</span>
      </div>
      <div className="divide-y divide-current/10">{children}</div>
    </div>
  );
}

function CvChaseRow({ cv, myEmail }: { cv: CvUpload; myEmail: string }) {
  const [busy, setBusy] = useState(false);
  const send = useSendCvUploadLink();
  const failed = cv.status === "failed";

  const resend = async () => {
    if (!cv.doctor_email) {
      toast.error("No email on file for this doctor — add one before resending.");
      return;
    }
    setBusy(true);
    try {
      await send.mutateAsync({
        doctor_id:    cv.doctor_id,
        doctor_name:  cv.doctor_name,
        doctor_email: cv.doctor_email,
        created_by:   myEmail || undefined,
      });
      toast.success(`Upload link resent to ${cv.doctor_name}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Resend failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-3 py-2 flex items-center gap-3">
      {failed
        ? <FileWarning className="h-3.5 w-3.5 text-rose-500 shrink-0" />
        : <FileClock className="h-3.5 w-3.5 text-amber-600 shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium text-slate-900 truncate">{cv.doctor_name}</div>
        <div className="text-[10px] text-muted-foreground truncate">
          {failed
            ? <span className="text-rose-600">Extraction failed{cv.extraction_error ? ` · ${cv.extraction_error}` : ""}</span>
            : <>Link sent {relativeAge(cv.created_at)} · not uploaded yet</>}
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-6 text-[10px] px-2 shrink-0"
        disabled={busy || !cv.doctor_email}
        onClick={resend}
        title={cv.doctor_email ? `Resend upload link to ${cv.doctor_email}` : "No email on file"}
      >
        <Send className="h-3 w-3 mr-0.5" /> {busy ? "Sending…" : "Resend link"}
      </Button>
    </div>
  );
}

function Overflow({ n, noun, onClick }: { n: number; noun: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full px-3 py-1.5 text-[10px] text-muted-foreground bg-white/30 hover:bg-white/60 text-left transition-colors"
    >
      +{n} more {noun}{n === 1 ? "" : "s"} — open Profiles to see all →
    </button>
  );
}
