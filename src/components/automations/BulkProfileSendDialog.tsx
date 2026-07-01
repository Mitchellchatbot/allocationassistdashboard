import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Search, Send, Users, Building2, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useHospitals } from "@/hooks/use-hospitals";
import { usePublishedWpCandidates } from "@/hooks/use-wp-candidates";
import { useEmailTemplates } from "@/hooks/use-email-templates";
import { TemplatePicker } from "@/components/automations/TemplatePicker";
import { findSenderByEmail } from "@/lib/hi-team";

const HOSPITAL_DEFAULT_KEY = "profile_sent_hospital";
const DOCTOR_DEFAULT_KEY   = "profile_sent_doctor";

/**
 * BulkProfileSendDialog — send MULTIPLE doctors' profiles to MULTIPLE hospitals,
 * ONE email per doctor (every doctor × hospital pair is its own email, never a
 * BCC digest). Pool = published WordPress candidates (the website roster). Each
 * pair becomes a profile_sent run + a send-flow-email invoke, so the sends still
 * flow into Flow 2, Past Sent and the pipeline counts exactly like a single send.
 *
 * Template-only (no per-send body editing — there can be hundreds of pairs); for
 * a hand-edited one-off use the single Send Profile dialog instead.
 */
export function BulkProfileSendDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: hospitals = [] } = useHospitals();
  const { data: candidates = [], isLoading: candLoading } = usePublishedWpCandidates();
  const { data: templates = [] } = useEmailTemplates();

  const [docIds,  setDocIds]  = useState<Set<string>>(new Set());
  const [hospIds, setHospIds] = useState<Set<string>>(new Set());
  const [docQuery,  setDocQuery]  = useState("");
  const [hospQuery, setHospQuery] = useState("");
  const [hospitalTemplateKey, setHospitalTemplateKey] = useState(HOSPITAL_DEFAULT_KEY);
  const [doctorTemplateKey,   setDoctorTemplateKey]   = useState(DOCTOR_DEFAULT_KEY);
  const [customMessage, setCustomMessage] = useState("");
  const [bccSelf, setBccSelf] = useState(true);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    if (open) {
      setDocIds(new Set()); setHospIds(new Set());
      setDocQuery(""); setHospQuery("");
      setHospitalTemplateKey(HOSPITAL_DEFAULT_KEY); setDoctorTemplateKey(DOCTOR_DEFAULT_KEY);
      setCustomMessage(""); setBccSelf(true); setProgress(null);
    }
  }, [open]);

  // Doctor pool — published WP candidates with a usable name (so the email
  // renders), newest first. Key by a stable identity that send-flow-email can
  // resolve back to the profile (linked Zoho id when present, else wp:<id>).
  const docPool = useMemo(() => {
    return candidates
      .filter(c => (c.full_name ?? "").trim())
      .map(c => ({
        key:        c.doctor_id ?? `wp:${c.id}`,
        doctor_id:  c.doctor_id ?? null,
        name:       c.full_name ?? "",
        email:      c.email ?? null,
        phone:      c.phone ?? null,
        speciality: c.specialty ?? null,
      }));
  }, [candidates]);

  const docFiltered = useMemo(() => {
    const q = docQuery.trim().toLowerCase();
    if (!q) return docPool;
    return docPool.filter(d => d.name.toLowerCase().includes(q) || (d.speciality ?? "").toLowerCase().includes(q) || (d.email ?? "").toLowerCase().includes(q));
  }, [docPool, docQuery]);

  // Only hospitals with a recruiter email can actually receive a send.
  const hospPool = useMemo(() => {
    const q = hospQuery.trim().toLowerCase();
    return hospitals
      .filter(h => h.primary_recruiter_email)
      .filter(h => !q || h.name.toLowerCase().includes(q) || (h.city ?? "").toLowerCase().includes(q));
  }, [hospitals, hospQuery]);

  const selectedDocs  = useMemo(() => docPool.filter(d => docIds.has(d.key)), [docPool, docIds]);
  const selectedHosps = useMemo(() => hospitals.filter(h => hospIds.has(h.id)), [hospitals, hospIds]);
  const pairCount = selectedDocs.length * selectedHosps.length;

  const toggle = (set: Set<string>, id: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setter(next);
  };

  const sampleVars = (d: typeof docPool[number]): Record<string, string> => ({
    doctor_name: d.name, doctor_speciality: d.speciality ?? "", hospital_name: selectedHosps[0]?.name ?? "the hospital",
  });

  const send = async () => {
    if (selectedDocs.length === 0 || selectedHosps.length === 0) {
      toast.error("Pick at least one doctor and one hospital.");
      return;
    }
    setSending(true);
    setProgress({ done: 0, total: pairCount });
    const batchId = crypto.randomUUID();
    const me = findSenderByEmail(user?.email ?? null);
    const bcc = bccSelf && me ? [me.email] : [];
    const templateOverrides: Record<string, string> = {};
    if (hospitalTemplateKey !== HOSPITAL_DEFAULT_KEY) templateOverrides.email_hospital = hospitalTemplateKey;
    if (doctorTemplateKey   !== DOCTOR_DEFAULT_KEY)   templateOverrides.email_doctor   = doctorTemplateKey;

    let sent = 0, failed = 0, lastErr = "";
    for (const d of selectedDocs) {
      for (const h of selectedHosps) {
        try {
          const { data: runRow, error: runErr } = await supabase
            .from("automation_flow_runs")
            .insert({
              flow_key:      "profile_sent",
              doctor_id:     d.doctor_id,
              doctor_name:   d.name,
              doctor_email:  d.email,
              doctor_phone:  d.phone,
              hospital:      h.name,
              current_stage: "email_hospital",
              status:        "active",
              created_by:    user?.email ?? null,
              metadata: {
                batch_id:          batchId,
                hospital_id:       h.id,
                hospital_email:    h.primary_recruiter_email,
                bcc:               false,            // one email per doctor — never a digest
                doctor_speciality: d.speciality,
                custom_message:    customMessage || null,
                triggered_via:     "bulk_profile_send",
                ...(bcc.length ? { bcc_override: bcc } : {}),
                ...(Object.keys(templateOverrides).length ? { template_overrides: templateOverrides } : {}),
              },
            })
            .select("id")
            .single();
          if (runErr || !runRow) throw new Error(runErr?.message ?? "run insert failed");
          const { data: resp, error: sendErr } = await supabase.functions.invoke("send-flow-email", { body: { run_id: runRow.id } });
          if (sendErr) throw sendErr;
          const r = resp as { ok?: boolean; error?: string };
          if (!r?.ok) throw new Error(r?.error ?? "send failed");
          sent++;
        } catch (e) {
          failed++;
          lastErr = e instanceof Error ? e.message : "unknown";
        }
        setProgress(p => p && ({ ...p, done: p.done + 1 }));
      }
    }
    qc.invalidateQueries({ queryKey: ["automation-flow-runs"] });
    setSending(false);
    if (failed === 0) toast.success(`Sent ${sent} email${sent === 1 ? "" : "s"} — ${selectedDocs.length} doctor(s) × ${selectedHosps.length} hospital(s).`);
    else toast.warning(`${sent} sent, ${failed} failed. Last error: ${lastErr}`);
    if (sent > 0) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !sending && onClose()}>
      <DialogContent className="w-[92vw] max-w-[860px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-teal-600" /> Bulk send profiles
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            Send multiple doctors to multiple hospitals — <strong>one email per doctor</strong> (each doctor × hospital is its own email, never bundled). For a hand-edited one-off, use the single Send Profile flow instead.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          {/* Doctors */}
          <Picklist
            icon={<Users className="h-3.5 w-3.5 text-teal-600" />}
            title="Doctors"
            count={selectedDocs.length}
            query={docQuery}
            onQuery={setDocQuery}
            loading={candLoading}
            emptyText="No published doctors match."
            onSelectAll={() => setDocIds(new Set(docFiltered.map(d => d.key)))}
            onClear={() => setDocIds(new Set())}
            items={docFiltered.map(d => ({
              id: d.key,
              checked: docIds.has(d.key),
              onToggle: () => toggle(docIds, d.key, setDocIds),
              primary: d.name,
              secondary: d.speciality ?? d.email ?? "",
            }))}
          />
          {/* Hospitals */}
          <Picklist
            icon={<Building2 className="h-3.5 w-3.5 text-teal-600" />}
            title="Hospitals"
            count={selectedHosps.length}
            query={hospQuery}
            onQuery={setHospQuery}
            emptyText="No hospitals with a recruiter email."
            onSelectAll={() => setHospIds(new Set(hospPool.map(h => h.id)))}
            onClear={() => setHospIds(new Set())}
            items={hospPool.map(h => ({
              id: h.id,
              checked: hospIds.has(h.id),
              onToggle: () => toggle(hospIds, h.id, setHospIds),
              primary: h.name,
              secondary: [h.city, h.country].filter(Boolean).join(", "),
            }))}
          />
        </div>

        {/* Template — only the doctor "working opportunity" email is pickable;
            the hospital intro always uses the standard profile-sent template. */}
        <div>
          <TemplatePicker templates={templates} value={doctorTemplateKey} onChange={setDoctorTemplateKey} defaultKey={DOCTOR_DEFAULT_KEY} renderVars={sampleVars(selectedDocs[0] ?? docPool[0] ?? { key: "", doctor_id: null, name: "Dr. Example", email: null, phone: null, speciality: "Cardiology" })} label="Doctor 'working opportunity' template" flowFilter="profile_sent" />
        </div>

        <div className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Custom note (optional — added to every hospital email)</span>
          <Textarea value={customMessage} onChange={(e) => setCustomMessage(e.target.value)} className="text-[12px] min-h-[56px]" placeholder="e.g. These are our latest available cardiologists for your Q3 openings." />
        </div>

        <label className="flex items-center gap-2 text-[12px] cursor-pointer">
          <Checkbox checked={bccSelf} onCheckedChange={(v) => setBccSelf(!!v)} /> BCC me on every send
        </label>

        {pairCount > 40 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-[2px] shrink-0" />
            That's <strong>{pairCount} individual emails</strong>. Double-check the doctor and hospital selections before sending.
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button onClick={send} disabled={sending || pairCount === 0} className="bg-teal-600 hover:bg-teal-700 text-white">
            {sending
              ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Sending {progress ? `${progress.done}/${progress.total}` : ""}…</>
              : <><Send className="h-4 w-4 mr-1.5" /> Send {pairCount || ""} email{pairCount === 1 ? "" : "s"}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface PicklistItem { id: string; checked: boolean; onToggle: () => void; primary: string; secondary: string }
function Picklist({ icon, title, count, query, onQuery, loading, emptyText, items, onSelectAll, onClear }: {
  icon: React.ReactNode; title: string; count: number; query: string; onQuery: (v: string) => void;
  loading?: boolean; emptyText: string; items: PicklistItem[]; onSelectAll: () => void; onClear: () => void;
}) {
  return (
    <div className="rounded-md border bg-white flex flex-col min-h-0">
      <div className="px-2.5 py-1.5 border-b flex items-center gap-1.5">
        {icon}
        <span className="text-[12px] font-medium">{title}</span>
        {count > 0 && <Badge variant="outline" className="text-[9px] bg-teal-50 text-teal-700 border-teal-200">{count} selected</Badge>}
        <div className="ml-auto flex items-center gap-1.5 text-[10px]">
          <button type="button" onClick={onSelectAll} className="text-teal-700 hover:underline">All</button>
          <span className="text-slate-300">·</span>
          <button type="button" onClick={onClear} className="text-slate-500 hover:underline">Clear</button>
        </div>
      </div>
      <div className="p-1.5 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input value={query} onChange={(e) => onQuery(e.target.value)} placeholder={`Search ${title.toLowerCase()}…`} className="h-8 pl-7 text-[12px]" />
        </div>
      </div>
      <div className="max-h-[260px] overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-[11px] text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1" /> Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-4 text-center text-[11px] text-muted-foreground italic">{emptyText}</div>
        ) : items.map(it => (
          <label key={it.id} className="flex items-start gap-2 px-2.5 py-1.5 hover:bg-teal-50/50 cursor-pointer border-b border-slate-50">
            <Checkbox checked={it.checked} onCheckedChange={it.onToggle} className="mt-0.5" />
            <span className="min-w-0">
              <span className="block text-[12px] font-medium truncate">{it.primary}</span>
              {it.secondary && <span className="block text-[10px] text-muted-foreground truncate">{it.secondary}</span>}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
