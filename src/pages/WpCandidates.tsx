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
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  UserSquare, Search, RefreshCw, ExternalLink, ArrowUpRight, FileText, Link2,
  History,
  Phone, Mail, IdCard, MapPin, Stethoscope, BadgeCheck, Calendar, CalendarDays,
  Briefcase, Award, Globe, Languages as LanguagesIcon, Users as UsersIcon,
  Baby, Clock as ClockIcon, GraduationCap,
} from "lucide-react";
import {
  useWpCandidates, useSyncWpCandidates, useLinkWpCandidate,
  useUpsertWpCandidate, useUploadWpPhoto, useDeleteWpCandidate,
  useStagedProfiles, useDeleteStagedProfile, usePublishStagedProfile, useUpdateStagedProfile,
  useWpCandidateById,
  type WpCandidate, type StagedProfile, type StagedProfileInput,
} from "@/hooks/use-wp-candidates";
import { toast } from "sonner";
import { Plus, Camera, Loader2, Check, AlertCircle, Pencil, Trash2, Send, Sparkles } from "lucide-react";
import { EmailChainPreviewDialog } from "@/components/EmailChainPreviewDialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface WpCandidatesProps { embedded?: boolean }

export default function WpCandidates({ embedded }: WpCandidatesProps = {}) {
  const { data: candidates = [], isLoading } = useWpCandidates();
  const sync = useSyncWpCandidates();
  const upsert = useUpsertWpCandidate();
  const [openDetailId, setOpenDetailId] = useState<number | null>(null);
  // Deep-link support: when Forms (or anything else) navigates here
  // with ?open=<wp_id>, auto-open that profile's detail dialog so the
  // user lands directly in the inline editor instead of having to
  // find + click the row.
  const [searchParamsForDeepLink] = useSearchParams();
  useEffect(() => {
    const raw = searchParamsForDeepLink.get("open");
    const id  = raw ? Number(raw) : NaN;
    if (Number.isFinite(id) && id > 0 && openDetailId !== id) {
      setOpenDetailId(id);
    }
    // Only react to the param changing — not to user-driven close.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParamsForDeepLink]);

  // Click "New profile" → POST a draft to WP immediately, then open the
  // detail dialog on the new row. The detail dialog is fully inline-
  // editable, so the user just fills in the empty fields from there.
  const handleNewProfile = async () => {
    try {
      const r = await upsert.mutateAsync({
        status: "draft",
        title: "New profile",
        acf: { full_name: "New profile" },
        // Allowed-create intent — explicit user click on "New profile".
        intent: "manual_create",
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
  const sentinelRef = useRef<HTMLDivElement | null>(null);

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

  // Infinite scroll — when the sentinel below the last row scrolls into
  // view, bump the window by 100. Same pattern the Doctor Progress
  // pipeline uses, just lazier (no network round-trip; we already have
  // every row in memory). 200px rootMargin so we start rendering the
  // next batch slightly before the user reaches the bottom — avoids a
  // visible "Loading…" flicker on fast scrolls.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) setRenderLimit(n => n + 100);
      }
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [sentinelRef.current, renderLimit]);

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

        {/* Staging area — profiles staged from JotForm but not yet
            pushed to WordPress. Only renders when there's something to
            show so the published list stays the default view. */}
        <StagingSection />

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
                {/* Sentinel — when this scrolls into view (200px before
                    actually), bump the render window by 100. Once we're
                    past the end, render a quiet 'All loaded' line. */}
                {filtered.length > renderLimit ? (
                  <div ref={sentinelRef} className="w-full py-3 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading more · {filtered.length - renderLimit} remaining
                  </div>
                ) : filtered.length > 60 ? (
                  <div className="w-full py-3 text-center text-[10px] text-muted-foreground/70">
                    All {filtered.length.toLocaleString()} loaded
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>
  );

  // The detail dialog reads its candidate from the cached list when
  // possible (fast — no extra round trip). If the row isn't there yet
  // — common when we deep-link from Slack moments after the upsert,
  // before the 1.2k-row pagination has finished — we fall back to a
  // direct-by-ID fetch so the dialog opens immediately instead of
  // hanging on "Loading profile…" forever.
  const cachedCandidate = openDetailId != null
    ? candidates.find(c => c.id === openDetailId) ?? null
    : null;
  const { data: fetchedCandidate } = useWpCandidateById(
    openDetailId != null && !cachedCandidate ? openDetailId : null,
  );
  const detailCandidate = cachedCandidate ?? fetchedCandidate ?? null;
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
  const del = useDeleteWpCandidate();

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const label = candidate.full_name ?? candidate.title ?? `WP candidate #${candidate.id}`;
    if (!confirm(`Delete "${label}" from WordPress?\n\nThis removes the post on the live site AND the dashboard mirror. Cannot be undone.`)) return;
    try {
      await del.mutateAsync(candidate.id);
      toast.success(`Deleted ${label}`);
    } catch (err) {
      toast.error("Couldn't delete", { description: (err as Error).message });
    }
  };

  return (
    <div className="rounded-md border bg-white flex items-stretch">
      <button
        type="button"
        onClick={onOpen}
        className="flex-1 min-w-0 flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50"
      >
        {/* Opens the centered profile dialog — arrow points outward
            so it reads "pop out" instead of the old chevron's
            "drill down". */}
        <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
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
      {/* Delete sits outside the row-click button so it doesn't open the
          detail dialog. Confirms before firing — this hits WP for real. */}
      <button
        type="button"
        onClick={handleDelete}
        disabled={del.isPending}
        title="Delete from WordPress (and remove from the dashboard mirror)"
        className="shrink-0 w-9 flex items-center justify-center text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors border-l border-slate-100 disabled:opacity-50"
      >
        {del.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      </button>
    </div>
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
                    value={formatPhone(candidate.phone)}
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
                {/* Status-aware label: only call it 'View on WordPress'
                    (i.e. the public allocationassist.com page) when the
                    candidate is actually published. Drafts + private
                    posts get 'Open in WP admin' because that's where
                    they're editable; the public URL would just 404. */}
                {(() => {
                  const published = candidate.status === "publish";
                  const href = published
                    ? candidate.wp_link
                    : `https://www.allocationassist.com/wp-admin/post.php?action=edit&post=${candidate.id}`;
                  const label = published ? "View on allocationassist.com" : "Open in WP admin (draft)";
                  return (
                    <a href={href} target="_blank" rel="noreferrer" className="block">
                      <Button variant="outline" className="w-full justify-center h-10 rounded-full border-teal-200 text-teal-700 hover:bg-teal-50">
                        <ExternalLink className="h-4 w-4 mr-2" /> {label}
                      </Button>
                    </a>
                  );
                })()}
                {candidate.email && (
                  <a href={`mailto:${candidate.email}`} className="block">
                    <Button className="w-full justify-center h-10 rounded-full bg-slate-900 hover:bg-slate-800">
                      <Mail className="h-4 w-4 mr-2" /> Contact
                    </Button>
                  </a>
                )}
                <DeleteCandidateButton candidate={candidate} onDone={onClose} />
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

/* ─────────────────────────────────────────────────────────────────────
 * Staging section — profiles awaiting Draft / Publish.
 *
 * Sits above the published-candidates list. Hidden when empty so the
 * primary list stays the default view; expands with a count badge in
 * the header when there's queued work.
 * ─────────────────────────────────────────────────────────────────── */

function StagingSection() {
  const { data: staged = [] } = useStagedProfiles();
  if (staged.length === 0) return null;
  return (
    <Card className="border-amber-200/60 bg-amber-50/30">
      <CardContent className="pt-3 pb-3 space-y-2">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-amber-900/70 font-semibold">
          <FileText className="h-3.5 w-3.5" />
          Staging — {staged.length} profile{staged.length === 1 ? "" : "s"} awaiting review
        </div>
        <p className="text-[10px] text-muted-foreground -mt-0.5">
          Imported from JotForm. Pick Publish or Save as draft to push them to WordPress, or discard.
        </p>
        <div className="space-y-1.5">
          {staged.map(s => <StagedRow key={s.id} profile={s} />)}
        </div>
      </CardContent>
    </Card>
  );
}

function StagedRow({ profile }: { profile: StagedProfile }) {
  const publish = usePublishStagedProfile();
  const del     = useDeleteStagedProfile();
  const [detailOpen, setDetailOpen] = useState(false);
  const subtitle = [profile.specialty, profile.country_of_training, profile.current_location]
    .filter(Boolean).join(" · ");

  const handlePublish = async (status: "draft" | "publish") => {
    try {
      await publish.mutateAsync({ profile, status });
      toast.success(status === "publish" ? "Published to WordPress" : "Saved as WordPress draft");
    } catch (e) {
      toast.error("Couldn't push to WordPress", { description: (e as Error).message });
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Discard staged profile for ${profile.full_name ?? profile.email ?? "this submission"}? This doesn't touch WordPress.`)) return;
    try {
      await del.mutateAsync(profile.id);
      toast.success("Staged profile discarded");
    } catch (e) {
      toast.error("Couldn't discard", { description: (e as Error).message });
    }
  };

  const pending = publish.isPending || del.isPending;

  // CV status indicator — extracted_cv_data fills once the async
  // cv-extract pass finishes. We show it as a chip so the team knows
  // there are extra fields ready to merge when they click Publish.
  const hasCv = !!profile.extracted_cv_data && Object.keys(profile.extracted_cv_data ?? {}).length > 0;
  const hasPicture = !!profile.picture_url;

  return (
    <>
    <div
      className="rounded-md border border-amber-200/70 bg-white px-3 py-2 flex items-center gap-3 hover:bg-amber-50/50 transition-colors cursor-pointer"
      onClick={() => setDetailOpen(true)}
      title="Click to preview the merged data before publishing"
    >
      <Avatar
        src={buildPhotoProxyUrl(profile.picture_url, profile.form_id)}
        name={profile.full_name ?? profile.email ?? "?"}
        size={28}
      />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium text-slate-800 truncate">
          {profile.full_name ?? profile.email ?? "Unnamed submission"}
        </div>
        <div className="text-[10px] text-muted-foreground truncate">
          {subtitle || profile.email || "—"}
        </div>
      </div>
      {/* Status chips: 'not on WP' makes it unmissable that this row
          hasn't been pushed yet, even when scanning the list at a
          glance. 'CV parsed' appears once cv-extract finishes so the
          team knows the Publish click will splice in extra fields. */}
      <Badge variant="outline" className="text-[9px] bg-slate-100 text-slate-600 border-slate-200 shrink-0" title="Not yet on WordPress. Hit Publish or Save as draft to push.">
        not on WP
      </Badge>
      {hasPicture && (
        <Badge variant="outline" className="text-[9px] bg-blue-50 text-blue-700 border-blue-200 shrink-0" title="Profile picture captured from JotForm. Will upload to WP on Publish.">
          + photo
        </Badge>
      )}
      {hasCv && (
        <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200 shrink-0" title="CV extracted — bio, license, years of experience etc. will merge into WP on Publish.">
          + CV parsed
        </Badge>
      )}
      <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[10px]"
          onClick={() => handlePublish("draft")}
          disabled={pending}
          title="Push to WordPress as a draft — visible only to WP admin"
        >
          {publish.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <FileText className="h-3 w-3 mr-1" />}
          Save as draft
        </Button>
        <Button
          size="sm"
          className="h-7 text-[10px]"
          onClick={() => handlePublish("publish")}
          disabled={pending}
          title="Publish live on allocationassist.com"
        >
          {publish.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
          Publish
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-[10px] text-rose-600 hover:bg-rose-50"
          onClick={handleDelete}
          disabled={pending}
          title="Discard this staged profile. Doesn't touch WordPress."
        >
          {del.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
        </Button>
      </div>
    </div>
    {/* Render the preview dialog OUTSIDE the clickable row. Radix
        Dialog uses a Portal at the DOM level, but React events still
        bubble up the React component tree — clicking Close inside a
        dialog rendered inside the row was bubbling back to the row's
        onClick and re-opening itself. Sibling-of-row placement breaks
        that loop entirely. */}
    <StagedProfileDetailDialog
      profile={profile}
      open={detailOpen}
      onOpenChange={setDetailOpen}
      onPublish={() => { setDetailOpen(false); handlePublish("publish"); }}
      onSaveDraft={() => { setDetailOpen(false); handlePublish("draft"); }}
      onDelete={() => { setDetailOpen(false); handleDelete(); }}
    />
    </>
  );
}

/** Rich, read-only preview of a staged profile that mirrors the WP
 *  candidate dialog's two-column layout: teal avatar card on the left
 *  (photo, name, job title, age, phone, email, the merged ACF
 *  recruiter/lead-source breadcrumbs) and a tiled stat grid + Education
 *  / Experience tabs on the right. Looking exactly like what the
 *  candidate will look like on WordPress was the user's ask — this is
 *  it, just before the Publish click. */
function StagedProfileDetailDialog({
  profile, open, onOpenChange, onPublish, onSaveDraft, onDelete,
}: {
  profile: StagedProfile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPublish:    () => void;
  onSaveDraft:  () => void;
  onDelete:     () => void;
}) {
  const acf = (profile.acf ?? {}) as Record<string, unknown>;
  const cv  = (profile.extracted_cv_data ?? {}) as Record<string, unknown>;
  const [tab, setTab] = useState<"education" | "experience">("education");
  const update = useUpdateStagedProfile();
  const [chainOpen, setChainOpen] = useState(false);

  // Save handler. Writes acf[key] = value AND mirrors the flat
  // denormalised column (specialty, full_name, phone, etc.) so the
  // staging-list row reflects the edit too. Returns a Promise so
  // EditableText can show its saving/saved spinner.
  const saveAcf = async (patch: Record<string, unknown>): Promise<void> => {
    const FLAT_MAP: Record<string, string> = {
      full_name:           "full_name",
      email:               "email",
      phone_number:        "phone",
      specialty:           "specialty",
      subspecialty:        "subspecialty",
      nationality:         "nationality",
      job_title:           "job_title",
      current_location:    "current_location",
      country_of_training: "country_of_training",
      years_of_experience_post_specialization: "years_experience",
    };
    const nextAcf = { ...acf, ...patch };
    // Strip empty strings so the row stays clean.
    for (const k of Object.keys(patch)) {
      if (nextAcf[k] === "") delete nextAcf[k];
    }
    const flatPatch: Record<string, unknown> = { acf: nextAcf };
    for (const [acfKey, flatCol] of Object.entries(FLAT_MAP)) {
      if (acfKey in patch) {
        const v = patch[acfKey];
        flatPatch[flatCol] = v === "" ? null : v;
      }
    }
    await update.mutateAsync({ id: profile.id, patch: flatPatch as Partial<StagedProfileInput> });
  };

  const get = (k: string): string | null => {
    const v = acf[k];
    if (v === null || v === undefined || v === "") return null;
    return typeof v === "string" ? v : String(v);
  };
  const getList = (k: string): string[] => {
    const v = acf[k];
    if (Array.isArray(v)) return v.filter(x => x != null && x !== "").map(String);
    if (typeof v === "string" && v.trim()) return v.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
    return [];
  };

  const fullName = profile.full_name ?? get("full_name") ?? profile.email ?? "Unnamed";
  const jobTitle = get("job_title");
  const ageVal   = get("age");
  const phone    = profile.phone ?? get("phone_number");
  const email    = profile.email ?? get("email");
  const recruiter   = get("recruiter");
  const leadSource  = get("lead_source");
  // Route the JotForm /widget-uploads/ URL through our edge proxy so
  // the APIKEY auth happens server-side AND the response comes back
  // with image/jpeg (raw GET against the imagepreview URL returns an
  // HTML wrapper page that browsers won't render in an <img>).
  const photoSrc = buildPhotoProxyUrl(profile.picture_url, profile.form_id);
  const bio      = get("bio");
  const areas    = get("specific_areas_of_interests_within_the_specialization");

  // Has-children: a bool, a string ("Yes"/"No"), or absent.
  const childrenVal = acf.have_children_or_any_dependent;
  const childrenStr =
      childrenVal === true || childrenVal === "Yes" ? "Yes"
    : childrenVal === false || childrenVal === "No" ? "No"
    : null;

  // Education / Experience entries — drawn from the CV-extracted
  // arrays AND/OR the per-slot ACF fields (title1/academy1 etc.)
  // that enrich-profile may have populated. CV array wins because
  // it's the canonical source; the slots are a fallback.
  type Entry = { title: string | null; org: string | null; start: string | null; end: string | null; present: boolean; description: string | null };
  const cvEdu = (Array.isArray(cv.education) ? cv.education : []) as Array<{ institution?: string; degree?: string; start?: string | number; end?: string | number; description?: string }>;
  const cvExp = (Array.isArray(cv.experience) ? cv.experience : []) as Array<{ company?: string;     title?:  string; start?: string | number; end?: string | number; description?: string }>;

  const slotEdu: Entry[] = ["1", "2"].map(n => ({
    title:       get(`title${n}`),
    org:         get(`academy${n}`),
    start:       get(`start_date${n}`),
    end:         get(`end_date${n}`),
    present:     acf[`present${n}`] === true,
    description: get(`description${n}`),
  })).filter(e => e.title || e.org || e.description);

  const slotExp: Entry[] = ["1", "2"].map(n => ({
    title:       get(`experience_title${n}`),
    org:         get(`experience_company${n}`),
    start:       get(`experience_start${n}`),
    end:         get(`experience_end${n}`),
    present:     acf[`experience_present${n}`] === true,
    description: get(`experience_description${n}`),
  })).filter(e => e.title || e.org || e.description);

  const education: Entry[] = cvEdu.length > 0
    ? cvEdu.map(e => ({
        title: e.degree ?? null, org: e.institution ?? null,
        start: e.start != null ? String(e.start) : null,
        end:   e.end != null && !/present|current/i.test(String(e.end)) ? String(e.end) : null,
        present: !!(e.end && /present|current/i.test(String(e.end))),
        description: e.description ?? null,
      }))
    : slotEdu;
  const experience: Entry[] = cvExp.length > 0
    ? cvExp.map(x => ({
        title: x.title ?? null, org: x.company ?? null,
        start: x.start != null ? String(x.start) : null,
        end:   x.end != null && !/present|current/i.test(String(x.end)) ? String(x.end) : null,
        present: !!(x.end && /present|current/i.test(String(x.end))),
        description: x.description ?? null,
      }))
    : slotExp;

  const memberSince = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;

  const heading = jobTitle ? `${fullName} – ${jobTitle}` : fullName;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1100px] w-[96vw] max-h-[92vh] overflow-y-auto p-0">
        {/* The teal-on-white WP candidate profile dialog, ported to
            staging. Same component shape (no inline edits — this is a
            preview), same icons, same tabs. */}
        <DialogHeader className="px-7 pt-6 pb-1">
          <DialogTitle className="text-[22px] md:text-[24px] font-semibold text-slate-900 leading-tight">{heading}</DialogTitle>
          <DialogDescription className="sr-only">Preview the staged profile before publishing to WordPress.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-[300px,1fr] gap-6 px-7 pb-4 pt-2">
          {/* ── Left: teal avatar card ─────────────────────────────────── */}
          <div className="space-y-3">
            <div className="rounded-2xl bg-gradient-to-b from-teal-400 to-teal-500 text-white p-6 text-center shadow-sm">
              <div className="mx-auto h-40 w-40 rounded-full bg-white ring-4 ring-white/40 overflow-hidden flex items-center justify-center">
                {photoSrc ? (
                  <img
                    src={photoSrc}
                    alt={fullName}
                    className="h-full w-full object-cover"
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <Avatar src={null} name={fullName} size={160} />
                )}
              </div>
              <div className="mt-4 text-[19px] font-semibold leading-tight">
                <EditableText
                  value={fullName}
                  onSave={v => saveAcf({ full_name: v ?? "" })}
                  placeholder="Add full name…"
                  className="text-white"
                  hoverClass="hover:bg-white/25 hover:ring-white/40"
                />
              </div>
              <div className="mt-1 text-[12.5px] text-white/95">
                <EditableText
                  value={jobTitle}
                  onSave={v => saveAcf({ job_title: v ?? "" })}
                  placeholder="Add job title…"
                  className="text-white/95"
                  hoverClass="hover:bg-white/25 hover:ring-white/40"
                />
              </div>
              {memberSince && (
                <div className="inline-flex mt-3 text-[10.5px] bg-white/15 rounded-full px-2.5 py-0.5">
                  Member Since: {memberSince}
                </div>
              )}
              <div className="my-5 border-t border-white/25" />
              <div className="space-y-2.5 text-[12.5px]">
                {ageVal && <div>Age: {ageVal} Years Old</div>}
                <div className="flex items-center justify-center gap-2">
                  <Phone className="h-3.5 w-3.5" />
                  <EditableText
                    value={phone}
                    onSave={v => saveAcf({ phone_number: v ?? "" })}
                    placeholder="Add phone…"
                    className="text-white"
                    hoverClass="hover:bg-white/25 hover:ring-white/40"
                  />
                </div>
                <div className="flex items-center justify-center gap-2 break-all">
                  <Mail className="h-3.5 w-3.5" />
                  <EditableText
                    value={email}
                    onSave={v => saveAcf({ email: v ?? "" })}
                    placeholder="Add email…"
                    className="text-white"
                    hoverClass="hover:bg-white/25 hover:ring-white/40"
                  />
                </div>
              </div>
            </div>

            {(recruiter || leadSource) && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 space-y-1 text-[11px]">
                {recruiter  && <div><span className="text-muted-foreground">Recruiter:</span> <span className="font-medium">{recruiter}</span></div>}
                {leadSource && <div><span className="text-muted-foreground">Lead source:</span> <span className="font-medium">{leadSource}</span></div>}
              </div>
            )}

            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">not on WP</Badge>
              {photoSrc && <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">+ photo</Badge>}
              {Object.keys(cv).length > 0 && <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">+ CV parsed</Badge>}
            </div>
          </div>

          {/* ── Right: areas of interest + tile grid + Edu/Exp tabs ─── */}
          <div className="space-y-5 min-w-0">
            <div>
              <p className="text-[13.5px] text-slate-500">Specific areas of interest within the specialization</p>
              <div className="mt-1 h-px bg-gradient-to-r from-teal-300 to-transparent" />
              <div className="mt-3">
                {/* Bio with AI-shorten affordance. Clicking the bio
                    text opens the inline textarea; clicking the
                    purple ✨ button opens the Shorten menu. */}
                <EditableText
                  value={bio}
                  onSave={v => saveAcf({ bio: v ?? "" })}
                  placeholder="Click to add bio…"
                  className="text-[13.5px] text-slate-800 leading-relaxed block"
                  multiline
                />
                <AiBioMenu
                  bio={bio}
                  onApply={async (newBio) => { await saveAcf({ bio: newBio }); }}
                />
              </div>
              <div className="mt-3">
                <EditableText
                  value={areas}
                  onSave={v => saveAcf({ specific_areas_of_interests_within_the_specialization: v ?? "" })}
                  placeholder="Click to add areas of interest…"
                  className="text-[12.5px] text-slate-700 block"
                  multiline
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
              <EditableTile icon={<Globe className="h-4 w-4" />}        label="Nationality"            value={get("nationality")}                         onSave={v => saveAcf({ nationality: v ?? "" })} />
              <EditableTile icon={<Calendar className="h-4 w-4" />}     label="Date of Birth"          value={get("date_of_birth")}
                                                                                                       display={prettyDate(get("date_of_birth"))}
                                                                                                       hint="YYYY-MM-DD or YYYYMMDD"
                                                                                                       onSave={v => saveAcf({ date_of_birth: v ?? "" })} />
              <EditableTile icon={<Stethoscope className="h-4 w-4" />}  label="Specialty"              value={get("specialty")}                           onSave={v => saveAcf({ specialty: v ?? "" })} />
              <EditableTile icon={<Stethoscope className="h-4 w-4" />}  label="Subspecialty"           value={get("subspecialty")}                        onSave={v => saveAcf({ subspecialty: v ?? "" })} />
              <EditableTile icon={<BadgeCheck className="h-4 w-4" />}   label="Specialist / Consultant" value={get("specialist__consultant")}             onSave={v => saveAcf({ specialist__consultant: v ?? "" })} />
              <EditableTile icon={<CalendarDays className="h-4 w-4" />} label="Years of Experience"    value={get("years_of_experience_post_specialization")}
                                                                                                       display={get("years_of_experience_post_specialization") ? `${get("years_of_experience_post_specialization")} Years` : null}
                                                                                                       onSave={v => saveAcf({ years_of_experience_post_specialization: v ?? "" })} />
              <EditableTile icon={<Award className="h-4 w-4" />}        label="DHA / DOH / MOH / SCFHS / QCHP Licenses?" value={get("dha__haad__moh_license")} onSave={v => saveAcf({ dha__haad__moh_license: v ?? "" })} />
              <EditableTile icon={<ClockIcon className="h-4 w-4" />}    label="Notice Period"          value={get("notice_period")}                       onSave={v => saveAcf({ notice_period: v ?? "" })} />
              <EditableTile icon={<MapPin className="h-4 w-4" />}       label="Targeted Location"      value={getList("targeted_locations").join(", ") || null}
                                                                                                       hint="Comma-separated"
                                                                                                       onSave={v => saveAcf({ targeted_locations: v ? v.split(",").map(s => s.trim()).filter(Boolean) : [] })} />
              <EditableTile icon={<LanguagesIcon className="h-4 w-4" />} label="Languages"             value={get("languages")}                           onSave={v => saveAcf({ languages: v ?? "" })} />
              <EditableTile icon={<LanguagesIcon className="h-4 w-4" />} label="English Level"         value={get("english_level")}                       onSave={v => saveAcf({ english_level: v ?? "" })} />
              <EditableTile icon={<UsersIcon className="h-4 w-4" />}    label="Family Status"          value={get("family_status")}                       onSave={v => saveAcf({ family_status: v ?? "" })} />
              <EditableTileSelect icon={<Baby className="h-4 w-4" />}   label="Have Children / Dependent"
                                                                                                       value={childrenStr ?? UNSET}
                                                                                                       options={[{ value: UNSET, label: "—" }, { value: "Yes", label: "Yes" }, { value: "No", label: "No" }]}
                                                                                                       onSave={v => saveAcf({ have_children_or_any_dependent: v === UNSET ? "" : v })} />
              <EditableTile icon={<MapPin className="h-4 w-4" />}       label="Country of Training"    value={get("country_of_training")}                 onSave={v => saveAcf({ country_of_training: v ?? "" })} />
              <EditableTile icon={<MapPin className="h-4 w-4" />}       label="Current Location"       value={get("current_location")}                    onSave={v => saveAcf({ current_location: v ?? "" })} />
              <EditableTile icon={<Award className="h-4 w-4" />}        label="License type tags"
                                                                                                       value={getList("license_type").join(", ") || null}
                                                                                                       hint="DHA, DOH, MOH, …"
                                                                                                       onSave={v => saveAcf({ license_type: v ? v.split(",").map(s => s.trim()).filter(Boolean) : [] })} />
              <EditableTile icon={<CalendarDays className="h-4 w-4" />} label="Current Salary"         value={get("current_salary")}                      onSave={v => saveAcf({ current_salary: v ?? "" })} />
              <EditableTile icon={<CalendarDays className="h-4 w-4" />} label="Expected Salary"        value={get("expected_salary")}                     onSave={v => saveAcf({ expected_salary: v ?? "" })} />
            </div>

            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="grid grid-cols-2">
                <button
                  type="button"
                  className={`h-11 text-[12.5px] font-semibold tracking-wide uppercase ${tab === "education" ? "bg-teal-500 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}
                  onClick={() => setTab("education")}
                >Education</button>
                <button
                  type="button"
                  className={`h-11 text-[12.5px] font-semibold tracking-wide uppercase ${tab === "experience" ? "bg-teal-500 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}
                  onClick={() => setTab("experience")}
                >Experience</button>
              </div>
              <div className="p-5 bg-white space-y-4">
                {(tab === "education" ? education : experience).length === 0 ? (
                  <div className="text-[12px] text-muted-foreground py-2">
                    No {tab} entries detected. {Object.keys(cv).length === 0
                      ? "CV extraction hasn't finished yet — re-open in ~15s."
                      : "The CV didn't list any."}
                  </div>
                ) : (
                  (tab === "education" ? education : experience).map((entry, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <GraduationCap className="h-4 w-4 text-teal-600 mt-1 shrink-0" hidden={tab !== "education"} />
                      <Briefcase className="h-4 w-4 text-teal-600 mt-1 shrink-0" hidden={tab !== "experience"} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[12.5px] uppercase tracking-wide text-teal-700 font-semibold">
                          {tab === "education" ? "Specialty Training:" : "Role:"}
                        </div>
                        <div className="text-[14.5px] font-semibold text-slate-900 mt-0.5">{entry.title ?? "—"}</div>
                        {entry.org && <div className="text-[13px] text-teal-700 mt-0.5">{entry.org}</div>}
                        {(entry.start || entry.end || entry.present) && (
                          <div className="text-[11.5px] text-muted-foreground mt-1">
                            {entry.start ?? "—"} – {entry.present ? "Present" : (entry.end ?? "—")}
                          </div>
                        )}
                        {entry.description && <div className="text-[12px] text-slate-700 mt-1.5 leading-snug">{entry.description}</div>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Action bar — Delete (red), Save as draft (green primary,
            because that's the WP review state the team usually wants),
            Publish (outlined teal). Matches user spec: 'delete, draft
            on WP, publish on WP, with the draft being the one
            highlighted in green'. */}
        <DialogFooter className="px-7 py-4 border-t bg-slate-50/60 flex sm:justify-between gap-2">
          <Button
            variant="outline"
            className="border-rose-300 text-rose-700 hover:bg-rose-50"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4 mr-1.5" /> Delete
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="border-purple-300 text-purple-700 hover:bg-purple-50"
              onClick={() => setChainOpen(true)}
              title="See every email in the lifecycle, rendered with this doctor's data"
            >
              <Mail className="h-4 w-4 mr-1.5" /> Preview email chain
            </Button>
            <Button
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
              onClick={onSaveDraft}
            >
              <FileText className="h-4 w-4 mr-1.5" /> Save as Draft on WP
            </Button>
            <Button
              variant="outline"
              className="border-teal-300 text-teal-700 hover:bg-teal-50"
              onClick={onPublish}
            >
              <Send className="h-4 w-4 mr-1.5" /> Publish to WP
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
      <EmailChainPreviewDialog
        profile={profile}
        open={chainOpen}
        onOpenChange={setChainOpen}
      />
    </Dialog>
  );
}

/** ✨ AI bio shortener. Renders a small purple button under the bio
 *  that pops a tiny menu of preset rewrites. Calls the rewrite-bio
 *  edge function, then hands the rewritten text back to the parent
 *  via onApply (which writes it to staged.acf.bio). */
function AiBioMenu({
  bio, onApply,
}: {
  bio: string | null;
  onApply: (newBio: string) => Promise<void>;
}) {
  const [open,     setOpen]     = useState(false);
  const [busy,     setBusy]     = useState<null | string>(null);
  const [preview,  setPreview]  = useState<{ text: string; instruction: string } | null>(null);

  const run = async (instruction: "shorten_100" | "shorten_60" | "tighten" | "professional", label: string) => {
    if (!bio) {
      toast.error("Add a bio first, then I can shorten it.");
      return;
    }
    setBusy(label);
    try {
      const { data, error } = await supabase.functions.invoke("rewrite-bio", {
        body: { text: bio, instruction },
      });
      if (error) throw error;
      const resp = data as { ok: boolean; rewritten?: string; error?: string };
      if (!resp.ok || !resp.rewritten) throw new Error(resp.error ?? "Empty rewrite");
      setPreview({ text: resp.rewritten, instruction });
    } catch (e) {
      toast.error("AI rewrite failed", { description: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const wordCount = bio ? bio.trim().split(/\s+/).length : 0;

  return (
    <>
      <div className="mt-2 flex items-center gap-2">
        <div className="relative">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-[11px] border-purple-300 text-purple-700 hover:bg-purple-50"
            onClick={() => setOpen(o => !o)}
            disabled={!!busy}
          >
            {busy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
            {busy ?? "AI rewrite"}
          </Button>
          {open && (
            <div className="absolute left-0 top-full mt-1 z-50 w-64 rounded-lg border border-slate-200 bg-white shadow-lg p-1">
              <MenuButton onClick={() => { setOpen(false); void run("shorten_100", "Shortening…"); }}>
                <span className="font-medium">Shorten</span>
                <span className="text-[10.5px] text-muted-foreground">Under 100 words</span>
              </MenuButton>
              <MenuButton onClick={() => { setOpen(false); void run("shorten_60", "Shortening…"); }}>
                <span className="font-medium">One-paragraph pitch</span>
                <span className="text-[10.5px] text-muted-foreground">Under 60 words</span>
              </MenuButton>
              <MenuButton onClick={() => { setOpen(false); void run("tighten", "Tightening…"); }}>
                <span className="font-medium">Tighten</span>
                <span className="text-[10.5px] text-muted-foreground">Remove filler, keep facts</span>
              </MenuButton>
              <MenuButton onClick={() => { setOpen(false); void run("professional", "Polishing…"); }}>
                <span className="font-medium">Professionalize</span>
                <span className="text-[10.5px] text-muted-foreground">Recruiter / hospital-intro tone</span>
              </MenuButton>
            </div>
          )}
        </div>
        {bio && (
          <span className="text-[10.5px] text-muted-foreground">{wordCount} words</span>
        )}
      </div>

      {/* Preview-and-apply dialog. Shows the rewritten text side-by-side
          with the original so the user can compare before saving. */}
      <Dialog open={!!preview} onOpenChange={(v) => { if (!v) setPreview(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-base">AI rewrite</DialogTitle>
            <DialogDescription className="text-[11px]">
              Compare with the original. Apply replaces the bio on the staged row.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
            <div>
              <div className="text-[10.5px] uppercase tracking-wider text-slate-500 mb-1">Original ({wordCount} words)</div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-[12.5px] text-slate-700 whitespace-pre-wrap">{bio}</div>
            </div>
            <div>
              <div className="text-[10.5px] uppercase tracking-wider text-purple-700 mb-1">
                Rewritten ({preview ? preview.text.trim().split(/\s+/).length : 0} words)
              </div>
              <div className="rounded-md border border-purple-200 bg-purple-50/50 p-3 text-[12.5px] text-slate-800 whitespace-pre-wrap">{preview?.text}</div>
            </div>
          </div>
          <DialogFooter className="mt-3 gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>Cancel</Button>
            <Button
              size="sm"
              className="bg-purple-600 hover:bg-purple-700 text-white"
              onClick={async () => {
                if (!preview) return;
                try {
                  await onApply(preview.text);
                  toast.success("Bio updated");
                } catch (e) {
                  toast.error("Couldn't save", { description: (e as Error).message });
                }
                setPreview(null);
              }}
            >
              <Sparkles className="h-3 w-3 mr-1" /> Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Bare menu-item button used by AiBioMenu's dropdown. */
function MenuButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex flex-col items-start text-left px-2.5 py-1.5 rounded-md hover:bg-purple-50 text-[12px] text-slate-800"
    >
      {children}
    </button>
  );
}

/** JotForm /widget-uploads/imagepreview/ URLs are NOT rendered by
 *  browsers — a raw GET returns an HTML wrapper that sets a guest
 *  cookie and serves a page, not the JPG. We route through the
 *  jotform-file-proxy edge function which fetches with APIKEY auth
 *  and streams back the raw bytes with the right image/* MIME. */
function buildPhotoProxyUrl(rawUrl: string | null, formId: string | null): string | null {
  if (!rawUrl) return null;
  if (!formId) return rawUrl;  // Old staged rows pre-migration; let the browser try.
  // Extract the /widget-uploads/... or /uploads/... path. JotForm URLs
  // look like https://www.jotform.com/widget-uploads/imagepreview/<formId>/<file>.
  try {
    const u = new URL(rawUrl.startsWith("http") ? rawUrl : `https://www.jotform.com${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}`);
    if (!u.pathname.startsWith("/widget-uploads/") && !u.pathname.startsWith("/uploads/")) {
      return rawUrl;  // Not a JotForm-gated URL; let it through as-is.
    }
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    return `${supabaseUrl}/functions/v1/jotform-file-proxy?form_id=${encodeURIComponent(formId)}&path=${encodeURIComponent(u.pathname)}`;
  } catch {
    return rawUrl;
  }
}

/** Format a YYYYMMDD or YYYY-MM-DD string into "DD Month YYYY". */
function formatLongDate(raw: string | null): string {
  if (!raw) return "";
  const m = /^(\d{4})[-]?(\d{2})[-]?(\d{2})$/.exec(raw.trim());
  if (!m) return raw;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  if (Number.isNaN(+d)) return raw;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** Small destructive action inside the detail dialog. Confirms via
 *  native confirm() (low ceremony) before firing — wraps useDeleteWpCandidate. */
function DeleteCandidateButton({ candidate, onDone }: { candidate: WpCandidate; onDone: () => void }) {
  const del = useDeleteWpCandidate();
  const handle = async () => {
    const label = candidate.full_name ?? candidate.title ?? `WP candidate #${candidate.id}`;
    if (!confirm(`Delete "${label}" from WordPress?\n\nThis removes the post on the live site AND the dashboard mirror. Cannot be undone.`)) return;
    try {
      await del.mutateAsync(candidate.id);
      toast.success(`Deleted ${label}`);
      onDone();
    } catch (err) {
      toast.error("Couldn't delete", { description: (err as Error).message });
    }
  };
  return (
    <Button
      variant="outline"
      onClick={handle}
      disabled={del.isPending}
      className="w-full justify-center h-10 rounded-full border-rose-200 text-rose-700 hover:bg-rose-50"
      title="Permanently delete this WordPress candidate — removes the post + the dashboard mirror row."
    >
      {del.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
      {del.isPending ? "Deleting…" : "Delete profile"}
    </Button>
  );
}

/** Reformat a phone string at render time. Some legacy mirror rows
 *  were populated before the webhook flattener handled the bare
 *  {area, phone} object — they ended up stored as the raw JSON
 *  string. Detect that shape and turn it into "+area phone" so the
 *  profile card doesn't show stringified JSON. Pass-through for
 *  anything else (already-formatted strings, nulls). */
function formatPhone(raw: string | null): string | null {
  if (!raw) return raw;
  const s = raw.trim();
  if (!s.startsWith("{") || !s.includes("phone")) return raw;
  try {
    const obj = JSON.parse(s) as { area?: string | number; phone?: string | number; full?: string };
    if (typeof obj.full === "string" && obj.full.trim()) return obj.full.trim();
    const a = obj.area != null ? String(obj.area).trim() : "";
    const p = obj.phone != null ? String(obj.phone).trim() : "";
    if (a || p) return [a, p].filter(Boolean).join(" ");
  } catch { /* fall through */ }
  return raw;
}
