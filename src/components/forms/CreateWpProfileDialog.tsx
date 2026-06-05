/**
 * Convert a JotForm submission into a STAGED doctor profile.
 *
 * Previously this dialog wrote straight to WordPress on confirm. That
 * was too quick a trigger — half the time the team wanted to review on
 * a wider surface, edit a few more fields, or discard. Now confirm
 * inserts into `staged_doctor_profiles` and the user picks
 * Draft / Publish / Delete from the Profiles tab when ready.
 *
 * Flow:
 *   1. User clicks "Create WP profile" on a JotForm response row.
 *   2. Dialog opens pre-filled via `mapAnswersToWp` (same field-fuzz
 *      the server side uses).
 *   3. User reviews/edits the key fields.
 *   4. Confirm inserts a row into `staged_doctor_profiles`.
 *   5. From the Profiles tab they pick Draft / Publish / Delete.
 */
import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input }  from "@/components/ui/input";
import { Label }  from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, FileText, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useCreateStagedProfile, type StagedProfileInput } from "@/hooks/use-wp-candidates";
import { mapAnswersToWp } from "@/lib/jotform-to-wp";
import type { FormResponse } from "@/hooks/use-forms";

interface Props {
  response: FormResponse | null;
  open:     boolean;
  onClose:  () => void;
}

export function CreateWpProfileDialog({ response, open, onClose }: Props) {
  const stage = useCreateStagedProfile();

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
    // overlay the user-edited fields on top. The ACF payload is what
    // gets passed straight through to wordpress-candidate-upsert when
    // the team eventually publishes.
    const baseAcf = { ...(prefill?.acf ?? {}) };
    const acf: Record<string, unknown> = {
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
    const input: StagedProfileInput = {
      source:             "jotform",
      source_response_id: response.id,
      full_name:          fullName.trim() || null,
      email:              email.trim()    || null,
      phone:              phone.trim()    || null,
      specialty:          specialty.trim()    || null,
      subspecialty:       subspecialty.trim() || null,
      nationality:        nationality.trim()  || null,
      job_title:          jobTitle.trim()     || null,
      current_location:   location.trim()     || null,
      country_of_training: country.trim()     || null,
      years_experience:   yearsExp.trim()     || null,
      acf,
    };
    try {
      await stage.mutateAsync(input);
      toast.success("Staged for review", {
        description: "Find it under Doctors → Profiles → Staging. Pick Publish or Save as draft when ready.",
      });
      onClose();
    } catch (err) {
      toast.error("Couldn't stage profile", { description: (err as Error).message });
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-600" />
            Stage WordPress profile
          </SheetTitle>
          <SheetDescription>
            Pre-filled from this JotForm submission. Stages it for review — pick Publish, Save as draft, or Discard from the Profiles tab. Nothing hits WordPress yet.
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

        </div>

        <div className="mt-6 flex items-center justify-end gap-2 border-t pt-4">
          <Button variant="ghost" onClick={onClose} disabled={stage.isPending}>Cancel</Button>
          <Button onClick={handleSave} disabled={stage.isPending}>
            {stage.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <FileText className="h-3 w-3 mr-1" />}
            Stage for review
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
