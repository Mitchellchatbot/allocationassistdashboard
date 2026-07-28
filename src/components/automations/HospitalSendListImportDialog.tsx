import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Upload, CheckCircle2, AlertTriangle, Ban, PlusCircle } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useHospitals, type Hospital, type HospitalInput } from "@/hooks/use-hospitals";
import { HOSPITAL_SENDLIST, type SendListEntry } from "@/lib/hospital-sendlist";

/** Normalise a hospital name for fuzzy matching (drop generic words + punctuation). */
const norm = (s: string) => (s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
const core = (s: string) =>
  norm(s).replace(/\b(hospital|hospitals|clinic|clinics|medical|centre|center|group|the|healthcare|health|city|dxb|auh|dubai|abu|dhabi|sharjah|al|ain|riyadh|jeddah|doha|saudi|london|university|llc|and|for)\b/g, " ")
    .replace(/\s+/g, " ").trim();

interface Change { field: string; from: string; to: string; patch: Partial<Hospital> }

interface Row {
  entry: SendListEntry;
  match: Hospital | null;
  matchKind: "email" | "exact" | "fuzzy" | "none";
  changes: Change[];
}

const same = (a: string[] | null | undefined, b: string[]) => {
  const A = new Set((a ?? []).map(x => x.trim().toLowerCase()));
  return b.length === A.size && b.every(x => A.has(x.trim().toLowerCase()));
};
const greetIsTeam = (g: string) => !g || /team/i.test(g);

/** Build the proposed changes for one sheet entry against its matched hospital. */
function buildChanges(entry: SendListEntry, h: Hospital | null): Change[] {
  const out: Change[] = [];
  const desiredActive = entry.state === "hold" ? false : true;

  if (!h) {
    // Whole-hospital create.
    out.push({
      field: "Create", from: "—", to: `${entry.name} · ${entry.city}, ${entry.country}`,
      patch: {
        name: entry.name, country: entry.country, city: entry.city,
        primary_recruiter_email: entry.to[0] ?? null,
        primary_contact_name: greetIsTeam(entry.greet) ? null : entry.greet,
        greet_with_contact_name: !greetIsTeam(entry.greet),
        active: desiredActive,
        specialty_only: entry.only.length ? entry.only : null,
        specialty_skip: entry.skip.length ? entry.skip : null,
        cc_emails: entry.cc.length ? entry.cc : null,
        notes: entry.note || null,
      },
    });
    return out;
  }

  // Send state — flip only when it actually differs (null/true both = sendable).
  const currentlySendable = h.active !== false;
  if (entry.state === "hold" && currentlySendable) out.push({ field: "Send state", from: "SEND", to: "DON'T SEND", patch: { active: false } });
  if (entry.state === "send" && h.active === false) out.push({ field: "Send state", from: "DON'T SEND", to: "SEND", patch: { active: true } });

  if (entry.only.length && !same(h.specialty_only, entry.only)) out.push({ field: "Specialty only", from: (h.specialty_only ?? []).join(", ") || "—", to: entry.only.join(", "), patch: { specialty_only: entry.only } });
  if (entry.skip.length && !same(h.specialty_skip, entry.skip)) out.push({ field: "Specialty skip", from: (h.specialty_skip ?? []).join(", ") || "—", to: entry.skip.join(", "), patch: { specialty_skip: entry.skip } });

  // CC — union with what's already on the hospital (never drop existing).
  if (entry.cc.length) {
    const have = new Set((h.cc_emails ?? []).map(e => e.trim().toLowerCase()));
    const add = entry.cc.filter(e => !have.has(e.trim().toLowerCase()));
    if (add.length) out.push({ field: "CC", from: (h.cc_emails ?? []).join(", ") || "—", to: [...(h.cc_emails ?? []), ...add].join(", "), patch: { cc_emails: [...(h.cc_emails ?? []), ...add] } });
  }

  // Greeting — only when the sheet names a person and it differs.
  if (!greetIsTeam(entry.greet) && (h.primary_contact_name ?? "").trim().toLowerCase() !== entry.greet.trim().toLowerCase()) {
    out.push({ field: "Greeting", from: h.primary_contact_name || "—", to: entry.greet, patch: { primary_contact_name: entry.greet, greet_with_contact_name: true } });
  }
  return out;
}

export function HospitalSendListImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: hospitals = [] } = useHospitals();
  const qc = useQueryClient();
  const [applying, setApplying] = useState<{ done: number; total: number } | null>(null);
  const [skip, setSkip] = useState<Set<string>>(new Set());   // entry names the user unchecked

  // Match each sheet entry to an existing hospital (email first, then fuzzy name).
  const rows = useMemo<Row[]>(() => {
    const byEmail = new Map<string, Hospital>();
    const byCore = new Map<string, Hospital>();
    for (const h of hospitals) {
      const e = h.primary_recruiter_email?.trim().toLowerCase();
      if (e) byEmail.set(e, h);
      const c = core(h.name);
      if (c && !byCore.has(c)) byCore.set(c, h);
    }
    return HOSPITAL_SENDLIST.map((entry): Row => {
      let match: Hospital | null = null;
      let matchKind: Row["matchKind"] = "none";
      for (const e of entry.to) { const hit = byEmail.get(e.trim().toLowerCase()); if (hit) { match = hit; matchKind = "email"; break; } }
      if (!match) {
        const c = core(entry.name);
        const exact = hospitals.find(h => norm(h.name) === norm(entry.name));
        if (exact) { match = exact; matchKind = "exact"; }
        else if (byCore.has(c)) { match = byCore.get(c)!; matchKind = "fuzzy"; }
        else { const contains = hospitals.find(h => { const hc = core(h.name); return hc && c && (hc.includes(c) || c.includes(hc)); }); if (contains) { match = contains; matchKind = "fuzzy"; } }
      }
      return { entry, match, matchKind, changes: buildChanges(entry, match) };
    });
  }, [hospitals]);

  const actionable = rows.filter(r => r.changes.length > 0);
  const selected = actionable.filter(r => !skip.has(r.entry.name));
  const holdCount = rows.filter(r => r.entry.state === "hold").length;
  const unmatched = rows.filter(r => r.matchKind === "none").length;

  const apply = async () => {
    if (selected.length === 0) { toast.error("Nothing selected to apply."); return; }
    setApplying({ done: 0, total: selected.length });
    let ok = 0, fail = 0;
    // Write directly and invalidate ONCE at the end — going through the per-row
    // mutation hooks would refetch the whole (limit-5000) hospitals table after
    // every one of the ~110 writes.
    for (const r of selected) {
      try {
        const patch = Object.assign({}, ...r.changes.map(c => c.patch)) as Partial<Hospital>;
        if (r.match) {
          const { error } = await supabase.from("hospitals").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", r.match.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("hospitals").insert(patch as HospitalInput);
          if (error) throw error;
        }
        ok++;
      } catch { fail++; }
      setApplying(p => p && { ...p, done: p.done + 1 });
    }
    await qc.invalidateQueries({ queryKey: ["hospitals"] });
    setApplying(null);
    if (fail === 0) toast.success(`Applied ${ok} hospital update${ok === 1 ? "" : "s"}.`);
    else toast.warning(`${ok} applied, ${fail} failed.`);
  };

  const toggle = (name: string) => setSkip(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !applying && onClose()}>
      <DialogContent className="w-[94vw] max-w-[900px] max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Upload className="h-4 w-4 text-teal-600" /> Import hospital send-list</DialogTitle>
          <DialogDescription className="text-[12px]">
            From the colour-coded sheet: <strong>{rows.length}</strong> hospitals · <strong>{holdCount}</strong> marked don't-send · <strong>{actionable.length}</strong> with changes · <strong>{unmatched}</strong> not matched (would be created). Review, then apply. Nothing is written until you click Apply.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {actionable.length === 0 ? (
            <div className="py-10 text-center text-[12px] text-muted-foreground">Everything already matches the sheet — no changes needed.</div>
          ) : (
            <div className="space-y-1.5">
              {actionable.map(r => {
                const checked = !skip.has(r.entry.name);
                const isCreate = r.matchKind === "none";
                return (
                  <div key={r.entry.name} className={`rounded-lg border p-2 ${checked ? "border-teal-200 bg-teal-50/30" : "border-slate-200 bg-slate-50/40 opacity-70"}`}>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <Checkbox checked={checked} onCheckedChange={() => toggle(r.entry.name)} className="mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-[12px] font-medium text-slate-800">
                          {r.entry.state === "hold" ? <Ban className="h-3.5 w-3.5 shrink-0 text-rose-500" /> : <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-teal-600" />}
                          <span className="truncate">{r.entry.name}</span>
                          <span className="text-[10px] font-normal text-slate-400">{r.entry.city}, {r.entry.country}</span>
                          {isCreate
                            ? <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-violet-100 px-1.5 py-0.5 text-[9.5px] font-medium text-violet-700"><PlusCircle className="h-2.5 w-2.5" /> new</span>
                            : <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[9.5px] font-medium ${r.matchKind === "email" ? "bg-emerald-100 text-emerald-700" : r.matchKind === "exact" ? "bg-sky-100 text-sky-700" : "bg-amber-100 text-amber-700"}`}>
                                {r.matchKind === "email" ? "email match" : r.matchKind === "exact" ? "name match" : "fuzzy match"} → {r.match!.name}
                              </span>}
                        </div>
                        <div className="mt-1 space-y-0.5">
                          {r.changes.map((c, i) => (
                            <div key={i} className="flex items-baseline gap-1.5 text-[10.5px]">
                              <span className="w-[86px] shrink-0 text-slate-400">{c.field}</span>
                              {c.field === "Create"
                                ? <span className="text-violet-700">{c.to}</span>
                                : <><span className="text-slate-400 line-through truncate max-w-[240px]">{c.from}</span><span className="text-slate-400">→</span><span className="font-medium text-teal-700 truncate">{c.to}</span></>}
                            </div>
                          ))}
                          {r.matchKind === "fuzzy" && !isCreate && (
                            <div className="flex items-center gap-1 text-[9.5px] text-amber-600"><AlertTriangle className="h-2.5 w-2.5" /> fuzzy match — double-check it's the right hospital</div>
                          )}
                        </div>
                      </div>
                    </label>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center gap-2">
          <span className="mr-auto text-[11px] text-muted-foreground">{selected.length} of {actionable.length} selected</span>
          <Button variant="outline" onClick={onClose} disabled={!!applying}>Close</Button>
          <Button onClick={apply} disabled={!!applying || selected.length === 0} className="bg-teal-600 hover:bg-teal-700 text-white">
            {applying
              ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Applying {applying.done}/{applying.total}…</>
              : <><Upload className="h-4 w-4 mr-1.5" /> Apply {selected.length} change{selected.length === 1 ? "" : "s"}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
