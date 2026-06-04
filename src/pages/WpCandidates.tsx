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
import { useSearchParams } from "react-router-dom";
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
import {
  useWpCandidates, useSyncWpCandidates, useLinkWpCandidate,
  useUpsertWpCandidate, useUploadWpPhoto,
  type WpCandidate,
} from "@/hooks/use-wp-candidates";
import { toast } from "sonner";
import { Plus, Camera, Loader2, Check, AlertCircle, Pencil } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface WpCandidatesProps { embedded?: boolean }

export default function WpCandidates({ embedded }: WpCandidatesProps = {}) {
  const { data: candidates = [], isLoading } = useWpCandidates();
  const sync = useSyncWpCandidates();
  const upsert = useUpsertWpCandidate();
  const [openDetailId, setOpenDetailId] = useState<number | null>(null);

  // Click "New profile" → POST a draft to WP immediately, then open the
  // detail dialog on the new row. The detail dialog is fully inline-
  // editable, so the user just fills in the empty fields from there.
  const handleNewProfile = async () => {
    try {
      const r = await upsert.mutateAsync({
        status: "draft",
        title: "New profile",
        acf: { full_name: "New profile" },
      });
      if (r.id) setOpenDetailId(r.id);
      toast.success("Blank profile created — fill in the fields inline.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create");
    }
  };

  // Search + filter state — same architecture as /forms.
  // In embedded mode the URL `q` is the source of truth (shell owns the
  // input). Standalone, we use a local raw value that's still URL-synced
  // so deep links work.
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQ = searchParams.get("q") ?? "";
  const [localRaw, setLocalRaw] = useState(urlQ);
  const searchRaw = embedded ? urlQ : localRaw;
  const setSearchRaw = (v: string) => {
    if (embedded) {
      const next = new URLSearchParams(searchParams);
      if (v) next.set("q", v); else next.delete("q");
      setSearchParams(next, { replace: true });
    } else {
      setLocalRaw(v);
    }
  };
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
      // Sync auto-links freshly added rows on its way out, so this single
      // toast covers both phases — no separate "Auto-link" button needed.
      const linkedNote = r.auto_linked ? ` · auto-linked ${r.auto_linked} new` : "";
      toast.success(`Synced — ${r.inserted} candidates${linkedNote} · ${(r.durationMs / 1000).toFixed(1)}s`, { duration: 8000 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
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

  const headerButtons = (
    <div className="flex items-center gap-2">
      <Button size="sm" onClick={handleNewProfile} disabled={upsert.isPending}>
        {upsert.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
        New profile
      </Button>
      <Button size="sm" variant="outline" onClick={handleSync} disabled={sync.isPending}>
        {sync.isPending ? <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> : <History className="h-3.5 w-3.5 mr-1" />}
        {sync.isPending ? "Syncing…" : "Sync from WordPress"}
      </Button>
    </div>
  );

  const body = (
      <div className="space-y-4">
        {/* Page header — shown only standalone. Embedded mode parks the
            buttons under the shared KPI strip to keep them reachable. */}
        {!embedded && (
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
            {headerButtons}
          </div>
        )}
        {embedded && <div className="flex justify-end">{headerButtons}</div>}

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
            {!embedded && (
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
            )}
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
                {filtered.slice(0, renderLimit).map(c => <CandidateRow key={c.id} candidate={c} highlight={search.trim().toLowerCase()} onOpen={() => setOpenDetailId(c.id)} />)}
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
  );

  // The detail dialog reads its candidate by ID from the cached list,
  // so inline edits flow through useUpsertWpCandidate → cache invalidation
  // → fresh row on next render without us having to plumb state around.
  const detailCandidate = openDetailId != null
    ? candidates.find(c => c.id === openDetailId) ?? null
    : null;
  const withDialog = (
    <>
      {body}
      <CandidateDetailDialog
        candidate={detailCandidate}
        open={openDetailId != null}
        onClose={() => setOpenDetailId(null)}
      />
    </>
  );

  if (embedded) return withDialog;
  return <DashboardLayout>{withDialog}</DashboardLayout>;
}

function CandidateRow({ candidate, highlight, onOpen }: { candidate: WpCandidate; highlight: string; onOpen: () => void }) {
  const subtitle = [candidate.job_title, candidate.country_of_training].filter(Boolean).join(" · ");
  return (
    <>
      <div className="rounded-md border bg-white">
        <button
          type="button"
          onClick={onOpen}
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
      {/* Detail dialog is mounted ONCE at the page level — the row just
          signals which candidate to open via onOpen. */}
    </>
  );
}

/**
 * Inline-editable profile card.
 *
 * Every field on the candidate is its own click-to-edit affordance —
 * hover shows a faint outline, click swaps it for an Input/Textarea/
 * Select, blur (or Enter on single-line, Esc to cancel) commits. Each
 * commit fires a partial PATCH via useUpsertWpCandidate.
 *
 * The avatar is the same — hover reveals a "Change photo" overlay that
 * opens the file picker and uploads to WP media in one shot.
 *
 * Accepts `candidate: WpCandidate | null` to gracefully handle the
 * brief moment between "New profile" POST → cache invalidation → row
 * actually appearing in the list.
 */
function CandidateDetailDialog({ candidate, open, onClose }: { candidate: WpCandidate | null; open: boolean; onClose: () => void }) {
  if (!candidate) {
    // The dialog is open but the row hasn't materialised in the cache
    // yet — show a placeholder rather than blowing up.
    return (
      <Dialog open={open} onOpenChange={v => !v && onClose()}>
        <DialogContent className="sm:max-w-[480px]">
          <div className="flex items-center justify-center py-12 text-[12px] text-muted-foreground">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading profile…
          </div>
        </DialogContent>
      </Dialog>
    );
  }
  return <CandidateDetailDialogInner candidate={candidate} open={open} onClose={onClose} />;
}

function CandidateDetailDialogInner({ candidate, open, onClose }: { candidate: WpCandidate; open: boolean; onClose: () => void }) {
  const upsert = useUpsertWpCandidate();
  const upload = useUploadWpPhoto();
  const link   = useLinkWpCandidate();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [tab, setTab] = useState<"education" | "experience">("education");
  const [doctorIdInput, setDoctorIdInput] = useState(candidate.doctor_id ?? "");

  useEffect(() => { setDoctorIdInput(candidate.doctor_id ?? ""); }, [candidate.doctor_id, candidate.id]);

  // Generic save: takes a partial ACF patch, fires upsert. Errors
  // bubble out so the inline field can show its red dot.
  const saveAcf = async (patch: Record<string, unknown>) => {
    await upsert.mutateAsync({ id: candidate.id, acf: patch });
  };
  const saveStatus = async (status: "draft" | "private" | "publish") => {
    await upsert.mutateAsync({ id: candidate.id, status });
  };
  const saveTitle = async (title: string) => {
    await upsert.mutateAsync({ id: candidate.id, title });
  };

  const handlePhotoPick = () => fileRef.current?.click();
  const handlePhotoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await upload.mutateAsync({ file, candidateId: candidate.id });
      toast.success("Photo updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      e.target.value = "";
    }
  };

  const saveLink = async () => {
    try {
      await link.mutateAsync({ id: candidate.id, doctorId: doctorIdInput.trim() || null });
      toast.success(doctorIdInput.trim() ? "Linked." : "Unlinked.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const age         = ageFromDob(candidate.date_of_birth);
  const memberSince = prettyDate(candidate.wp_date);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-[1080px] max-h-[92vh] overflow-y-auto p-0">
        <input ref={fileRef} type="file" accept="image/*" onChange={handlePhotoFile} className="hidden" />
        <div className="p-5 md:p-7">
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">

            {/* ── Left teal sidebar card ───────────────────────────────── */}
            <div className="space-y-3">
              <div className="rounded-2xl bg-gradient-to-b from-teal-400 to-teal-500 text-white p-5 shadow-sm">
                {/* Photo with hover-to-upload overlay */}
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={handlePhotoPick}
                    className="relative group rounded-full"
                    title="Click to change photo"
                  >
                    <Avatar src={candidate.photo_url} name={candidate.full_name ?? candidate.title ?? "?"} size={132} ring />
                    <div className="absolute inset-0 rounded-full flex flex-col items-center justify-center bg-black/55 text-white text-[10.5px] font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                      {upload.isPending ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <>
                          <Camera className="h-5 w-5 mb-1" />
                          Change photo
                        </>
                      )}
                    </div>
                  </button>
                </div>

                {/* Name + job title — both inline-editable */}
                <div className="mt-4 text-center space-y-1">
                  <EditableText
                    value={candidate.full_name}
                    onSave={v => saveAcf({ full_name: v ?? "" })}
                    placeholder="Add full name…"
                    className="text-[18px] font-semibold leading-tight text-white"
                    hoverClass="hover:bg-white/25 hover:ring-white/40"
                  />
                  <EditableText
                    value={candidate.job_title}
                    onSave={v => saveAcf({ job_title: v ?? "" })}
                    placeholder="Add job title…"
                    className="text-[12px] text-white/90 leading-snug"
                    hoverClass="hover:bg-white/25 hover:ring-white/40"
                  />
                  {memberSince && (
                    <div className="inline-flex mt-3 text-[10.5px] bg-white/15 rounded-full px-2.5 py-0.5">
                      Member Since: {memberSince}
                    </div>
                  )}
                </div>

                <div className="my-4 border-t border-white/25" />

                <div className="space-y-2.5 text-[12px]">
                  {age != null && (
                    <div className="flex items-center justify-center gap-2 text-white/90">
                      <span>Age: {age} Years Old</span>
                    </div>
                  )}
                  <ContactLineEditable
                    icon={<Phone className="h-3.5 w-3.5" />}
                    value={candidate.phone}
                    placeholder="Add phone…"
                    onSave={v => saveAcf({ phone_number: v ?? "" })}
                  />
                  <ContactLineEditable
                    icon={<Mail className="h-3.5 w-3.5" />}
                    value={candidate.email}
                    placeholder="Add email…"
                    onSave={v => saveAcf({ email: v ?? "" })}
                  />
                </div>
              </div>

              {/* Action buttons — Edit profile button is gone; the card
                  IS the editor now. */}
              <div className="space-y-2">
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

              {/* Status inline-editor + Link to AA doctor (admin tools) */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 space-y-2.5">
                <div>
                  <div className="text-[10.5px] font-medium text-slate-600 uppercase tracking-wider mb-1">Status</div>
                  <Select value={candidate.status ?? "draft"} onValueChange={(v) => saveStatus(v as "draft" | "private" | "publish")}>
                    <SelectTrigger className="h-8 text-[11px] bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="private">Private</SelectItem>
                      <SelectItem value="publish">Published</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <div className="text-[10.5px] font-medium text-slate-600 uppercase tracking-wider mb-1">Link to AA doctor</div>
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
                    <div className="text-[10px] text-emerald-700 flex items-center gap-1 mt-1">
                      <Link2 className="h-2.5 w-2.5" /> Currently linked to <span className="font-mono">{candidate.doctor_id}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Right detail pane ────────────────────────────────────── */}
            <div className="space-y-5">
              <div>
                {/* WP post title — editable */}
                <EditableText
                  value={candidate.title}
                  onSave={v => saveTitle(v ?? "")}
                  placeholder="Add a heading…"
                  className="text-[22px] md:text-[26px] font-semibold text-slate-900 leading-tight block"
                  hoverClass="hover:bg-slate-100/70"
                />

                <p className="mt-3 text-[14px] text-slate-600">Specific areas of interests within the specialization</p>
                <div className="mt-1 h-px bg-gradient-to-r from-teal-300 to-transparent" />
                <EditableText
                  value={candidate.area_of_interest}
                  onSave={v => saveAcf({ specific_areas_of_interests_within_the_specialization: v ?? "" })}
                  placeholder="Add areas of interest…"
                  className="text-[13px] text-slate-700 mt-2 block"
                  multiline
                />
              </div>

              {/* Stat tile grid — every tile is inline-editable */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-4">
                <EditableTile icon={<Globe className="h-4 w-4" />} label="Nationality"
                  value={candidate.nationality}
                  onSave={v => saveAcf({ nationality: v ?? "" })} />
                <EditableTile icon={<Calendar className="h-4 w-4" />} label="Date of Birth"
                  value={candidate.date_of_birth}
                  display={prettyDate(candidate.date_of_birth)}
                  hint="YYYYMMDD or YYYY-MM-DD"
                  onSave={v => saveAcf({ date_of_birth: v ?? "" })} />
                <EditableTile icon={<Stethoscope className="h-4 w-4" />} label="Specialty"
                  value={candidate.specialty}
                  onSave={v => saveAcf({ specialty: v ?? "" })} />
                <EditableTile icon={<Stethoscope className="h-4 w-4" />} label="Subspecialty"
                  value={candidate.subspecialty}
                  onSave={v => saveAcf({ subspecialty: v ?? "" })} />
                <EditableTile icon={<BadgeCheck className="h-4 w-4" />} label="Specialist / Consultant"
                  value={candidate.rank}
                  onSave={v => saveAcf({ specialist__consultant: v ?? "" })} />
                <EditableTile icon={<CalendarDays className="h-4 w-4" />} label="Years of Experience"
                  value={candidate.years_experience != null ? String(candidate.years_experience) : null}
                  display={candidate.years_experience != null ? `${candidate.years_experience} Years` : null}
                  onSave={v => saveAcf({ years_of_experience_post_specialization: v ?? "" })} />
                <EditableTile icon={<Award className="h-4 w-4" />} label="DHA / DOH / MOH / SCFHS / QCHP Licenses?"
                  value={candidate.license_status}
                  onSave={v => saveAcf({ dha__haad__moh_license: v ?? "" })} />
                <EditableTile icon={<ClockIcon className="h-4 w-4" />} label="Notice Period"
                  value={candidate.notice_period}
                  onSave={v => saveAcf({ notice_period: v ?? "" })} />
                <EditableTile icon={<MapPin className="h-4 w-4" />} label="Targeted Location"
                  value={(candidate.targeted_locations ?? []).join(", ") || null}
                  hint="Comma-separated"
                  onSave={v => saveAcf({ targeted_locations: v ? v.split(",").map(s => s.trim()).filter(Boolean) : [] })} />
                <EditableTile icon={<LanguagesIcon className="h-4 w-4" />} label="Languages"
                  value={candidate.languages}
                  onSave={v => saveAcf({ languages: v ?? "" })} />
                <EditableTile icon={<LanguagesIcon className="h-4 w-4" />} label="English Level"
                  value={candidate.english_level}
                  onSave={v => saveAcf({ english_level: v ?? "" })} />
                <EditableTile icon={<UsersIcon className="h-4 w-4" />} label="Family Status"
                  value={candidate.family_status}
                  onSave={v => saveAcf({ family_status: v ?? "" })} />
                <EditableTileSelect icon={<Baby className="h-4 w-4" />} label="Have Children / Dependent"
                  value={candidate.has_dependents == null ? UNSET : (candidate.has_dependents ? "Yes" : "No")}
                  options={[{ value: UNSET, label: "—" }, { value: "Yes", label: "Yes" }, { value: "No", label: "No" }]}
                  onSave={v => saveAcf({ have_children_or_any_dependent: v === UNSET ? "" : v })} />
                <EditableTile icon={<MapPin className="h-4 w-4" />} label="Country of Training"
                  value={candidate.country_of_training}
                  onSave={v => saveAcf({ country_of_training: v ?? "" })} />
                <EditableTile icon={<MapPin className="h-4 w-4" />} label="Current Location"
                  value={candidate.current_location}
                  onSave={v => saveAcf({ current_location: v ?? "" })} />
                <EditableTile icon={<Award className="h-4 w-4" />} label="License type tags"
                  value={(candidate.license_types ?? []).join(", ") || null}
                  hint="DHA, DOH, MOH, …"
                  onSave={v => saveAcf({ license_type: v ? v.split(",").map(s => s.trim()).filter(Boolean) : [] })} />
                <EditableTile icon={<CalendarDays className="h-4 w-4" />} label="Current Salary"
                  value={candidate.current_salary}
                  onSave={v => saveAcf({ current_salary: v ?? "" })} />
                <EditableTile icon={<CalendarDays className="h-4 w-4" />} label="Expected Salary"
                  value={candidate.expected_salary}
                  onSave={v => saveAcf({ expected_salary: v ?? "" })} />
              </div>

              {/* Education / Experience — always visible so you can fill
                  them in inline. Each subfield is its own editable. */}
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="grid grid-cols-2">
                  <TabBtn active={tab === "education"}  onClick={() => setTab("education")}>Education</TabBtn>
                  <TabBtn active={tab === "experience"} onClick={() => setTab("experience")}>Experience</TabBtn>
                </div>
                <div className="p-5 bg-white space-y-2">
                  {tab === "education" && (
                    <EditableTimelineEntry
                      leadIcon={<GraduationCap className="h-4 w-4 text-teal-600" />}
                      leadLabel="Specialty Training:"
                      title={candidate.education_title}
                      org={candidate.education_academy}
                      start={candidate.education_start}
                      end={candidate.education_end}
                      present={candidate.education_present}
                      description={candidate.education_description}
                      onSave={(patch) => saveAcf({
                        title1:        patch.title       ?? candidate.education_title       ?? "",
                        academy1:      patch.org         ?? candidate.education_academy     ?? "",
                        start_date1:   patch.start       ?? candidate.education_start       ?? "",
                        end_date1:     patch.end         ?? candidate.education_end         ?? "",
                        present1:      (patch.present !== undefined ? patch.present : candidate.education_present) ? "Yes" : "No",
                        description1:  patch.description ?? candidate.education_description ?? "",
                      })}
                    />
                  )}
                  {tab === "experience" && (
                    <EditableTimelineEntry
                      leadIcon={<Briefcase className="h-4 w-4 text-teal-600" />}
                      leadLabel="Role:"
                      title={candidate.experience_title}
                      org={candidate.experience_company}
                      start={candidate.experience_start}
                      end={candidate.experience_end}
                      present={candidate.experience_present}
                      description={candidate.experience_description}
                      onSave={(patch) => saveAcf({
                        title2:        patch.title       ?? candidate.experience_title       ?? "",
                        company2:      patch.org         ?? candidate.experience_company     ?? "",
                        start_date_2:  patch.start       ?? candidate.experience_start       ?? "",
                        end_date2:     patch.end         ?? candidate.experience_end         ?? "",
                        present2:      (patch.present !== undefined ? patch.present : candidate.experience_present) ? "Yes" : "No",
                        description2:  patch.description ?? candidate.experience_description ?? "",
                      })}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── inline-edit primitives ───────────────────────────────────────────

/** Sentinel value used by EditableTileSelect when "unset" is one of the
 *  options. Radix's <Select.Item value="" /> isn't legal — value must be
 *  a non-empty string — so we map "" ↔ this sentinel at the boundary. */
const UNSET = "__unset__";

/** Click-to-edit single-line (or multi-line) text. Auto-saves on blur,
 *  Enter, or click-outside; Esc reverts. Shows a tiny saving spinner +
 *  green check after a successful save, red dot on error. */
function EditableText({
  value, onSave, placeholder, className, hoverClass, multiline,
}: {
  value: string | null;
  onSave: (v: string | null) => Promise<void>;
  placeholder?: string;
  className?: string;
  hoverClass?: string;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(value ?? "");
  const [state,   setState]   = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => { setDraft(value ?? ""); }, [value]);

  const commit = async () => {
    setEditing(false);
    const next = draft.trim();
    if ((next || null) === (value ?? null) || (next === "" && (value == null || value === ""))) {
      // No-op
      return;
    }
    setState("saving");
    try {
      await onSave(next === "" ? null : next);
      setState("saved");
      setTimeout(() => setState("idle"), 1200);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 3000);
    }
  };

  if (editing) {
    return multiline ? (
      <Textarea
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); } }}
        rows={3}
        className={`text-[13px] ${className ?? ""}`}
      />
    ) : (
      <Input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          else if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); }
        }}
        className={`h-8 text-[13px] ${className ?? ""}`}
      />
    );
  }

  const empty = value == null || value === "";
  // Two affordances combined:
  //   1. A faint emerald background that brightens on hover, with a tiny
  //      pencil that fades in. Tells the user the value is interactive.
  //   2. An empty value gets a dashed emerald outline + a more prominent
  //      "Click to add …" so blank fields read as a TODO rather than
  //      just absent data.
  // The teal sidebar passes a custom hoverClass so the highlight stays
  // visible against the dark background — emerald-on-teal vanishes,
  // white/15 doesn't.
  const baseHover = hoverClass ?? "hover:bg-emerald-50 hover:ring-emerald-300";
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditing(true); } }}
      className={`group/edit relative rounded px-1.5 -mx-1.5 py-0.5 cursor-text inline-flex items-center gap-1 ring-1 transition-all duration-150 ${
        empty
          ? "ring-emerald-300/70 bg-emerald-50/40 hover:bg-emerald-100/60 [border-style:dashed]"
          : `ring-transparent ${baseHover}`
      } ${className ?? ""}`}
    >
      {empty
        ? <span className="text-emerald-700/80 italic font-normal">{placeholder ?? "Click to add"}</span>
        : <span className="whitespace-pre-wrap">{value}</span>}
      {/* Pencil affordance — appears on hover when there's a value. For
          empty fields the placeholder text already prompts the action. */}
      {!empty && state === "idle" && (
        <Pencil className="h-3 w-3 opacity-0 group-hover/edit:opacity-60 transition-opacity shrink-0" />
      )}
      <SaveIndicator state={state} />
    </span>
  );
}

