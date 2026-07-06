import { useEffect, useMemo, useState, Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Hospital as HospitalIcon, Plus, Pencil, Trash2, Search, Save, ChevronRight, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import {
  useHospitals, useCreateHospital, useUpdateHospital, useDeleteHospital,
  type Hospital, type HospitalInput,
} from "@/hooks/use-hospitals";
import { useHospitalContacts, eligibleRecipients, resolveRecipient, type HospitalContact } from "@/hooks/use-hospital-contacts";
import { uploadEmailAttachment } from "@/lib/email-attachments";

const BLANK: HospitalInput = {
  name: "", city: "", country: "", primary_recruiter_email: "",
  primary_contact_name: "", recruiter_phone: "", template_key: "", notes: "",
};

/** Expanded panel under a hospital row: its Zoho contacts + the per-hospital
 *  send-routing settings (who to email + direct addressing). */
function HospitalContactsPanel({ hospital, contacts, onUpdate }: {
  hospital: Hospital;
  contacts: HospitalContact[];
  onUpdate: (patch: Partial<HospitalInput>) => Promise<unknown>;
}) {
  const mode = hospital.contact_mode ?? "primary";
  const excluded = new Set((hospital.excluded_contact_emails ?? []).map(e => e.toLowerCase()));
  const eligible = eligibleRecipients(contacts, hospital);
  const next = resolveRecipient(contacts, hospital).contact;

  const toggleExcluded = (email: string) => {
    const set = new Set(excluded);
    const k = email.toLowerCase();
    if (set.has(k)) set.delete(k); else set.add(k);
    void onUpdate({ excluded_contact_emails: Array.from(set) });
  };

  const seg = (active: boolean) =>
    `px-2.5 py-1 text-[11px] font-medium transition-colors ${active ? "bg-teal-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`;

  return (
    <div className="px-4 py-3 space-y-3">
      {/* Routing settings */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Send each email to:</span>
          <div className="inline-flex rounded-md border border-border/60 overflow-hidden">
            <button type="button" className={seg(mode === "primary")} onClick={() => onUpdate({ contact_mode: "primary" })} title="Always email the Primary contact">
              Primary contact
            </button>
            <button type="button" className={seg(mode === "cycle")} onClick={() => onUpdate({ contact_mode: "cycle" })} title="Rotate through all contacts — each send goes to the next one">
              Cycle through all
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Greet with:</span>
          <div className="inline-flex rounded-md border border-border/60 overflow-hidden">
            <button
              type="button"
              className={seg(!hospital.greet_with_contact_name)}
              onClick={() => onUpdate({ greet_with_contact_name: false })}
              title="Open the email with the hospital's name"
            >
              Hospital name
            </button>
            <button
              type="button"
              className={seg(hospital.greet_with_contact_name)}
              onClick={() => onUpdate({ greet_with_contact_name: true })}
              title="Open the email with the chosen contact's own name"
            >
              Contact name
            </button>
          </div>
        </div>
        {mode === "cycle" && next && (
          <span className="ml-auto text-[10.5px] text-muted-foreground">
            Next up: <span className="font-medium text-foreground">{next.name || next.email}</span>
          </span>
        )}
        {eligible.length > 0 && mode === "primary" && next && (
          <span className="ml-auto text-[10.5px] text-muted-foreground">
            Emails: <span className="font-medium text-foreground">{next.name || next.email}</span>
          </span>
        )}
      </div>

      {/* Contacts */}
      {contacts.length === 0 ? (
        <div className="text-[11px] text-muted-foreground italic">
          No Zoho contacts matched this hospital by name. They appear after the next Zoho sync — or the hospital's name here differs from its Zoho account name.
        </div>
      ) : (
        <div className="rounded-md border bg-white overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left px-2 py-1.5 font-medium w-14" title="Include in the primary/cycle rotation">Email?</th>
                <th className="text-left px-2 py-1.5 font-medium">Name</th>
                <th className="text-left px-2 py-1.5 font-medium">Title</th>
                <th className="text-left px-2 py-1.5 font-medium">Type</th>
                <th className="text-left px-2 py-1.5 font-medium">Email</th>
                <th className="text-left px-2 py-1.5 font-medium">Phone</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {contacts.map(c => {
                const isExcluded = c.email ? excluded.has(c.email.toLowerCase()) : true;
                return (
                  <tr key={c.id} className={isExcluded ? "opacity-45" : ""}>
                    <td className="px-2 py-1.5">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-teal-600"
                        disabled={!c.email}
                        checked={!!c.email && !isExcluded}
                        onChange={() => c.email && toggleExcluded(c.email)}
                        title={c.email ? "Include this contact when picking a recipient" : "No email — can't be a recipient"}
                      />
                    </td>
                    <td className="px-2 py-1.5 font-medium text-slate-800">{c.name || "—"}</td>
                    <td className="px-2 py-1.5 text-slate-600">{c.title ?? "—"}</td>
                    <td className="px-2 py-1.5">
                      {c.isPrimary
                        ? <Badge variant="outline" className="text-[8px] bg-teal-50 text-teal-700 border-teal-200 uppercase">Primary</Badge>
                        : <span className="text-slate-400">{c.type ?? "—"}</span>}
                    </td>
                    <td className="px-2 py-1.5 text-slate-600">{c.email ?? "—"}</td>
                    <td className="px-2 py-1.5 text-slate-500">{c.phone ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function HospitalsTab() {
  const { data: hospitals = [], isLoading } = useHospitals();
  const createH = useCreateHospital();
  const updateH = useUpdateHospital();
  const deleteH = useDeleteHospital();

  const [search,  setSearch]  = useState("");
  const [editing, setEditing] = useState<Hospital | null>(null);
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const contacts = useHospitalContacts();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return hospitals;
    // Special filter: a literal em-dash search shows rows missing a
    // country (matches the placeholder rendered in the country cell).
    // Used by the "Show them" banner above.
    if (q === "—") return hospitals.filter(h => !h.country);
    return hospitals.filter(h =>
      h.name.toLowerCase().includes(q) ||
      h.city?.toLowerCase().includes(q) ||
      h.country?.toLowerCase().includes(q) ||
      h.primary_recruiter_email?.toLowerCase().includes(q),
    );
  }, [hospitals, search]);

  const byCountry = useMemo(() => {
    const m: Record<string, number> = {};
    for (const h of hospitals) {
      const k = h.country ?? "—";
      m[k] = (m[k] ?? 0) + 1;
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [hospitals]);

  const handleDelete = async (h: Hospital) => {
    if (!confirm(`Delete ${h.name}? This can't be undone.`)) return;
    await deleteH.mutateAsync(h.id);
    toast.success(`Deleted ${h.name}`);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <HospitalIcon className="h-4 w-4 text-teal-600" /> Hospitals
              </CardTitle>
              <CardDescription className="mt-1">
                The registry of hospitals AA introduces doctors to. Flow 2 (Profile Sent) and Flow 5 (Relocation) read from this table.
                Saif's full 95-hospital list will be loaded here; seeded entries are starter rows for the demo.
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add hospital
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Banner: country-scoped batches require every hospital to
              have a country set. Surface the count + a 1-click filter
              so the team can fix them in-place. */}
          {(() => {
            const needsCountry = hospitals.filter(h => !h.country).length;
            if (needsCountry === 0) return null;
            return (
              <div className="rounded-md border border-amber-200 bg-amber-50/50 px-3 py-2 flex items-center gap-2">
                <span className="text-[11px] text-amber-900 flex-1">
                  <strong>{needsCountry}</strong> hospital{needsCountry === 1 ? "" : "s"} {needsCountry === 1 ? "is" : "are"} missing a country — country-scoped batch sends (UAE / KSA / etc.) skip these. Search "—" to filter, then edit each row.
                </span>
                <button
                  onClick={() => setSearch("—")}
                  className="text-[11px] font-medium text-amber-900 hover:underline"
                >
                  Show them
                </button>
              </div>
            );
          })()}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, city, country, or email..."
                className="pl-7 text-[12px] h-8"
              />
            </div>
            <div className="text-[11px] text-muted-foreground">
              {filtered.length} of {hospitals.length}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {byCountry.map(([c, n]) => (
                <Badge key={c} variant="outline" className="text-[10px]">{c}: {n}</Badge>
              ))}
            </div>
          </div>

          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px]">Name</TableHead>
                  <TableHead className="text-[11px]">City</TableHead>
                  <TableHead className="text-[11px]">Country</TableHead>
                  <TableHead className="text-[11px]">Recruiter Email</TableHead>
                  <TableHead className="text-[11px]">Contact</TableHead>
                  <TableHead className="text-[11px]">Template</TableHead>
                  <TableHead className="text-[11px] w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={7} className="text-center text-[12px] text-muted-foreground py-6">Loading...</TableCell></TableRow>
                )}
                {!isLoading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-[12px] text-muted-foreground py-6">No hospitals match.</TableCell></TableRow>
                )}
                {filtered.map(h => {
                  const hc = contacts.forHospital(h.name);
                  const expanded = expandedId === h.id;
                  return (
                  <Fragment key={h.id}>
                  <TableRow className="text-[12px] cursor-pointer hover:bg-muted/30" onClick={() => setExpandedId(expanded ? null : h.id)}>
                    <TableCell className="font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                        {h.name}
                        {hc.length > 0 && (
                          <Badge variant="outline" className="text-[8px] bg-teal-50 text-teal-700 border-teal-200">
                            {hc.length} contact{hc.length === 1 ? "" : "s"}
                          </Badge>
                        )}
                        {h.contact_mode === "cycle" && (
                          <Badge variant="outline" className="text-[8px] bg-violet-50 text-violet-700 border-violet-200">cycle</Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>{h.city ?? "—"}</TableCell>
                    <TableCell>{h.country ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{h.primary_recruiter_email ?? "—"}</TableCell>
                    <TableCell>{h.primary_contact_name ?? "—"}</TableCell>
                    <TableCell>
                      {h.template_key ? (
                        <code className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded">{h.template_key}</code>
                      ) : <span className="text-muted-foreground">default</span>}
                    </TableCell>
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(h)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-600 hover:text-rose-700" onClick={() => handleDelete(h)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  {expanded && (
                    <TableRow className="bg-muted/20 hover:bg-muted/20">
                      <TableCell colSpan={7} className="p-0">
                        <HospitalContactsPanel
                          hospital={h}
                          contacts={hc}
                          onUpdate={patch => updateH.mutateAsync({ id: h.id, name: h.name, ...patch })}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                  </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <HospitalDialog
        open={creating}
        onClose={() => setCreating(false)}
        title="Add Hospital"
        initial={BLANK}
        onSubmit={async (input) => {
          await createH.mutateAsync(input);
          toast.success(`Added ${input.name}`);
        }}
      />
      <HospitalDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`Edit ${editing?.name ?? ""}`}
        initial={editing ?? BLANK}
        onSubmit={async (input) => {
          if (!editing) return;
          await updateH.mutateAsync({ id: editing.id, ...input });
          toast.success(`Updated ${input.name}`);
        }}
      />
    </div>
  );
}

function HospitalDialog({
  open, onClose, title, initial, onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  initial: HospitalInput | Hospital;
  onSubmit: (input: HospitalInput) => Promise<void>;
}) {
  const [form, setForm] = useState<HospitalInput>(() => ({
    name:                    initial.name ?? "",
    city:                    initial.city ?? "",
    country:                 initial.country ?? "",
    primary_recruiter_email: initial.primary_recruiter_email ?? "",
    primary_contact_name:    initial.primary_contact_name ?? "",
    greet_with_contact_name: initial.greet_with_contact_name ?? false,
    recruiter_phone:         initial.recruiter_phone ?? "",
    image_url:               initial.image_url ?? "",
    template_key:            initial.template_key ?? "",
    notes:                   initial.notes ?? "",
  }));
  const [imgUploading, setImgUploading] = useState(false);

  const uploadHospitalImage = async (file: File) => {
    setImgUploading(true);
    try {
      const att = await uploadEmailAttachment(file);
      setForm(f => ({ ...f, image_url: att.path }));
      toast.success("Image uploaded.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setImgUploading(false);
    }
  };
  const [saving, setSaving] = useState(false);

  // Re-seed when the dialog opens with a different initial (edit flow).
  // Identity check via `initial` reference — parent passes a new object per
  // hospital selection so this fires on each open.
  useEffect(() => {
    setForm({
      name:                    initial.name ?? "",
      city:                    initial.city ?? "",
      country:                 initial.country ?? "",
      primary_recruiter_email: initial.primary_recruiter_email ?? "",
      primary_contact_name:    initial.primary_contact_name ?? "",
      greet_with_contact_name: initial.greet_with_contact_name ?? false,
      recruiter_phone:         initial.recruiter_phone ?? "",
      image_url:               initial.image_url ?? "",
      template_key:            initial.template_key ?? "",
      notes:                   initial.notes ?? "",
    });
  }, [initial]);

  const handleSave = async () => {
    if (!form.name?.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ ...form, name: form.name.trim() });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-[12px]">
            Used by Flow 2 (profile sends) and Flow 5 (relocation guide selection). Email becomes the BCC recipient when sending profiles.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name *" className="col-span-2"
            value={form.name ?? ""} onChange={v => setForm(f => ({ ...f, name: v }))} />
          <Field label="City"
            value={form.city ?? ""} onChange={v => setForm(f => ({ ...f, city: v }))} />
          <Field label="Country"
            value={form.country ?? ""} onChange={v => setForm(f => ({ ...f, country: v }))} />
          <Field label="Recruiter email" type="email" className="col-span-2"
            value={form.primary_recruiter_email ?? ""} onChange={v => setForm(f => ({ ...f, primary_recruiter_email: v }))} />
          <Field label="Contact name"
            value={form.primary_contact_name ?? ""} onChange={v => setForm(f => ({ ...f, primary_contact_name: v }))} />
          <Field label="Phone"
            value={form.recruiter_phone ?? ""} onChange={v => setForm(f => ({ ...f, recruiter_phone: v }))} />

          {/* Hospital photo — shown in working-opportunity emails via the
              {{hospital_image}} slot. Paste a URL or upload an image. */}
          <div className="col-span-2 space-y-1">
            <Label className="text-[11px]">Hospital photo (shown in working-opportunity emails)</Label>
            <div className="flex items-center gap-2">
              <Input
                value={form.image_url ?? ""}
                onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))}
                placeholder="Paste an image URL, or upload →"
                className="h-9 text-[12px] flex-1"
              />
              <label className={`shrink-0 inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-[12px] cursor-pointer hover:bg-slate-50 ${imgUploading ? "opacity-60 pointer-events-none" : ""}`}>
                {imgUploading ? "Uploading…" : "Upload"}
                <input type="file" accept="image/png,image/jpeg" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadHospitalImage(f); e.currentTarget.value = ""; }} />
              </label>
            </div>
            {form.image_url?.trim() && (
              <div className="flex items-center gap-2 pt-1">
                <img src={form.image_url} alt="Hospital" className="h-14 w-24 rounded object-cover border border-slate-200" />
                <button type="button" onClick={() => setForm(f => ({ ...f, image_url: "" }))} className="text-[11px] text-rose-600 hover:underline">Remove</button>
              </div>
            )}
          </div>
          {/* Greeting source — does the hospital email open with the hospital
              name or the named contact person? */}
          <div className="col-span-2 space-y-1">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Email greeting uses</Label>
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 text-[12px] w-fit">
              <button type="button" onClick={() => setForm(f => ({ ...f, greet_with_contact_name: false }))}
                className={`rounded-md px-3 py-1 font-medium transition-colors ${!form.greet_with_contact_name ? "bg-white shadow-sm text-teal-700" : "text-slate-500"}`}>
                Hospital name
              </button>
              <button type="button" onClick={() => setForm(f => ({ ...f, greet_with_contact_name: true }))}
                className={`rounded-md px-3 py-1 font-medium transition-colors ${form.greet_with_contact_name ? "bg-white shadow-sm text-teal-700" : "text-slate-500"}`}>
                Contact name
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Preview: <span className="font-medium text-slate-600">Hello {(form.greet_with_contact_name ? (form.primary_contact_name?.trim() || form.name?.trim()) : form.name?.trim()) || "the team"}!</span>
              {form.greet_with_contact_name && !form.primary_contact_name?.trim() && <span className="text-amber-600"> — no contact name set, falls back to the hospital name.</span>}
            </p>
          </div>
          <Field label="Template key (override)" placeholder="e.g. profile_sent_american_hospital" className="col-span-2"
            value={form.template_key ?? ""} onChange={v => setForm(f => ({ ...f, template_key: v }))} />
          <div className="col-span-2">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Notes</Label>
            <Textarea
              value={form.notes ?? ""}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="mt-1 text-[12px] min-h-[60px]"
              placeholder="Relationship history, preferred contact times, etc."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, className }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 text-[12px]"
      />
    </div>
  );
}
