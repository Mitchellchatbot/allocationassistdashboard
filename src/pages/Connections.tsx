import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Link2, RefreshCw, Plus, AlertTriangle, CheckCircle2, Pause, Play, Trash2, ExternalLink, Clock, FileSpreadsheet, ChevronsUpDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useDriveFiles, driveFileKind, type DriveFile } from "@/hooks/use-drive-files";
import { toast } from "sonner";
import {
  useSheetConnections, useCreateSheetConnection, useUpdateSheetConnection,
  useDeleteSheetConnection, useSyncSheetConnectionNow,
  previewSheetConnection, fetchSheetHeaders,
  type SheetConnection, type SheetTargetKind, type SheetAuthMode, normalizeSheetUrl, extractSheetIds,
} from "@/hooks/use-sheet-connections";
import { IMPORTABLE_TABLES, findImportableTable, autoMapColumns } from "@/lib/importable-tables";
import { useGoogleOAuthStatus, useStartGoogleOAuth, useDisconnectGoogle, googleOAuthEnabledOnClient } from "@/hooks/use-google-oauth";
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Connections page.
 *
 * The team pastes a Google Sheets URL once; tick-scheduler re-fetches and
 * re-parses it on the configured cadence (default hourly). No more manual
 * CSV pasting in the Bulk Import tabs — keep editing the sheet in Google
 * Sheets like normal, the dashboard mirrors automatically.
 *
 * Supports six target kinds (see SheetTargetKind). Each ties to a specific
 * parser in supabase/functions/sheets-sync.
 */
