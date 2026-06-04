/**
 * WordPress Candidates page.
 *
 * Mirrors the AA WP site's "candidate" CPT (~1,243 doctor profiles)
 * into a searchable surface inside the dashboard. Same supercharged-
 * search pattern as /forms: pre-stringified corpus, debounced input,
 * filter chips, virtualisation-lite via "Show more".
 *
 * Each candidate row links out to the WP source URL and can be
 * manually linked to an existing AA doctor (Zoho lead / DoB) if the
 * names don't auto-match.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  UserSquare, Search, RefreshCw, ExternalLink, ChevronRight, FileText, Link2,
  History,
  Phone, Mail, IdCard, MapPin, Stethoscope, BadgeCheck, Calendar, CalendarDays,
  Briefcase, Award, Globe, Languages as LanguagesIcon, Users as UsersIcon,
  Baby, Clock as ClockIcon, GraduationCap,
} from "lucide-react";
import { useWpCandidates, useSyncWpCandidates, useLinkWpCandidate, useAutoLinkWpCandidates, type WpCandidate } from "@/hooks/use-wp-candidates";
import { WpCandidateEditDialog } from "@/components/WpCandidateEditDialog";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";

export default function WpCandidates() {
  const { data: candidates = [], isLoading } = useWpCandidates();
  const sync     = useSyncWpCandidates();
  const autoLink = useAutoLinkWpCandidates();
  const [editing, setEditing] = useState<{ open: boolean; candidate: WpCandidate | null }>({ open: false, candidate: null });

  // Search + filter state — same architecture as /forms.
  const [searchRaw, setSearchRaw] = useState("");
  const search = useDebounce(searchRaw, 120);
  const [statusFilter, setStatusFilter] = useState<"all" | "publish" | "private" | "draft">("all");
  const [licenseFilter, setLicenseFilter] = useState<"all" | "DHA" | "DOH" | "MOH" | "SCFHS" | "QCHP">("all");
  const [renderLimit, setRenderLimit] = useState(60);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Pre-build search corpus once per data refresh. Per-keystroke
  // filter is then plain string.includes() — fast at 1k+ rows.
  const corpus = useMemo(() => candidates.map(c => {
    const parts: string[] = [
      c.full_name, c.title, c.job_title, c.email, c.phone, c.nationality,
      c.specialty, c.subspecialty, c.area_of_interest, c.license_status,
      c.country_of_training, c.current_location, c.rank, c.languages,
      c.english_level, c.current_salary, c.expected_salary, c.notice_period,
      ...(c.license_types ?? []), ...(c.targeted_locations ?? []),
    ].filter((s): s is string => !!s);
    return parts.join(" \n ").toLowerCase();
  }), [candidates]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
    return candidates.filter((c, i) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (licenseFilter !== "all" && !(c.license_types ?? []).some(l => l?.toUpperCase().includes(licenseFilter))) return false;
      if (tokens.length === 0) return true;
      const hay = corpus[i];
      return tokens.every(t => hay.includes(t));
    });
  }, [candidates, corpus, search, statusFilter, licenseFilter]);

  // Reset render window when filter narrows.
  useEffect(() => { setRenderLimit(60); }, [search, statusFilter, licenseFilter]);

  // ⌘F to focus search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f"
          && document.activeElement?.tagName !== "INPUT"
          && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleSync = async () => {
    try {
      const r = await sync.mutateAsync();
      toast.success(`Synced — ${r.inserted} candidates · ${r.totalReported} total in WP · ${(r.durationMs / 1000).toFixed(1)}s`, { duration: 8000 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    }
  };

  const handleAutoLink = async () => {
    try {
      const r = await autoLink.mutateAsync();
      const bits = [
        `${r.updated} linked`,
        r.matched_by_email ? `${r.matched_by_email} by email` : "",
        r.matched_by_name  ? `${r.matched_by_name} by name`   : "",
        r.skipped_ambiguous ? `${r.skipped_ambiguous} skipped (ambiguous)` : "",
      ].filter(Boolean).join(" · ");
      toast.success(`Auto-linked: ${bits}`, { duration: 9000 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Auto-link failed");
    }
  };

  // KPI snapshot — taken on the FULL list, not the filter, so it stays
  // stable as the user types.
  const kpis = useMemo(() => ({
    total:     candidates.length,
    published: candidates.filter(c => c.status === "publish").length,
    privateCt: candidates.filter(c => c.status === "private").length,
    drafts:    candidates.filter(c => c.status === "draft").length,
    linked:    candidates.filter(c => !!c.doctor_id).length,
  }), [candidates]);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <UserSquare className="h-6 w-6 text-teal-600" />
              WP Candidates
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Mirror of the doctor profiles on allocationassist.com. Use this as a one-stop search across every AA-curated candidate — specialty, license, country of training, salary expectations, targeted locations, the lot.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setEditing({ open: true, candidate: null })}>
              <Plus className="h-3.5 w-3.5 mr-1" /> New candidate
            </Button>
            <Button size="sm" variant="outline" onClick={handleAutoLink} disabled={autoLink.isPending}>
              {autoLink.isPending ? <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Link2 className="h-3.5 w-3.5 mr-1" />}
              {autoLink.isPending ? "Auto-linking…" : "Auto-link to AA doctors"}
            </Button>
            <Button size="sm" variant="outline" onClick={handleSync} disabled={sync.isPending}>
              {sync.isPending ? <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> : <History className="h-3.5 w-3.5 mr-1" />}
              {sync.isPending ? "Syncing…" : "Sync from WordPress"}
            </Button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Kpi label="Total"          value={kpis.total}     tone="slate" />
          <Kpi label="Published"      value={kpis.published} tone="emerald" />
          <Kpi label="Private"        value={kpis.privateCt} tone="amber" />
          <Kpi label="Drafts"         value={kpis.drafts}    tone="sky" />
          <Kpi label="Linked to AA"   value={kpis.linked}    tone="indigo" hint={`${Math.round((kpis.linked / Math.max(kpis.total, 1)) * 100)}% matched`} />
        </div>

        {/* Search + filters */}
        <Card>
          <CardContent className="pt-3 pb-3 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={searchRaw}
                onChange={e => setSearchRaw(e.target.value)}
                placeholder="Search any field — name, specialty, license, country, salary, location… (⌘F)"
                className="pl-10 pr-24 h-10 text-[13px]"
              />
              {searchRaw && (
                <button
                  type="button"
                  onClick={() => setSearchRaw("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground hover:text-slate-800"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap text-[11px]">
              <ChipGroup
                value={statusFilter}
                onChange={(v) => setStatusFilter(v as typeof statusFilter)}
                options={[
                  { value: "all",     label: "All statuses" },
                  { value: "publish", label: "Published" },
                  { value: "private", label: "Private" },
                  { value: "draft",   label: "Drafts" },
                ]}
              />
              <span className="text-muted-foreground/40">·</span>
              <ChipGroup
                value={licenseFilter}
                onChange={(v) => setLicenseFilter(v as typeof licenseFilter)}
                options={[
                  { value: "all",   label: "Any license" },
                  { value: "DHA",   label: "DHA" },
                  { value: "DOH",   label: "DOH" },
                  { value: "MOH",   label: "MOH" },
                  { value: "SCFHS", label: "SCFHS" },
                  { value: "QCHP",  label: "QCHP" },
                ]}
              />
              <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                {filtered.length === candidates.length ? `${candidates.length} candidates` : `${filtered.length} of ${candidates.length}`}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* List */}
        <Card>
          <CardContent className="pt-3 space-y-2">
            {isLoading ? (
              <p className="text-[11px] text-muted-foreground py-2">Loading candidates…</p>
            ) : candidates.length === 0 ? (
              <div className="rounded-md border border-dashed py-8 text-center">
                <UserSquare className="h-5 w-5 mx-auto mb-2 text-muted-foreground/60" />
                <p className="text-[12px] text-muted-foreground">No candidates synced yet.</p>
                <Button size="sm" onClick={handleSync} disabled={sync.isPending} className="mt-3">
                  <History className="h-3.5 w-3.5 mr-1" /> Sync from WordPress
                </Button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-md border border-dashed py-8 text-center">
                <Search className="h-5 w-5 mx-auto mb-2 text-muted-foreground/60" />
                <p className="text-[12px] text-muted-foreground">No matches.</p>
                <button onClick={() => { setSearchRaw(""); setStatusFilter("all"); setLicenseFilter("all"); }} className="text-[11px] text-teal-700 hover:underline mt-1">
                  Clear filters
                </button>
              </div>
            ) : (
              <>
                {filtered.slice(0, renderLimit).map(c => <CandidateRow key={c.id} candidate={c} highlight={search.trim().toLowerCase()} onEdit={() => setEditing({ open: true, candidate: c })} />)}
                {filtered.length > renderLimit && (
                  <button
                    type="button"
                    onClick={() => setRenderLimit(n => n + 100)}
                    className="w-full py-2 text-[11px] text-teal-700 hover:bg-slate-50 rounded-md border border-dashed"
                  >
                    Show {Math.min(100, filtered.length - renderLimit)} more · {filtered.length - renderLimit} remaining
                  </button>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
      <WpCandidateEditDialog
        open={editing.open}
        candidate={editing.candidate}
        onClose={() => setEditing({ open: false, candidate: null })}
      />
    </DashboardLayout>
  );
}

function CandidateRow({ candidate, highlight, onEdit }: { candidate: WpCandidate; highlight: string; onEdit: () => void }) {
  const [open, setOpen] = useState(false);
  const subtitle = [candidate.job_title, candidate.country_of_training].filter(Boolean).join(" · ");
  return (
    <>
      <div className="rounded-md border bg-white">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50"
        >
          <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <Avatar src={candidate.photo_url} name={candidate.full_name ?? candidate.title ?? "?"} size={32} />
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium text-slate-800 truncate">
              <Hl text={candidate.full_name ?? candidate.title ?? "—"} q={highlight} />
            </div>
            <div className="text-[10px] text-muted-foreground truncate">
              <Hl text={subtitle || "—"} q={highlight} />
              {candidate.years_experience != null && <span> · {candidate.years_experience}y exp</span>}
            </div>
          </div>
          {(candidate.license_types ?? []).slice(0, 3).map(l => (
            <Badge key={l} variant="outline" className="text-[9px] bg-sky-50 text-sky-700 border-sky-200 shrink-0">{l}</Badge>
          ))}
          {candidate.doctor_id && (
            <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200 shrink-0">
              <Link2 className="h-2.5 w-2.5 mr-0.5" /> Linked
            </Badge>
          )}
          {candidate.status === "private" && <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-200 shrink-0">Private</Badge>}
        </button>
      </div>
      <CandidateDetailDialog
        candidate={candidate}
        open={open}
        onClose={() => setOpen(false)}
        onEdit={() => { setOpen(false); onEdit(); }}
      />
    </>
  );
}

function CandidateDetailDialog({ candidate, open, onClose, onEdit }: { candidate: WpCandidate; open: boolean; onClose: () => void; onEdit: () => void }) {
  const link = useLinkWpCandidate();
  const [doctorIdInput, setDoctorIdInput] = useState(candidate.doctor_id ?? "");
  const [tab, setTab] = useState<"education" | "experience">("education");

  // Reset linkage input when a different candidate opens.
  useEffect(() => { setDoctorIdInput(candidate.doctor_id ?? ""); }, [candidate.doctor_id, candidate.id]);

  const saveLink = async () => {
    try {
      await link.mutateAsync({ id: candidate.id, doctorId: doctorIdInput.trim() || null });
      toast.success(doctorIdInput.trim() ? "Linked." : "Unlinked.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const age          = ageFromDob(candidate.date_of_birth);
  const dobPretty    = prettyDate(candidate.date_of_birth);
  const memberSince  = prettyDate(candidate.wp_date);
  const hasDeps      = candidate.has_dependents;
  const hasEducation = !!(candidate.education_title || candidate.education_academy || candidate.education_description);
  const hasExperience = !!(candidate.experience_title || candidate.experience_company || candidate.experience_description);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-[1080px] max-h-[92vh] overflow-y-auto p-0">
        <div className="p-5 md:p-7">
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">

            {/* ── Left teal sidebar card ───────────────────────────────── */}
            <div className="space-y-3">
              <div className="rounded-2xl bg-gradient-to-b from-teal-400 to-teal-500 text-white p-5 shadow-sm">
                <div className="flex justify-center">
                  <Avatar src={candidate.photo_url} name={candidate.full_name ?? candidate.title ?? "?"} size={132} ring />
                </div>
                <div className="mt-4 text-center">
                  <div className="text-[18px] font-semibold leading-tight">{candidate.full_name ?? candidate.title ?? "—"}</div>
                  {candidate.job_title && (
                    <div className="text-[12px] text-white/90 mt-1 leading-snug">{candidate.job_title}</div>
                  )}
                  {memberSince && (
                    <div className="inline-flex mt-3 text-[10.5px] bg-white/15 rounded-full px-2.5 py-0.5">
                      Member Since: {memberSince}
                    </div>
                  )}
                </div>

                <div className="my-4 border-t border-white/25" />

                <div className="space-y-2.5 text-[12px]">
                  {age != null && (
                    <div className="flex items-center justify-center gap-2">
                      <span>Age: {age} Years Old</span>
                    </div>
                  )}
                  {candidate.phone && (
                    <ContactLine icon={<Phone className="h-3.5 w-3.5" />} value={candidate.phone} href={`tel:${candidate.phone}`} />
                  )}
                  {candidate.email && (
                    <ContactLine icon={<Mail className="h-3.5 w-3.5" />} value={candidate.email} href={`mailto:${candidate.email}`} />
                  )}
                </div>
              </div>

              {/* Action buttons mirroring the WP layout */}
              <div className="space-y-2">
                <Button onClick={onEdit} className="w-full justify-center h-10 rounded-full bg-teal-600 hover:bg-teal-700">
                  <Pencil className="h-4 w-4 mr-2" /> Edit profile
                </Button>
                {candidate.cv_url && (
                  <a href={candidate.cv_url} target="_blank" rel="noreferrer" className="block">
                    <Button variant="outline" className="w-full justify-center h-10 rounded-full border-slate-200 shadow-sm">
                      <FileText className="h-4 w-4 mr-2" /> View Resume
                    </Button>
                  </a>
                )}
                <a href={candidate.wp_link} target="_blank" rel="noreferrer" className="block">
                  <Button variant="outline" className="w-full justify-center h-10 rounded-full border-teal-200 text-teal-700 hover:bg-teal-50">
                    <ExternalLink className="h-4 w-4 mr-2" /> View on WordPress
                  </Button>
                </a>
                {candidate.email && (
                  <a href={`mailto:${candidate.email}`} className="block">
                    <Button className="w-full justify-center h-10 rounded-full bg-slate-900 hover:bg-slate-800">
                      <Mail className="h-4 w-4 mr-2" /> Contact
                    </Button>
                  </a>
                )}
              </div>

              {/* Manual AA linkage stays here — admin-only thing, tucked
                  under the contact buttons so the card still reads like a
                  profile card and not a CRM form. */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 space-y-1.5">
                <div className="text-[10.5px] font-medium text-slate-600 uppercase tracking-wider">Link to AA doctor</div>
                <div className="flex items-center gap-2">
                  <Input
                    value={doctorIdInput}
                    onChange={e => setDoctorIdInput(e.target.value)}
                    placeholder="lead:12345 / dob:6789"
                    className="h-8 text-[11px] font-mono bg-white"
                  />
                  <Button size="sm" className="h-8" onClick={saveLink} disabled={link.isPending}>
                    {link.isPending ? "…" : "Save"}
                  </Button>
                </div>
                {candidate.doctor_id && (
                  <div className="text-[10px] text-emerald-700 flex items-center gap-1">
                    <Link2 className="h-2.5 w-2.5" /> Currently linked to <span className="font-mono">{candidate.doctor_id}</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── Right detail pane ────────────────────────────────────── */}
            <div className="space-y-5">
              <div>
                <h2 className="text-[22px] md:text-[26px] font-semibold text-slate-900 leading-tight">
                  {prefixedTitle(candidate)}
                </h2>
                {candidate.area_of_interest && (
                  <>
                    <p className="mt-3 text-[14px] text-slate-600">Specific areas of interests within the specialization</p>
                    <div className="mt-1 h-px bg-gradient-to-r from-teal-300 to-transparent" />
                    <p className="mt-2 text-[13px] text-slate-700">{candidate.area_of_interest}</p>
                  </>
                )}
              </div>

              {/* Stat tile grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-4">
                <InfoTile icon={<IdCard className="h-4 w-4" />}        label="Age"                          value={age != null ? `${age} years old` : null} />
                <InfoTile icon={<Globe className="h-4 w-4" />}         label="Nationality"                  value={candidate.nationality} />
                <InfoTile icon={<Calendar className="h-4 w-4" />}      label="Date of Birth"                value={dobPretty} />
                <InfoTile icon={<Stethoscope className="h-4 w-4" />}   label="Specialty"                    value={[candidate.specialty, candidate.subspecialty].filter(Boolean).join(" / ") || null} />
                <InfoTile icon={<BadgeCheck className="h-4 w-4" />}    label="Specialist / Consultant"      value={candidate.rank} />
                <InfoTile icon={<CalendarDays className="h-4 w-4" />}  label="Years of Experience"          value={candidate.years_experience != null ? `${candidate.years_experience} Years` : null} />
                <InfoTile icon={<Award className="h-4 w-4" />}         label="DHA / DOH / MOH / SCFHS / QCHP Licenses?" value={licenseSummary(candidate)} />
                <InfoTile icon={<ClockIcon className="h-4 w-4" />}     label="Notice Period"                value={candidate.notice_period} />
                <InfoTile icon={<MapPin className="h-4 w-4" />}        label="Targeted Location"            value={(candidate.targeted_locations ?? []).join(", ") || null} />
                <InfoTile icon={<LanguagesIcon className="h-4 w-4" />} label="Languages"                    value={candidate.languages} />
                <InfoTile icon={<LanguagesIcon className="h-4 w-4" />} label="English Level"                value={candidate.english_level} />
                <InfoTile icon={<UsersIcon className="h-4 w-4" />}     label="Family Status"                value={candidate.family_status} />
                <InfoTile icon={<Baby className="h-4 w-4" />}          label="Have Children / Dependent"    value={hasDeps == null ? null : (hasDeps ? "Yes" : "No")} />
                <InfoTile icon={<MapPin className="h-4 w-4" />}        label="Country of Training"          value={candidate.country_of_training} />
                <InfoTile icon={<MapPin className="h-4 w-4" />}        label="Current Location"             value={candidate.current_location} />
              </div>

              {/* Education / Experience tabs */}
              {(hasEducation || hasExperience) && (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="grid grid-cols-2">
                    <TabBtn active={tab === "education"}  onClick={() => setTab("education")}  disabled={!hasEducation}>Education</TabBtn>
                    <TabBtn active={tab === "experience"} onClick={() => setTab("experience")} disabled={!hasExperience}>Experience</TabBtn>
                  </div>
                  <div className="p-5 bg-white">
                    {tab === "education" && hasEducation && (
                      <TimelineEntry
                        title={candidate.education_title}
                        org={candidate.education_academy}
                        start={candidate.education_start}
                        end={candidate.education_end}
                        present={candidate.education_present}
                        description={candidate.education_description}
                        leadIcon={<GraduationCap className="h-4 w-4 text-teal-600" />}
                        leadLabel="Specialty Training:"
                      />
                    )}
                    {tab === "experience" && hasExperience && (
                      <TimelineEntry
                        title={candidate.experience_title}
                        org={candidate.experience_company}
                        start={candidate.experience_start}
                        end={candidate.experience_end}
                        present={candidate.experience_present}
                        description={candidate.experience_description}
                        leadIcon={<Briefcase className="h-4 w-4 text-teal-600" />}
                        leadLabel="Role:"
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Status chip row — admin-y info that the WP card doesn't show but we want internally */}
              <div className="flex flex-wrap items-center gap-1.5 pt-2">
                {candidate.license_types?.map(l => (
                  <Badge key={l} variant="outline" className="text-[10px] bg-sky-50 text-sky-700 border-sky-200">{l}</Badge>
                ))}
                {candidate.status && (
                  <Badge variant="outline" className={`text-[10px] ${
                    candidate.status === "publish" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                    candidate.status === "private" ? "bg-amber-50 text-amber-700 border-amber-200" :
                    "bg-slate-50 text-slate-700 border-slate-200"
                  }`}>{candidate.status}</Badge>
                )}
                {candidate.current_salary && <Badge variant="outline" className="text-[10px]">Current: {candidate.current_salary}</Badge>}
                {candidate.expected_salary && <Badge variant="outline" className="text-[10px]">Expected: {candidate.expected_salary}</Badge>}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Square-ish circular avatar with initials fallback. Matches the teal
 *  WP profile-card ring when `ring` is on. */
function Avatar({ src, name, size, ring }: { src: string | null; name: string; size: number; ring?: boolean }) {
  const [errored, setErrored] = useState(false);
  const initials = name.replace(/^Dr\.?\s+/i, "").split(/\s+/).map(s => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
  const showImage = src && !errored;
  const ringClass = ring ? "ring-4 ring-white/40 shadow-lg" : "";
  return (
    <div
      style={{ width: size, height: size }}
      className={`rounded-full bg-slate-200 overflow-hidden flex items-center justify-center text-slate-600 font-medium shrink-0 ${ringClass}`}
    >
      {showImage ? (
        <img
          src={src!}
          alt={name}
          width={size}
          height={size}
          onError={() => setErrored(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <span style={{ fontSize: Math.max(10, size * 0.32) }}>{initials}</span>
      )}
    </div>
  );
}

function ContactLine({ icon, value, href }: { icon: React.ReactNode; value: string; href: string }) {
  return (
    <a href={href} className="flex items-center justify-center gap-2 text-white/95 hover:text-white">
      <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-white/15">{icon}</span>
      <span className="truncate">{value}</span>
    </a>
  );
}

function InfoTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number | null | undefined }) {
  const display = value == null || value === "" ? "—" : String(value);
  const muted   = display === "—";
  return (
    <div className="flex items-start gap-3">
      <div className="h-9 w-9 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] text-slate-500">{label}</div>
        <div className={`text-[13px] mt-0.5 break-words ${muted ? "text-slate-400" : "text-slate-800"}`}>{display}</div>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, disabled, children }: { active: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`py-3 text-[12px] font-medium tracking-wider uppercase transition-colors ${
        disabled ? "bg-slate-50 text-slate-300 cursor-not-allowed"
        : active   ? "bg-teal-600 text-white"
        :            "bg-slate-50 text-slate-600 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

function TimelineEntry({ title, org, start, end, present, description, leadIcon, leadLabel }: {
  title: string | null; org: string | null; start: string | null; end: string | null;
  present: boolean | null; description: string | null;
  leadIcon: React.ReactNode; leadLabel: string;
}) {
  const range = formatRange(start, end, present);
  return (
    <div className="space-y-1.5">
      {title && (
        <div className="text-[15px] text-slate-900 leading-snug">
          <span className="inline-flex items-center gap-1.5 font-semibold">{leadIcon}{leadLabel}</span>{" "}
          <span>{title}</span>
        </div>
      )}
      {org && <div className="text-[14px] text-teal-600 font-medium">{org}</div>}
      {range && <div className="text-[12px] text-slate-500">{range}</div>}
      {description && <div className="text-[12.5px] text-slate-700 whitespace-pre-line">Description: {description}</div>}
      {!description && org && !title && <div className="text-[12px] text-slate-500">Description: {org}</div>}
    </div>
  );
}

// ─── small formatters ─────────────────────────────────────────────────

function prefixedTitle(c: WpCandidate): string {
  // Prefer the WP-rendered post title (already has the "Dr. X – Consultant in …" shape).
  const t = (c.title ?? "").trim();
  if (t) return t;
  const parts = [c.full_name, c.job_title].filter(Boolean) as string[];
  return parts.join(" – ") || "Candidate";
}

function ageFromDob(dob: string | null): number | null {
  if (!dob) return null;
  // Accept "19870904", "1987-09-04", "4 September 1987" — try them in order.
  let d: Date | null = null;
  if (/^\d{8}$/.test(dob))                      d = new Date(`${dob.slice(0, 4)}-${dob.slice(4, 6)}-${dob.slice(6, 8)}`);
  else if (/^\d{4}-\d{2}-\d{2}/.test(dob))      d = new Date(dob);
  else                                          { const parsed = new Date(dob); if (!isNaN(parsed.valueOf())) d = parsed; }
  if (!d || isNaN(d.valueOf())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 120 ? age : null;
}

function prettyDate(raw: string | null): string | null {
  if (!raw) return null;
  let d: Date | null = null;
  if (/^\d{8}$/.test(raw))                 d = new Date(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`);
  else                                     { const parsed = new Date(raw); if (!isNaN(parsed.valueOf())) d = parsed; }
  if (!d || isNaN(d.valueOf())) return raw;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function formatRange(start: string | null, end: string | null, present: boolean | null): string {
  const s = prettyMonthYear(start);
  const e = present ? "Present" : prettyMonthYear(end);
  if (s && e) return `${s} – ${e}`;
  if (s)      return present ? `${s} – Present` : s;
  if (e)      return e;
  return present ? "Present" : "";
}

function prettyMonthYear(raw: string | null): string | null {
  if (!raw) return null;
  let d: Date | null = null;
  if (/^\d{8}$/.test(raw))            d = new Date(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`);
  else                                { const parsed = new Date(raw); if (!isNaN(parsed.valueOf())) d = parsed; }
  if (!d || isNaN(d.valueOf())) return raw;
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function licenseSummary(c: WpCandidate): string | null {
  // Prefer the human-written "DHA, DOH & MOH in process" field if present.
  if (c.license_status) return c.license_status;
  if (c.license_types?.length) return c.license_types.join(", ");
  return null;
}

function Kpi({ label, value, tone, hint }: { label: string; value: number; tone: "slate" | "emerald" | "amber" | "sky" | "indigo"; hint?: string }) {
  const cls = {
    slate:   "bg-slate-50 text-slate-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber:   "bg-amber-50 text-amber-700",
    sky:     "bg-sky-50 text-sky-700",
    indigo:  "bg-indigo-50 text-indigo-700",
  }[tone];
  return (
    <div className={`rounded-md border ${cls} px-3 py-3`}>
      <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-[22px] font-semibold mt-1 leading-none">{value.toLocaleString()}</div>
      {hint && <div className="text-[10px] opacity-70 mt-1">{hint}</div>}
    </div>
  );
}

function ChipGroup<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }>;
}) {
  return (
    <div className="inline-flex items-center gap-1">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 rounded-full transition-colors ${
            value === o.value ? "bg-teal-600 text-white" : "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Hl({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const tokens = q.trim().split(/\s+/).filter(t => t.length > 0);
  if (tokens.length === 0) return <>{text}</>;
  const escaped = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const splitter = new RegExp(`(${escaped.join("|")})`, "gi");
  const matcher  = new RegExp(`^(?:${escaped.join("|")})$`, "i");
  return (
    <>
      {text.split(splitter).map((p, i) =>
        matcher.test(p)
          ? <mark key={i} className="bg-amber-100 text-amber-900 px-0.5 rounded">{p}</mark>
          : <span key={i}>{p}</span>
      )}
    </>
  );
}

function useDebounce<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}
