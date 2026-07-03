/**
 * Forms page — tabbed view, one tab per registered form.
 *
 * Each tab shows for that form:
 *   - Headline KPIs (total responses, this week, last 7d trend)
 *   - Submission timeline (live; realtime sub on form_responses)
 *   - Per-question response distribution for choice-type fields
 *   - Webhook URL + secret for the form (so it can be re-pasted into
 *     Elementor / Typeform if the webhook ever gets deleted)
 *
 * Per-provider action buttons:
 *   - Typeform: "Sync historical responses" — requires a PAT.
 *   - Elementor: nothing automatic; just shows the webhook URL to
 *     paste into Elementor's webhook action.
 *
 * Last tab is "+ Connect new" which opens the dialog to add a fresh
 * Typeform / Elementor form.
 */
import { useEffect, useMemo, useRef, useState, memo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ClipboardList, Plus, ExternalLink, Copy, CheckCircle2, AlertCircle,
  Trash2, Inbox, ChevronRight, History, Sparkles, Mail, User as UserIcon, RefreshCw, Settings,
  Search, Download, Loader2, Phone, DollarSign, CalendarClock, Save,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useZohoData, type ZohoLead } from "@/hooks/use-zoho-data";
import { zohoPut, zohoPost } from "@/lib/zoho";
import { useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useForms, useFormResponsesPage, useFormResponsesFilteredCount, fetchAllFormResponses,
  FORM_RESPONSES_PAGE_SIZE, useFormStats, useCreateForm, useUpdateForm, useDeleteForm,
  useUpdateFormResponseOutreach, useBackfillFormCsv, useLinkFormResponseToDoctor,
  useArchiveFormResponse, useRestoreFormResponse, useHardDeleteFormResponse,
  type OutreachStatus,
  useSyncTypeformHistory, useSyncJotformHistory, generateWebhookSecret,
  type Form, type FormResponse,
} from "@/hooks/use-forms";
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink,
  PaginationPrevious, PaginationNext, PaginationEllipsis,
} from "@/components/ui/pagination";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useWpCandidateByContact, useWpContactSet, normalizePhone } from "@/hooks/use-wp-candidates";
import { useNavigate } from "react-router-dom";
import { useCreateStagedProfile } from "@/hooks/use-wp-candidates";
import { mapAnswersToWp } from "@/lib/jotform-to-wp";
import { FormDropoff } from "@/components/forms/FormDropoff";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) ?? "";

function webhookUrlFor(form: Form): string {
  if (form.provider === "typeform") {
    return `${supabaseUrl}/functions/v1/typeform-webhook`;
  }
  if (form.provider === "jotform") {
    // JotForm doesn't sign requests; the secret in the URL is the auth.
    return `${supabaseUrl}/functions/v1/jotform-webhook?key=${form.webhook_secret ?? ""}`;
  }
  // Elementor / generic: identifies the form by webhook_secret in URL.
  return `${supabaseUrl}/functions/v1/form-webhook?key=${form.webhook_secret ?? ""}`;
}

function extractTypeformId(url: string): string | null {
  const m = url.trim().match(/typeform\.com\/to\/([a-zA-Z0-9]+)/);
  return m ? m[1] : null;
}

export default function Forms({ embedded = false }: { embedded?: boolean }) {
  const { data: forms = [], isLoading } = useForms();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // Embedded in the Doctors → Responses tab: show ONLY the doctor-intake
  // forms (JotForm + Typeform doctor profile intake). Leads / consultation /
  // DoctorsFinder forms stay on the standalone /forms page.
  const formsToShow = useMemo(
    () => embedded ? forms.filter(f => f.form_type === "doctor_intake") : forms,
    [forms, embedded],
  );

  // Default to first form; ensure activeId is always one that exists.
  const safeActiveId = useMemo(() => {
    if (activeId && formsToShow.some(f => f.id === activeId)) return activeId;
    return formsToShow[0]?.id ?? null;
  }, [formsToShow, activeId]);

  const active = useMemo(() => formsToShow.find(f => f.id === safeActiveId) ?? null, [formsToShow, safeActiveId]);

  const content = (
      <div className="space-y-4">
        {!embedded && (
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-teal-600" />
            Forms
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live form submissions from Typeform + Elementor. Each tab shows analytics + every response for one form. Emails matched to a Zoho lead/DoB get linked automatically.
          </p>
        </div>
        )}

        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}><CardContent className="py-4 space-y-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </CardContent></Card>
            ))}
          </div>
        ) : formsToShow.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-[12px] text-muted-foreground">
              <ClipboardList className="h-6 w-6 mx-auto mb-2 text-muted-foreground/60" />
              <p>{embedded ? "No doctor-intake form connected yet." : "No forms connected yet."}</p>
              {!embedded && (
                <Button size="sm" onClick={() => setCreateOpen(true)} className="mt-3">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Connect your first form
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Tabs value={safeActiveId ?? undefined} onValueChange={setActiveId}>
            <TabsList className="flex w-full overflow-x-auto h-auto py-1 bg-slate-100 justify-start" data-tour="forms-tabs">
              {formsToShow.map(f => (
                <TabsTrigger key={f.id} value={f.id} className="text-[12px] px-3 py-1.5 flex items-center gap-1.5">
                  <ProviderDot provider={f.provider} />
                  {f.name}
                </TabsTrigger>
              ))}
            </TabsList>

            {formsToShow.map(f => (
              <TabsContent key={f.id} value={f.id} className="mt-3">
                {active?.id === f.id && <FormDetail form={f} />}
              </TabsContent>
            ))}
          </Tabs>
        )}

        <ConnectFormDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      </div>
  );

  return embedded ? content : <DashboardLayout docSlug="growth/forms">{content}</DashboardLayout>;
}

