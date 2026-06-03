import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Hospital as HospitalIcon, Plus, Pencil, Trash2, Search, Save } from "lucide-react";
import { toast } from "sonner";
import {
  useHospitals, useCreateHospital, useUpdateHospital, useDeleteHospital,
  type Hospital, type HospitalInput,
} from "@/hooks/use-hospitals";

const BLANK: HospitalInput = {
  name: "", city: "", country: "", primary_recruiter_email: "",
  primary_contact_name: "", recruiter_phone: "", template_key: "", notes: "",
};

export function HospitalsTab() {
  const { data: hospitals = [], isLoading } = useHospitals();
  const createH = useCreateHospital();
  const updateH = useUpdateHospital();
  const deleteH = useDeleteHospital();

  const [search,  setSearch]  = useState("");
  const [editing, setEditing] = useState<Hospital | null>(null);
  const [creating, setCreating] = useState(false);

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
                {filtered.map(h => (
                  <TableRow key={h.id} className="text-[12px]">
                    <TableCell className="font-medium">{h.name}</TableCell>
                    <TableCell>{h.city ?? "—"}</TableCell>
                    <TableCell>{h.country ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{h.primary_recruiter_email ?? "—"}</TableCell>
                    <TableCell>{h.primary_contact_name ?? "—"}</TableCell>
                    <TableCell>
                      {h.template_key ? (
                        <code className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded">{h.template_key}</code>
                      ) : <span className="text-muted-foreground">default</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(h)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-600 hover:text-rose-700" onClick={() => handleDelete(h)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
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
    recruiter_phone:         initial.recruiter_phone ?? "",
    template_key:            initial.template_key ?? "",
    notes:                   initial.notes ?? "",
  }));
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
      recruiter_phone:         initial.recruiter_phone ?? "",
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
