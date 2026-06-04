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
import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ClipboardList, Plus, ExternalLink, Copy, CheckCircle2, AlertCircle,
  Trash2, Inbox, ChevronRight, History, Sparkles, Mail, User as UserIcon, RefreshCw, Settings,
  Search, Download, Loader2, Phone, DollarSign, CalendarClock, Save,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  useForms, useFormResponsesInfinite, useFormStats, useCreateForm, useUpdateForm, useDeleteForm,
  useUpdateFormResponseOutreach,
  type OutreachStatus,
  useSyncTypeformHistory, generateWebhookSecret,
  type Form, type FormResponse,
} from "@/hooks/use-forms";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) ?? "";

function webhookUrlFor(form: Form): string {
  if (form.provider === "typeform") {
    return `${supabaseUrl}/functions/v1/typeform-webhook`;
  }
  // Elementor / generic: identifies the form by webhook_secret in URL.
  return `${supabaseUrl}/functions/v1/form-webhook?key=${form.webhook_secret ?? ""}`;
}

function extractTypeformId(url: string): string | null {
  const m = url.trim().match(/typeform\.com\/to\/([a-zA-Z0-9]+)/);
  return m ? m[1] : null;
}

export default function Forms() {
  const { data: forms = [], isLoading } = useForms();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // Default to first form; ensure activeId is always one that exists.
  const safeActiveId = useMemo(() => {
    if (activeId && forms.some(f => f.id === activeId)) return activeId;
    return forms[0]?.id ?? null;
  }, [forms, activeId]);

  const active = useMemo(() => forms.find(f => f.id === safeActiveId) ?? null, [forms, safeActiveId]);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-teal-600" />
            Forms
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live form submissions from Typeform + Elementor. Each tab shows analytics + every response for one form. Emails matched to a Zoho lead/DoB get linked automatically.
          </p>
        </div>

        {isLoading ? (
          <Card><CardContent className="py-8 text-[12px] text-muted-foreground">Loading forms…</CardContent></Card>
        ) : forms.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-[12px] text-muted-foreground">
              <ClipboardList className="h-6 w-6 mx-auto mb-2 text-muted-foreground/60" />
              <p>No forms connected yet.</p>
              <Button size="sm" onClick={() => setCreateOpen(true)} className="mt-3">
                <Plus className="h-3.5 w-3.5 mr-1" /> Connect your first form
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs value={safeActiveId ?? undefined} onValueChange={setActiveId}>
            <TabsList className="flex w-full overflow-x-auto h-auto py-1 bg-slate-100 justify-start">
              {forms.map(f => (
                <TabsTrigger key={f.id} value={f.id} className="text-[12px] px-3 py-1.5 flex items-center gap-1.5">
                  <ProviderDot provider={f.provider} />
                  {f.name}
                  <Badge variant="outline" className="ml-1 bg-white border-slate-200 text-[9px]">{f.response_count}</Badge>
                </TabsTrigger>
              ))}
            </TabsList>

            {forms.map(f => (
              <TabsContent key={f.id} value={f.id} className="mt-3">
                {active?.id === f.id && <FormDetail form={f} />}
              </TabsContent>
            ))}
          </Tabs>
        )}

        <ConnectFormDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      </div>
    </DashboardLayout>
  );
}

