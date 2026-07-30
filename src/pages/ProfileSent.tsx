import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Send, Users, UserSquare2, History, ExternalLink } from "lucide-react";
import { SendProfileDialog } from "@/components/automations/SendProfileDialog";
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
/** `query` is the shared /sends search bar — filters the recent-sends list. */
export function SendProfilePanel({ query = "" }: { query?: string } = {}) {
  const navigate = useNavigate();
  const [sendOpen, setSendOpen] = useState(false);
  const { records } = useSentHistory();

  const recent = useMemo(() => {
    const q = query.trim().toLowerCase();
    const individual = records.filter(r => r.sentKind === "individual");
    const matched = q
      ? individual.filter(r => `${r.doctorName} ${r.hospital ?? ""} ${r.specialty ?? ""}`.toLowerCase().includes(q))
      : individual;
    return matched.slice(0, 25);
  }, [records, query]);

  return (
    <>
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2"><Send className="h-5 w-5 text-teal-600" /> Profile Sent</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5 max-w-[640px]">
            Send doctor profiles to hospitals. Every send flows into Flow 2, Past Sent and the pipeline — this is just the launchpad.
          </p>
        </div>

        {/* Two ways to send — the primary CTAs now that the header buttons
            are gone. Distinct accents (teal vs indigo) + a hover lift. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card
            className="group cursor-pointer border-teal-200 bg-gradient-to-br from-teal-50 to-white transition-all hover:border-teal-400 hover:shadow-md hover:-translate-y-0.5"
            onClick={() => setSendOpen(true)}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-[14px] flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-white shadow-sm transition-transform group-hover:scale-105">
                  <UserSquare2 className="h-4 w-4" />
                </span>
                Personalized send
              </CardTitle>
              <CardDescription className="text-[12px] text-slate-600">One or more doctors → one or more hospitals, each a personalized email. Full preview + editing, attachments, templates, schedule-for-later.</CardDescription>
            </CardHeader>
          </Card>
          <Card
            className="group cursor-pointer border-indigo-200 bg-gradient-to-br from-indigo-50 to-white transition-all hover:border-indigo-400 hover:shadow-md hover:-translate-y-0.5"
            onClick={() => navigate("/sends?tab=batch-sends&compose=oneoff")}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-[14px] flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm transition-transform group-hover:scale-105">
                  <Users className="h-4 w-4" />
                </span>
                Bulk send
              </CardTitle>
              <CardDescription className="text-[12px] text-slate-600">Many doctors → one table per hospital, sent now — opens the batch composer (where you can also schedule recurring blasts).</CardDescription>
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
              <button onClick={() => navigate("/sends?tab=past-sent")} className="ml-auto inline-flex items-center gap-1 text-[11px] text-teal-700 hover:underline">
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
    </>
  );
}

export default function ProfileSent() {
  return (
    <DashboardLayout>
      <SendProfilePanel />
    </DashboardLayout>
  );
}
