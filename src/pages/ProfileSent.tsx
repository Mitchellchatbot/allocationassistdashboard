import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Send, Users, UserSquare2, History, ExternalLink } from "lucide-react";
import { SendProfileDialog } from "@/components/automations/SendProfileDialog";
import { BulkProfileSendDialog } from "@/components/automations/BulkProfileSendDialog";
import { ScheduledProfileSendsCard } from "@/pages/Batches";
import { useSentHistory } from "@/hooks/use-sent-history";
import { GulfClock } from "@/components/GulfClock";

/**
 * Profile Sent — a dedicated home for the headline workflow: sending a doctor's
 * profile to hospitals. Single send (full editing) or bulk (many doctors ×
 * hospitals). Every send still creates a profile_sent Flow-2 run, so it shows up
 * in Automations, Past Sent and the pipeline counts exactly as before — this
 * page is just the launchpad + at-a-glance queue/history.
 */
export default function ProfileSent() {
  const navigate = useNavigate();
  const [sendOpen, setSendOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const { records } = useSentHistory();

  const recent = useMemo(() => records.filter(r => r.sentKind === "individual").slice(0, 25), [records]);

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2"><Send className="h-5 w-5 text-teal-600" /> Profile Sent</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5 max-w-[640px]">
              Send doctor profiles to hospitals. Every send flows into Flow 2, Past Sent and the pipeline — this is just the launchpad.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setBulkOpen(true)}>
              <Users className="h-4 w-4 mr-1.5" /> Bulk send
            </Button>
            <Button onClick={() => setSendOpen(true)} className="bg-teal-600 hover:bg-teal-700 text-white">
              <Send className="h-4 w-4 mr-1.5" /> Send a profile
            </Button>
          </div>
        </div>

        {/* Two ways to send */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card className="hover:border-teal-300 transition-colors cursor-pointer" onClick={() => setSendOpen(true)}>
            <CardHeader className="pb-2">
              <CardTitle className="text-[14px] flex items-center gap-2"><UserSquare2 className="h-4 w-4 text-teal-600" /> Single send</CardTitle>
              <CardDescription className="text-[12px]">One doctor → one or more hospitals, with full preview + editing, attachments, templates, and schedule-for-later.</CardDescription>
            </CardHeader>
          </Card>
          <Card className="hover:border-teal-300 transition-colors cursor-pointer" onClick={() => setBulkOpen(true)}>
            <CardHeader className="pb-2">
              <CardTitle className="text-[14px] flex items-center gap-2"><Users className="h-4 w-4 text-teal-600" /> Bulk send</CardTitle>
              <CardDescription className="text-[12px]">Many doctors → many hospitals, one email per doctor. Template-only, great for blasting your latest available doctors to a set of hospitals.</CardDescription>
            </CardHeader>
          </Card>
        </div>

        <ScheduledProfileSendsCard />

        {/* Recent profile sends */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4 text-teal-600" /> Recent profile sends
              {recent.length > 0 && <Badge variant="outline" className="text-[9px] bg-slate-50">{recent.length}</Badge>}
              <button onClick={() => navigate("/past-sent")} className="ml-auto inline-flex items-center gap-1 text-[11px] text-teal-700 hover:underline">
                View all in Past Sent <ExternalLink className="h-3 w-3" />
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {recent.length === 0 ? (
              <div className="px-4 py-6 text-center text-[12px] text-muted-foreground">No profile sends yet. Click <span className="font-medium text-slate-600">Send a profile</span> to start.</div>
            ) : (
              <div className="divide-y">
                {recent.map(r => (
                  <div key={r.id} className="px-4 py-2.5 flex items-center gap-3">
                    <UserSquare2 className="h-4 w-4 text-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium truncate">
                        {r.doctorName}
                        {r.hospital && <span className="text-muted-foreground font-normal"> → {r.hospital}</span>}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">{r.specialty ?? "—"}</div>
                    </div>
                    {r.sentAt && <GulfClock when={r.sentAt} showRelative />}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <SendProfileDialog open={sendOpen} onClose={() => setSendOpen(false)} />
      <BulkProfileSendDialog open={bulkOpen} onClose={() => setBulkOpen(false)} />
    </DashboardLayout>
  );
}