/** Same affordance as the icon-tile labelled fields on the right pane —
 *  icon + label + editable value. */
function EditableTile({
  icon, label, value, display, hint, onSave,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  display?: string | null;       // optional formatted view for the display state
  hint?: string;                  // shown as placeholder when empty
  onSave: (v: string | null) => Promise<void>;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="h-9 w-9 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-slate-500">{label}</div>
        <div className="text-[13px] mt-0.5 text-slate-800 break-words">
          <EditableText
            value={value}
            onSave={onSave}
            placeholder={hint ?? `Add ${label.toLowerCase()}…`}
            className="block"
          />
          {display && value && display !== value && (
            <span className="text-[10.5px] text-slate-400 ml-1">({display})</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Select variant of the tile — used for Yes/No/— style fields. */
function EditableTileSelect({
  icon, label, value, options, onSave,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onSave: (v: string) => Promise<void>;
}) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const handle = async (v: string) => {
    if (v === value) return;
    setState("saving");
    try {
      await onSave(v);
      setState("saved");
      setTimeout(() => setState("idle"), 1200);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 3000);
    }
  };
  return (
    <div className="flex items-start gap-3">
      <div className="h-9 w-9 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-slate-500 flex items-center gap-1">{label} <SaveIndicator state={state} /></div>
        <Select value={value} onValueChange={handle}>
          <SelectTrigger className="h-8 mt-0.5 text-[12px] bg-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/** Phone / email contact row inside the teal sidebar — editable. */
function ContactLineEditable({
  icon, value, placeholder, onSave,
}: {
  icon: React.ReactNode;
  value: string | null;
  placeholder: string;
  onSave: (v: string | null) => Promise<void>;
}) {
  return (
    <div className="flex items-center justify-center gap-2 text-white/95">
      <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-white/15">{icon}</span>
      <EditableText
        value={value}
        onSave={onSave}
        placeholder={placeholder}
        className="text-[12px] text-white/95"
        hoverClass="hover:bg-white/25 hover:ring-white/40"
      />
    </div>
  );
}

/** Tiny status dot rendered next to a value. idle = nothing, saving =
 *  spinner, saved = green check (1s), error = red alert. */
function SaveIndicator({ state }: { state: "idle" | "saving" | "saved" | "error" }) {
  if (state === "idle")   return null;
  if (state === "saving") return <Loader2 className="inline h-3 w-3 ml-1.5 animate-spin opacity-70" />;
  if (state === "saved")  return <Check    className="inline h-3 w-3 ml-1.5 text-emerald-600" />;
  return <AlertCircle className="inline h-3 w-3 ml-1.5 text-red-500" />;
}

/** Editable Education / Experience entry. */
function EditableTimelineEntry({
  leadIcon, leadLabel, title, org, start, end, present, description, onSave,
}: {
  leadIcon: React.ReactNode;
  leadLabel: string;
  title: string | null;
  org: string | null;
  start: string | null;
  end: string | null;
  present: boolean | null;
  description: string | null;
  onSave: (patch: { title?: string; org?: string; start?: string; end?: string; present?: boolean; description?: string }) => Promise<void>;
}) {
  return (
    <div className="space-y-1.5 text-[13px]">
      <div className="text-[15px] text-slate-900 leading-snug">
        <span className="inline-flex items-center gap-1.5 font-semibold mr-1">{leadIcon}{leadLabel}</span>
        <EditableText
          value={title}
          onSave={v => onSave({ title: v ?? "" })}
          placeholder="Add title…"
          className="text-[15px] text-slate-900"
        />
      </div>
      <div className="text-[14px] text-teal-600 font-medium">
        <EditableText
          value={org}
          onSave={v => onSave({ org: v ?? "" })}
          placeholder="Add organisation…"
          className="text-[14px] text-teal-600 font-medium"
          hoverClass="hover:bg-teal-50"
        />
      </div>
      <div className="text-[12px] text-slate-500 flex items-center gap-2 flex-wrap">
        <EditableText
          value={start}
          onSave={v => onSave({ start: v ?? "" })}
          placeholder="Start (YYYYMMDD)"
          className="text-[12px] text-slate-500"
        />
        <span>–</span>
        {present ? (
          <span>Present</span>
        ) : (
          <EditableText
            value={end}
            onSave={v => onSave({ end: v ?? "" })}
            placeholder="End (YYYYMMDD)"
            className="text-[12px] text-slate-500"
          />
        )}
        <label className="inline-flex items-center gap-1 text-[11px] text-slate-600 ml-2">
          <input type="checkbox" checked={!!present} onChange={e => onSave({ present: e.target.checked })} />
          Currently {leadLabel.toLowerCase().includes("training") ? "studying" : "working"}
        </label>
      </div>
      <div className="text-[12.5px] text-slate-700 mt-2">
        <span className="font-medium mr-1">Description:</span>
        <EditableText
          value={description}
          onSave={v => onSave({ description: v ?? "" })}
          placeholder="Add description…"
          className="text-[12.5px] text-slate-700"
          multiline
        />
      </div>
    </div>
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

// ─── small formatters ─────────────────────────────────────────────────

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
