import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { UserSquare, Search, Save, Sparkles, Eye, CheckCircle2, Mail, FileText, RefreshCw, AlertCircle, Clock, ChevronDown, ChevronRight, Send, Workflow } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { CardListSkeleton } from "@/components/ui/data-skeleton";
import { toast } from "sonner";
import { useZohoData, type ZohoDoctorOnBoard, type ZohoLead } from "@/hooks/use-zoho-data";
import {
  useDoctorProfiles, useDoctorProfile, useUpsertDoctorProfile, calcCompletion, profileToTokens,
  type DoctorProfile, type DoctorProfileInput,
} from "@/hooks/use-doctor-profiles";
import { useDoctorCvUploads, useSendCvUploadLink, useReExtractCv, usePendingCvUploads, type CvUpload } from "@/hooks/use-cv-uploads";
import { DoctorJourneyDialog } from "@/components/automations/DoctorJourneyDialog";
import { DoctorStatusBadge } from "@/components/DoctorStatusBadge";
import { useDoctorStatus, useDoctorStatusMap } from "@/hooks/use-doctor-status";
import { DoctorVacancyMatches } from "@/components/DoctorVacancyMatches";
import { DoctorLicensePills } from "@/components/DoctorLicensePills";
import { DoctorLifecycleCard } from "@/components/DoctorLifecycleCard";
import { useEmailTemplates, renderTemplate } from "@/hooks/use-email-templates";
import { EmailPreview } from "@/components/EmailPreview";

interface DoctorRow {
  id:         string;        // dob:xxx or lead:xxx
  name:       string;
  email:      string | null;
  phone:      string | null;
  speciality: string | null;
  source:     "dob" | "lead";
  age:        number | null;
  country:    string | null;
  // License signals — leads carry boolean flags; DOB rows generally don't.
  has_dha:    boolean;
  has_doh:    boolean;
  has_moh:    boolean;
  license:    string | null;
}

const BLANK: DoctorProfileInput = { doctor_id: "" };

