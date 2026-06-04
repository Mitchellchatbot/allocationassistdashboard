/**
 * Edit + create dialog for WordPress candidates.
 *
 * - When `candidate` is set, dialog pre-fills with that row and saving
 *   PATCHes the existing WP post.
 * - When `candidate` is null, dialog renders blank and saving POSTs a
 *   new WP post. The new candidate lands as `draft` unless the user
 *   flips the status field — so accidental clicks never go public.
 *
 * The form deliberately mirrors WP's ACF field names so each input maps
 * to exactly one ACF key. No fancy validation beyond required fields
 * (full_name) — HI staff are the only writers, and the WP admin still
 * works for anything we don't expose here.
 */
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Loader2, Save, X } from "lucide-react";
import { useUpsertWpCandidate, useUploadWpPhoto, type WpCandidate, type WpCandidateUpsertPayload } from "@/hooks/use-wp-candidates";
import { toast } from "sonner";

interface Props {
  open:        boolean;
  onClose:     () => void;
  candidate?:  WpCandidate | null;                  // null/undefined → create
}

export function WpCandidateEditDialog({ open, onClose, candidate }: Props) {
  const upsert = useUpsertWpCandidate();
  const upload = useUploadWpPhoto();
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Form state — keyed by ACF field name. Initialised from the
  // candidate's mirror columns when editing, blank when creating.
  const [form, setForm] = useState<FormState>(() => initialFromCandidate(candidate));

  // Reset whenever a different candidate opens.
  useEffect(() => {
    if (open) setForm(initialFromCandidate(candidate));
  }, [open, candidate?.id]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.full_name.trim()) {
      toast.error("Full name is required.");
      return;
    }

    const acf: WpCandidateUpsertPayload["acf"] = {
      full_name:                                                form.full_name.trim(),
      job_title:                                                form.job_title.trim()  || undefined,
      phone_number:                                             form.phone.trim()       || undefined,
      email:                                                    form.email.trim()       || undefined,
      date_of_birth:                                            form.date_of_birth.trim() || undefined,
      nationality:                                              form.nationality.trim() || undefined,
      specialty:                                                form.specialty.trim()   || undefined,
      subspecialty:                                             form.subspecialty.trim()|| undefined,
      specific_areas_of_interests_within_the_specialization:    form.area_of_interest.trim() || undefined,
      years_of_experience_post_specialization:                  form.years_experience.trim() || undefined,
      dha__haad__moh_license:                                   form.license_status.trim() || undefined,
      license_type:                                             form.license_types.length ? form.license_types : undefined,
      family_status:                                            form.family_status.trim() || undefined,
      have_children_or_any_dependent:                           form.has_dependents === "" ? undefined : (form.has_dependents as "Yes" | "No"),
      country_of_training:                                      form.country_of_training.trim() || undefined,
      current_location:                                         form.current_location.trim() || undefined,
      specialist__consultant:                                   form.rank.trim() || undefined,
      languages:                                                form.languages.trim() || undefined,
      english_level:                                            form.english_level.trim() || undefined,
      current_salary:                                           form.current_salary.trim() || undefined,
      expected_salary:                                          form.expected_salary.trim() || undefined,
      notice_period:                                            form.notice_period.trim() || undefined,
      targeted_locations:                                       form.targeted_locations.length ? form.targeted_locations : undefined,

      academy1:    form.education_academy.trim()     || undefined,
      title1:      form.education_title.trim()       || undefined,
      start_date1: form.education_start.trim()       || undefined,
      end_date1:   form.education_end.trim()         || undefined,
      present1:    form.education_present ? "Yes" : "No",
      description1: form.education_description.trim() || undefined,

      company2:    form.experience_company.trim()    || undefined,
      title2:      form.experience_title.trim()      || undefined,
      start_date_2: form.experience_start.trim()     || undefined,
      end_date2:   form.experience_end.trim()        || undefined,
      present2:    form.experience_present ? "Yes" : "No",
      description2: form.experience_description.trim() || undefined,
    };

    const payload: WpCandidateUpsertPayload = {
      id:     candidate?.id,
      status: form.status,
      title:  form.title.trim() || form.full_name.trim(),
      acf,
    };

    try {
      const res = await upsert.mutateAsync(payload);
      toast.success(res.created ? `Created candidate #${res.id} on WordPress.` : `Saved changes to #${res.id}.`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const handlePhotoPick = () => fileRef.current?.click();
  const handlePhotoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!candidate?.id) {
      toast.message("Save the candidate first, then add a photo.");
      e.target.value = "";
      return;
    }
    try {
      await upload.mutateAsync({ file, candidateId: candidate.id });
      toast.success("Photo uploaded and attached.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      e.target.value = "";
    }
  };

  const isEdit = !!candidate?.id;
  const saving = upsert.isPending || upload.isPending;

  return (
    <Dialog open={open} onOpenChange={v => !v && !saving && onClose()}>
      <DialogContent className="sm:max-w-[860px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[15px]">
            {isEdit ? `Edit candidate · #${candidate?.id}` : "New candidate"}
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground">
            Saves directly to WordPress (allocationassist.com) and refreshes the local mirror.
          </p>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Top row: status + post title */}
          <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-3">
            <Field label="Status">
              <Select value={form.status} onValueChange={v => set("status", v as FormState["status"])}>
                <SelectTrigger className="h-9 text-[12px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="publish">Published</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Post title (the bold heading on the profile page)">
              <Input value={form.title} onChange={e => set("title", e.target.value)} placeholder={form.full_name ? `${form.full_name} – ${form.job_title || "Doctor"}` : "Auto-filled from full name if blank"} className="h-9 text-[12px]" />
            </Field>
          </div>

          <Section title="Identity">
            <Grid>
              <Field label="Full name *"><Input value={form.full_name} onChange={e => set("full_name", e.target.value)} className="h-9 text-[12px]" /></Field>
              <Field label="Job title"><Input value={form.job_title} onChange={e => set("job_title", e.target.value)} placeholder="Consultant in Anaesthesia and Pain Medicine" className="h-9 text-[12px]" /></Field>
              <Field label="Specialist / Consultant"><Input value={form.rank} onChange={e => set("rank", e.target.value)} placeholder="Consultant" className="h-9 text-[12px]" /></Field>
              <Field label="Date of birth"><Input value={form.date_of_birth} onChange={e => set("date_of_birth", e.target.value)} placeholder="YYYYMMDD or YYYY-MM-DD" className="h-9 text-[12px]" /></Field>
              <Field label="Nationality"><Input value={form.nationality} onChange={e => set("nationality", e.target.value)} className="h-9 text-[12px]" /></Field>
              <Field label="Email"><Input type="email" value={form.email} onChange={e => set("email", e.target.value)} className="h-9 text-[12px]" /></Field>
              <Field label="Phone"><Input value={form.phone} onChange={e => set("phone", e.target.value)} className="h-9 text-[12px]" /></Field>
              <Field label="Family status"><Input value={form.family_status} onChange={e => set("family_status", e.target.value)} placeholder="Married, Single, …" className="h-9 text-[12px]" /></Field>
              <Field label="Children / dependents">
                <Select value={form.has_dependents} onValueChange={v => set("has_dependents", v as FormState["has_dependents"])}>
                  <SelectTrigger className="h-9 text-[12px]"><SelectValue placeholder="Pick one" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">—</SelectItem>
                    <SelectItem value="Yes">Yes</SelectItem>
                    <SelectItem value="No">No</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </Grid>
          </Section>

          <Section title="Practice">
            <Grid>
              <Field label="Specialty"><Input value={form.specialty} onChange={e => set("specialty", e.target.value)} className="h-9 text-[12px]" /></Field>
              <Field label="Subspecialty"><Input value={form.subspecialty} onChange={e => set("subspecialty", e.target.value)} className="h-9 text-[12px]" /></Field>
              <Field label="Years of experience (post-specialization)"><Input value={form.years_experience} onChange={e => set("years_experience", e.target.value)} placeholder="e.g. 7" className="h-9 text-[12px]" /></Field>
              <Field label="Country of training"><Input value={form.country_of_training} onChange={e => set("country_of_training", e.target.value)} className="h-9 text-[12px]" /></Field>
              <Field label="Current location"><Input value={form.current_location} onChange={e => set("current_location", e.target.value)} className="h-9 text-[12px]" /></Field>
              <Field label="Languages"><Input value={form.languages} onChange={e => set("languages", e.target.value)} placeholder="English, Arabic" className="h-9 text-[12px]" /></Field>
              <Field label="English level"><Input value={form.english_level} onChange={e => set("english_level", e.target.value)} placeholder="Very Good" className="h-9 text-[12px]" /></Field>
            </Grid>
            <Field label="Specific areas of interest within the specialization">
              <Textarea value={form.area_of_interest} onChange={e => set("area_of_interest", e.target.value)} rows={2} className="text-[12px]" />
            </Field>
          </Section>

          <Section title="Licenses + relocation">
            <Grid>
              <Field label="DHA/DOH/MOH/SCFHS/QCHP licenses (free text)">
                <Input value={form.license_status} onChange={e => set("license_status", e.target.value)} placeholder='e.g. "DHA, DOH & MOH in process"' className="h-9 text-[12px]" />
              </Field>
              <Field label="License type tags (comma-separated)">
                <Input
                  value={form.license_types.join(", ")}
                  onChange={e => set("license_types", e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
                  placeholder="DHA, DOH, MOH"
                  className="h-9 text-[12px]"
                />
              </Field>
              <Field label="Current salary"><Input value={form.current_salary} onChange={e => set("current_salary", e.target.value)} className="h-9 text-[12px]" /></Field>
              <Field label="Expected salary"><Input value={form.expected_salary} onChange={e => set("expected_salary", e.target.value)} className="h-9 text-[12px]" /></Field>
              <Field label="Notice period"><Input value={form.notice_period} onChange={e => set("notice_period", e.target.value)} placeholder="e.g. 4 months" className="h-9 text-[12px]" /></Field>
              <Field label="Targeted locations (comma-separated)">
                <Input
                  value={form.targeted_locations.join(", ")}
                  onChange={e => set("targeted_locations", e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
                  placeholder="All Emirates, All KSA"
                  className="h-9 text-[12px]"
                />
              </Field>
            </Grid>
          </Section>

          <Section title="Education (one entry)">
            <Grid>
              <Field label="Title"><Input value={form.education_title} onChange={e => set("education_title", e.target.value)} className="h-9 text-[12px]" /></Field>
              <Field label="Academy / institution"><Input value={form.education_academy} onChange={e => set("education_academy", e.target.value)} className="h-9 text-[12px]" /></Field>
              <Field label="Start (YYYYMMDD)"><Input value={form.education_start} onChange={e => set("education_start", e.target.value)} className="h-9 text-[12px]" /></Field>
              <Field label="End (YYYYMMDD)">
                <Input value={form.education_end} onChange={e => set("education_end", e.target.value)} className="h-9 text-[12px]" disabled={form.education_present} />
              </Field>
            </Grid>
            <label className="flex items-center gap-2 text-[11px] text-slate-700">
              <input type="checkbox" checked={form.education_present} onChange={e => set("education_present", e.target.checked)} />
              Currently studying
            </label>
            <Field label="Description"><Textarea value={form.education_description} onChange={e => set("education_description", e.target.value)} rows={2} className="text-[12px]" /></Field>
          </Section>

          <Section title="Experience (one entry)">
            <Grid>
              <Field label="Role title"><Input value={form.experience_title} onChange={e => set("experience_title", e.target.value)} className="h-9 text-[12px]" /></Field>
              <Field label="Company / hospital"><Input value={form.experience_company} onChange={e => set("experience_company", e.target.value)} className="h-9 text-[12px]" /></Field>
              <Field label="Start (YYYYMMDD)"><Input value={form.experience_start} onChange={e => set("experience_start", e.target.value)} className="h-9 text-[12px]" /></Field>
              <Field label="End (YYYYMMDD)">
                <Input value={form.experience_end} onChange={e => set("experience_end", e.target.value)} className="h-9 text-[12px]" disabled={form.experience_present} />
              </Field>
            </Grid>
            <label className="flex items-center gap-2 text-[11px] text-slate-700">
              <input type="checkbox" checked={form.experience_present} onChange={e => set("experience_present", e.target.checked)} />
              Currently working
            </label>
            <Field label="Description"><Textarea value={form.experience_description} onChange={e => set("experience_description", e.target.value)} rows={2} className="text-[12px]" /></Field>
          </Section>

          {/* Photo upload — only available after the candidate exists in WP,
              because the upload attaches by ID. For new candidates we
              tell the user to save first, then come back. */}
          <Section title="Photo">
            <div className="flex items-center gap-3">
              {candidate?.photo_url && (
                <img src={candidate.photo_url} alt="" className="h-14 w-14 rounded-full object-cover border" />
              )}
              <Button type="button" variant="outline" size="sm" onClick={handlePhotoPick} disabled={!isEdit || upload.isPending}>
                {upload.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                {upload.isPending ? "Uploading…" : "Upload photo"}
              </Button>
              <input ref={fileRef} type="file" accept="image/*" onChange={handlePhotoFile} className="hidden" />
              {!isEdit && <span className="text-[10px] text-muted-foreground">Save the candidate first, then add a photo.</span>}
            </div>
          </Section>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            <X className="h-3.5 w-3.5 mr-1" /> Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !form.full_name.trim()}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create candidate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── form shape + helpers ─────────────────────────────────────────────

interface FormState {
  status:               "draft" | "private" | "publish";
  title:                string;
  full_name:            string;
  job_title:            string;
  email:                string;
  phone:                string;
  date_of_birth:        string;
  nationality:          string;
  specialty:            string;
  subspecialty:         string;
  area_of_interest:     string;
  years_experience:     string;
  license_status:       string;
  license_types:        string[];
  family_status:        string;
  has_dependents:       "" | "Yes" | "No";
  country_of_training:  string;
  current_location:     string;
  rank:                 string;
  languages:            string;
  english_level:        string;
  current_salary:       string;
  expected_salary:      string;
  notice_period:        string;
  targeted_locations:   string[];

  education_title:        string;
  education_academy:      string;
  education_start:        string;
  education_end:          string;
  education_present:      boolean;
  education_description:  string;

  experience_title:        string;
  experience_company:      string;
  experience_start:        string;
  experience_end:          string;
  experience_present:      boolean;
  experience_description:  string;
}

function initialFromCandidate(c?: WpCandidate | null): FormState {
  return {
    status:               (c?.status as FormState["status"]) ?? "draft",
    title:                c?.title ?? "",
    full_name:            c?.full_name ?? "",
    job_title:            c?.job_title ?? "",
    email:                c?.email ?? "",
    phone:                c?.phone ?? "",
    date_of_birth:        c?.date_of_birth ?? "",
    nationality:          c?.nationality ?? "",
    specialty:            c?.specialty ?? "",
    subspecialty:         c?.subspecialty ?? "",
    area_of_interest:     c?.area_of_interest ?? "",
    years_experience:     c?.years_experience != null ? String(c.years_experience) : "",
    license_status:       c?.license_status ?? "",
    license_types:        c?.license_types ?? [],
    family_status:        c?.family_status ?? "",
    has_dependents:       c?.has_dependents == null ? "" : (c.has_dependents ? "Yes" : "No"),
    country_of_training:  c?.country_of_training ?? "",
    current_location:     c?.current_location ?? "",
    rank:                 c?.rank ?? "",
    languages:            c?.languages ?? "",
    english_level:        c?.english_level ?? "",
    current_salary:       c?.current_salary ?? "",
    expected_salary:      c?.expected_salary ?? "",
    notice_period:        c?.notice_period ?? "",
    targeted_locations:   c?.targeted_locations ?? [],

    education_title:        c?.education_title ?? "",
    education_academy:      c?.education_academy ?? "",
    education_start:        c?.education_start ?? "",
    education_end:          c?.education_end ?? "",
    education_present:      c?.education_present ?? false,
    education_description:  c?.education_description ?? "",

    experience_title:        c?.experience_title ?? "",
    experience_company:      c?.experience_company ?? "",
    experience_start:        c?.experience_start ?? "",
    experience_end:          c?.experience_end ?? "",
    experience_present:      c?.experience_present ?? false,
    experience_description:  c?.experience_description ?? "",
  };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{title}</div>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10.5px] text-slate-600">{label}</Label>
      {children}
    </div>
  );
}
