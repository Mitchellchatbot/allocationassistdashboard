import { useState } from "react";
import { Link } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FlaskConical, Table2, Maximize2, Paperclip, Mail, Calendar, Search, Sparkles } from "lucide-react";
import { EditableEmailPreview } from "@/components/EditableEmailPreview";
import { FullScreenEmailPreview } from "@/components/FullScreenEmailPreview";
import { TableInsertDialog } from "@/components/TableInsertDialog";
import { AttachmentsPicker } from "@/components/automations/AttachmentsPicker";
import { TemplatePicker } from "@/components/automations/TemplatePicker";
import { GulfClock, composeGulfDateTime } from "@/components/GulfClock";
import { useEmailTemplates } from "@/hooks/use-email-templates";
import { SAMPLE_VARS, SAMPLE_HOSPITAL_EMAIL_HTML } from "@/lib/email-sample-vars";
import type { EmailAttachment } from "@/lib/email-attachments";

/**
 * Feature Lab (Amir test harness) — a zero-setup page that mounts the REAL new
 * components with sample data so the whole feature set can be clicked through
 * in npm run dev with no doctor/hospital setup and no edge-function deploy.
 * Everything here is the actual production code (not a fork), just fed sample
 * props + local state.
 */
export default function FeatureLab() {
  const { data: templates = [] } = useEmailTemplates();

  // Live editable email (sample) — exercises the toolbar: table insert, rich
  // text, full-screen, all on real content.
  const [subject, setSubject] = useState("Candidate introduction — Dr. Mónica Costeira");
  const [html, setHtml]       = useState(SAMPLE_HOSPITAL_EMAIL_HTML);
  const [resetTick, setResetTick] = useState(0);

  const [tableOpen, setTableOpen] = useState(false);
  const [fsOpen, setFsOpen]       = useState(false);
  const [attachments, setAttachments] = useState<EmailAttachment[]>([]);
  const [hospitalKey, setHospitalKey] = useState("profile_sent_hospital");
  const [doctorKey, setDoctorKey]     = useState("profile_sent_doctor");

  // Scheduling demo state.
  const [schedDate, setSchedDate] = useState(new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
  const [schedTime, setSchedTime] = useState("09:00");

  return (
    <DashboardLayout>
      <div className="space-y-5 max-w-5xl">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <FlaskConical className="h-6 w-6 text-teal-600" /> Feature Lab
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Try every new email feature here with sample data — no doctors/hospitals to set up, nothing sends. These are the real components, so what you see is exactly how they behave in the live send flows.
            </p>
          </div>
          <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200">npm run dev · nothing sends</Badge>
        </div>

        {/* #4 + #7 + rich text — the live editor */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Table2 className="h-4 w-4 text-teal-600" /> The email editor — tables, rich text & full-screen <Badge variant="outline" className="text-[9px]">#4 · #7</Badge></CardTitle>
            <CardDescription className="text-[12px]">
              In the toolbar below: click <strong>Table</strong> to build/paste a Top-15 table, use <strong>B/I/list/link</strong> to format, and <strong>Full screen</strong> to review across device widths. Everything you do here is what would actually send.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EditableEmailPreview
              subject={subject}
              html={html}
              onSubjectChange={setSubject}
              onHtmlChange={setHtml}
              resetKey={resetTick}
              edited={html !== SAMPLE_HOSPITAL_EMAIL_HTML}
              onReset={() => { setHtml(SAMPLE_HOSPITAL_EMAIL_HTML); setSubject("Candidate introduction — Dr. Mónica Costeira"); setResetTick(t => t + 1); }}
              from="Rodaina Thabit <rodaina@allocationassist.com>"
              to="recruiter@americanhospital.com"
              className="max-h-[520px]"
              text="Plain-text version of the sample email."
            />
          </CardContent>
        </Card>

        {/* #3 template picker */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Mail className="h-4 w-4 text-teal-600" /> Template selection <Badge variant="outline" className="text-[9px]">#3</Badge></CardTitle>
            <CardDescription className="text-[12px]">Pick which template each email uses — hover any option to preview it rendered with sample data. In the real flow this is in Send Profile → Preview & confirm.</CardDescription>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-4">
            <TemplatePicker templates={templates} value={hospitalKey} onChange={setHospitalKey} defaultKey="profile_sent_hospital" renderVars={SAMPLE_VARS} label="Hospital email template" />
            <TemplatePicker templates={templates} value={doctorKey} onChange={setDoctorKey} defaultKey="profile_sent_doctor" renderVars={SAMPLE_VARS} label="Doctor 'working opportunity' template" />
          </CardContent>
        </Card>

        {/* Standalone triggers */}
        <div className="grid sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-[13px] flex items-center gap-1.5"><Table2 className="h-3.5 w-3.5 text-teal-600" /> Insert table</CardTitle></CardHeader>
            <CardContent><Button size="sm" variant="outline" onClick={() => setTableOpen(true)} className="w-full"><Table2 className="h-3.5 w-3.5 mr-1.5" /> Open table builder</Button></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-[13px] flex items-center gap-1.5"><Maximize2 className="h-3.5 w-3.5 text-teal-600" /> Full-screen</CardTitle></CardHeader>
            <CardContent><Button size="sm" variant="outline" onClick={() => setFsOpen(true)} className="w-full"><Maximize2 className="h-3.5 w-3.5 mr-1.5" /> Open full-screen preview</Button></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-[13px] flex items-center gap-1.5"><Paperclip className="h-3.5 w-3.5 text-teal-600" /> Attachments <Badge variant="outline" className="text-[9px]">#1</Badge></CardTitle></CardHeader>
            <CardContent><AttachmentsPicker attachments={attachments} onChange={setAttachments} hint="CV, logbook — drop a PDF to see the chip" /></CardContent>
          </Card>
        </div>

        {/* #5 scheduling demo */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4 text-teal-600" /> Scheduling <Badge variant="outline" className="text-[9px]">#5</Badge></CardTitle>
            <CardDescription className="text-[12px]">Pick a date + Gulf time and see the live countdown. In the real flow, Batches lets you schedule two daily sends at different times (e.g. 09:00 and 14:00).</CardDescription>
          </CardHeader>
          <CardContent className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1"><label className="text-[10px] uppercase tracking-wider text-muted-foreground">Date</label><Input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)} className="h-9 text-[12px] w-[150px]" /></div>
            <div className="space-y-1"><label className="text-[10px] uppercase tracking-wider text-muted-foreground">Time (GST)</label><Input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)} className="h-9 text-[12px] w-[120px]" /></div>
            <div className="pb-2"><GulfClock when={composeGulfDateTime(schedDate, schedTime)} /></div>
            <Button asChild size="sm" variant="outline" className="ml-auto"><Link to="/batches">Open Batches →</Link></Button>
          </CardContent>
        </Card>

        {/* #6 search */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Search className="h-4 w-4 text-teal-600" /> Unified search & Past Sent <Badge variant="outline" className="text-[9px]">#6</Badge></CardTitle>
            <CardDescription className="text-[12px]">Press <kbd className="px-1 py-0.5 rounded border bg-muted/60 text-[10px]">⌘K</kbd> / <kbd className="px-1 py-0.5 rounded border bg-muted/60 text-[10px]">Ctrl K</kbd> and use the filter chips (1st/2nd profile, Top 15, daily specialty), or open the full Past Sent log.</CardDescription>
          </CardHeader>
          <CardContent><Button asChild size="sm" variant="outline"><Link to="/past-sent">Open Past Sent →</Link></Button></CardContent>
        </Card>

        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-teal-600" /> See <code className="bg-slate-100 px-1 py-0.5 rounded">TESTING.md</code> in the repo root for a step-by-step checklist of all 8 requests.
        </div>
      </div>

      <TableInsertDialog open={tableOpen} onOpenChange={setTableOpen} onInsert={(h) => setHtml(prev => prev + h)} />
      <FullScreenEmailPreview open={fsOpen} onClose={() => setFsOpen(false)} subject={subject} html={html} from="Rodaina Thabit <rodaina@allocationassist.com>" to="recruiter@americanhospital.com" text="Plain-text version." />
    </DashboardLayout>
  );
}