export default function DoctorProfiles() {
  const { data: zoho, isLoading: zohoLoading } = useZohoData();
  const { data: profiles = [] } = useDoctorProfiles();
  const { data: pendingUploads = [] } = usePendingCvUploads();
  const profileMap = useMemo(() => {
    const m = new Map<string, DoctorProfile>();
    for (const p of profiles) m.set(p.doctor_id, p);
    return m;
  }, [profiles]);

  const allDoctors = useMemo<DoctorRow[]>(() => {
    const out: DoctorRow[] = [];
    const z = zoho as { rawDoctorsOnBoard?: ZohoDoctorOnBoard[]; rawLeads?: ZohoLead[] } | undefined;
    const truthy = (v: unknown): boolean => {
      if (v == null) return false;
      if (typeof v === "boolean") return v;
      const s = String(v).toLowerCase().trim();
      return s === "true" || s === "yes" || s === "1" || s === "y";
    };
    for (const d of z?.rawDoctorsOnBoard ?? []) {
      const name = d.Full_Name || `${d.First_Name ?? ""} ${d.Last_Name ?? ""}`.trim();
      if (!name) continue;
      out.push({
        id: `dob:${d.id}`, name,
        email: d.Email, phone: d.Phone ?? d.Mobile,
        speciality: d.Specialty, source: "dob",
        age: null, country: null,
        has_dha: false, has_doh: false, has_moh: false, license: null,
      });
    }
    for (const l of z?.rawLeads ?? []) {
      const name = l.Full_Name || `${l.First_Name ?? ""} ${l.Last_Name ?? ""}`.trim();
      if (!name) continue;
      out.push({
        id: `lead:${l.id}`, name,
        email: l.Email, phone: l.Phone ?? l.Mobile,
        speciality: l.Specialty ?? l.Specialty_New, source: "lead",
        age: l.Age, country: l.Country_of_Specialty_training,
        has_dha: truthy(l.Has_DHA), has_doh: truthy(l.Has_DOH), has_moh: truthy(l.Has_MOH),
        license: l.License,
      });
    }
    return out;
  }, [zoho]);

  const [search,  setSearch]  = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<"all" | "missing" | "complete">("all");
  const [pendingOpen, setPendingOpen] = useState(true);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = allDoctors;
    if (q) {
      list = list.filter(d =>
        d.name.toLowerCase().includes(q) ||
        d.email?.toLowerCase().includes(q) ||
        d.speciality?.toLowerCase().includes(q),
      );
    }
    // The Missing/Complete chips ONLY apply when the user isn't searching —
    // a typed name means "find this specific doctor regardless of profile
    // status". Combining the two was hiding doctors the user was clearly
    // looking for.
    if (!q && filterMode === "missing") {
      list = list.filter(d => {
        const p = profileMap.get(d.id);
        return !p || calcCompletion(p) < 100;
      });
    } else if (!q && filterMode === "complete") {
      list = list.filter(d => {
        const p = profileMap.get(d.id);
        return p && calcCompletion(p) === 100;
      });
    }
    let final = list.slice(0, 200);
    // Always include the currently-selected doctor at the top, even if the
    // active filter would have excluded them. Prevents the confusing
    // "empty list / populated editor" state when a selection comes from
    // outside the filter (e.g. Pending Uploads panel, deep link, etc).
    if (selectedId) {
      const already = final.some(d => d.id === selectedId);
      if (!already) {
        const sel = allDoctors.find(d => d.id === selectedId);
        if (sel) final = [sel, ...final];
      }
    }
    return final;
  }, [allDoctors, search, filterMode, profileMap, selectedId]);

  const selectedDoctor = allDoctors.find(d => d.id === selectedId) ?? null;

  // Phase 4 — per-doctor status pill on the picker. Single bulk fetch keeps
  // the picker from firing one query per row.
  const statusMap = useDoctorStatusMap(useMemo(() => filtered.map(d => d.id), [filtered]));

  // Default-select the first match once data is loaded.
  useEffect(() => {
    if (!selectedId && filtered.length > 0) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  const completeCount = useMemo(
    () => profiles.filter(p => calcCompletion(p) === 100).length,
    [profiles],
  );

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <UserSquare className="h-6 w-6 text-teal-600" />
              Doctor Profiles
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Phase 2 — the structured profile data that backs the Profile Sent emails. Fields here populate the per-doctor row in hospital introductions.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <KpiPill label="Profiles started" value={profiles.length} />
            <KpiPill label="Complete" value={completeCount} tone="emerald" />
            <KpiPill label="Doctors in Zoho" value={allDoctors.length} tone="slate" />
          </div>
        </div>

        {pendingUploads.length > 0 && (
          <PendingUploadsPanel
            uploads={pendingUploads}
            open={pendingOpen}
            onToggle={() => setPendingOpen(p => !p)}
            onJumpToDoctor={(doctorId) => {
              setSelectedId(doctorId);
              // Reset the filter so the jumped-to doctor is visible in the
              // left rail. Otherwise the user lands on an editor with an
              // apparently-empty list ("Doctors · 0") because the doctor
              // is filtered out by completion status.
              setFilterMode("all");
            }}
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
          <Card className="h-fit">
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-[13px] flex items-center gap-1.5 font-medium">
                Doctors
                <span className="text-muted-foreground font-normal text-[11px]">· {filtered.length}{filtered.length === 200 ? "+" : ""}</span>
              </CardTitle>
              <div className="relative mt-1.5">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name, email, speciality..."
                  className="pl-7 text-[11px] h-7"
                />
              </div>
              <div className="flex items-center gap-1 mt-1.5">
                {(["all", "missing", "complete"] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setFilterMode(m)}
                    className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-md transition-colors ${
                      filterMode === m
                        ? "bg-teal-500 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    } ${search.trim() ? "opacity-40" : ""}`}
                    title={search.trim() ? "Ignored while searching by name" : undefined}
                  >
                    {m}
                  </button>
                ))}
                {search.trim() && (
                  <span className="text-[9px] text-muted-foreground ml-1 italic">
                    filter paused
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[640px] overflow-y-auto">
                {zohoLoading && <div className="px-3 py-2"><CardListSkeleton rows={5} /></div>}
                {!zohoLoading && filtered.length === 0 && (
                  <EmptyState icon={Search} title="No doctors match" body="Try clearing the search or specialty filter." size="sm" />
                )}
                {filtered.map(d => {
                  const p = profileMap.get(d.id);
                  const completion = calcCompletion(p);
                  const isSelected = selectedId === d.id;
                  return (
                    <button
                      key={d.id}
                      onClick={() => setSelectedId(d.id)}
                      className={`w-full text-left px-3 py-2 hover:bg-slate-50 transition-colors border-l-2 ${
                        isSelected ? "border-teal-500 bg-teal-50/40" : "border-transparent"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[12px] font-medium truncate text-slate-800">{d.name}</div>
                        {completion === 100
                          ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          : <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0 rounded-sm shrink-0 ${
                              completion === 0
                                ? "bg-slate-200 text-slate-600"
                                : "bg-amber-100 text-amber-700"
                            }`}>
                              {completion === 0 ? "empty" : `${completion}%`}
                            </span>
                        }
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {d.speciality ?? "—"}
                      </div>
                      {statusMap[d.id] && statusMap[d.id].status !== "lead" && (
                        <div className="mt-1">
                          <DoctorStatusBadge info={statusMap[d.id]} size="sm" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {selectedDoctor && (
            <ProfileEditor key={selectedDoctor.id} doctor={selectedDoctor} />
          )}
          {!selectedDoctor && (
            <Card>
              <CardContent className="py-0">
                <EmptyState
                  icon={UserSquare}
                  title="Select a doctor to edit"
                  body="Pick someone from the list on the left to start filling in their profile, attach a CV, or build the hospital introduction email."
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

function KpiPill({ label, value, tone = "teal" }: { label: string; value: number; tone?: "teal" | "emerald" | "slate" }) {
  const colors = {
    teal:    "bg-teal-50 text-teal-700 border-teal-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    slate:   "bg-slate-50 text-slate-700 border-slate-200",
  };
  return (
    <div className={`rounded-md border px-3 py-1.5 ${colors[tone]}`}>
      <div className="text-[9px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-base font-semibold leading-tight">{value.toLocaleString()}</div>
    </div>
  );
}

function ProfileEditor({ doctor }: { doctor: DoctorRow }) {
  const { data: existing, isLoading } = useDoctorProfile(doctor.id);
  const upsert = useUpsertDoctorProfile();
  const { data: templates = [] } = useEmailTemplates();
  const { data: uploads = [] } = useDoctorCvUploads(doctor.id);
  const sendCvLink = useSendCvUploadLink();
  const reExtract  = useReExtractCv();
  const [journeyOpen, setJourneyOpen] = useState(false);

  // Was this profile last touched by the CV extractor? If yes, surface a
  // "review extraction" badge so the team knows to give it a once-over
  // before relying on the data for hospital emails.
  const lastExtractedUpload = uploads.find(u => u.status === "extracted");
  const profileFromExtractor = existing?.updated_by === "cv-extract";

  const [form, setForm] = useState<DoctorProfileInput>({ doctor_id: doctor.id });
  const [previewOpen, setPreviewOpen] = useState(false);

  // Re-seed form whenever the loaded profile (or doctor selection) changes.
  useEffect(() => {
    if (existing) {
      setForm({
        doctor_id:          doctor.id,
        doctor_name:        existing.doctor_name ?? doctor.name,
        title:              existing.title,
        bio:                existing.bio,
        area_of_interest:   existing.area_of_interest,
        country_training:   existing.country_training,
        years_experience:   existing.years_experience,
        nationality:        existing.nationality,
        age:                existing.age,
        marital_status:     existing.marital_status,
        family_status:      existing.family_status,
        license:            existing.license,
        salary_expectation: existing.salary_expectation,
        notice_period:      existing.notice_period,
        languages:          existing.languages,
        notes:              existing.notes,
        completed:          existing.completed,
      });
    } else {
      // No profile yet — pre-fill what we can from Zoho.
      setForm({
        doctor_id:        doctor.id,
        doctor_name:      doctor.name,
        country_training: doctor.country,
        age:              doctor.age,
      });
    }
  }, [existing, doctor]);

  const completion = useMemo(() => calcCompletion(form as DoctorProfile), [form]);

  // Track unsaved changes. The form re-seeds whenever `existing` changes; if
  // the user has tweaked anything since, this returns true. Used both for the
  // beforeunload warning and the dirty dot in the Save button.
  const dirty = useMemo(() => {
    const baseline = existing
      ? {
          title:              existing.title              ?? null,
          bio:                existing.bio                ?? null,
          area_of_interest:   existing.area_of_interest   ?? null,
          country_training:   existing.country_training   ?? null,
          years_experience:   existing.years_experience   ?? null,
          nationality:        existing.nationality        ?? null,
          age:                existing.age                ?? null,
          marital_status:     existing.marital_status     ?? null,
          family_status:      existing.family_status      ?? null,
          license:            existing.license            ?? null,
          salary_expectation: existing.salary_expectation ?? null,
          notice_period:      existing.notice_period      ?? null,
          languages:          existing.languages          ?? null,
          notes:              existing.notes              ?? null,
        }
      : null;
    const current = {
      title:              form.title              ?? null,
      bio:                form.bio                ?? null,
      area_of_interest:   form.area_of_interest   ?? null,
      country_training:   form.country_training   ?? null,
      years_experience:   form.years_experience   ?? null,
      nationality:        form.nationality        ?? null,
      age:                form.age                ?? null,
      marital_status:     form.marital_status     ?? null,
      family_status:      form.family_status      ?? null,
      license:            form.license            ?? null,
      salary_expectation: form.salary_expectation ?? null,
      notice_period:      form.notice_period      ?? null,
      languages:          form.languages          ?? null,
      notes:              form.notes              ?? null,
    };
    if (!baseline) {
      // Brand new profile — dirty if anything non-trivial has been entered.
      return Object.values(current).some(v => v !== null && v !== "");
    }
    return JSON.stringify(baseline) !== JSON.stringify(current);
  }, [form, existing]);

  // Browser-level guard against losing edits to page reload / close / nav.
  // Not perfect for in-app route changes (would need React Router blockers
  // for that), but catches the common cases.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const handleAutoFillZoho = () => {
    setForm(f => ({
      ...f,
      doctor_name:      doctor.name,
      country_training: f.country_training ?? doctor.country ?? null,
      age:              f.age              ?? doctor.age     ?? null,
    }));
    toast.success("Pre-filled from Zoho. Click Save to persist.");
  };

  const handleSave = async () => {
    const completed = completion === 100;
    await upsert.mutateAsync({ ...form, completed });
    toast.success(`Saved ${doctor.name}'s profile${completed ? " (complete)" : ` (${completion}% complete)`}`);
  };

  const setField = <K extends keyof DoctorProfileInput>(key: K, value: DoctorProfileInput[K]) => {
    setForm(f => ({ ...f, [key]: value }));
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              {doctor.name}
              <Badge variant="outline" className="text-[10px] uppercase">{doctor.source === "dob" ? "Doctor on Board" : "Lead"}</Badge>
              <DoctorPipelineStatus doctorId={doctor.id} />
              <DoctorLicensePills
                has_dha={doctor.has_dha}
                has_doh={doctor.has_doh}
                has_moh={doctor.has_moh}
                license_text={doctor.license}
                size="sm"
                hideWhenEmpty={doctor.source === "dob"}
              />
            </CardTitle>
            <CardDescription className="text-[11px] mt-0.5">
              {doctor.speciality ?? "—"} · {doctor.email ?? doctor.phone ?? "no contact"}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-[11px] text-muted-foreground">
              {completion === 100 ? "Complete" : `${completion}% complete`}
            </div>
            <Button size="sm" variant="outline" onClick={() => setPreviewOpen(p => !p)}>
              <Eye className="h-3.5 w-3.5 mr-1.5" /> {previewOpen ? "Close preview" : "Preview email"}
            </Button>
            {dirty ? (
              <Button size="sm" onClick={handleSave} disabled={upsert.isPending}>
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {upsert.isPending ? "Saving..." : "Save changes"}
                <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-amber-300 inline-block" title="Unsaved changes" />
              </Button>
            ) : (
              <div
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 text-[12px] font-medium text-slate-500"
                title="No unsaved changes"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                Saved
              </div>
            )}
          </div>
        </div>
        <div className="mt-2 h-1 w-full rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full bg-teal-500 transition-all" style={{ width: `${completion}%` }} />
        </div>
        {profileFromExtractor && lastExtractedUpload && (
          <div className="mt-2 flex items-start gap-2 rounded-md bg-violet-50 border border-violet-200 px-3 py-2">
            <Sparkles className="h-3.5 w-3.5 text-violet-600 shrink-0 mt-[2px]" />
            <div className="text-[11px] text-violet-900 leading-snug">
              <strong>Auto-extracted from CV.</strong> Last extraction {relativeTime(lastExtractedUpload.extracted_at ?? lastExtractedUpload.uploaded_at ?? lastExtractedUpload.created_at)}. Please review every field before sending this profile to a hospital — Claude is accurate but not infallible. Your edits override the extraction.
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading && <CardListSkeleton rows={3} />}

        <DoctorLifecycleCard doctorId={doctor.id} doctorName={doctor.name} />

        <DoctorVacancyMatches
          doctorId={doctor.id}
          doctorName={doctor.name}
          doctorSpeciality={doctor.speciality}
        />

        {/* Quick actions: prominent at the top so the team finds them. */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => setJourneyOpen(true)}>
            <Workflow className="h-3.5 w-3.5 mr-1.5 text-teal-600" /> View journey
          </Button>
          <Button size="sm" variant="outline" onClick={handleAutoFillZoho}>
            <Sparkles className="h-3.5 w-3.5 mr-1.5 text-violet-600" /> Pre-fill from Zoho
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!doctor.email || sendCvLink.isPending}
            onClick={async () => {
              if (!doctor.email) return;
              try {
                const res = await sendCvLink.mutateAsync({
                  doctor_id:    doctor.id,
                  doctor_name:  doctor.name,
                  doctor_email: doctor.email,
                });
                toast.success(`CV upload link sent to ${res.to}. Doctor uploads → Claude fills the profile.`);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Failed to send link");
              }
            }}
            title={doctor.email ? "Email the doctor a token-gated link to upload their CV. Claude auto-populates this profile when they do." : "Doctor has no email on file"}
          >
            <Mail className="h-3.5 w-3.5 mr-1.5 text-teal-600" /> {sendCvLink.isPending ? "Sending..." : "Send CV upload link"}
          </Button>
          {!doctor.email && (
            <div className="text-[10px] text-muted-foreground">
              No email on this Zoho record — can't send the upload link.
            </div>
          )}
        </div>

        {/* ── Professional ───────────────────────────────────────── */}
        <SectionHeading title="Professional" subtitle="The fields the hospital sees" />
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Bio paragraph</Label>
          <Textarea
            value={form.bio ?? ""}
            onChange={e => setField("bio", e.target.value)}
            placeholder="3–5 sentence prose paragraph summarising clinical background. Sits above the table in the hospital introduction email."
            className="mt-1 text-[12px] min-h-[110px]"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Title (per UAE license)" placeholder="e.g. Consultant Pediatrician"
            value={form.title ?? ""} onChange={v => setField("title", v)} />
          <Field label="Country of training" placeholder="e.g. German Board / UK Trained"
            value={form.country_training ?? ""} onChange={v => setField("country_training", v)} />
          <Field label="Area of interest" placeholder="comma-separated, e.g. Endourology, Robotic Surgery"
            value={form.area_of_interest ?? ""} onChange={v => setField("area_of_interest", v)} className="md:col-span-2" />
          <Field label="Years of experience" type="number" placeholder="e.g. 7"
            value={form.years_experience != null ? String(form.years_experience) : ""}
            onChange={v => setField("years_experience", v === "" ? null : Number(v))} />
          <Field label="License" placeholder="e.g. DHA Registration / SCFHS in process"
            value={form.license ?? ""} onChange={v => setField("license", v)} />
        </div>

        {/* ── Identity ───────────────────────────────────────── */}
        <SectionHeading title="Identity" subtitle="Personal context for the introduction" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Nationality" placeholder="e.g. British"
            value={form.nationality ?? ""} onChange={v => setField("nationality", v)} />
          <Field label="Age" type="number" placeholder="e.g. 41"
            value={form.age != null ? String(form.age) : ""}
            onChange={v => setField("age", v === "" ? null : Number(v))} />
          <Field label="Marital status" placeholder="Married / Single / Divorced"
            value={form.marital_status ?? ""} onChange={v => setField("marital_status", v)} />
          <Field label="Family status" placeholder="e.g. 2 Children, or —"
            value={form.family_status ?? ""} onChange={v => setField("family_status", v)} />
          <Field label="Languages" placeholder="comma-separated, e.g. English, Arabic, Urdu" className="md:col-span-2"
            value={form.languages ?? ""} onChange={v => setField("languages", v)} />
        </div>

        {/* ── Logistics ───────────────────────────────────────── */}
        <SectionHeading title="Logistics" subtitle="Compensation + availability" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Salary expectation" placeholder="e.g. Market Range / 80,000 AED"
            value={form.salary_expectation ?? ""} onChange={v => setField("salary_expectation", v)} />
          <Field label="Notice period" placeholder="e.g. 2 months / Immediate"
            value={form.notice_period ?? ""} onChange={v => setField("notice_period", v)} />
        </div>

        {/* ── Internal ───────────────────────────────────────── */}
        <SectionHeading title="Internal" subtitle="Not sent to hospitals" />
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Notes for the team</Label>
          <Textarea
            value={form.notes ?? ""}
            onChange={e => setField("notes", e.target.value)}
            placeholder="Internal context — relationship history, communication preferences, etc."
            className="mt-1 text-[12px] min-h-[80px]"
          />
        </div>

        {uploads.length > 0 && (
          <CvUploadHistory uploads={uploads} doctorId={doctor.id} onReExtract={(uploadId) => {
            reExtract.mutate({ upload_id: uploadId, doctor_id: doctor.id }, {
              onSuccess: () => toast.success("Re-extracted from CV"),
              onError: (e) => toast.error(e instanceof Error ? e.message : "Re-extract failed"),
            });
          }} />
        )}

        {previewOpen && (
          <ProfilePreview doctor={doctor} form={form} templates={templates} />
        )}
      </CardContent>

      <DoctorJourneyDialog
        open={journeyOpen}
        onClose={() => setJourneyOpen(false)}
        doctorId={doctor.id}
        doctorName={doctor.name}
      />
    </Card>
  );
}

function CvUploadHistory({ uploads, doctorId: _doctorId, onReExtract }: {
  uploads: CvUpload[];
  doctorId: string;
  onReExtract: (uploadId: string) => void;
}) {
  return (
    <div className="rounded-md border bg-slate-50/40">
      <div className="px-3 py-1.5 border-b text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        CV uploads ({uploads.length})
      </div>
      <div className="divide-y">
        {uploads.map(u => (
          <div key={u.id} className="px-3 py-2 flex items-center gap-3 text-[12px]">
            <UploadStatusBadge status={u.status} />
            <div className="flex-1 min-w-0">
              {u.file_name ? (
                <div className="flex items-center gap-1.5">
                  <FileText className="h-3 w-3 text-slate-500" />
                  <span className="font-medium truncate">{u.file_name}</span>
                  {u.file_size != null && (
                    <span className="text-[10px] text-muted-foreground">· {(u.file_size / 1024).toFixed(0)} KB</span>
                  )}
                </div>
              ) : (
                <div className="text-muted-foreground">Awaiting upload</div>
              )}
              <div className="text-[10px] text-muted-foreground mt-0.5">
                Link sent {relativeTime(u.created_at)}
                {u.uploaded_at  && ` · Uploaded ${relativeTime(u.uploaded_at)}`}
                {u.extracted_at && ` · Extracted ${relativeTime(u.extracted_at)}`}
              </div>
              {u.extraction_error && (
                <div className="text-[10px] text-rose-700 mt-0.5">Error: {u.extraction_error}</div>
              )}
            </div>
            {(u.status === "extracted" || u.status === "failed") && u.file_path && (
              <Button size="sm" variant="ghost" onClick={() => onReExtract(u.id)} title="Re-run Claude extraction on this CV">
                <RefreshCw className="h-3 w-3 mr-1" /> Re-extract
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function UploadStatusBadge({ status }: { status: CvUpload["status"] }) {
  const config = {
    pending_upload: { label: "Awaiting",   icon: Clock,        cls: "bg-slate-100 text-slate-600 border-slate-200" },
    uploaded:       { label: "Uploaded",   icon: FileText,     cls: "bg-blue-50 text-blue-700 border-blue-200" },
    extracting:     { label: "Extracting", icon: Sparkles,     cls: "bg-violet-50 text-violet-700 border-violet-200 animate-pulse" },
    extracted:      { label: "Extracted",  icon: CheckCircle2, cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    failed:         { label: "Failed",     icon: AlertCircle,  cls: "bg-rose-50 text-rose-700 border-rose-200" },
  }[status];
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${config.cls}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

function PendingUploadsPanel({ uploads, open, onToggle, onJumpToDoctor }: {
  uploads: CvUpload[];
  open: boolean;
  onToggle: () => void;
  onJumpToDoctor: (doctorId: string) => void;
}) {
  const sendCvLink = useSendCvUploadLink();

  const handleResend = async (u: CvUpload, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!u.doctor_email) {
      toast.error("Doctor has no email on file");
      return;
    }
    try {
      await sendCvLink.mutateAsync({
        doctor_id:    u.doctor_id,
        doctor_name:  u.doctor_name,
        doctor_email: u.doctor_email,
      });
      toast.success(`Re-sent upload link to ${u.doctor_name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resend");
    }
  };

  // Sort: oldest first so the stalest pending requests bubble to the top.
  const sorted = [...uploads].sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  return (
    <Card className="border-amber-200 bg-amber-50/40">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-amber-50/60 transition-colors"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4 text-amber-700" /> : <ChevronRight className="h-4 w-4 text-amber-700" />}
          <Clock className="h-4 w-4 text-amber-700" />
          <span className="text-[13px] font-medium text-amber-900">
            {uploads.length} doctor{uploads.length === 1 ? " is" : "s are"} awaiting CV upload
          </span>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-amber-700">
          oldest {relativeTime(sorted[0]?.created_at ?? new Date().toISOString())}
        </span>
      </button>
      {open && (
        <div className="border-t border-amber-200 max-h-[280px] overflow-y-auto">
          {sorted.map(u => {
            const sentAt = new Date(u.created_at).getTime();
            const ageDays = Math.floor((Date.now() - sentAt) / 86_400_000);
            const isStale = ageDays > 7;
            return (
              <button
                key={u.id}
                onClick={() => onJumpToDoctor(u.doctor_id)}
                className="w-full px-4 py-2 flex items-center justify-between gap-3 hover:bg-amber-50/80 border-t border-amber-100 first:border-t-0 transition-colors text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-medium text-slate-800 truncate">{u.doctor_name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {u.doctor_email ?? "no email on file"} · link sent {relativeTime(u.created_at)}
                    {isStale && <span className="text-amber-700 font-medium"> · {ageDays} days old</span>}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] shrink-0"
                  disabled={!u.doctor_email || sendCvLink.isPending}
                  onClick={(e) => handleResend(u, e)}
                >
                  <Send className="h-3 w-3 mr-1" /> Resend
                </Button>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hrs  = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hrs  < 24)  return `${hrs}h ago`;
  if (days === 1) return "yesterday";
  if (days < 30)  return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-baseline gap-3 pt-2">
      <div className="flex items-center gap-2 shrink-0">
        <div className="h-3 w-[3px] rounded-full bg-teal-500" />
        <h3 className="text-[11px] uppercase tracking-[0.12em] text-slate-700 font-semibold">{title}</h3>
      </div>
      {subtitle && <div className="text-[11px] text-muted-foreground truncate">{subtitle}</div>}
      <div className="flex-1 h-px bg-slate-100" />
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, className }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
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

function ProfilePreview({ doctor, form, templates }: {
  doctor: DoctorRow;
  form: DoctorProfileInput;
  templates: { key: string; subject: string; body_html: string; body_text: string }[];
}) {
  const tpl = templates.find(t => t.key === "profile_sent_hospital");
  if (!tpl) {
    return (
      <div className="rounded border bg-slate-50 p-3 text-[11px] text-muted-foreground">
        profile_sent_hospital template not loaded yet.
      </div>
    );
  }
  const tokens: Record<string, string> = {
    ...profileToTokens(form as DoctorProfile),
    doctor_name:      doctor.name,
    doctor_email:     doctor.email ?? "",
    doctor_phone:     doctor.phone ?? "",
    doctor_speciality: doctor.speciality ?? "",
    hospital_name:    "[Hospital]",
    hospital_contact_name: "[Hospital contact]",
  };
  const subject = renderTemplate(tpl.subject, tokens);
  const html    = renderTemplate(tpl.body_html || tpl.body_text, tokens, { html: true });
  const text    = renderTemplate(tpl.body_text ?? "", tokens);

  return (
    <EmailPreview
      subject={subject}
      html={html}
      text={text}
      from="Hospital Intro <hospitalintro@care-assist.io>"
      to="[Hospital recruiter]"
      templateKey="profile_sent_hospital"
    />
  );
}

function DoctorPipelineStatus({ doctorId }: { doctorId: string }) {
  const info = useDoctorStatus(doctorId);
  if (!info) return null;
  return <DoctorStatusBadge info={info} />;
}
