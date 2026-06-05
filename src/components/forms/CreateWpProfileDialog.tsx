/**
 * Surface for converting a JotForm submission into a WordPress doctor
 * candidate. The pipeline can do this automatically (webhook path) but
 * the historical sync DELIBERATELY does not (most historical rows
 * already exist in WP and the bulk import would create duplicate
 * drafts).
 *
 * Flow:
 *   1. User clicks "Create WP profile" on a JotForm response row.
 *   2. We open this dialog with the answers pre-mapped via
 *      `mapAnswersToWp` (same field-fuzz the server side uses).
 *   3. User reviews/edits the key fields, picks Draft vs Publish.
 *   4. On confirm we call `wordpress-candidate-upsert` and link the
 *      form_response → new WP candidate so the row stops surfacing
 *      the create button on its next render.
 */
import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input }  from "@/components/ui/input";
import { Label }  from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ExternalLink, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useUpsertWpCandidate, type WpCandidateUpsertPayload } from "@/hooks/use-wp-candidates";
import { mapAnswersToWp } from "@/lib/jotform-to-wp";
import type { FormResponse } from "@/hooks/use-forms";

interface Props {
  response: FormResponse | null;
  open:     boolean;
  onClose:  () => void;
}

export function CreateWpProfileDialog({ response, open, onClose }: Props) {
  const upsert = useUpsertWpCandidate();

  // Pre-map the answers once when the dialog opens so the form starts
  // populated with the same fields the webhook would have set. Stored
  // in component state so the user can override before saving.
  const prefill = useMemo(() => {
    if (!response) return null;
    return mapAnswersToWp(response.answers ?? {});
  }, [response]);

  // Editable fields. Initialised from prefill but tracked separately so
  // user edits aren't blown away on re-render.
  const [fullName,  setFullName]  = useState("");
  const [email,     setEmail]     = useState("");
  const [phone,     setPhone]     = useState("");
  const [specialty, setSpecialty] = useState("");
  const [subspecialty, setSubspecialty] = useState("");
  const [nationality, setNationality] = useState("");
  const [yearsExp,  setYearsExp]  = useState("");
  const [country,   setCountry]   = useState("");
  const [location,  setLocation]  = useState("");
  const [jobTitle,  setJobTitle]  = useState("");
  const [status,    setStatus]    = useState<"draft" | "publish">("draft");

  // Seed editable state when the prefill changes (i.e. on dialog open).
  // Using a key derived from response.id lets us re-seed on row switch.
  const seedKey = response?.id ?? "";
  const [seeded, setSeeded] = useState("");
  if (open && prefill && seedKey !== seeded) {
    const acf = prefill.acf;
    setFullName(prefill.full_name ?? "");
    setEmail(prefill.email ?? response?.respondent_email ?? "");
    setPhone(prefill.phone ?? "");
    setSpecialty((acf.specialty as string) ?? "");
    setSubspecialty((acf.subspecialty as string) ?? "");
    setNationality((acf.nationality as string) ?? "");
    setYearsExp(String(acf.years_of_experience_post_specialization ?? ""));
    setCountry((acf.country_of_training as string) ?? "");
    setLocation((acf.current_location as string) ?? "");
    setJobTitle((acf.job_title as string) ?? "");
    setStatus("draft");
    setSeeded(seedKey);
  }

  if (!response) return null;

  const handleSave = async () => {
    if (!fullName.trim()) {
      toast.error("Full name is required");
      return;
    }
    // Start from the auto-mapped ACF so we keep every field the
    // server-side mapper picked up (license, dependents, etc.) and
    // overlay the user-edited fields on top.
    const baseAcf = { ...(prefill?.acf ?? {}) };
    const acf: WpCandidateUpsertPayload["acf"] = {
      ...baseAcf,
      full_name:    fullName.trim(),
      email:        email.trim() || undefined,
      phone_number: phone.trim() || undefined,
      specialty:    specialty.trim() || undefined,
      subspecialty: subspecialty.trim() || undefined,
      nationality:  nationality.trim() || undefined,
      country_of_training: country.trim() || undefined,
      current_location:    location.trim() || undefined,
      job_title:    jobTitle.trim() || undefined,
      years_of_experience_post_specialization: yearsExp.trim() || undefined,
    };
    const payload: WpCandidateUpsertPayload = {
      status,
      title:     fullName.trim(),
      doctor_id: response.doctor_id ?? null,
      acf,
    };
    try {
      const res = await upsert.mutateAsync(payload);
      const wpLink = res.row?.wp_link;
      toast.success(
        res.created ? "WP profile created" : "WP profile updated",
        wpLink
          ? { description: "Click to open in WordPress", action: { label: "Open", onClick: () => window.open(wpLink, "_blank") } }
          : undefined,
      );
      onClose();
    } catch (err) {
      toast.error("Failed to create WP profile", { description: (err as Error).message });
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-600" />
            Create WordPress profile
          </SheetTitle>
          <SheetDescription>
            Pre-filled from this JotForm submission. Review the key fields, then save as draft or publish.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          <Field label="Full name *">
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Dr. Jane Smith" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Phone">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Specialty">
              <Input value={specialty} onChange={(e) => setSpecialty(e.target.value)} />
            </Field>
            <Field label="Subspecialty">
              <Input value={subspecialty} onChange={(e) => setSubspecialty(e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nationality">
              <Input value={nationality} onChange={(e) => setNationality(e.target.value)} />
            </Field>
            <Field label="Years of experience">
              <Input value={yearsExp} onChange={(e) => setYearsExp(e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Country of training">
              <Input value={country} onChange={(e) => setCountry(e.target.value)} />
            </Field>
            <Field label="Current location">
              <Input value={location} onChange={(e) => setLocation(e.target.value)} />
            </Field>
          </div>
          <Field label="Job title / rank">
            <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
          </Field>

          {/* Source-of-truth dump — the original JotForm answers, read
              only, so the team can spot anything the auto-map missed. */}
          <Field label="JotForm answers (source)">
            <Textarea
              readOnly
              rows={6}
              className="text-[11px] font-mono bg-slate-50"
              value={Object.entries(response.answers ?? {})
                .map(([k, v]) => `${k}: ${v}`)
                .join("\n")}
            />
          </Field>

          <Field label="Status">
            <Select value={status} onValueChange={(v) => setStatus(v as "draft" | "publish")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft — only visible inside WP admin</SelectItem>
                <SelectItem value="publish">Publish — live on allocationassist.com</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2 border-t pt-4">
          <Button variant="ghost" onClick={onClose} disabled={upsert.isPending}>Cancel</Button>
          <Button onClick={handleSave} disabled={upsert.isPending}>
            {upsert.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ExternalLink className="h-3 w-3 mr-1" />}
            {status === "publish" ? "Create & publish" : "Create as draft"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-slate-600">{label}</Label>
      {children}
    </div>
  );
}