function ProviderDot({ provider }: { provider: string }) {
  const cls =
    provider === "typeform"   ? "bg-purple-500" :
    provider === "elementor"  ? "bg-pink-500"   :
    provider === "jotform"    ? "bg-amber-500"  :
                                "bg-slate-400";
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${cls}`} title={provider} />;
}

/* ────────────────────────────────────────────────────────────────────
 * FormDetail — analytics + submission feed for one form.
 * ──────────────────────────────────────────────────────────────────── */
function FormDetail({ form }: { form: Form }) {
  const del = useDeleteForm();
  const [setupOpen, setSetupOpen] = useState(false);

  // ── Search + filter + sort state ──────────────────────────────────
  const [searchRaw, setSearchRaw] = useState("");
  const search = useDebounce(searchRaw, 250);
  const [dateFilter, setDateFilter] = useState<"all" | "7d" | "30d" | "90d">("all");
  const [sortDir, setSortDir]       = useState<"newest" | "oldest">("newest");
  // Default outreach filter by form type:
  // - Paid-lead (DoctorsFinder) → 'all' (Zoho-side buckets don't apply)
  // - JotForm (doctor profile intake) → 'all' (it's a simple intake;
  //   we don't apply the Zoho/outreach lifecycle frame here)
  // - Free-signal forms (Typeform / Consultation) → 'uncontacted-zoho'
  //   (narrowest actionable bucket, where the team starts each day)
  const isPaidFormInit = (form.lead_value_cents ?? 0) > 0;
  // Doctor-intake forms (JotForm OR Typeform doctor profile intake) feed
  // WordPress, so they share one view: the WP-presence filter + intake KPIs,
  // and NO Zoho/outreach lifecycle chips. Other forms (leads, consultation)
  // keep the outreach frame. Keyed off form_type so JotForm + Typeform doctor
  // intake render identically.
  const isDoctorIntake    = form.form_type === "doctor_intake";
  const showOutreachChips = !isDoctorIntake;
  // Every form now defaults to "all" — previously Typeform/Consultation
  // defaulted to 'uncontacted-zoho' (the narrowest actionable bucket),
  // but that hid 99% of submissions on first load and people kept
  // thinking the page was broken. Show everything, let the team narrow.
  const [outreachFilter, setOutreachFilter] = useState<"all" | "mine" | "uncontacted-zoho" | "unqualified" | OutreachStatus>("all");
  // WP-presence filter — JotForm only. Client-side because the data
  // lives in a separate table. Pre-fetched email + phone sets +
  // Set.has lookups keep this O(1) per row.
  const [wpFilter, setWpFilter] = useState<"all" | "in" | "out">("all");
  // Live vs Archived view. Default 'live' — archived rows are hidden
  // until the user explicitly switches.
  const [view, setView] = useState<"live" | "archived">("live");
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [search, dateFilter, sortDir, outreachFilter, view]);
  const wpContacts = useWpContactSet();
  const { user } = useAuth();

  const serverFilters = useMemo(() => ({
    search:            search.trim(),
    date:              dateFilter,
    sort:              sortDir,
    outreach:          outreachFilter,
    currentOwnerEmail: user?.email ?? undefined,
    view,
  }), [search, dateFilter, sortDir, outreachFilter, user?.email, view]);

  const pageFeed  = useFormResponsesPage(form.id, serverFilters, page);
  const countFeed = useFormResponsesFilteredCount(form.id, serverFilters);
  const totalFilteredCount = countFeed.data ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalFilteredCount / FORM_RESPONSES_PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const pageNumbers = useMemo((): Array<number | "..."> => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const out: Array<number | "..."> = [1];
    if (safePage > 3) out.push("...");
    for (let i = Math.max(2, safePage - 1); i <= Math.min(totalPages - 1, safePage + 1); i++) out.push(i);
    if (safePage < totalPages - 2) out.push("...");
    out.push(totalPages);
    return out;
  }, [safePage, totalPages]);

  const responses = useMemo(() => {
    const flat = pageFeed.data ?? [];
    if (!isDoctorIntake || wpFilter === "all" || !wpContacts.data) return flat;
    return flat.filter(r => {
      const e = (r.respondent_email ?? "").toLowerCase().trim();
      const p = normalizePhone(phoneFor(r));
      const inWp = (!!e && wpContacts.data!.emails.has(e))
                || (!!p && wpContacts.data!.phones.has(p));
      return wpFilter === "in" ? inWp : !inWp;
    });
  }, [pageFeed.data, isDoctorIntake, wpFilter, wpContacts.data]);

  // KPIs from cheap server-side count queries — total / last 7 days /
  // Zoho-linked — no longer dependent on the loaded set.
  const { data: stats } = useFormStats(form.id);
  const total              = stats?.total              ?? form.response_count ?? 0;
  const last7Days          = stats?.last7d             ?? 0;
  const last30Days         = stats?.last30d            ?? 0;
  const openOutreach       = stats?.outreachOpen       ?? 0;
  const unqualified        = stats?.unqualified        ?? 0;
  const uncontactedInZoho  = stats?.uncontactedInZoho  ?? 0;
  const paidPerLead        = (form.lead_value_cents ?? 0) / 100;
  const isPaidForm         = paidPerLead > 0;

  const isLoading  = pageFeed.isLoading;
  const [exporting, setExporting] = useState(false);
  const isSearching = !!search.trim();

  // ⌘K / Ctrl+K to focus the search bar from anywhere on the page.
  const searchRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleDelete = async () => {
    if (!confirm(`Delete "${form.name}"? All ${form.response_count} response${form.response_count === 1 ? "" : "s"} will be lost.`)) return;
    try {
      await del.mutateAsync(form.id);
      toast.success(`Deleted ${form.name}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const handleExportCsv = async () => {
    if (totalFilteredCount === 0) { toast.error("Nothing to export."); return; }
    setExporting(true);
    try {
      const all = await fetchAllFormResponses(form.id, serverFilters);
      if (all.length === 0) { toast.error("Nothing to export."); return; }
      const keys = new Set<string>();
      for (const r of all) for (const k of Object.keys(r.answers ?? {})) keys.add(k);
      const headers = ["submitted_at", "respondent_name", "respondent_email", "doctor_id", ...Array.from(keys)];
      const esc = (s: string | null | undefined) => {
        const v = s == null ? "" : String(s);
        return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
      };
      const lines = [headers.join(",")];
      for (const r of all) {
        const row = [
          r.submitted_at,
          r.respondent_name ?? "",
          r.respondent_email ?? "",
          r.doctor_id ?? "",
          ...Array.from(keys).map(k => esc((r.answers ?? {})[k] ?? "")),
        ];
        lines.push(row.map(esc).join(","));
      }
      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${form.name.replace(/[^a-z0-9]+/gi, "_")}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${all.length} responses.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Header row */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-[14px] flex items-center gap-2">
                <ProviderDot provider={form.provider} />
                {form.name}
                <Badge variant="outline" className="text-[9px] uppercase tracking-wider bg-slate-50">{form.provider}</Badge>
              </CardTitle>
              <CardDescription className="text-[11px]">
                {form.description ?? "—"}
                {form.provider_form_id && <> · form id <code className="text-[10px] bg-slate-100 px-1 rounded">{form.provider_form_id}</code></>}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {form.public_url && (
                <a href={form.public_url} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="outline">
                    <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open form
                  </Button>
                </a>
              )}
              <Button size="sm" variant="outline" onClick={handleExportCsv} disabled={exporting} title={`Export ${totalFilteredCount.toLocaleString()} filtered response${totalFilteredCount === 1 ? "" : "s"} to CSV`}>
                {exporting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1" />} Export
              </Button>
              {form.provider === "typeform" && <TypeformSyncButton form={form} />}
              {form.provider === "jotform"  && <JotformSyncButton  form={form} />}
              <Button size="sm" variant="outline" onClick={() => setSetupOpen(true)} title="View webhook URL + setup instructions">
                <Settings className="h-3.5 w-3.5 mr-1" /> Setup
              </Button>
              <Button size="sm" variant="outline" onClick={handleDelete} className="text-rose-600 hover:bg-rose-50 hover:text-rose-700" title="Delete this form and all its submissions">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Analytics strip — server-side counts so it stays accurate as
          the user scrolls / filters / searches. */}
      <div className={`grid grid-cols-2 ${isDoctorIntake ? "sm:grid-cols-3" : "sm:grid-cols-4"} gap-3`}>
        <Kpi label="Total submissions" value={total}      tone="slate" />
        <Kpi label="Last 7 days"       value={last7Days}  tone="sky" />

        {/* KPI 3 + 4 branch on the form type:
            - JotForm (doctor profile intake): just Last 30d.
              Zoho-qualification framing doesn't apply; the team
              wanted a simple count strip.
            - Paid-lead form (DoctorsFinder): Last 30d + Revenue. These
              don't feed Zoho, so 'Open outreach' from the form_responses
              lifecycle is the only outreach signal — show it in row 2.
            - Free-signal form (Typeform / Consultation): Unqualified +
              Uncontacted-in-Zoho. These are the actually-actionable
              buckets after the 'Open outreach' tile turned out to
              be misleading (counted every default-'new' row). */}
        {isDoctorIntake ? (
          <Kpi label="Last 30 days" value={last30Days} tone="emerald" />
        ) : isPaidForm ? (
          <>
            <Kpi label="Last 30 days" value={last30Days} tone="emerald" />
            <Kpi
              label="Revenue from this form"
              value={paidPerLead * total}
              tone="indigo"
              format="currency"
              hint={`${total.toLocaleString()} × $${paidPerLead.toLocaleString()}`}
            />
          </>
        ) : (
          <>
            <Kpi
              label="Unqualified"
              value={unqualified}
              tone="slate"
              hint="never reached Zoho"
            />
            <Kpi
              label="Uncontacted in Zoho"
              value={uncontactedInZoho}
              tone="amber"
              hint="Lead_Status = Not Contacted"
            />
          </>
        )}
      </div>

      {/* Where people drop off — Typeform funnel (per-question) / Jotform count. */}
      <FormDropoff form={form} />

      {/* Paid forms still get the form-response lifecycle tile — it's
          the right outreach signal when there's no Zoho funnel. */}
      {isPaidForm && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 -mt-1">
          <Kpi
            label="Open outreach"
            value={openOutreach}
            tone="amber"
            hint="new + contacted + qualified"
          />
        </div>
      )}

      {/* Supercharged search + filters bar */}
      <Card>
        <CardContent className="pt-3 pb-3 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={searchRaw}
              onChange={e => setSearchRaw(e.target.value)}
              placeholder="Search anything — name, email, answer to any question, Zoho ID, phone…  (⌘F)"
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
          {/* Active filter banner — counts every chip set away from the
              default ("all") plus the search box. Hidden when nothing's
              active so the page stays calm; loud when something is so
              users don't sit on an empty result for ages thinking the
              data's gone. Click 'Clear' to reset everything. */}
          <ActiveFilterBanner
            count={
              (search.trim()           ? 1 : 0) +
              (dateFilter    !== "all" ? 1 : 0) +
              (outreachFilter !== "all" ? 1 : 0) +
              (wpFilter      !== "all" ? 1 : 0)
            }
            onClear={() => {
              setSearchRaw("");
              setDateFilter("all");
              setOutreachFilter("all");
              setWpFilter("all");
            }}
          />
          <div className="flex items-center gap-2 flex-wrap text-[11px]">
            {/* Live / Archived view toggle — left-most so it's the
                first thing the user can flip when looking for
                something they archived earlier. */}
            <FilterChipGroup
              value={view}
              onChange={(v) => setView(v as typeof view)}
              options={[
                { value: "live",     label: "Live" },
                { value: "archived", label: "Archived" },
              ]}
            />
            <span className="text-muted-foreground/40">·</span>
            {/* Date chips */}
            <FilterChipGroup
              value={dateFilter}
              onChange={(v) => setDateFilter(v as typeof dateFilter)}
              options={[
                { value: "all", label: "All time" },
                { value: "7d",  label: "Last 7d" },
                { value: "30d", label: "Last 30d" },
                { value: "90d", label: "Last 90d" },
              ]}
            />
            {/* Outreach lifecycle — chip order matches the typical
                triage flow. 'Uncontacted in Zoho' first because that's
                where the team starts each day; 'Unqualified' is the
                explicit not-in-Zoho bucket from Saif's logic. The pure
                lifecycle buckets (New / Contacted / …) live behind a
                'lifecycle…' divider so they don't crowd the front of
                the row.

                JotForm is excluded — it's a self-serve doctor intake,
                not a Zoho-funnel form. Date + sort are the only useful
                filters there. */}
            {/* WordPress-presence filter — JotForm only, since other
                providers don't feed WP. Sits next to date so the team
                can quickly answer "who do I still need to import?". */}
            {isDoctorIntake && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <FilterChipGroup
                  value={wpFilter}
                  onChange={(v) => setWpFilter(v as typeof wpFilter)}
                  options={[
                    { value: "all", label: "All" },
                    { value: "in",  label: "In WordPress" },
                    { value: "out", label: "Not in WP" },
                  ]}
                />
              </>
            )}
            {showOutreachChips && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <FilterChipGroup
                  value={outreachFilter}
                  onChange={(v) => setOutreachFilter(v as typeof outreachFilter)}
                  options={isPaidFormInit ? [
                    // Paid leads (DoctorsFinder) — minimal funnel: each row
                    // is a chunk of revenue the team works carefully. Drop
                    // 'Qualified' and 'Declined' (paid leads don't decline
                    // us — deals close-won or close-lost) and keep just
                    // the buckets the team actually moves things between.
                    { value: "all",       label: "All" },
                    { value: "mine",      label: "My queue" },
                    { value: "new",       label: "New" },
                    { value: "contacted", label: "Contacted" },
                    { value: "closed",    label: "Closed" },
                  ] : [
                    { value: "uncontacted-zoho", label: "Uncontacted in Zoho" },
                    { value: "unqualified",      label: "Unqualified" },
                    { value: "mine",             label: "My queue" },
                    { value: "all",              label: "All" },
                    { value: "new",              label: "New (form)" },
                    { value: "contacted",        label: "Contacted (form)" },
                    { value: "qualified",        label: "Qualified (form)" },
                  ]}
                />
              </>
            )}
            <span className="text-muted-foreground/40">·</span>
            {/* Sort */}
            <FilterChipGroup
              value={sortDir}
              onChange={(v) => setSortDir(v as typeof sortDir)}
              options={[
                { value: "newest", label: "Newest first" },
                { value: "oldest", label: "Oldest first" },
              ]}
            />
            <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums">
              {countFeed.isLoading && <Loader2 className="h-3 w-3 animate-spin" />}
              {totalFilteredCount.toLocaleString()} result{totalFilteredCount === 1 ? "" : "s"}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Submission feed */}
      <Card>
        <CardContent className="pt-3 space-y-2">
          {isLoading ? (
            <div className="space-y-2 py-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-md border border-dashed">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-1/3" />
                    <Skeleton className="h-2.5 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : responses.length === 0 ? (
            isSearching || dateFilter !== "all" || outreachFilter !== "all" || wpFilter !== "all" ? (
              <div className="rounded-md border border-dashed py-8 text-center">
                <Search className="h-5 w-5 mx-auto mb-2 text-muted-foreground/60" />
                <p className="text-[12px] text-muted-foreground">No matches for the current filter.</p>
                <button onClick={() => { setSearchRaw(""); setDateFilter("all"); setOutreachFilter("all"); setWpFilter("all"); }} className="text-[11px] text-teal-700 hover:underline mt-1">
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="rounded-md border border-dashed py-8 text-center">
                <Inbox className="h-5 w-5 mx-auto mb-2 text-muted-foreground/60" />
                <p className="text-[12px] text-muted-foreground">No submissions yet.</p>
                <p className="text-[10px] text-muted-foreground/80 mt-1">
                  {form.provider === "typeform"
                    ? "Once the webhook is active in Typeform, submissions appear here within seconds. Or click 'Sync history' to backfill past responses."
                    : form.provider === "jotform"
                    ? "Once the webhook URL is wired into JotForm → Settings → Integrations → Webhooks, submissions appear here within seconds AND auto-create a WordPress doctor profile."
                    : "Once the webhook URL is wired into Elementor, submissions appear here within seconds."}
                </p>
              </div>
            )
          ) : (
            <>
              {responses.map(r => (
                <ResponseRow
                  key={r.id}
                  response={r}
                  highlight={search.trim().toLowerCase()}
                  leadValueCents={form.lead_value_cents ?? 0}
                  formType={form.form_type}
                  formProvider={form.provider}
                />
              ))}
              {totalPages > 1 && (
                <Pagination className="mt-4">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(e) => { e.preventDefault(); setPage(p => Math.max(1, p - 1)); }}
                        aria-disabled={safePage === 1}
                        className={safePage === 1 ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                    {pageNumbers.map((n, i) =>
                      n === "..." ? (
                        <PaginationItem key={`ell-${i}`}><PaginationEllipsis /></PaginationItem>
                      ) : (
                        <PaginationItem key={n}>
                          <PaginationLink
                            href="#"
                            isActive={safePage === n}
                            onClick={(e) => { e.preventDefault(); setPage(n as number); }}
                          >
                            {n}
                          </PaginationLink>
                        </PaginationItem>
                      )
                    )}
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(e) => { e.preventDefault(); setPage(p => Math.min(totalPages, p + 1)); }}
                        aria-disabled={safePage === totalPages}
                        className={safePage === totalPages ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <SetupDialog form={form} open={setupOpen} onClose={() => setSetupOpen(false)} />
    </div>
  );
}

/** Loud-but-thin amber bar that surfaces when any filter is away from
 *  its default. Sits between the search box and the chip row so it's
 *  impossible to miss when "no results" is actually a filter issue
 *  rather than empty data. Hidden when nothing's active. */
function ActiveFilterBanner({ count, onClear }: { count: number; onClear: () => void }) {
  if (count === 0) return null;
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-md border border-amber-200 bg-amber-50 text-[11px] text-amber-900">
      <div className="flex items-center gap-1.5">
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-200/70 text-[9px] font-semibold text-amber-900">{count}</span>
        <span>filter{count === 1 ? "" : "s"} active — narrowing the results. Showing only what matches.</span>
      </div>
      <button
        onClick={onClear}
        className="text-[11px] font-medium text-amber-900 underline hover:text-amber-700"
      >
        Clear all
      </button>
    </div>
  );
}

/* A small pill group: one active value at a time, rest are
 * neutral-styled. Used for date / linked / sort filters. */
function FilterChipGroup<T extends string>({ value, onChange, options }: {
  value:   T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div className="inline-flex items-center gap-1">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 rounded-full transition-colors ${
            value === o.value
              ? "bg-teal-600 text-white"
              : "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Debounce hook — postpones the returned value until `delay` ms
 *  after the input stops changing. Used to keep search responsive
 *  even when the underlying filter runs over 20k rows. */
function useDebounce<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

/** Tucked-away webhook configuration. Opens from the FormDetail
 *  header's 'Setup' button — keeps the URL + secret out of the
 *  primary view but one click away when the team needs to re-paste
 *  into Elementor / Typeform. */
function SetupDialog({ form, open, onClose }: { form: Form; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[14px]">
            <Settings className="h-4 w-4 text-teal-600" />
            {form.name} · Setup
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground">
            {form.provider === "typeform"
              ? "Paste this URL + secret into Typeform → Connect → Webhooks if you ever recreate the webhook."
              : form.provider === "jotform"
              ? "Paste this URL into JotForm → Settings → Integrations → Webhooks. Each submission auto-creates or updates a WordPress doctor profile (matched by email; new ones land as drafts for review). The key in the URL is the auth — keep it secret."
              : "Paste this URL into the Elementor form's 'Webhook' action. The key in the URL identifies this form — keep it secret."}
          </p>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">Webhook</div>
            <FieldRow label="Webhook URL" value={webhookUrlFor(form)} />
            {form.provider === "typeform" && (
              <FieldRow label="Secret" value={form.webhook_secret ?? "(none)"} masked />
            )}
          </div>
          <BackfillCsvSection form={form} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** CSV import for backfilling historical submissions. Works for any
 *  form — useful for the DoctorsFinder $150 leads where there's no
 *  Typeform / Elementor history API to pull from, so a CSV export
 *  from the source system is the only way in.
 *
 *  Column mapping is heuristic: standard 'email', 'phone', 'name',
 *  'date' columns get auto-mapped; everything else lands in the
 *  answers JSONB so the search bar still hits them. Re-running the
 *  same import no-ops via a stable synthetic provider_response_id. */
function BackfillCsvSection({ form }: { form: Form }) {
  const backfill = useBackfillFormCsv();
  const fileRef  = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<{ count: number; firstHeaders: string[] } | null>(null);

  const handlePick = () => fileRef.current?.click();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    try {
      // Parse with papaparse — header row becomes the keys.
      const Papa = (await import("papaparse")).default;
      const text = await file.text();
      const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: "greedy" });
      const rows = parsed.data.filter(r => Object.values(r).some(v => String(v ?? "").trim() !== ""));
      if (rows.length === 0) {
        toast.error("CSV had no data rows.");
        return;
      }

      const firstHeaders = parsed.meta.fields?.slice(0, 6) ?? [];
      setPreview({ count: rows.length, firstHeaders });

      const result = await backfill.mutateAsync({ formId: form.id, rows });
      toast.success(
        `Imported ${result.inserted} response${result.inserted === 1 ? "" : "s"}${result.skipped ? ` · ${result.skipped} duplicates skipped` : ""}.`,
        { duration: 9000 },
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "CSV import failed");
    }
  };

  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">Backfill historical submissions</div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Upload a CSV exported from wherever your historical submissions live (WordPress admin, WooCommerce export, payment processor, spreadsheet…). Columns are auto-mapped — anything called <code className="text-[10px] bg-slate-100 px-1 rounded">email</code>, <code className="text-[10px] bg-slate-100 px-1 rounded">name</code> (or <code className="text-[10px] bg-slate-100 px-1 rounded">first_name</code> + <code className="text-[10px] bg-slate-100 px-1 rounded">last_name</code>), <code className="text-[10px] bg-slate-100 px-1 rounded">phone</code>, <code className="text-[10px] bg-slate-100 px-1 rounded">date</code>/<code className="text-[10px] bg-slate-100 px-1 rounded">submitted_at</code> gets recognised; every other column becomes an answer. Re-running the same file is safe — duplicates are skipped.
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={handlePick} disabled={backfill.isPending}>
          {backfill.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1 rotate-180" />}
          {backfill.isPending ? "Importing…" : "Upload CSV"}
        </Button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
        {preview && (
          <span className="text-[10px] text-muted-foreground">
            Last upload: {preview.count.toLocaleString()} rows · cols: {preview.firstHeaders.join(", ")}{preview.firstHeaders.length >= 6 ? "…" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

/** "Sync historical responses" button — Typeform only. Asks for a PAT
 *  on first use, stores it on forms.api_token. */
function TypeformSyncButton({ form }: { form: Form }) {
  const sync   = useSyncTypeformHistory();
  const update = useUpdateForm();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");

  const hasToken = !!form.api_token;

  const handleStart = () => {
    if (!hasToken) {
      setOpen(true);
      return;
    }
    runSync();
  };

  const runSync = async () => {
    try {
      const r = await sync.mutateAsync(form.id);
      // Show what Typeform claims is the total so the user can spot
      // when our sync got fewer than expected (plan caps / API throttle).
      const totalNote = r.totalReported && r.totalReported > 0 ? ` · Typeform reports ${r.totalReported} total` : "";
      toast.success(`Synced — fetched ${r.fetched}, ${r.inserted} stored${totalNote}.`, { duration: 8000 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    }
  };

  const handleSaveToken = async () => {
    if (!token.trim()) return;
    try {
      await update.mutateAsync({ id: form.id, patch: { api_token: token.trim() } });
      setOpen(false);
      setToken("");
      // Auto-run the sync now that the token is in place.
      await runSync();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save token");
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={handleStart} disabled={sync.isPending} title="Backfill historical submissions via the form provider's API. Resumable in chunks — safe to click multiple times.">
        {sync.isPending ? <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> : <History className="h-3.5 w-3.5 mr-1" />}
        {sync.isPending ? "Syncing…" : "Sync history"}
      </Button>

      <Dialog open={open} onOpenChange={v => !v && setOpen(false)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[14px]">
              <History className="h-4 w-4 text-teal-600" />
              Typeform Personal Access Token
            </DialogTitle>
            <p className="text-[11px] text-muted-foreground">
              To pull historical responses we call Typeform's API. Generate a token at <a href="https://admin.typeform.com/account#/section/tokens" target="_blank" rel="noreferrer" className="text-teal-700 hover:underline">admin.typeform.com → Personal tokens</a> and paste it below. Stored encrypted-at-rest in our DB.
            </p>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <label className="text-[11px] font-medium text-muted-foreground">Personal Access Token</label>
            <Input value={token} onChange={e => setToken(e.target.value)} placeholder="tfp_..." type="password" />
            <p className="text-[10px] text-muted-foreground/80">Only the "Responses → Read" scope is needed.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveToken} disabled={!token.trim()}>Save & sync</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** "Sync history" button for JotForm. Requires both a JotForm API key
 *  (Settings → API) and the JotForm form id (URL slug). First click
 *  opens a small dialog to capture both; subsequent clicks fire the
 *  sync directly. Each sync re-runs the same WP-upsert + Zoho-link
 *  pipeline that the live webhook uses. */
function JotformSyncButton({ form }: { form: Form }) {
  const sync   = useSyncJotformHistory();
  const update = useUpdateForm();
  const [open,  setOpen]  = useState(false);
  const [token, setToken] = useState("");
  const [jfId,  setJfId]  = useState(form.provider_form_id ?? "");

  const ready = !!form.api_token && !!form.provider_form_id;

  const handleStart = () => {
    if (!ready) { setOpen(true); return; }
    runSync();
  };

  const runSync = async () => {
    // Each invocation processes ~40 new rows then returns; the hook
    // chains calls until done. We pump progress toasts so the team
    // sees the counter ticking as the chain runs.
    const toastId = toast.loading("Sync starting…");
    try {
      const r = await sync.mutateAsync({
        formId: form.id,
        onProgress: (p) => {
          const wpNote = (p.wp_created + p.wp_updated) > 0
            ? ` · WP: ${p.wp_created} created, ${p.wp_updated} updated`
            : "";
          toast.loading(
            `Sync chunk ${p.chunkN} done · ${p.inserted} rows stored${wpNote}${p.totalReported ? ` of ${p.totalReported.toLocaleString()}` : ""}`,
            { id: toastId },
          );
        },
      });
      const totalNote = r.total_reported > 0 ? ` · JotForm reports ${r.total_reported.toLocaleString()} total` : "";
      const wpNote    = (r.wp_created + r.wp_updated) > 0
        ? ` · WP: ${r.wp_created} created, ${r.wp_updated} updated`
        : "";
      toast.success(
        `Synced — ${r.inserted} stored${totalNote}${wpNote}.`,
        { id: toastId, duration: 9000 },
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed", { id: toastId });
    }
  };

  const handleSaveAndSync = async () => {
    if (!token.trim() || !jfId.trim()) return;
    try {
      await update.mutateAsync({
        id: form.id,
        patch: { api_token: token.trim(), provider_form_id: jfId.trim() },
      });
      setOpen(false);
      setToken("");
      await runSync();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save credentials");
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={handleStart} disabled={sync.isPending} title="Backfill historical submissions via the form provider's API. Resumable in chunks — safe to click multiple times.">
        {sync.isPending ? <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> : <History className="h-3.5 w-3.5 mr-1" />}
        {sync.isPending ? "Syncing…" : "Sync history"}
      </Button>

      <Dialog open={open} onOpenChange={v => !v && setOpen(false)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[14px]">
              <History className="h-4 w-4 text-teal-600" />
              JotForm credentials
            </DialogTitle>
            <p className="text-[11px] text-muted-foreground">
              To pull every past submission, we call JotForm's API. Need two things, both one-time:
            </p>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">JotForm form id</label>
              <Input
                value={jfId}
                onChange={e => setJfId(e.target.value)}
                placeholder="e.g. 240851234567890"
              />
              <p className="text-[10px] text-muted-foreground/80">
                The number in your form URL: <code className="bg-slate-100 px-1 rounded">jotform.com/form/<strong>240851234567890</strong></code>.
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">API key</label>
              <Input
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="Your JotForm API key"
                type="password"
              />
              <p className="text-[10px] text-muted-foreground/80">
                Generate at <a href="https://www.jotform.com/myaccount/api" target="_blank" rel="noreferrer" className="text-teal-700 hover:underline">jotform.com/myaccount/api</a> → New API Key → READ scope is enough. Stored encrypted in our DB.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveAndSync} disabled={!token.trim() || !jfId.trim()}>Save & sync</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FieldRow({ label, value, masked = false }: { label: string; value: string; masked?: boolean }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const display = masked && !shown ? "•".repeat(Math.min(32, value.length)) : value;
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  };
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-[10px] uppercase tracking-wider font-medium">{label}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {masked && (
            <button
              type="button"
              onClick={() => setShown(s => !s)}
              className="text-[10px] text-teal-700 hover:underline"
            >
              {shown ? "Hide" : "Show"}
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className={`inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border transition-colors ${
              copied
                ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
            }`}
            title="Copy to clipboard"
          >
            {copied ? <CheckCircle2 className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      {/* URL goes on its own row underneath the label so it has the
          full card width to wrap into. break-all lets long URLs flow
          across multiple lines instead of clipping behind the buttons. */}
      <code className="block text-[10.5px] bg-slate-100 px-2.5 py-2 rounded font-mono break-all leading-relaxed">
        {display}
      </code>
    </div>
  );
}

function Kpi({ label, value, tone, hint, format }: { label: string; value: number; tone: "slate" | "emerald" | "sky" | "indigo" | "amber"; hint?: string; format?: "number" | "currency" }) {
  const cls = {
    slate:   "bg-slate-50 text-slate-700",
    emerald: "bg-emerald-50 text-emerald-700",
    sky:     "bg-sky-50 text-sky-700",
    indigo:  "bg-indigo-50 text-indigo-700",
    amber:   "bg-amber-50 text-amber-700",
  }[tone];
  const display =
    format === "currency"
      ? `$${value.toLocaleString()}`
      : value.toLocaleString();
  return (
    <div className={`rounded-md border ${cls} px-3 py-3`}>
      <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-[24px] font-semibold mt-1 leading-none tabular-nums">{display}</div>
      {hint && <div className="text-[10px] opacity-70 mt-1">{hint}</div>}
    </div>
  );
}

/** Best-effort display name. Falls back through respondent_name →
 *  first_name + last_name (or any of the common variants) in answers →
 *  email → "Anonymous submission". Lots of forms don't have a single
 *  "name" field; they ask First / Last separately, so we stitch them
 *  back together here. */
function displayNameFor(r: FormResponse): { label: string; kind: "name" | "email" | "anon" } {
  if (r.respondent_name && r.respondent_name.trim()) return { label: r.respondent_name.trim(), kind: "name" };
  const a = r.answers ?? {};
  // Match keys case-insensitively, ignoring punctuation. So "First Name",
  // "first_name", "First-name", etc all map to the same bucket.
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  let first = "";
  let last  = "";
  let full  = "";
  for (const [k, v] of Object.entries(a)) {
    if (!v) continue;
    const n = norm(k);
    if (!first && (n === "firstname"  || n === "fname" || n === "givenname"))            first = String(v).trim();
    else if (!last && (n === "lastname" || n === "lname" || n === "surname" || n === "familyname")) last = String(v).trim();
    else if (!full && (n === "name" || n === "fullname"))                                  full = String(v).trim();
  }
  const stitched = [first, last].filter(Boolean).join(" ").trim() || full;
  if (stitched) return { label: stitched, kind: "name" };
  if (r.respondent_email) return { label: r.respondent_email, kind: "email" };
  return { label: "Anonymous submission", kind: "anon" };
}

/** Best-effort phone mining — same case-insensitive key matching as
 *  displayNameFor. Used to surface a tap-to-call shortcut on the row. */
function phoneFor(r: FormResponse): string | null {
  if (r.respondent_email) {
    // not relevant — email is a separate channel, just return null here
  }
  const a = r.answers ?? {};
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  for (const [k, v] of Object.entries(a)) {
    if (!v) continue;
    const n = norm(k);
    if (n === "phone" || n === "phonenumber" || n === "mobile" || n === "tel" || n === "telephone" || n === "whatsapp") {
      return String(v).trim() || null;
    }
  }
  return null;
}

const OUTREACH_STYLE: Record<OutreachStatus, { label: string; className: string }> = {
  new:        { label: "New",        className: "bg-sky-50 text-sky-700 border-sky-200" },
  contacted:  { label: "Contacted",  className: "bg-amber-50 text-amber-700 border-amber-200" },
  qualified:  { label: "Qualified",  className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  declined:   { label: "Declined",   className: "bg-slate-50 text-slate-500 border-slate-200" },
  closed:     { label: "Closed",     className: "bg-slate-100 text-slate-500 border-slate-200" },
};

const ResponseRow = memo(function ResponseRow({
  response, highlight = "", leadValueCents = 0, formType, formProvider,
}: {
  response: FormResponse;
  highlight?: string;
  leadValueCents?: number;
  formType?: string;
  formProvider?: string;
}) {
  const [open, setOpen] = useState(false);
  const stageProfile = useCreateStagedProfile();
  const [creatingWp, setCreatingWp] = useState(false);
  // Progress bar for "Send to staging" — stage-from-response does real
  // server work (Zoho enrich, CV download + extract, picture parse), so we
  // creep a bar to ~85% then snap to 100% on success instead of a spinner.
  const [stageProgress, setStageProgress] = useState<{ pct: number; label: string } | null>(null);
  const entries = useMemo(() => Object.entries(response.answers ?? {}), [response.answers]);
  const display = useMemo(() => displayNameFor(response), [response]);
  const phone   = useMemo(() => phoneFor(response), [response]);
  const avatar  = useMemo(() => pictureUrlFor(response), [response]);
  const navigate = useNavigate();

  /** Cross-link helper: send the user to the unified Doctors page with
   *  the email (or fallback display name) pre-typed into the search,
   *  so they land directly on this person's record in the chosen tab. */
  const openInDoctors = (tab: "progress" | "profiles") => {
    const q = response.respondent_email || display.label || "";
    navigate(`/doctors?tab=${tab}${q ? `&q=${encodeURIComponent(q)}` : ""}`);
  };

  /** Send-to-staging flow. Inserts a staged_doctor_profiles row from
   *  the form answers and lets the team review + click Publish in the
   *  staging area before anything lands on WordPress. NEVER posts to
   *  WordPress directly — the user's hard rule. */
  const archiveResponse = useArchiveFormResponse();
  const restoreResponse = useRestoreFormResponse();
  const hardDelete      = useHardDeleteFormResponse();
  const isArchived = !!response.archived_at;

  const handleArchive = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const label = display.label || response.respondent_email || `submission ${response.id.slice(0, 8)}`;
    try {
      await archiveResponse.mutateAsync(response.id);
      toast.success(`Archived ${label}`, {
        description: "Hidden from the live feed. Flip 'Archived' chip to view + restore.",
      });
    } catch (err) {
      toast.error("Couldn't archive", { description: (err as Error).message });
    }
  };
  const handleRestore = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await restoreResponse.mutateAsync(response.id);
      toast.success("Restored");
    } catch (err) {
      toast.error("Couldn't restore", { description: (err as Error).message });
    }
  };
  const handleHardDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const label = display.label || response.respondent_email || `submission ${response.id.slice(0, 8)}`;
    if (!confirm(`Permanently delete "${label}"?\n\nThis removes the record from our dashboard forever. Doesn't touch JotForm / Typeform on the source side.`)) return;
    try {
      await hardDelete.mutateAsync(response.id);
      toast.success(`Deleted ${label}`);
    } catch (err) {
      toast.error("Couldn't delete", { description: (err as Error).message });
    }
  };

  const handleCreateWpProfile = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (creatingWp) return;
    setCreatingWp(true);
    setStageProgress({ pct: 10, label: "Sending to staging…" });
    const creep = setInterval(() => {
      setStageProgress(p => (p && p.pct < 85 ? { ...p, pct: p.pct + Math.max(1, (85 - p.pct) * 0.08) } : p));
    }, 200);
    try {
      // Use the server-side stage-from-response endpoint. Runs the
      // SAME pipeline as a live JotForm webhook submission — Zoho
      // enrichment, picture-URL extraction from widget_metadata, CV
      // download + extraction queue. Earlier we did this in the
      // browser, which skipped the CV download (the doctor-cvs
      // bucket only accepts service-role writes) and the picture
      // (the raw_payload widget_metadata parse only ran server-side).
      const { data, error } = await supabase.functions.invoke("stage-from-response", {
        body: { response_id: response.id },
      });
      if (error) throw error;
      const resp = data as {
        ok: boolean; picture_captured?: boolean; error?: string;
        cv_found?: boolean; cv_extracted?: boolean; cv_complete?: boolean; cv_error?: string;
      };
      if (!resp.ok) throw new Error(resp.error ?? "Staging failed");
      clearInterval(creep);
      setStageProgress({ pct: 100, label: "Sent" });
      const openAction = { label: "Open staging", onClick: () => navigate("/doctors?tab=profiles") };
      // The CV is read INLINE during staging, so the row is complete on
      // arrival. If a CV was found but couldn't be read, say so loudly —
      // experience / education / years would otherwise be missing.
      if (resp.cv_found && !resp.cv_extracted) {
        toast.warning("Staged — but the CV couldn't be read", {
          description: `Experience, education & years may be missing. ${resp.cv_error ?? ""} Try staging again, or fill those fields by hand.`.trim(),
          action: openAction,
        });
      } else {
        const captured: string[] = [];
        if (resp.picture_captured) captured.push("photo");
        if (resp.cv_extracted)     captured.push("CV ✓");
        toast.success("Sent to staging area", {
          description: captured.length
            ? `Captured: ${captured.join(", ")}. Everything's merged — open the row to preview, then Publish.`
            : "Review the merged data, then click Publish to push to WordPress.",
          action: openAction,
        });
      }
    } catch (err) {
      clearInterval(creep);
      setStageProgress(null);
      toast.error("Couldn't stage profile", { description: (err as Error).message });
    } finally {
      clearInterval(creep);
      setCreatingWp(false);
      // Let the full bar show briefly before it disappears.
      setTimeout(() => setStageProgress(null), 500);
    }
  };

  // Auto-expand when the search term hits something INSIDE this
  // response's answers (rather than just the header) — saves the user
  // clicking each row to verify what matched.
  const matchesInBody = useMemo(() => {
    if (!highlight) return false;
    const tokens = highlight.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return false;
    const headerHay = `${display.label} ${response.respondent_email ?? ""}`.toLowerCase();
    return tokens.some(t => !headerHay.includes(t));
  }, [highlight, display.label, response.respondent_email]);
  const effectivelyOpen = open || matchesInBody;

  const isWpProvider = formProvider === "jotform" || formProvider === "typeform";

  // Collapsed in/out-of-WP badge is driven off the already-cached
  // useWpContactSet() Set — O(1) Set.has, zero extra fetch — using the
  // SAME normalisation the contact set builds its keys from
  // (email → lowercased+trimmed; phone → normalizePhone/last-9). This
  // reproduces today's binary in/out badge exactly without a per-row
  // query. `.data` is undefined until the WP list has loaded; while
  // it's loading we render nothing for the badge (same as the old
  // `!wpQuery.isLoading` gate that hid the badge until the check
  // resolved).
  const wpContacts = useWpContactSet();
  const inWpFromSet = useMemo(() => {
    if (!isWpProvider || !wpContacts.data) return null;
    const e = (response.respondent_email ?? "").toLowerCase().trim();
    const p = normalizePhone(phone);
    return (!!e && wpContacts.data.emails.has(e))
        || (!!p && wpContacts.data.phones.has(p));
  }, [isWpProvider, wpContacts.data, response.respondent_email, phone]);

  // Live WP candidate lookup — only mounted when the row is actually
  // expanded, since only the expanded panel needs the live
  // wp_link / status / id. Passing null contacts keeps the query
  // disabled (enabled: !!email || !!phone), so a collapsed row fires
  // no per-row fetch. Matches on email OR normalised phone. Only
  // matters for JotForm / Typeform — Elementor flows don't feed WP.
  const wpQuery = useWpCandidateByContact(
    (isWpProvider && effectivelyOpen) ? response.respondent_email : null,
    (isWpProvider && effectivelyOpen) ? phone : null,
  );
  const existingWp = wpQuery.data;
  const summary = useMemo(() => entries.slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(" · "), [entries]);
  const statusStyle = OUTREACH_STYLE[response.outreach_status] ?? OUTREACH_STYLE.new;
  const isPaid = leadValueCents > 0;
  const isDueForFollowup = response.next_followup_at && new Date(response.next_followup_at).getTime() < Date.now();

  return (
    <div className={`rounded-md border bg-white ${isPaid ? "border-amber-200 shadow-[0_0_0_1px_rgba(245,158,11,0.12)]" : ""}`}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(o => !o)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(o => !o); } }}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 cursor-pointer"
      >
        <ChevronRight className={`h-3.5 w-3.5 text-slate-400 shrink-0 transition-transform ${effectivelyOpen ? "rotate-90" : ""}`} />
        {/* Avatar — JotForm "professional picture" widget answer if the
            response has one, else a fallback icon. Lets the team scan
            the feed by face instead of email. */}
        {avatar ? (
          <img
            src={avatar}
            alt=""
            loading="lazy"
            className="h-7 w-7 rounded-full object-cover border border-slate-200 shrink-0"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="h-7 w-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
            {display.kind === "name"
              ? <UserIcon className="h-3.5 w-3.5 text-slate-400" />
              : <Mail     className="h-3.5 w-3.5 text-slate-400" />}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-medium text-slate-800 truncate flex items-center gap-1">
            <Hl text={display.label} q={highlight} />
          </div>
          <div className="text-[10px] text-muted-foreground truncate">
            <Hl text={summary || "—"} q={highlight} />
          </div>
        </div>
        {/* Paid-lead chip — shows the dollar value when the form has one
            (DoctorsFinder = $150). Keeps high-value rows visually loud. */}
        {isPaid && (
          <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-800 border-amber-300 shrink-0 font-semibold">
            <DollarSign className="h-2.5 w-2.5 mr-0.5" /> ${(leadValueCents / 100).toLocaleString()} collected
          </Badge>
        )}
        {/* Outreach status pill — hidden for the default "new" state (every
            uncontacted row would otherwise scream "New"); only the meaningful
            states (Contacted / Qualified / Declined / Closed) get a pill. */}
        {response.outreach_status !== "new" && (
          <Badge variant="outline" className={`text-[9px] shrink-0 ${statusStyle.className}`}>
            {statusStyle.label}
          </Badge>
        )}
        {isDueForFollowup && (
          <Badge variant="outline" className="text-[9px] bg-rose-50 text-rose-700 border-rose-200 shrink-0">
            <CalendarClock className="h-2.5 w-2.5 mr-0.5" /> follow-up due
          </Badge>
        )}
        {response.doctor_id ? (
          // Clickable — opens the Doctors → Progress tab with this
          // respondent's email pre-filled in search. Stop propagation
          // so we don't also toggle the row open. asChild on Badge
          // would lose the styling, so we just render a styled <button>.
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); openInDoctors("progress"); }}
            title="Open in Doctors → Progress"
            className="text-[9px] shrink-0 inline-flex items-center rounded-md border px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 transition-colors"
          >
            <Sparkles className="h-2.5 w-2.5 mr-0.5" /> in Zoho
          </button>
        ) : (
          // Form was supposed to create a Zoho lead automatically. No
          // match = the respondent never made it to the CRM — Saif's
          // shorthand for an unqualified submission.
          leadValueCents === 0 && (formProvider === "typeform" || (formProvider === "elementor" && formType !== "doctors_finder")) && (
            <Badge variant="outline" className="text-[9px] bg-slate-100 text-slate-500 border-slate-200 shrink-0" title="No matching Zoho lead — likely an unqualified submission">
              not in Zoho
            </Badge>
          )
        )}
        {/* WP profile presence — paired with the Zoho badge so the team
            sees both systems' state without expanding the row. Only
            JotForm feeds WP, so other providers stay silent. Match
            considers email OR phone so a doctor who re-submitted with
            a different email isn't flagged as missing. */}
        {isWpProvider && inWpFromSet !== null && (
          inWpFromSet ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); openInDoctors("profiles"); }}
              title={existingWp
                ? `WP candidate #${existingWp.id} · ${existingWp.status ?? ""} — open in Doctor Profiles`
                : "In WordPress — open in Doctor Profiles"}
              className="text-[9px] shrink-0 inline-flex items-center rounded-md border px-1.5 py-0.5 bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100 transition-colors"
            >
              <Sparkles className="h-2.5 w-2.5 mr-0.5" /> in WordPress
            </button>
          ) : (response.respondent_email || phone) ? (
            <Badge variant="outline" className="text-[9px] bg-slate-100 text-slate-500 border-slate-200 shrink-0" title="No WP candidate matches this email or phone yet — expand the row to create one">
              not in WP
            </Badge>
          ) : null
        )}
        <div className="text-[10px] text-muted-foreground shrink-0">{relativeTime(response.submitted_at)}</div>
        {/* Trash / Restore / hard-delete actions. In live view the
            trash archives (soft delete). In archived view the same
            icon RESTORES, and a small permanent-delete (x) appears
            alongside it. Native confirm only on the permanent path. */}
        {!isArchived ? (
          <button
            type="button"
            onClick={handleArchive}
            disabled={archiveResponse.isPending}
            title="Archive this submission. Hidden from the live feed; flip the Archived chip to view + restore. Doesn't touch JotForm/Typeform."
            className="h-6 w-6 rounded-full flex items-center justify-center text-slate-300 hover:text-amber-600 hover:bg-amber-50 transition-colors shrink-0 disabled:opacity-50"
          >
            {archiveResponse.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Inbox className="h-3 w-3" />}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={handleRestore}
              disabled={restoreResponse.isPending}
              title="Restore — moves the row back to the live feed."
              className="h-6 w-6 rounded-full flex items-center justify-center text-slate-300 hover:text-emerald-700 hover:bg-emerald-50 transition-colors shrink-0 disabled:opacity-50"
            >
              {restoreResponse.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            </button>
            <button
              type="button"
              onClick={handleHardDelete}
              disabled={hardDelete.isPending}
              title="Permanently delete from the dashboard. Cannot be undone. Doesn't touch JotForm/Typeform."
              className="h-6 w-6 rounded-full flex items-center justify-center text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0 disabled:opacity-50"
            >
              {hardDelete.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            </button>
          </>
        )}
      </div>
      {effectivelyOpen && (
        <div className="border-t bg-slate-50/30 px-3 py-2 space-y-3">
          {/* Outreach panel — keeps the team's working state on the
              same surface as the data. */}
          <OutreachPanel
            response={response}
            email={response.respondent_email}
            phone={phone}
            displayName={display.label}
            expectedInZoho={leadValueCents === 0}
          />

          {/* Answers dump */}
          <div className="space-y-1">
            {entries.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic">No answers captured.</p>
            ) : (
              entries.map(([k, v]) => (
                <div key={k} className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-x-3 gap-y-0.5 text-[11px]">
                  <span className="text-muted-foreground">{k}</span>
                  <AnswerValue k={k} v={v} highlight={highlight} formId={response.form_id} />
                </div>
              ))
            )}
            {response.doctor_id && (
              <div className="text-[10px] text-emerald-700 mt-2 inline-flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Linked to <code className="text-[10px] bg-emerald-50 px-1 rounded">{response.doctor_id}</code>
              </div>
            )}
          </div>

          {/* WordPress profile action — only relevant for JotForm,
              the only provider currently feeding WP. Shows a link to
              the existing record if there is one, else a button that
              opens the review dialog. */}
          {(formProvider === "jotform" || formProvider === "typeform") && (
            <div className="flex items-center gap-2 pt-2 border-t">
              {wpQuery.isLoading ? (
                <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Checking WordPress…
                </span>
              ) : existingWp ? (
                <a
                  href={existingWp.wp_link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-emerald-700 hover:underline inline-flex items-center gap-1"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  WP profile exists — open in WordPress ↗
                </a>
              ) : stageProgress ? (
                <div className="w-[180px]" title={stageProgress.label}>
                  <div className="text-[10px] text-slate-500 mb-0.5 truncate">{stageProgress.label}</div>
                  <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-200 ease-out" style={{ width: `${stageProgress.pct}%` }} />
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  onClick={handleCreateWpProfile}
                  disabled={creatingWp}
                >
                  <Sparkles className="h-3 w-3 mr-1 text-emerald-600" />
                  Send to staging
                </Button>
              )}
            </div>
          )}
        </div>
      )}

    </div>
  );
});

/** Inline outreach editor — status pill bar, owner, notes, follow-up
 *  date, last-contacted stamp. Every change is a partial PATCH; tiny
 *  spinner shows while saving, green check on success. */
function OutreachPanel({
  response, email, phone, displayName, expectedInZoho,
}: {
  response: FormResponse;
  email: string | null;
  phone: string | null;
  displayName: string;
  expectedInZoho: boolean;
}) {
  const upd = useUpdateFormResponseOutreach();
  const { user } = useAuth();
  const [notes, setNotes] = useState(response.outreach_notes ?? "");
  const [followup, setFollowup] = useState(response.next_followup_at ? response.next_followup_at.slice(0, 10) : "");
  const [savedStamp, setSavedStamp] = useState(0);

  useEffect(() => { setNotes(response.outreach_notes ?? ""); }, [response.outreach_notes]);
  useEffect(() => { setFollowup(response.next_followup_at ? response.next_followup_at.slice(0, 10) : ""); }, [response.next_followup_at]);

  const flash = () => { setSavedStamp(Date.now()); setTimeout(() => setSavedStamp(s => (Date.now() - s > 1500 ? 0 : s)), 1700); };

  const setStatus = async (s: OutreachStatus) => {
    try { await upd.mutateAsync({ responseId: response.id, outreach_status: s, outreach_owner: response.outreach_owner ?? user?.email ?? null }); flash(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
  };
  const markContacted = async () => {
    try {
      await upd.mutateAsync({
        responseId: response.id,
        markContactedNow: true,
        outreach_owner: response.outreach_owner ?? user?.email ?? null,
      });
      flash();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
  };
  const saveNotes = async () => {
    if ((notes ?? "") === (response.outreach_notes ?? "")) return;
    try { await upd.mutateAsync({ responseId: response.id, outreach_notes: notes.trim() || null }); flash(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
  };
  const saveFollowup = async (v: string) => {
    const iso = v ? new Date(v + "T09:00:00").toISOString() : null;
    if ((iso ?? null) === (response.next_followup_at ?? null)) return;
    try { await upd.mutateAsync({ responseId: response.id, next_followup_at: iso }); flash(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
  };
  const claim = async () => {
    if (!user?.email) return;
    try { await upd.mutateAsync({ responseId: response.id, outreach_owner: user.email }); flash(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
  };

  const owner = response.outreach_owner;
  const ownedByMe = owner && user?.email && owner.toLowerCase() === user.email.toLowerCase();

  return (
    <div className="rounded-md border border-slate-200 bg-white p-2.5 space-y-2">
      {/* Top row: status pills + action buttons */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {(["new", "contacted", "qualified", "declined", "closed"] as OutreachStatus[]).map(s => {
          const active = response.outreach_status === s;
          const style = OUTREACH_STYLE[s];
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${active ? style.className : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"}`}
            >
              {style.label}
            </button>
          );
        })}
        <span className="text-muted-foreground/40 mx-1">·</span>
        <button
          type="button"
          onClick={markContacted}
          className="text-[10px] h-6 px-2 rounded-full border border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100 inline-flex items-center gap-1"
        >
          <CheckCircle2 className="h-3 w-3" /> Mark contacted now
        </button>

        {/* Quick contact shortcuts */}
        <span className="text-muted-foreground/40 mx-1">·</span>
        {email && (
          <a href={`mailto:${email}`} className="text-[10px] h-6 px-2 rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1">
            <Mail className="h-3 w-3" /> Email
          </a>
        )}
        {phone && (
          <a href={`tel:${phone}`} className="text-[10px] h-6 px-2 rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1">
            <Phone className="h-3 w-3" /> Call
          </a>
        )}
        {phone && (
          <a href={`https://wa.me/${phone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer" className="text-[10px] h-6 px-2 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 inline-flex items-center gap-1">
            WhatsApp
          </a>
        )}

        {/* Owner + saving indicator (right-aligned) */}
        <span className="ml-auto text-[10px] text-muted-foreground inline-flex items-center gap-1">
          {upd.isPending  && <Loader2 className="h-3 w-3 animate-spin" />}
          {!upd.isPending && savedStamp && (Date.now() - savedStamp < 1500) ? <Check className="h-3 w-3 text-emerald-600" /> : null}
          {owner ? (
            <>Owner: <span className={`font-medium ${ownedByMe ? "text-teal-700" : "text-slate-700"}`}>{owner}</span></>
          ) : (
            <button type="button" onClick={claim} className="text-teal-700 hover:underline">Claim</button>
          )}
        </span>
      </div>

      {/* Notes + follow-up date */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-2">
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="Notes from the call — what they want, when to chase, gotchas… (saves on blur)"
          className="w-full text-[11px] rounded-md border border-slate-200 bg-white px-2 py-1.5 min-h-[60px] focus:outline-none focus:ring-1 focus:ring-teal-300"
        />
        <div className="space-y-1">
          <label className="text-[10px] text-slate-500 block">Follow-up date</label>
          <input
            type="date"
            value={followup}
            onChange={e => { setFollowup(e.target.value); saveFollowup(e.target.value); }}
            className="w-full h-7 text-[11px] rounded-md border border-slate-200 bg-white px-2"
          />
          {response.last_contacted_at && (
            <div className="text-[9.5px] text-slate-500">
              Last contacted {relativeTime(response.last_contacted_at)}
            </div>
          )}
        </div>
      </div>

      {/* Zoho CRM block — show the linked lead's status (editable) or,
          if no Zoho lead exists yet, offer to create one (only on forms
          where Zoho is expected — free-signal forms). */}
      <ZohoBlock
        responseId={response.id}
        doctorId={response.doctor_id}
        email={email}
        phone={phone}
        displayName={displayName}
        expectedInZoho={expectedInZoho}
      />
    </div>
  );
}

/** Renders the Zoho-CRM bit of an outreach panel. Three states:
 *   - Linked (doctor_id starts with 'lead:'): show current Lead_Status +
 *     dropdown. Change fires zohoPut + invalidates the zoho-data cache so
 *     Doctor Progress reflects it within a beat.
 *   - Unlinked + expected: offer 'Create Zoho lead' button. POSTs a
 *     minimal lead (Last_Name, Email, Phone, Description=notes) then
 *     stamps the new id back as doctor_id so this response shows as
 *     linked next render.
 *   - Unlinked + not expected (e.g. DoctorsFinder paid leads): renders
 *     nothing — these forms don't feed Zoho. */
/** Shared Zoho lookups derived once per zoho-cache identity and reused
 *  by every expanded ZohoBlock. Builds id→lead / id→dob Maps (first
 *  occurrence wins, matching the previous Array.find semantics) and the
 *  sorted distinct Lead_Status list. Keyed on the zoho cache object's
 *  identity (stable across renders), so the heavy rawLeads scan runs
 *  only when the cache actually changes. */
function useZohoLookups() {
  const { data: zoho } = useZohoData();
  return useMemo(() => {
    const byLead = new Map<string, ZohoLead>();
    const statuses = new Set<string>();
    for (const l of (zoho as { rawLeads?: ZohoLead[] } | undefined)?.rawLeads ?? []) {
      if (!byLead.has(l.id)) byLead.set(l.id, l);
      if (l.Lead_Status) statuses.add(l.Lead_Status);
    }
    const byDob = new Map<string, { id: string; Full_Name?: string | null }>();
    for (const d of (zoho as { rawDoctorsOnBoard?: Array<{ id: string; Full_Name?: string | null }> } | undefined)?.rawDoctorsOnBoard ?? []) {
      if (!byDob.has(d.id)) byDob.set(d.id, d);
    }
    return { byLead, byDob, leadStatuses: Array.from(statuses).sort() };
  }, [zoho]);
}

function ZohoBlock({
  responseId, doctorId, email, phone, displayName, expectedInZoho,
}: {
  responseId: string;
  doctorId: string | null;
  email: string | null;
  phone: string | null;
  displayName: string;
  expectedInZoho: boolean;
}) {
  const link = useLinkFormResponseToDoctor();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { byLead, byDob, leadStatuses } = useZohoLookups();

  // Two link shapes: 'lead:<zoho_id>' = Zoho Leads module (full
  // Lead_Status workflow), 'dob:<zoho_id>' = Zoho Contacts (Doctors
  // on Board) — further down the funnel, already a placed-ish doctor.
  // Both count as 'in Zoho'; only Leads have an editable status.
  const linkedZohoId = doctorId?.startsWith("lead:") ? doctorId.slice(5)
                     : doctorId?.startsWith("dob:")  ? doctorId.slice(4)
                     : null;
  const linkKind: "lead" | "dob" | null =
    doctorId?.startsWith("lead:") ? "lead"
    : doctorId?.startsWith("dob:") ? "dob"
    : null;

  const lead = useMemo<ZohoLead | null>(() => {
    if (linkKind !== "lead" || !linkedZohoId) return null;
    return byLead.get(linkedZohoId) ?? null;
  }, [linkKind, linkedZohoId, byLead]);

  const dob = useMemo<{ id: string; Full_Name?: string | null } | null>(() => {
    if (linkKind !== "dob" || !linkedZohoId) return null;
    return byDob.get(linkedZohoId) ?? null;
  }, [linkKind, linkedZohoId, byDob]);

  // ─── Linked to a Doctors-on-Board contact (no Lead_Status workflow) ──
  if (dob || (linkKind === "dob" && linkedZohoId)) {
    return (
      <div className="border-t border-slate-100 pt-2 mt-1">
        <div className="flex items-center gap-2 flex-wrap text-[10.5px]">
          <span className="text-slate-500 inline-flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-emerald-600" />
            Zoho contact (Doctors on Board)
          </span>
          <code className="text-[10px] bg-slate-100 px-1 rounded">{doctorId}</code>
          {dob?.Full_Name && <span className="text-slate-700 font-medium">· {dob.Full_Name}</span>}
          <a
            href={`https://crm.zoho.com/crm/org/contacts/${linkedZohoId}`}
            target="_blank"
            rel="noreferrer"
            className="ml-auto text-teal-700 hover:underline"
          >
            Open in Zoho ↗
          </a>
        </div>
      </div>
    );
  }

  // ─── Linked to a Zoho Lead: status dropdown ─────────────────────────
  if (lead) {
    const setStatus = async (newStatus: string) => {
      if (newStatus === lead.Lead_Status) return;
      setBusy(true);
      try {
        await zohoPut(`Leads/${lead.id}`, { data: [{ Lead_Status: newStatus }] });
        // Patch the local zoho cache so Doctor Progress / KPIs reflect
        // it on next render without a full re-fetch.
        qc.setQueryData<unknown>(["zoho-data"], (prev) => {
          const data = prev as { rawLeads?: ZohoLead[] } | undefined;
          if (!data?.rawLeads) return prev;
          return {
            ...data,
            rawLeads: data.rawLeads.map(l => l.id === lead.id ? { ...l, Lead_Status: newStatus } : l),
          };
        });
        toast.success(`Zoho lead status → ${newStatus}.`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't update Zoho");
      } finally { setBusy(false); }
    };
    return (
      <div className="border-t border-slate-100 pt-2 mt-1">
        <div className="flex items-center gap-2 flex-wrap text-[10.5px]">
          <span className="text-slate-500 inline-flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-emerald-600" />
            Zoho lead
          </span>
          <code className="text-[10px] bg-slate-100 px-1 rounded">{doctorId}</code>
          <span className="text-slate-400">·</span>
          <span className="text-slate-500">Status:</span>
          <Select value={lead.Lead_Status ?? ""} onValueChange={setStatus} disabled={busy}>
            <SelectTrigger className="h-6 w-[180px] text-[10px] bg-white border-slate-200 px-2 py-0">
              <SelectValue placeholder="Set status" />
            </SelectTrigger>
            <SelectContent>
              {leadStatuses.map(s => (
                <SelectItem key={s} value={s} className="text-[11px]">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {busy && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
          <a
            href={`https://crm.zoho.com/crm/org/leads/${lead.id}`}
            target="_blank"
            rel="noreferrer"
            className="ml-auto text-teal-700 hover:underline"
          >
            Open in Zoho ↗
          </a>
        </div>
      </div>
    );
  }

  // ─── Unlinked + not expected → render nothing (DoctorsFinder etc.) ───
  if (!expectedInZoho) return null;

  // ─── Unlinked + expected: offer to create ────────────────────────────
  const createLead = async () => {
    if (!email && !displayName) {
      toast.error("Need at least a name or an email to create a Zoho lead.");
      return;
    }
    // Zoho Leads requires Last_Name + Company. Derive Last_Name from
    // the display name (last token), Company defaults to AA.
    const nameParts = displayName.replace(/^Dr\.?\s+/i, "").trim().split(/\s+/);
    const lastName  = nameParts.length > 1 ? nameParts.slice(-1)[0] : (nameParts[0] || "Unknown");
    const firstName = nameParts.length > 1 ? nameParts.slice(0, -1).join(" ") : "";
    setBusy(true);
    try {
      const payload = {
        data: [{
          Last_Name:    lastName,
          First_Name:   firstName || undefined,
          Email:        email     || undefined,
          Phone:        phone     || undefined,
          Company:      "Allocation Assist",
          Lead_Source:  "Dashboard backfill",
          Lead_Status:  "Not Contacted",
          Description:  "Created from a form response that didn't auto-match an existing Zoho lead.",
        }],
        trigger: ["workflow"],
      };
      const resp = await zohoPost<{ data?: Array<{ code?: string; details?: { id?: string }; message?: string }> }>(
        "Leads",
        payload,
      );
      const newId = resp?.data?.[0]?.details?.id;
      const code  = resp?.data?.[0]?.code;
      if (!newId || code !== "SUCCESS") {
        throw new Error(resp?.data?.[0]?.message ?? "Zoho refused the new lead");
      }
      // Stamp the new lead's id onto the form_response so it now reads
      // as linked.
      await link.mutateAsync({ responseId, doctorId: `lead:${newId}` });
      // Schedule a Zoho sync so the cache picks up the new row.
      qc.invalidateQueries({ queryKey: ["zoho-data"] });
      toast.success(`Created Zoho lead · ${firstName ? `${firstName} ${lastName}` : lastName}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create Zoho lead");
    } finally { setBusy(false); }
  };

  return (
    <div className="border-t border-slate-100 pt-2 mt-1">
      <div className="flex items-center gap-2 flex-wrap text-[10.5px]">
        <span className="text-slate-500 inline-flex items-center gap-1">
          <Sparkles className="h-3 w-3 text-slate-400" />
          Not in Zoho
        </span>
        <span className="text-slate-400">·</span>
        <span className="text-slate-500">No matching lead — likely an unqualified submission.</span>
        <button
          type="button"
          onClick={createLead}
          disabled={busy}
          className="ml-auto text-[10px] h-6 px-2 rounded-full border border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100 inline-flex items-center gap-1 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Create Zoho lead
        </button>
      </div>
    </div>
  );
}

// Tiny check icon (lucide doesn't expose just `Check` distinct from CheckCircle2; using CheckCircle2 above).
const Check = CheckCircle2;

/** Highlight matched search tokens inside arbitrary text. Renders
 *  unchanged text when q is empty. Cheap; runs per cell on render.
 *
 *  Uses two regexes intentionally: a /g/i for splitting (which
 *  preserves capture groups in the output array) and a fresh /i one
 *  per match check (because RegExp.test on a /g regex is STATEFUL —
 *  re-using the same instance between map iterations would alternate
 *  true/false based on lastIndex). */
/** Renders a single form-answer value with awareness of JotForm-y
 *  shapes that would otherwise dump as raw JSON:
 *
 *  - widget_metadata images (the 'professional picture' question type):
 *      thumbnail strip + the original filenames.
 *  - File-upload URLs (PDFs / docs — the 'send us your CV' question
 *      type): a 'Download <filename>' link per URL, one per line.
 *  - Plain URLs that look like images: rendered as a thumbnail too.
 *  - Compound JSON the JotForm webhook didn't manage to flatten
 *      (e.g. phone {"area":"001","phone":"..."} or DoB
 *      {"day":"19","month":"01","year":"1989"...}): a humanised
 *      'area 001 · phone …' rather than a raw JSON dump.
 *  - Everything else falls through to the highlighter as before.
 *
 *  Detection is at render time so historical rows benefit without
 *  needing a re-sync. Future syncs can extract this stuff at write
 *  time too — both layers are belt + braces. */
function AnswerValue({ k, v, highlight, formId }: { k: string; v: string; highlight: string; formId?: string }) {
  const trimmed = (v ?? "").trim();
  if (!trimmed) return <span className="text-slate-400 italic">—</span>;

  // 1. JotForm widget-metadata image blob — JSON shape:
  //    {"widget_metadata":{"type":"imagelinks","value":[{"name":"...","url":"..."}]}}
  if (trimmed.startsWith("{") && trimmed.includes("widget_metadata")) {
    try {
      const parsed = JSON.parse(trimmed) as { widget_metadata?: { type?: string; value?: Array<{ name?: string; url?: string }> } };
      const items = parsed.widget_metadata?.value ?? [];
      const images = items.filter(it => typeof it?.url === "string");
      if (images.length > 0) {
        return (
          <div className="flex flex-wrap gap-2">
            {images.map((it, i) => {
              const url = jotformImageUrl(it.url!, formId);
              return (
                <a key={i} href={url} target="_blank" rel="noreferrer" className="inline-flex flex-col gap-0.5">
                  <img src={url} alt={it.name ?? ""} className="h-20 w-20 object-cover rounded border border-slate-200" />
                  <span className="text-[9.5px] text-slate-500 max-w-[80px] truncate" title={it.name ?? ""}>{it.name ?? ""}</span>
                </a>
              );
            })}
          </div>
        );
      }
    } catch { /* fall through to default */ }
  }

  // 2. Compound JSON the webhook flattener missed — phone, DoB, etc.
  //    Render the key/value pairs inline rather than raw JSON.
  if (trimmed.startsWith("{") && trimmed.endsWith("}") && trimmed.length < 600 && !trimmed.includes("widget_metadata")) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      const parts = Object.entries(obj)
        .filter(([k2]) => k2 !== "datetime" && k2 !== "month" && k2 !== "year" && k2 !== "day"
                       ? true
                       : true) // include everything for now
        .map(([k2, v2]) => `${k2}: ${typeof v2 === "string" ? v2 : JSON.stringify(v2)}`)
        .join(" · ");
      // For DoB-shaped objects with a datetime, prefer the formatted datetime.
      const datetime = typeof obj.datetime === "string" ? obj.datetime : null;
      const formattedDob = datetime ? prettyDateFromIso(datetime) : null;
      const display = formattedDob ?? parts;
      if (display) return <span className="text-slate-800 break-words"><Hl text={display} q={highlight} /></span>;
    } catch { /* fall through */ }
  }

  // 3. URL list — one URL per line or multiple separated by whitespace.
  //    Common for JotForm 'file upload' (CV) fields.
  const urls = extractUrls(trimmed);
  if (urls.length > 0 && urls.join(" ").length >= trimmed.length * 0.7) {
    // Treat the value as a list of URLs (≥70% of it is URLs). Route
    // every URL through jotformImageUrl so JotForm-hosted files (CVs,
    // pics, anything in /uploads/) go through our edge-function proxy
    // instead of the bare jotform.com URL that requires a JotForm
    // session to download.
    return (
      <div className="flex flex-col gap-1">
        {urls.map((u, i) => {
          const filename = filenameFromUrl(u);
          const isImage = /\.(jpe?g|png|gif|webp|svg)(\?|$)/i.test(u);
          const proxied = jotformImageUrl(u, formId);
          return isImage ? (
            <a key={i} href={proxied} target="_blank" rel="noreferrer" className="inline-flex flex-col gap-0.5">
              <img src={proxied} alt={filename} className="h-20 w-20 object-cover rounded border border-slate-200" />
              <span className="text-[9.5px] text-slate-500 max-w-[140px] truncate">{filename}</span>
            </a>
          ) : (
            <a key={i} href={proxied} target="_blank" rel="noreferrer" className="text-[11px] text-teal-700 hover:underline inline-flex items-center gap-1 max-w-full">
              <Download className="h-3 w-3 shrink-0" />
              <span className="truncate">{filename || u}</span>
            </a>
          );
        })}
      </div>
    );
  }

  return <span className="text-slate-800 break-words"><Hl text={trimmed} q={highlight} /></span>;
}

/** JotForm widget files (`/widget-uploads/...`) aren't publicly readable
 *  — the bare URL serves a 404 page. The `jotform-file-proxy` edge
 *  function fetches them with the form's API key and streams the bytes
 *  back. For any non-widget URL we just return it as-is (still
 *  absolutising relative paths defensively). */
function jotformImageUrl(url: string, formId: string | undefined): string {
  // Typeform file uploads (api.typeform.com/.../files/…) need the Bearer
  // token — route through our typeform-file-proxy so the <img>/download works.
  if (formId && /^https?:\/\/api\.typeform\.com\//i.test(url)) {
    const base = (import.meta.env.VITE_SUPABASE_URL as string)?.replace(/\/$/, "") ?? "";
    return `${base}/functions/v1/typeform-file-proxy?form_id=${encodeURIComponent(formId)}&url=${encodeURIComponent(url)}`;
  }
  // Full https URLs pointing at jotform.com — extract the path part and
  // route through the proxy. Otherwise the dashboard would link directly
  // to JotForm, which requires the user to be logged in there. Common
  // case: CV PDFs come back as
  //   https://www.jotform.com/uploads/Allocationassist/.../file.pdf
  if (/^https?:\/\/(?:www\.)?jotform\.com\//i.test(url)) {
    try {
      const u = new URL(url);
      const path = u.pathname; // e.g. /uploads/Allocationassist/.../file.pdf
      if (formId && (path.startsWith("/uploads/") || path.startsWith("/widget-uploads/"))) {
        const base = (import.meta.env.VITE_SUPABASE_URL as string)?.replace(/\/$/, "") ?? "";
        return `${base}/functions/v1/jotform-file-proxy?form_id=${encodeURIComponent(formId)}&path=${encodeURIComponent(path)}`;
      }
    } catch { /* fall through to return as-is */ }
    return url;
  }
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/widget-uploads/") || url.startsWith("/uploads/")) {
    if (!formId) return `https://www.jotform.com${url}`;
    const base = (import.meta.env.VITE_SUPABASE_URL as string)?.replace(/\/$/, "") ?? "";
    return `${base}/functions/v1/jotform-file-proxy?form_id=${encodeURIComponent(formId)}&path=${encodeURIComponent(url)}`;
  }
  if (url.startsWith("/")) return `https://www.jotform.com${url}`;
  return url;
}

/** Scan a response for the first picture-shaped widget answer and
 *  return its proxy URL — used as the row avatar.
 *
 *  Looks in three places, in order:
 *   1. raw_payload.answers (the JotForm API shape — {3: {text, answer}})
 *   2. response.answers     (our flattened map — "Type A52": "<JSON>")
 *   3. raw_payload.rawRequest  (the live-webhook multipart JSON blob —
 *                               keyed by q52_typeA52 → "<JSON>")
 *
 *  Live webhook submissions land via multipart, so the API-shaped
 *  `answers` key is absent. We have to fall through to the flat
 *  answers / rawRequest payload to find widget_metadata for those. */
function pictureUrlFor(response: FormResponse): string | null {
  const apiAnswers = (response.raw_payload as { answers?: Record<string, unknown> } | undefined)?.answers;
  if (apiAnswers && typeof apiAnswers === "object") {
    const hit = scanWidgetMetadataApiShape(apiAnswers, response.form_id);
    if (hit) return hit;
  }
  // Flat-answers fallback: "Type A52": '{"widget_metadata":...}'
  const flat = response.answers ?? {};
  for (const v of Object.values(flat)) {
    const url = extractWidgetUrl(v);
    if (url) return jotformImageUrl(url, response.form_id);
  }
  // rawRequest fallback: multipart payload's JSON blob
  const rr = (response.raw_payload as { rawRequest?: string } | undefined)?.rawRequest;
  if (typeof rr === "string") {
    try {
      const obj = JSON.parse(rr) as Record<string, unknown>;
      for (const v of Object.values(obj)) {
        const url = extractWidgetUrl(typeof v === "string" ? v : JSON.stringify(v));
        if (url) return jotformImageUrl(url, response.form_id);
      }
    } catch { /* skip */ }
  }
  // Typeform photo: a file-upload answer is a plain URL (api.typeform.com/…/
  // files/…), not widget_metadata. Find the picture-labelled one + proxy it.
  for (const [label, v] of Object.entries(flat)) {
    if (typeof v !== "string" || !v.trim()) continue;
    if (!/picture|photo|image|profilepic|headshot|studio/i.test(label)) continue;
    const url = (/https?:\/\/api\.typeform\.com\/[^\s,;"']+/i.exec(v)?.[0])
             ?? (/https?:\/\/[^\s,;"']+\.(?:jpe?g|png|gif|webp)(?:\?|$)/i.exec(v)?.[0]);
    if (url) return jotformImageUrl(url, response.form_id);
  }
  return null;
}

/** Pull the first /widget-uploads/imagepreview/... URL out of a string
 *  value that looks like a widget_metadata JSON blob. Returns null if
 *  the value doesn't contain a picture URL. */
function extractWidgetUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.includes("widget_metadata")) return null;
  try {
    const parsed = JSON.parse(raw) as { widget_metadata?: { value?: Array<{ url?: string }> } };
    const items  = parsed?.widget_metadata?.value;
    const url    = items?.find(it => typeof it?.url === "string")?.url;
    return url ?? null;
  } catch { return null; }
}

/** The original API-shape scan, factored out so the multi-fallback
 *  pictureUrlFor stays readable. */
function scanWidgetMetadataApiShape(rawAnswers: Record<string, unknown>, formId: string | undefined): string | null {
  for (const v of Object.values(rawAnswers)) {
    if (!v || typeof v !== "object") continue;
    const obj = v as { text?: string; answer?: unknown };
    const text = String(obj.text ?? "").toLowerCase();
    const looksLikePic = text.includes("picture") || text.includes("photo") || text.includes("image");
    const answerStr = typeof obj.answer === "string" ? obj.answer : JSON.stringify(obj.answer ?? "");
    if (!answerStr.includes("widget_metadata") && !looksLikePic) continue;
    try {
      const parsed = typeof obj.answer === "string" ? JSON.parse(obj.answer) : obj.answer;
      const items = (parsed as { widget_metadata?: { value?: Array<{ url?: string }> } })?.widget_metadata?.value;
      const url   = items?.find(it => typeof it?.url === "string")?.url;
      if (url) return jotformImageUrl(url, formId);
    } catch { /* fall through to next answer */ }
  }
  return null;
}

function extractUrls(s: string): string[] {
  const matches = s.match(/https?:\/\/[^\s,;]+/g);
  return matches ?? [];
}

function filenameFromUrl(u: string): string {
  try {
    const p = new URL(u).pathname;
    const last = p.split("/").filter(Boolean).pop() ?? "";
    return decodeURIComponent(last);
  } catch { return ""; }
}

function prettyDateFromIso(iso: string): string | null {
  const d = new Date(iso.replace(" ", "T"));
  if (isNaN(d.valueOf())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function Hl({ text, q }: { text: string; q: string }) {
  const regex = useMemo(() => {
    if (!q) return null;
    const tokens = q.trim().split(/\s+/).filter(t => t.length > 0);
    if (tokens.length === 0) return null;
    const escaped = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return {
      splitter: new RegExp(`(${escaped.join("|")})`, "gi"),
      matcher:  new RegExp(`^(?:${escaped.join("|")})$`, "i"),
    };
  }, [q]);
  if (!regex) return <>{text}</>;
  const { splitter, matcher } = regex;
  const parts = text.split(splitter);
  return (
    <>
      {parts.map((p, i) =>
        matcher.test(p)
          ? <mark key={i} className="bg-amber-100 text-amber-900 px-0.5 rounded">{p}</mark>
          : <span key={i}>{p}</span>
      )}
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────
 * Connect a new form dialog — Typeform or Elementor.
 * ──────────────────────────────────────────────────────────────────── */
function ConnectFormDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateForm();
  const [provider, setProvider] = useState<"typeform" | "elementor">("typeform");
  const [name, setName]         = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl]           = useState("");
  const [formType, setFormType] = useState("custom");
  const [done, setDone]         = useState<Form | null>(null);

  const reset = () => {
    setProvider("typeform"); setName(""); setDescription(""); setUrl(""); setFormType("custom"); setDone(null);
  };
  const handleClose = () => { reset(); onClose(); };

  const formId = provider === "typeform" ? extractTypeformId(url) : null;
  const canCreate = name.trim() && (provider === "elementor" || !!formId);

  const handleCreate = async () => {
    if (!canCreate) return;
    const secret = generateWebhookSecret();
    try {
      const created = await create.mutateAsync({
        name: name.trim(),
        description: description.trim() || null,
        form_type: formType.trim() || "custom",
        provider,
        provider_form_id: formId,
        public_url: url.trim() || null,
        webhook_secret: secret,
      });
      setDone(created);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create form");
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[14px]">
            <ClipboardList className="h-4 w-4 text-teal-600" />
            {done ? "Form connected — finish setup with the form provider" : "Connect a form"}
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground">
            {done
              ? "Last step: paste the webhook URL into the form provider's webhook settings. We'll catch every submission and surface it here."
              : "Typeform or Elementor. We'll generate the webhook URL + secret and walk you through where to paste them."}
          </p>
        </DialogHeader>

        {!done ? (
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Provider</label>
              <div className="flex gap-2">
                {(["typeform", "elementor"] as const).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setProvider(p)}
                    className={`text-[11px] px-3 py-1.5 rounded-full border transition-colors ${provider === p ? "bg-teal-600 text-white border-teal-600" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"}`}
                  >
                    <ProviderDot provider={p} /> {p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Display name</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder={provider === "typeform" ? "e.g. Doctor intake form" : "e.g. Consultation form"} />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">{provider === "typeform" ? "Typeform URL" : "Form page URL (optional)"}</label>
              <Input value={url} onChange={e => setUrl(e.target.value)} placeholder={provider === "typeform" ? "https://form.typeform.com/to/AbCdEfGh" : "https://www.allocationassist.com/consultation"} />
              {provider === "typeform" && url && !formId && (
                <p className="text-[10px] text-rose-600">Couldn't find a Typeform form ID. URL should look like <code>typeform.com/to/...</code>.</p>
              )}
              {provider === "typeform" && formId && <p className="text-[10px] text-emerald-700">✓ Form ID: <code>{formId}</code></p>}
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Description (optional)</label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="What this form is for" />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Type tag</label>
              <Input value={formType} onChange={e => setFormType(e.target.value)} placeholder="doctor_intake / consultation / doctors_finder / custom" />
            </div>
          </div>
        ) : (
          <DoneInstructions form={done} />
        )}

        <DialogFooter>
          {!done ? (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!canCreate || create.isPending}>
                {create.isPending ? "Connecting…" : "Connect form"}
              </Button>
            </>
          ) : (
            <Button onClick={handleClose}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DoneInstructions({ form }: { form: Form }) {
  const url = webhookUrlFor(form);
  if (form.provider === "typeform") {
    return (
      <div className="space-y-3 py-1">
        <ol className="text-[12px] text-slate-800 space-y-2 list-decimal pl-5">
          <li>In Typeform: <strong>Connect</strong> → <strong>Webhooks</strong> → <strong>Add a webhook</strong>.</li>
          <li>Paste this URL:<FieldRow label="URL" value={url} /></li>
          <li>Set the secret:<FieldRow label="Secret" value={form.webhook_secret ?? ""} masked /></li>
          <li>Toggle the webhook <strong>on</strong>. Submit a test response → it'll appear in this tab within seconds.</li>
        </ol>
      </div>
    );
  }
  // Elementor
  return (
    <div className="space-y-3 py-1">
      <ol className="text-[12px] text-slate-800 space-y-2 list-decimal pl-5">
        <li>Open the form in Elementor editor → click the form widget → <strong>Actions After Submit</strong>.</li>
        <li>Add the <strong>Webhook</strong> action.</li>
        <li>
          Paste this URL into the <strong>Webhook URL</strong> field:
          <FieldRow label="URL" value={url} />
        </li>
        <li>Save the page. Submit a test response → it'll appear in this tab within seconds. The key in the URL is the form's secret — keep it private.</li>
      </ol>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
 * Lightweight analytics
 * ──────────────────────────────────────────────────────────────────── */
function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60)      return `${secs}s ago`;
  if (secs < 3600)    return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86_400)  return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 604_800) return `${Math.floor(secs / 86_400)}d ago`;
  return d.toLocaleDateString();
}

export const _silence = { AlertCircle, supabase };