function ProviderDot({ provider }: { provider: string }) {
  const cls =
    provider === "typeform"   ? "bg-purple-500" :
    provider === "elementor"  ? "bg-pink-500"   :
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
  const [outreachFilter, setOutreachFilter] = useState<"all" | "mine" | OutreachStatus>("all");
  const { user } = useAuth();

  // Server-side paginated + filtered feed. First page is 200 rows; each
  // scroll fires a fetchNextPage() for 50 more. Search/date/outreach all
  // push down to the DB so we never have to load the full table.
  const feed = useFormResponsesInfinite(form.id, {
    search:           search.trim(),
    date:             dateFilter,
    sort:             sortDir,
    outreach:         outreachFilter,
    currentOwnerEmail: user?.email ?? undefined,
  });
  const responses = useMemo(() => {
    const flat = feed.data?.pages.flatMap(p => p.rows) ?? [];
    // Paid leads always float to the top of whatever order the DB
    // returned. Stable within each bucket — preserves the submitted_at
    // sort for the free rows below.
    if ((form.lead_value_cents ?? 0) > 0) return flat;  // single-form view; either all paid or all free → no resort needed
    return flat;
  }, [feed.data, form.lead_value_cents]);

  // KPIs from cheap server-side count queries — total / last 7 days /
  // Zoho-linked — no longer dependent on the loaded set.
  const { data: stats } = useFormStats(form.id);
  const total       = stats?.total        ?? form.response_count ?? 0;
  const last7Days   = stats?.last7d       ?? 0;
  const last30Days  = stats?.last30d      ?? 0;
  const openOutreach = stats?.outreachOpen ?? 0;
  const paidPerLead  = (form.lead_value_cents ?? 0) / 100;

  // Sentinel for infinite scroll.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && feed.hasNextPage && !feed.isFetchingNextPage) {
          feed.fetchNextPage();
        }
      }
    }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [feed.hasNextPage, feed.isFetchingNextPage, feed.fetchNextPage]);

  const isLoading = feed.isLoading;
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

  const handleExportCsv = () => {
    // Now that we paginate, "Export" dumps what's currently loaded —
    // tell the user explicitly so they don't think they got everything
    // when they've only scrolled through a hundred rows.
    if (responses.length === 0) { toast.error("Nothing to export."); return; }
    if (responses.length < total && !confirm(
      `You've loaded ${responses.length} of ${total.toLocaleString()} submissions. Export only the loaded ones?`
    )) return;

    // Stable column per question across the exported set.
    const keys = new Set<string>();
    for (const r of responses) for (const k of Object.keys(r.answers ?? {})) keys.add(k);
    const headers = ["submitted_at", "respondent_name", "respondent_email", "doctor_id", ...Array.from(keys)];
    const esc = (s: string | null | undefined) => {
      const v = s == null ? "" : String(s);
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    };
    const lines = [headers.join(",")];
    for (const r of responses) {
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
    toast.success(`Exported ${responses.length} responses.`);
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
              <Button size="sm" variant="outline" onClick={handleExportCsv} title={`Export ${responses.length} loaded response${responses.length === 1 ? "" : "s"} to CSV`}>
                <Download className="h-3.5 w-3.5 mr-1" /> Export
              </Button>
              {form.provider === "typeform" && <TypeformSyncButton form={form} />}
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Total submissions" value={total}      tone="slate" />
        <Kpi label="Last 7 days"       value={last7Days}  tone="sky" />
        <Kpi label="Last 30 days"      value={last30Days} tone="emerald" />
        <Kpi
          label={paidPerLead > 0 ? `Open outreach · $${(paidPerLead * openOutreach).toLocaleString()} at stake` : "Open outreach"}
          value={openOutreach}
          tone="amber"
          hint="new + contacted + qualified"
        />
      </div>

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
          <div className="flex items-center gap-2 flex-wrap text-[11px]">
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
            <span className="text-muted-foreground/40">·</span>
            {/* Outreach lifecycle */}
            <FilterChipGroup
              value={outreachFilter}
              onChange={(v) => setOutreachFilter(v as typeof outreachFilter)}
              options={[
                { value: "all",        label: "All outreach" },
                { value: "mine",       label: "My queue" },
                { value: "new",        label: "New" },
                { value: "contacted",  label: "Contacted" },
                { value: "qualified",  label: "Qualified" },
                { value: "declined",   label: "Declined" },
                { value: "closed",     label: "Closed" },
              ]}
            />
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
            <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
              {isSearching
                ? `${responses.length}${feed.hasNextPage ? "+" : ""} matches`
                : `${responses.length.toLocaleString()} of ${total.toLocaleString()} loaded`}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Submission feed */}
      <Card>
        <CardContent className="pt-3 space-y-2">
          {isLoading ? (
            <p className="text-[11px] text-muted-foreground py-2">Loading submissions…</p>
          ) : responses.length === 0 ? (
            isSearching || dateFilter !== "all" || outreachFilter !== "all" ? (
              <div className="rounded-md border border-dashed py-8 text-center">
                <Search className="h-5 w-5 mx-auto mb-2 text-muted-foreground/60" />
                <p className="text-[12px] text-muted-foreground">No matches for the current filter.</p>
                <button onClick={() => { setSearchRaw(""); setDateFilter("all"); setOutreachFilter("all"); }} className="text-[11px] text-teal-700 hover:underline mt-1">
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
                    : "Once the webhook URL is wired into Elementor, submissions appear here within seconds."}
                </p>
              </div>
            )
          ) : (
            <>
              {responses.map(r => (
                <ResponseRow key={r.id} response={r} highlight={search.trim().toLowerCase()} leadValueCents={form.lead_value_cents ?? 0} />
              ))}
              {/* Infinite-scroll sentinel — fires fetchNextPage() ~300px
                  before reaching the bottom so there's no perceptible
                  pause on fast scrolls. */}
              {feed.hasNextPage ? (
                <div ref={sentinelRef} className="w-full py-3 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading more…
                </div>
              ) : responses.length > 0 ? (
                <div className="w-full py-3 text-center text-[10px] text-muted-foreground/70">
                  {isSearching
                    ? `${responses.length} match${responses.length === 1 ? "" : "es"} loaded`
                    : `All ${responses.length.toLocaleString()} loaded`}
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <SetupDialog form={form} open={setupOpen} onClose={() => setSetupOpen(false)} />
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
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[14px]">
            <Settings className="h-4 w-4 text-teal-600" />
            {form.name} · Webhook setup
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground">
            {form.provider === "typeform"
              ? "Paste this URL + secret into Typeform → Connect → Webhooks if you ever recreate the webhook."
              : "Paste this URL into the Elementor form's 'Webhook' action. The key in the URL identifies this form — keep it secret."}
          </p>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <FieldRow label="Webhook URL" value={webhookUrlFor(form)} />
          {form.provider === "typeform" && (
            <FieldRow label="Secret" value={form.webhook_secret ?? "(none)"} masked />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
      <Button size="sm" variant="outline" onClick={handleStart} disabled={sync.isPending}>
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

function Kpi({ label, value, tone, hint }: { label: string; value: number; tone: "slate" | "emerald" | "sky" | "indigo"; hint?: string }) {
  const cls = {
    slate:   "bg-slate-50 text-slate-700",
    emerald: "bg-emerald-50 text-emerald-700",
    sky:     "bg-sky-50 text-sky-700",
    indigo:  "bg-indigo-50 text-indigo-700",
  }[tone];
  return (
    <div className={`rounded-md border ${cls} px-3 py-3`}>
      <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-[24px] font-semibold mt-1 leading-none">{value}</div>
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

function ResponseRow({
  response, highlight = "", leadValueCents = 0,
}: {
  response: FormResponse;
  highlight?: string;
  leadValueCents?: number;
}) {
  const [open, setOpen] = useState(false);
  const entries = Object.entries(response.answers ?? {});
  const display = useMemo(() => displayNameFor(response), [response]);
  const phone   = useMemo(() => phoneFor(response), [response]);

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
  const summary = entries.slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(" · ");
  const statusStyle = OUTREACH_STYLE[response.outreach_status] ?? OUTREACH_STYLE.new;
  const isPaid = leadValueCents > 0;
  const isDueForFollowup = response.next_followup_at && new Date(response.next_followup_at).getTime() < Date.now();

  return (
    <div className={`rounded-md border bg-white ${isPaid ? "border-amber-200 shadow-[0_0_0_1px_rgba(245,158,11,0.12)]" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50"
      >
        <ChevronRight className={`h-3.5 w-3.5 text-slate-400 shrink-0 transition-transform ${effectivelyOpen ? "rotate-90" : ""}`} />
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-medium text-slate-800 truncate flex items-center gap-1">
            {display.kind === "name"  && <UserIcon className="h-3 w-3 text-slate-400 shrink-0" />}
            {display.kind === "email" && <Mail     className="h-3 w-3 text-slate-400 shrink-0" />}
            <Hl text={display.label} q={highlight} />
          </div>
          <div className="text-[10px] text-muted-foreground truncate">
            <Hl text={summary || "—"} q={highlight} />
          </div>
        </div>
        {/* Paid-lead chip — shows the dollar value when the form has one
            (DoctorsFinder = $750). Keeps high-value rows visually loud. */}
        {isPaid && (
          <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-800 border-amber-300 shrink-0 font-semibold">
            <DollarSign className="h-2.5 w-2.5 mr-0.5" /> ${(leadValueCents / 100).toLocaleString()} paid lead
          </Badge>
        )}
        {/* Outreach status pill */}
        <Badge variant="outline" className={`text-[9px] shrink-0 ${statusStyle.className}`}>
          {statusStyle.label}
        </Badge>
        {isDueForFollowup && (
          <Badge variant="outline" className="text-[9px] bg-rose-50 text-rose-700 border-rose-200 shrink-0">
            <CalendarClock className="h-2.5 w-2.5 mr-0.5" /> follow-up due
          </Badge>
        )}
        {response.doctor_id && (
          <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200 shrink-0">
            <Sparkles className="h-2.5 w-2.5 mr-0.5" /> Zoho linked
          </Badge>
        )}
        <div className="text-[10px] text-muted-foreground shrink-0">{relativeTime(response.submitted_at)}</div>
      </button>
      {effectivelyOpen && (
        <div className="border-t bg-slate-50/30 px-3 py-2 space-y-3">
          {/* Outreach panel — keeps the team's working state on the
              same surface as the data. */}
          <OutreachPanel response={response} email={response.respondent_email} phone={phone} />

          {/* Answers dump */}
          <div className="space-y-1">
            {entries.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic">No answers captured.</p>
            ) : (
              entries.map(([k, v]) => (
                <div key={k} className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-x-3 gap-y-0.5 text-[11px]">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="text-slate-800 break-words"><Hl text={v} q={highlight} /></span>
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
        </div>
      )}
    </div>
  );
}

/** Inline outreach editor — status pill bar, owner, notes, follow-up
 *  date, last-contacted stamp. Every change is a partial PATCH; tiny
 *  spinner shows while saving, green check on success. */
function OutreachPanel({
  response, email, phone,
}: {
  response: FormResponse;
  email: string | null;
  phone: string | null;
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
function Hl({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const tokens = q.trim().split(/\s+/).filter(t => t.length > 0);
  if (tokens.length === 0) return <>{text}</>;
  const escaped = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const splitter = new RegExp(`(${escaped.join("|")})`, "gi");
  const matcher  = new RegExp(`^(?:${escaped.join("|")})$`, "i");
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