export default function Connections() {
  const { data: connections = [], isLoading } = useSheetConnections();
  const { data: oauth, isLoading: oauthLoading } = useGoogleOAuthStatus();
  const startOAuth   = useStartGoogleOAuth();
  const disconnect   = useDisconnectGoogle();
  const [createOpen, setCreateOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Surface the OAuth-callback result via URL query (?oauth=ok|error&message=...)
  useEffect(() => {
    const result = searchParams.get("oauth");
    if (!result) return;
    const message = searchParams.get("message") ?? "";
    if (result === "ok") toast.success(`Connected to Google${message ? ` (${message})` : ""}.`);
    else                 toast.error(`Google connect failed: ${message}`);
    // Clean the URL so a refresh doesn't re-trigger the toast.
    searchParams.delete("oauth"); searchParams.delete("message");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Link2 className="h-6 w-6 text-teal-600" />
              Connections
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Plug in any Google Sheet (or Excel file in Drive). The dashboard pulls fresh rows on a
              schedule, parses them, and writes them to the right table.
            </p>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)} disabled={!oauth?.connected}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> New connection
          </Button>
        </div>

        {/* Google account status — required before connections can sync */}
        <Card className={oauth?.connected ? "border-emerald-200 bg-emerald-50/30" : "border-amber-200 bg-amber-50/40"}>
          <CardContent className="py-3 px-4 flex items-start gap-3">
            <FileSpreadsheet className={`h-4 w-4 mt-0.5 shrink-0 ${oauth?.connected ? "text-emerald-700" : "text-amber-700"}`} />
            <div className="flex-1 min-w-0">
              {oauthLoading ? (
                <div className="text-[12px] text-muted-foreground">Checking Google connection...</div>
              ) : oauth?.connected ? (
                <>
                  <div className="text-[13px] font-medium text-emerald-900">
                    Connected to {oauth.account_email ?? "Google"}
                  </div>
                  <div className="text-[11px] text-emerald-800/80 mt-0.5">
                    Reads Google Sheets + Excel files in this account's Drive.
                    {oauth.connected_by && <> · connected by {oauth.connected_by}</>}
                  </div>
                </>
              ) : (
                <>
                  <div className="text-[13px] font-medium text-amber-900">
                    Connect a Google account to sync sheets
                  </div>
                  <div className="text-[11px] text-amber-900/80 mt-0.5 leading-relaxed">
                    One-time OAuth login. The team's Drive stays private — only the connected
                    account (and whoever it shares with) can see the files. Both
                    <strong> Google Sheets </strong> and <strong>Excel (.xlsx)</strong> work.
                  </div>
                </>
              )}
            </div>
            <div className="shrink-0">
              {oauth?.connected ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-[11px] text-rose-600 hover:bg-rose-50"
                  onClick={async () => {
                    if (!confirm("Disconnect Google? Existing sheet connections will stop syncing until you reconnect.")) return;
                    try { await disconnect.mutateAsync(); toast.success("Disconnected."); }
                    catch (e) { toast.error(e instanceof Error ? e.message : "Disconnect failed"); }
                  }}
                >
                  Disconnect
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => {
                    if (!googleOAuthEnabledOnClient()) {
                      toast.error("Set VITE_GOOGLE_OAUTH_CLIENT_ID in your env first. See the setup guide below.");
                      return;
                    }
                    try { startOAuth(); }
                    catch (e) { toast.error(e instanceof Error ? e.message : "OAuth start failed"); }
                  }}
                >
                  Connect Google
                </Button>
              )}
            </div>
          </CardContent>
        </Card>


        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Active connections</CardTitle>
            <CardDescription className="text-[11px]">
              Status, last sync result, and a "Sync now" button per row. Pause a connection to stop the auto-sweep.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading && <div className="px-4 py-6 text-[12px] text-muted-foreground">Loading...</div>}
            {!isLoading && connections.length === 0 && (
              <div className="px-4 py-12 text-center text-[12px] text-muted-foreground">
                No connections yet. Click <strong>New connection</strong> to wire up your first sheet.
              </div>
            )}
            {!isLoading && connections.length > 0 && (
              <div className="divide-y">
                {connections.map(c => <Row key={c.id} c={c} />)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <CreateDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </DashboardLayout>
  );
}

function Row({ c }: { c: SheetConnection }) {
  const syncNow = useSyncSheetConnectionNow();
  const update  = useUpdateSheetConnection();
  const remove  = useDeleteSheetConnection();
  const [busy, setBusy] = useState(false);

  const handleSync = async () => {
    setBusy(true);
    try {
      const r = await syncNow.mutateAsync(c.id);
      const s = r.summary;
      const parts = [
        s?.created ? `${s.created} created` : null,
        s?.updated ? `${s.updated} updated` : null,
        s?.skipped ? `${s.skipped} skipped` : null,
        s?.unmatched ? `${s.unmatched} unmatched` : null,
      ].filter(Boolean).join(" · ");
      toast.success(`Synced "${c.label}". ${parts || "no changes"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally { setBusy(false); }
  };

  const handleToggle = async () => {
    try { await update.mutateAsync({ id: c.id, patch: { active: !c.active } }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Toggle failed"); }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete connection "${c.label}"? The sheet itself isn't touched.`)) return;
    try { await remove.mutateAsync(c.id); toast.success("Connection deleted."); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); }
  };

  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-medium truncate">{c.label}</span>
          <KindBadge kind={c.target_kind} />
          <Badge variant="outline" className={`text-[9px] uppercase tracking-wider ${c.auth_mode === "oauth" || c.auth_mode === "service_account" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
            {c.auth_mode === "oauth" ? "Private · OAuth" : c.auth_mode === "service_account" ? "Private · SA" : "Public link"}
          </Badge>
          {!c.active && (
            <Badge variant="outline" className="text-[9px] bg-slate-100 text-slate-600 border-slate-200 uppercase tracking-wider">
              Paused
            </Badge>
          )}
          {c.last_error && c.active && (
            <Badge variant="outline" className="text-[9px] bg-rose-100 text-rose-700 border-rose-200 uppercase tracking-wider">
              Error
            </Badge>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
          <Clock className="h-3 w-3" />
          {c.last_synced_at
            ? <>Last synced {relativeAge(c.last_synced_at)}</>
            : <>Never synced</>}
          <span className="text-muted-foreground/50">·</span>
          <span>Every {c.schedule_minutes} min</span>
          <span className="text-muted-foreground/50">·</span>
          <a href={c.sheet_url} target="_blank" rel="noopener noreferrer" className="text-teal-700 hover:underline inline-flex items-center gap-0.5">
            Open sheet <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>
        {c.last_summary && c.active && !c.last_error && (
          <div className="text-[10px] text-emerald-700 mt-0.5 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Last run · {c.last_summary.created ?? 0} created, {c.last_summary.updated ?? 0} updated
            {c.last_summary.unmatched ? `, ${c.last_summary.unmatched} unmatched` : ""}
          </div>
        )}
        {c.last_error && (
          <div className="text-[10px] text-rose-700 mt-0.5 flex items-start gap-1">
            <AlertTriangle className="h-3 w-3 mt-[1px]" />
            <span className="line-clamp-2">{c.last_error}</span>
          </div>
        )}
      </div>
      <Button size="sm" variant="outline" className="h-8 text-[10px]" disabled={busy || !c.active} onClick={handleSync}>
        <RefreshCw className={`h-3 w-3 mr-1 ${busy ? "animate-spin" : ""}`} /> Sync now
      </Button>
      <Button size="sm" variant="ghost" className="h-8 text-[10px]" onClick={handleToggle}>
        {c.active ? <><Pause className="h-3 w-3 mr-1" /> Pause</> : <><Play className="h-3 w-3 mr-1" /> Resume</>}
      </Button>
      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50" onClick={handleDelete}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function KindBadge({ kind }: { kind: SheetTargetKind }) {
  const META: Record<SheetTargetKind, { label: string; cls: string }> = {
    hospitals:            { label: "Hospitals",            cls: "bg-cyan-100 text-cyan-800 border-cyan-200" },
    vacancies:            { label: "Vacancies",            cls: "bg-amber-100 text-amber-800 border-amber-200" },
    unavailable_doctors:  { label: "Unavailable doctors",  cls: "bg-orange-100 text-orange-800 border-orange-200" },
    placements:           { label: "Placements",           cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    source_overrides:     { label: "Source overrides",     cls: "bg-purple-100 text-purple-800 border-purple-200" },
    hospital_templates:   { label: "Templates",            cls: "bg-pink-100 text-pink-800 border-pink-200" },
  };
  const meta = META[kind];
  return <Badge variant="outline" className={`${meta.cls} text-[9px] uppercase tracking-wider`}>{meta.label}</Badge>;
}

function CreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateSheetConnection();
  const [label,       setLabel]       = useState("");
  const [url,         setUrl]         = useState("");
  const [kind,        setKind]        = useState<SheetTargetKind>("unavailable_doctors");
  const [authMode,    setAuthMode]    = useState<SheetAuthMode>("oauth");
  const [scheduleMin, setScheduleMin] = useState(60);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ rows: number; sample: string[] } | { error: string } | null>(null);

  const parsedIds = extractSheetIds(url);
  const previewCsv = normalizeSheetUrl(url);
  const urlValid = !!parsedIds || !!previewCsv;

  const handleTest = async () => {
    if (!url.trim()) { toast.error("Paste a URL first."); return; }
    setTesting(true);
    setTestResult(null);
    try {
      const r = await previewSheetConnection(url, kind, authMode);
      setTestResult(r);
    } finally { setTesting(false); }
  };

  const handle = async () => {
    if (!label.trim()) { toast.error("Give the connection a label."); return; }
    if (!url.trim())   { toast.error("Paste a Google Sheets URL."); return; }
    if (!urlValid)     { toast.error("URL doesn't look like a Google Sheet."); return; }
    setBusy(true);
    try {
      await create.mutateAsync({
        label,
        sheet_url:        url,
        target_kind:      kind,
        auth_mode:        authMode,
        schedule_minutes: scheduleMin,
      });
      toast.success("Connection created. Click 'Sync now' to do the first pull.");
      setLabel(""); setUrl(""); setKind("unavailable_doctors"); setAuthMode("service_account"); setScheduleMin(60);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>New connection</DialogTitle>
          <DialogDescription className="text-[12px]">
            Wire a Google Sheet to a destination table. Sheet must be share-link-viewable.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-[11px]">Label</Label>
            <Input value={label} onChange={e => setLabel(e.target.value)} placeholder='e.g. "Unavailable doctors — Ammar"' className="h-9 text-[12px]" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Google Sheet</Label>
            {authMode === "oauth" ? (
              <SheetPicker
                value={url}
                onChange={(v, label) => {
                  setUrl(v);
                  // If the user hasn't typed a label yet, prefill from the sheet name.
                  setLabel(prev => prev.trim() ? prev : label);
                }}
              />
            ) : (
              <Input
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=0"
                className="h-9 text-[12px] font-mono"
              />
            )}
            {url && (
              urlValid
                ? <p className="text-[10px] text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    Sheet ID: <span className="font-mono">{parsedIds?.sheetId.slice(0, 16)}…</span>
                    {parsedIds?.gid && <> · tab {parsedIds.gid}</>}
                  </p>
                : <p className="text-[10px] text-rose-700 flex items-center gap-1"><AlertTriangle className="h-2.5 w-2.5" /> Doesn't look like a Google Sheets URL.</p>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-[11px]">Access mode</Label>
            <div className="rounded-2xl border bg-card p-1 inline-flex w-full">
              <button
                type="button"
                onClick={() => setAuthMode("oauth")}
                className={`flex-1 px-3 py-1.5 text-[11px] font-medium rounded-xl transition-colors ${authMode === "oauth" ? "bg-teal-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Private · Google account
              </button>
              <button
                type="button"
                onClick={() => setAuthMode("public_csv")}
                className={`flex-1 px-3 py-1.5 text-[11px] font-medium rounded-xl transition-colors ${authMode === "public_csv" ? "bg-teal-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Public · link-share
              </button>
            </div>
            {authMode === "oauth" ? (
              <div className="rounded-xl border border-teal-200/60 bg-teal-50/40 px-3 py-2 mt-1 text-[11px] text-teal-900 leading-relaxed">
                Pulls via the connected Google account. Works for both Google Sheets AND Excel
                (.xlsx) files in the account's Drive. Sheet stays as private as it is in Drive.
              </div>
            ) : (
              <div className="rounded-xl border border-amber-200/60 bg-amber-50/40 px-3 py-2 mt-1 text-[11px] text-amber-900 leading-relaxed">
                Sheet must be shared <strong>"Anyone with the link · Viewer"</strong>. Anyone who guesses the URL can read.
                Excel files don't work in this mode — use Private for those.
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px]">Destination</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as SheetTargetKind)}>
                <SelectTrigger className="h-9 text-[12px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hospitals">Hospitals</SelectItem>
                  <SelectItem value="vacancies">Vacancies</SelectItem>
                  <SelectItem value="unavailable_doctors">Unavailable doctors</SelectItem>
                  <SelectItem value="placements">Historical placements</SelectItem>
                  <SelectItem value="source_overrides">Lead source overrides</SelectItem>
                  <SelectItem value="hospital_templates">Per-hospital email templates</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Sync every (minutes)</Label>
              <Input
                type="number"
                min={5}
                value={scheduleMin}
                onChange={e => setScheduleMin(Math.max(5, Number(e.target.value) || 60))}
                className="h-9 text-[12px]"
              />
            </div>
          </div>
        </div>
        {testResult && (
          "rows" in testResult ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-[11px] text-emerald-900">
              <div className="font-medium flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3" />
                Test pass · would import <strong>{testResult.rows}</strong> row{testResult.rows === 1 ? "" : "s"}.
              </div>
              {testResult.sample.length > 0 && (
                <div className="text-[10px] text-emerald-700 mt-1 line-clamp-2">
                  Sample: {testResult.sample.join(" · ")}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-rose-200 bg-rose-50/60 px-3 py-2 text-[11px] text-rose-900 flex items-start gap-1.5">
              <AlertTriangle className="h-3 w-3 mt-[2px]" />
              <span>{testResult.error}</span>
            </div>
          )
        )}
        <DialogFooter>
          <Button variant="outline" onClick={handleTest} disabled={busy || testing || !url.trim()} className="mr-auto">
            <RefreshCw className={`h-3 w-3 mr-1.5 ${testing ? "animate-spin" : ""}`} />
            {testing ? "Testing..." : "Test parse"}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={handle} disabled={busy}>{busy ? "Creating..." : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Searchable Google Sheets picker. Lists files from the connected Google
 *  account's Drive (filtered to Sheets + Excel). Selecting one fills the URL
 *  field with the canonical docs.google.com link so the rest of the flow —
 *  sheet-id parsing, preview, sync — works unchanged. */
function SheetPicker({ value, onChange }: { value: string; onChange: (url: string, name: string) => void }) {
  const [open, setOpen] = useState(false);
  const { data: files = [], isLoading, isError, error, refetch, isFetching } = useDriveFiles(open || !!value);

  const selected = files.find(f => buildSheetUrl(f) === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-9 text-[12px] font-normal"
        >
          {selected ? (
            <span className="flex items-center gap-2 truncate">
              <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <span className="truncate">{selected.name}</span>
              {driveFileKind(selected.mimeType) === "excel" && (
                <Badge variant="outline" className="text-[9px] bg-blue-50 text-blue-700 border-blue-200">xlsx</Badge>
              )}
            </span>
          ) : (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Search className="h-3.5 w-3.5" />
              Search your Google Sheets…
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]" align="start">
        <Command>
          <CommandInput placeholder="Search by sheet name…" />
          <CommandList className="max-h-[280px]">
            {isLoading || isFetching ? (
              <div className="px-4 py-6 text-center text-[12px] text-muted-foreground">
                <RefreshCw className="h-3.5 w-3.5 inline-block mr-1.5 animate-spin" />
                Loading from Drive…
              </div>
            ) : isError ? (
              <div className="px-4 py-6 text-center text-[11px] text-rose-700">
                <AlertTriangle className="h-3.5 w-3.5 inline-block mr-1" />
                {error instanceof Error ? error.message : "Failed to load."}
                <Button variant="link" size="sm" onClick={() => refetch()} className="text-[11px]">Retry</Button>
              </div>
            ) : (
              <>
                <CommandEmpty>No sheets found.</CommandEmpty>
                <CommandGroup heading={`${files.length} sheet${files.length === 1 ? "" : "s"} in your Drive`}>
                  {files.map(f => (
                    <CommandItem
                      key={f.id}
                      value={`${f.name} ${f.id}`}
                      onSelect={() => {
                        onChange(buildSheetUrl(f), f.name);
                        setOpen(false);
                      }}
                      className="flex items-start gap-2 py-2"
                    >
                      <FileSpreadsheet className={`h-3.5 w-3.5 shrink-0 mt-[2px] ${driveFileKind(f.mimeType) === "sheet" ? "text-emerald-600" : "text-blue-600"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] truncate flex items-center gap-1.5">
                          {f.name}
                          {driveFileKind(f.mimeType) === "excel" && (
                            <Badge variant="outline" className="text-[8px] bg-blue-50 text-blue-700 border-blue-200 px-1 py-0">xlsx</Badge>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          Modified {relativeAge(f.modifiedTime)}
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Canonical docs.google.com URL for a Drive file (Sheet or Excel). The
 *  existing sheet-id parser handles either — Excel files just route through
 *  the OAuth + SheetJS path in sheets-sync. */
function buildSheetUrl(f: DriveFile): string {
  // For native Google Sheets the canonical URL is /spreadsheets/d/{id}/edit.
  // For Excel files we use the Drive webViewLink so the user can preview, and
  // sheets-sync's OAuth path detects the mime and routes via Drive download.
  if (f.mimeType === "application/vnd.google-apps.spreadsheet") {
    return `https://docs.google.com/spreadsheets/d/${f.id}/edit`;
  }
  return f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`;
}

function relativeAge(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hrs  = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hrs  < 24)  return `${hrs}h ago`;
  if (days === 1) return "yesterday";
  if (days < 30)  return `${days}d ago`;
  try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
  catch { return iso; }
}

// Suppress unused for Switch — kept for follow-up where we may add a toggle in
// the create dialog itself rather than the row.
void Switch;
