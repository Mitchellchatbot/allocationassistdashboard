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
  Search, Download,
} from "lucide-react";
import {
  useForms, useFormResponses, useCreateForm, useUpdateForm, useDeleteForm,
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
  const { data: responses = [], isLoading } = useFormResponses(form.id);
  const del = useDeleteForm();
  const [setupOpen, setSetupOpen] = useState(false);

  // ── Search + filter + sort state ──────────────────────────────────
  const [searchRaw, setSearchRaw] = useState("");
  const search = useDebounce(searchRaw, 120);
  const [dateFilter, setDateFilter] = useState<"all" | "7d" | "30d" | "90d">("all");
  const [linkFilter, setLinkFilter] = useState<"all" | "linked" | "unlinked">("all");
  const [sortDir, setSortDir]   = useState<"newest" | "oldest">("newest");
  const [renderLimit, setRenderLimit] = useState(100);   // virtualisation-lite: only render the first N rows; "Load more" reveals more

  const analytics = useMemo(() => computeAnalytics(responses), [responses]);

  // Pre-stringify each response into a single search-corpus to make
  // the per-keystroke filter loop fast even at 20k+ rows.
  const corpus = useMemo(() => responses.map(r => {
    const parts: string[] = [];
    if (r.respondent_name)  parts.push(r.respondent_name);
    if (r.respondent_email) parts.push(r.respondent_email);
    if (r.doctor_id)        parts.push(r.doctor_id);
    for (const [k, v] of Object.entries(r.answers ?? {})) {
      parts.push(k, v);
    }
    return parts.join(" \n ").toLowerCase();
  }), [responses]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
    const cutoffMs =
      dateFilter === "7d"  ? Date.now() - 7  * 86_400_000 :
      dateFilter === "30d" ? Date.now() - 30 * 86_400_000 :
      dateFilter === "90d" ? Date.now() - 90 * 86_400_000 : 0;

    const out: FormResponse[] = [];
    for (let i = 0; i < responses.length; i++) {
      const r = responses[i];
      if (cutoffMs && new Date(r.submitted_at).getTime() < cutoffMs) continue;
      if (linkFilter === "linked"   && !r.doctor_id) continue;
      if (linkFilter === "unlinked" &&  r.doctor_id) continue;
      if (tokens.length > 0) {
        const hay = corpus[i];
        let allHit = true;
        for (const t of tokens) {
          if (!hay.includes(t)) { allHit = false; break; }
        }
        if (!allHit) continue;
      }
      out.push(r);
    }
    out.sort((a, b) => {
      const ta = new Date(a.submitted_at).getTime();
      const tb = new Date(b.submitted_at).getTime();
      return sortDir === "newest" ? tb - ta : ta - tb;
    });
    return out;
  }, [responses, corpus, search, dateFilter, linkFilter, sortDir]);

  // Reset the render limit whenever the filter narrows the list so
  // "Load more" doesn't reveal stale offsets.
  useEffect(() => { setRenderLimit(100); }, [search, dateFilter, linkFilter, sortDir]);

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
    if (filtered.length === 0) { toast.error("Nothing to export."); return; }
    // Gather all distinct question keys across the filtered set so
    // the CSV has a stable column for every question, even ones some
    // responses didn't answer.
    const keys = new Set<string>();
    for (const r of filtered) for (const k of Object.keys(r.answers ?? {})) keys.add(k);
    const headers = ["submitted_at", "respondent_name", "respondent_email", "doctor_id", ...Array.from(keys)];
    const esc = (s: string | null | undefined) => {
      const v = s == null ? "" : String(s);
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    };
    const lines = [headers.join(",")];
    for (const r of filtered) {
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
    toast.success(`Exported ${filtered.length} responses.`);
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
              <Button size="sm" variant="outline" onClick={handleExportCsv} title={`Export filtered responses (${filtered.length}) to CSV`}>
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

      {/* Analytics strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Total submissions"     value={analytics.total}      tone="slate" />
        <Kpi label="This week"              value={analytics.thisWeek}   tone="emerald" />
        <Kpi label="Last 7 days"            value={analytics.last7Days}  tone="sky"     hint={`vs ${analytics.priorWindow} prior 7d`} />
        <Kpi label="Auto-linked to Zoho"    value={analytics.linkedCount} tone="indigo" hint={`${Math.round((analytics.linkedCount / Math.max(analytics.total, 1)) * 100)}% matched`} />
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
            {/* Zoho link chips */}
            <FilterChipGroup
              value={linkFilter}
              onChange={(v) => setLinkFilter(v as typeof linkFilter)}
              options={[
                { value: "all",      label: "All" },
                { value: "linked",   label: "Zoho-linked" },
                { value: "unlinked", label: "Unlinked" },
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
              {filtered.length === responses.length ? `${responses.length} responses` : `${filtered.length} of ${responses.length}`}
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
            <div className="rounded-md border border-dashed py-8 text-center">
              <Inbox className="h-5 w-5 mx-auto mb-2 text-muted-foreground/60" />
              <p className="text-[12px] text-muted-foreground">No submissions yet.</p>
              <p className="text-[10px] text-muted-foreground/80 mt-1">
                {form.provider === "typeform"
                  ? "Once the webhook is active in Typeform, submissions appear here within seconds. Or click 'Sync history' to backfill past responses."
                  : "Once the webhook URL is wired into Elementor, submissions appear here within seconds."}
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-md border border-dashed py-8 text-center">
              <Search className="h-5 w-5 mx-auto mb-2 text-muted-foreground/60" />
              <p className="text-[12px] text-muted-foreground">No matches for the current filter.</p>
              <button onClick={() => { setSearchRaw(""); setDateFilter("all"); setLinkFilter("all"); }} className="text-[11px] text-teal-700 hover:underline mt-1">
                Clear filters
              </button>
            </div>
          ) : (
            <>
              {filtered.slice(0, renderLimit).map(r => (
                <ResponseRow key={r.id} response={r} highlight={search.trim().toLowerCase()} />
              ))}
              {filtered.length > renderLimit && (
                <button
                  type="button"
                  onClick={() => setRenderLimit(n => n + 200)}
                  className="w-full py-2 text-[11px] text-teal-700 hover:bg-slate-50 rounded-md border border-dashed"
                >
                  Show {Math.min(200, filtered.length - renderLimit)} more · {filtered.length - renderLimit} remaining
                </button>
              )}
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

function ResponseRow({ response, highlight = "" }: { response: FormResponse; highlight?: string }) {
  const [open, setOpen] = useState(false);
  const entries = Object.entries(response.answers ?? {});
  // Auto-expand when the search term hits something INSIDE this
  // response's answers (rather than just the header) — saves the user
  // clicking each row to verify what matched.
  const matchesInBody = useMemo(() => {
    if (!highlight) return false;
    const tokens = highlight.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return false;
    const headerHay = `${response.respondent_name ?? ""} ${response.respondent_email ?? ""}`.toLowerCase();
    // Any token NOT in the header => must have matched in the body.
    return tokens.some(t => !headerHay.includes(t));
  }, [highlight, response.respondent_name, response.respondent_email]);
  const effectivelyOpen = open || matchesInBody;
  const summary = entries.slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(" · ");
  return (
    <div className="rounded-md border bg-white">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50"
      >
        <ChevronRight className={`h-3.5 w-3.5 text-slate-400 shrink-0 transition-transform ${effectivelyOpen ? "rotate-90" : ""}`} />
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-medium text-slate-800 truncate flex items-center gap-1">
            {response.respondent_name ? <UserIcon className="h-3 w-3 text-slate-400 shrink-0" /> : response.respondent_email ? <Mail className="h-3 w-3 text-slate-400 shrink-0" /> : null}
            <Hl text={response.respondent_name ?? response.respondent_email ?? "Anonymous submission"} q={highlight} />
          </div>
          <div className="text-[10px] text-muted-foreground truncate">
            <Hl text={summary || "—"} q={highlight} />
          </div>
        </div>
        {response.doctor_id && (
          <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200 shrink-0">
            <Sparkles className="h-2.5 w-2.5 mr-0.5" /> Zoho linked
          </Badge>
        )}
        <div className="text-[10px] text-muted-foreground shrink-0">{relativeTime(response.submitted_at)}</div>
      </button>
      {effectivelyOpen && (
        <div className="border-t bg-slate-50/30 px-3 py-2 space-y-1">
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
      )}
    </div>
  );
}

/** Highlight matched search tokens inside arbitrary text. Renders
 *  unchanged text when q is empty. Cheap; runs per cell on render. */
function Hl({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const tokens = q.trim().split(/\s+/).filter(t => t.length > 0);
  if (tokens.length === 0) return <>{text}</>;
  // Build a single regex that matches any token, case-insensitively.
  const escaped = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(re);
  return (
    <>
      {parts.map((p, i) =>
        re.test(p)
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
interface Analytics {
  total:        number;
  thisWeek:     number;
  last7Days:    number;
  priorWindow:  number;
  linkedCount:  number;
  questions:    Array<{
    question:     string;
    answeredCount: number;
    distinct:     number;
    topAnswers:   Array<{ value: string; count: number }>;
  }>;
}

function computeAnalytics(responses: FormResponse[]): Analytics {
  const now = Date.now();
  const startOfWeek = (d => { const date = new Date(d); const day = (date.getDay() + 6) % 7; date.setDate(date.getDate() - day); date.setHours(0,0,0,0); return date; })(new Date());
  const cutoff7   = now - 7  * 86_400_000;
  const cutoff14  = now - 14 * 86_400_000;

  let thisWeek = 0;
  let last7    = 0;
  let prior7   = 0;
  let linked   = 0;
  const questionCounts = new Map<string, Map<string, number>>();

  for (const r of responses) {
    const t = new Date(r.submitted_at).getTime();
    if (t >= startOfWeek.getTime()) thisWeek++;
    if (t >= cutoff7)               last7++;
    else if (t >= cutoff14)         prior7++;
    if (r.doctor_id)                linked++;
    for (const [k, v] of Object.entries(r.answers ?? {})) {
      let m = questionCounts.get(k);
      if (!m) { m = new Map(); questionCounts.set(k, m); }
      m.set(v, (m.get(v) ?? 0) + 1);
    }
  }

  const questions = Array.from(questionCounts.entries())
    .map(([question, valueMap]) => {
      const totalAnswers = Array.from(valueMap.values()).reduce((a, b) => a + b, 0);
      const top = Array.from(valueMap.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([value, count]) => ({ value, count }));
      return { question, answeredCount: totalAnswers, distinct: valueMap.size, topAnswers: top };
    })
    .sort((a, b) => b.answeredCount - a.answeredCount);

  return {
    total:        responses.length,
    thisWeek,
    last7Days:    last7,
    priorWindow:  prior7,
    linkedCount:  linked,
    questions,
  };
}

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
