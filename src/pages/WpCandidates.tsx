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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { UserSquare, Search, RefreshCw, ExternalLink, ChevronRight, FileText, Link2, History } from "lucide-react";
import { useWpCandidates, useSyncWpCandidates, useLinkWpCandidate, type WpCandidate } from "@/hooks/use-wp-candidates";
import { toast } from "sonner";

export default function WpCandidates() {
  const { data: candidates = [], isLoading } = useWpCandidates();
  const sync = useSyncWpCandidates();

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
          <Button size="sm" variant="outline" onClick={handleSync} disabled={sync.isPending}>
            {sync.isPending ? <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> : <History className="h-3.5 w-3.5 mr-1" />}
            {sync.isPending ? "Syncing…" : "Sync from WordPress"}
          </Button>
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
                {filtered.slice(0, renderLimit).map(c => <CandidateRow key={c.id} candidate={c} highlight={search.trim().toLowerCase()} />)}
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
    </DashboardLayout>
  );
}

function CandidateRow({ candidate, highlight }: { candidate: WpCandidate; highlight: string }) {
  const [open, setOpen] = useState(false);
  const subtitle = [candidate.job_title, candidate.country_of_training].filter(Boolean).join(" · ");
  return (
    <>
      <div className="rounded-md border bg-white">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50"
        >
          <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
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
      <CandidateDetailDialog candidate={candidate} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function CandidateDetailDialog({ candidate, open, onClose }: { candidate: WpCandidate; open: boolean; onClose: () => void }) {
  const link = useLinkWpCandidate();
  const [doctorIdInput, setDoctorIdInput] = useState(candidate.doctor_id ?? "");

  const saveLink = async () => {
    try {
      await link.mutateAsync({ id: candidate.id, doctorId: doctorIdInput.trim() || null });
      toast.success(doctorIdInput.trim() ? "Linked." : "Unlinked.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const Field = ({ label, value }: { label: string; value: string | number | string[] | null | undefined }) => {
    if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) return null;
    return (
      <div className="grid grid-cols-[140px_1fr] gap-3 text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-slate-800 break-words">{Array.isArray(value) ? value.join(", ") : String(value)}</span>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-[640px] max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[14px]">
            <UserSquare className="h-4 w-4 text-teal-600" />
            {candidate.full_name ?? candidate.title}
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground">
            {candidate.job_title ?? "—"}
            {candidate.specialty && <> · {candidate.specialty}</>}
          </p>
        </DialogHeader>

        <div className="space-y-1 py-1">
          <Field label="Email"               value={candidate.email} />
          <Field label="Phone"               value={candidate.phone} />
          <Field label="Date of birth"       value={candidate.date_of_birth} />
          <Field label="Nationality"         value={candidate.nationality} />
          <Field label="Specialty"           value={candidate.specialty} />
          <Field label="Subspecialty"        value={candidate.subspecialty} />
          <Field label="Area of interest"    value={candidate.area_of_interest} />
          <Field label="Years experience"    value={candidate.years_experience} />
          <Field label="License status"      value={candidate.license_status} />
          <Field label="License types"       value={candidate.license_types} />
          <Field label="Country of training" value={candidate.country_of_training} />
          <Field label="Current location"    value={candidate.current_location} />
          <Field label="Rank"                value={candidate.rank} />
          <Field label="Languages"           value={candidate.languages} />
          <Field label="English level"       value={candidate.english_level} />
          <Field label="Current salary"      value={candidate.current_salary} />
          <Field label="Expected salary"     value={candidate.expected_salary} />
          <Field label="Notice period"       value={candidate.notice_period} />
          <Field label="Targeted locations"  value={candidate.targeted_locations} />
          <Field label="Family status"       value={candidate.family_status} />
          <Field label="Has dependents"      value={candidate.has_dependents == null ? null : (candidate.has_dependents ? "Yes" : "No")} />
          <Field label="Status"              value={candidate.status} />
        </div>

        <div className="space-y-2 border-t pt-3 mt-2">
          <div className="text-[11px] font-medium text-slate-700">Link to AA doctor</div>
          <div className="flex items-center gap-2">
            <Input
              value={doctorIdInput}
              onChange={e => setDoctorIdInput(e.target.value)}
              placeholder="lead:12345 or dob:67890 (or leave blank to unlink)"
              className="h-9 text-[11px] font-mono"
            />
            <Button size="sm" onClick={saveLink} disabled={link.isPending}>
              {link.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">Use the lead:/dob: prefix that other parts of the dashboard use.</p>
        </div>

        <DialogFooter>
          <a href={candidate.wp_link} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm">
              <ExternalLink className="h-3.5 w-3.5 mr-1" /> View on WordPress
            </Button>
          </a>
          {candidate.cv_url && (
            <a href={candidate.cv_url} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm">
                <FileText className="h-3.5 w-3.5 mr-1" /> CV
              </Button>
            </a>
          )}
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
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
