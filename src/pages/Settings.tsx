import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAuth, ROLE_PRESETS, ALL_PAGES } from "@/hooks/use-auth";
import { Trash2, Plus, UserCog, Slack as SlackIcon, Send, Loader2, CheckCircle2, AlertCircle, Pencil } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Permission-checkbox labels in the Add User dialog. Kept aligned with
// the sidebar nav so what an admin grants matches what the user sees.
// /leads-pipeline and /doctor-profiles are gone — folded into /doctors.
const PAGE_LABELS: Record<string, string> = {
  "/":               "Dashboard",
  "/sales":          "Sales Tracker",
  "/marketing":      "Marketing",
  "/team":           "Team Performance",
  "/finance":        "Finance",
  "/meta-ads":       "Meta Ads",
  "/settings":       "Settings",
  "/worker":         "Worker Portal (upload & view records)",
  "/my-workspace":   "My Workspace",
  "/doctors":        "Doctors (Progress + Profiles)",
  "/automations":    "Automations",
  "/vacancies":      "Vacancies",
  "/batches":        "Batch Sends",
  "/reports":        "Reports",
  "/forms":          "Forms",
  "/follow-ups":     "Follow-ups",
  "/calls":          "Calls",
  "/contracts":      "Contract Builder",
  "/import":         "Import Data",
  "/import-bulk":    "Bulk Import",
  "/connections":    "Connections",
};

const ROLE_COLORS: Record<string, string> = {
  admin:   "bg-primary/10 text-primary",
  sales:   "bg-blue-500/10 text-blue-600",
  finance: "bg-emerald-500/10 text-emerald-600",
  worker:  "bg-orange-500/10 text-orange-600",
  custom:  "bg-muted text-muted-foreground",
};

interface UserRow {
  id:            string;
  email:         string;
  full_name:     string | null;
  role:          string;
  allowed_pages: string[];
  created_at:    string;
}

// ── Add User Dialog ──────────────────────────────────────────────────────────

function AddUserDialog({
  open,
  onClose,
  onCreated,
  session,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  session: { access_token: string } | null;
}) {
  const [email,        setEmail]        = useState("");
  const [password,     setPassword]     = useState("");
  const [fullName,     setFullName]     = useState("");
  const [role,         setRole]         = useState("sales");
  const [pages,        setPages]        = useState<string[]>(ROLE_PRESETS.sales);
  const [saving,       setSaving]       = useState(false);

  // When role preset changes, auto-populate pages
  function handleRoleChange(r: string) {
    setRole(r);
    if (r !== "custom") setPages(ROLE_PRESETS[r] ?? []);
  }

  function togglePage(p: string) {
    setPages(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  }

  async function handleSave() {
    if (!email || !password) { toast.error("Email and password are required"); return; }
    setSaving(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-user`, {
        method:  "POST",
        headers: {
          "apikey":        SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${session?.access_token}`,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify({ email, password, full_name: fullName || null, role, allowed_pages: pages }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to create user");
      toast.success(`User ${email} created`);
      onCreated();
      onClose();
      setEmail(""); setPassword(""); setFullName(""); setRole("sales"); setPages(ROLE_PRESETS.sales);
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Add User</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1">
            <Label className="text-[11px]">Full Name (optional)</Label>
            <Input value={fullName} onChange={e => setFullName(e.target.value)} className="h-8 text-[12px]" placeholder="Jane Smith" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Email</Label>
            <Input value={email} onChange={e => setEmail(e.target.value)} type="email" className="h-8 text-[12px]" placeholder="jane@example.com" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Password</Label>
            <Input value={password} onChange={e => setPassword(e.target.value)} type="text" className="h-8 text-[12px]" placeholder="Temporary password" />
          </div>

          {/* Role selector */}
          <div className="space-y-1.5">
            <Label className="text-[11px]">Role</Label>
            <div className="flex flex-wrap gap-1.5">
              {["admin", "sales", "finance", "worker", "custom"].map(r => (
                <button
                  key={r}
                  onClick={() => handleRoleChange(r)}
                  className={`px-3 py-1 rounded-full text-[11px] font-medium border transition-colors capitalize ${
                    role === r
                      ? "bg-primary text-white border-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Pages checklist — always shown so admin can review/tweak */}
          <div className="space-y-1.5">
            <Label className="text-[11px]">Page Access</Label>
            <div className="grid grid-cols-2 gap-1">
              {ALL_PAGES.map(p => (
                <label key={p} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pages.includes(p)}
                    onChange={() => togglePage(p)}
                    className="h-3 w-3 accent-primary"
                  />
                  <span className="text-[11px] text-foreground">{PAGE_LABELS[p] ?? p}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} className="h-7 text-[11px]">Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="h-7 text-[11px]">
            {saving ? "Creating…" : "Create User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit User Dialog ──────────────────────────────────────────────────────────
// Change an existing user's role + page access after they've been created.
// Email/password are fixed here (auth-level); this just edits who-sees-what.

function EditUserDialog({
  user,
  onClose,
  onUpdated,
  session,
}: {
  user: UserRow | null;
  onClose: () => void;
  onUpdated: () => void;
  session: { access_token: string } | null;
}) {
  const [fullName, setFullName] = useState("");
  const [role,     setRole]     = useState("custom");
  const [pages,    setPages]    = useState<string[]>([]);
  const [saving,   setSaving]   = useState(false);

  // Re-seed the form whenever a different user is opened for editing.
  useEffect(() => {
    if (!user) return;
    setFullName(user.full_name ?? "");
    setRole(user.role);
    setPages(user.allowed_pages ?? []);
  }, [user?.id]);

  function handleRoleChange(r: string) {
    setRole(r);
    if (r !== "custom") setPages(ROLE_PRESETS[r] ?? []);
  }
  function togglePage(p: string) {
    setPages(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/update-user`, {
        method:  "POST",
        headers: {
          "apikey":        SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${session?.access_token}`,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify({ userId: user.id, email: user.email, full_name: fullName || null, role, allowed_pages: pages }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to update user");
      toast.success(`Access updated for ${user.email}`);
      onUpdated();
      onClose();
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : err));
    } finally {
      setSaving(false);
    }
  }

  // Every real role (admin/sales/finance/worker/hi_member) plus "custom" for
  // a hand-picked page set.
  const ROLES = [...Object.keys(ROLE_PRESETS), "custom"];

  return (
    <Dialog open={!!user} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Edit access{user ? ` — ${user.full_name ?? user.email}` : ""}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1">
            <Label className="text-[11px]">Email</Label>
            <Input value={user?.email ?? ""} disabled className="h-8 text-[12px] opacity-60" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Full Name</Label>
            <Input value={fullName} onChange={e => setFullName(e.target.value)} className="h-8 text-[12px]" placeholder="Jane Smith" />
          </div>

          {/* Role selector — picking a preset re-fills the page list; "custom" leaves it as-is */}
          <div className="space-y-1.5">
            <Label className="text-[11px]">Role</Label>
            <div className="flex flex-wrap gap-1.5">
              {ROLES.map(r => (
                <button
                  key={r}
                  onClick={() => handleRoleChange(r)}
                  className={`px-3 py-1 rounded-full text-[11px] font-medium border transition-colors capitalize ${
                    role === r
                      ? "bg-primary text-white border-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {r.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          </div>

          {/* Pages checklist */}
          <div className="space-y-1.5">
            <Label className="text-[11px]">Page Access</Label>
            <div className="grid grid-cols-2 gap-1">
              {ALL_PAGES.map(p => (
                <label key={p} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pages.includes(p)}
                    onChange={() => togglePage(p)}
                    className="h-3 w-3 accent-primary"
                  />
                  <span className="text-[11px] text-foreground">{PAGE_LABELS[p] ?? p}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} className="h-7 text-[11px]">Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="h-7 text-[11px]">
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab({ session }: { session: { access_token: string } | null }) {
  const [users,      setUsers]      = useState<UserRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting,   setDeleting]   = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/get-users`, {
        method: "POST",
        headers: {
          "apikey":        SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${session?.access_token}`,
          "Content-Type":  "application/json",
        },
      });
      const json = await res.json();
      setUsers((json.users as UserRow[]) ?? []);
    } catch {
      setUsers([]);
    }
    setLoading(false);
  }

  useEffect(() => { loadUsers(); }, []);

  async function handleDelete(userId: string, email: string) {
    if (!confirm(`Delete user ${email}? This cannot be undone.`)) return;
    setDeleting(userId);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-user`, {
        method:  "POST",
        headers: {
          "apikey":        SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${session?.access_token}`,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify({ userId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to delete user");
      toast.success(`User ${email} deleted`);
      loadUsers();
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : err));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-semibold">Team Members</p>
          <p className="text-[11px] text-muted-foreground">{users.length} user{users.length !== 1 ? "s" : ""}</p>
        </div>
        <Button size="sm" className="h-7 text-[11px] gap-1.5" onClick={() => setDialogOpen(true)}>
          <Plus className="h-3 w-3" /> Add User
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-8 text-[12px] text-muted-foreground">No users yet. Add one above.</div>
      ) : (
        <div className="space-y-1.5">
          {users.map(u => (
            <div key={u.id} className="flex items-center gap-3 rounded-lg border border-border/50 bg-card px-3 py-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                {u.email.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[12px] font-medium truncate">{u.full_name ?? u.email}</p>
                  <span className={`shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium capitalize ${ROLE_COLORS[u.role] ?? ROLE_COLORS.custom}`}>
                    {u.role}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground truncate">{u.full_name ? u.email : ""}</p>
              </div>
              <div className="hidden sm:flex flex-wrap gap-1 max-w-[200px]">
                {u.allowed_pages.slice(0, 4).map(p => (
                  <span key={p} className="px-1.5 py-0.5 rounded text-[9px] bg-muted text-muted-foreground">
                    {PAGE_LABELS[p] ?? p}
                  </span>
                ))}
                {u.allowed_pages.length > 4 && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] bg-muted text-muted-foreground">
                    +{u.allowed_pages.length - 4}
                  </span>
                )}
              </div>
              <button
                onClick={() => setEditingUser(u)}
                title="Edit role & page access"
                className="shrink-0 flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => handleDelete(u.id, u.email)}
                disabled={deleting === u.id}
                title="Delete user"
                className="shrink-0 flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <AddUserDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={loadUsers}
        session={session}
      />

      <EditUserDialog
        user={editingUser}
        onClose={() => setEditingUser(null)}
        onUpdated={loadUsers}
        session={session}
      />
    </div>
  );
}

// ── Settings Page ─────────────────────────────────────────────────────────────

type Tab = "general" | "notifications" | "users";

const Settings = () => {
  const { role, session } = useAuth();
  const [tab, setTab] = useState<Tab>("general");

  return (
    <DashboardLayout title="Settings" subtitle="Account and notification preferences" docSlug="admin/settings">
      {/* Tab bar */}
      <div className="flex gap-1 mb-4 border-b border-border/50">
        {(["general", "notifications", ...(role === "admin" ? ["users"] : [])] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-[12px] font-medium capitalize border-b-2 transition-colors -mb-px ${
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "users" ? (
              <span className="flex items-center gap-1.5"><UserCog className="h-3.5 w-3.5" />Users</span>
            ) : t}
          </button>
        ))}
      </div>

      <div className="max-w-2xl">
        {tab === "general" && (
          <Card className="shadow-sm border-border/50">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-[13px] font-semibold">Organization</CardTitle>
              <CardDescription className="text-[11px]">Company details</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div className="space-y-1">
                <Label className="text-[11px]">Company Name</Label>
                <Input defaultValue="Allocation Assist" className="h-8 text-[12px]" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Contact Email</Label>
                <Input defaultValue="info@allocationassist.com" className="h-8 text-[12px]" />
              </div>
              <Button size="sm" className="h-7 text-[11px]">Save</Button>
            </CardContent>
          </Card>
        )}

        {tab === "notifications" && (
          <div className="space-y-3">
            <SlackIntegrationCard />
            <MyNotificationPrefsCard session={session} />
          </div>
        )}

        {tab === "users" && role === "admin" && (
          <Card className="shadow-sm border-border/50">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-[13px] font-semibold">User Management</CardTitle>
              <CardDescription className="text-[11px]">Create accounts and assign page-level access</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <UsersTab session={session} />
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Settings;

/* ─────────────────────────────────────────────────────────────────────
 * Slack integration card — admin-side wiring.
 *
 * The webhook URL itself lives in the Supabase edge-function secrets
 * (SLACK_WEBHOOK_URL) so we don't store it in the browser. This card
 * surfaces a "Send test message" button that hits a tiny edge function
 * + reports whether the webhook is configured.
 * ─────────────────────────────────────────────────────────────────── */
function SlackIntegrationCard() {
  const [pinging, setPinging] = useState(false);
  const [result,  setResult]  = useState<{ ok: boolean; reason?: string } | null>(null);

  const handleTest = async () => {
    setPinging(true); setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("slack-test", { body: {} });
      if (error) throw error;
      const resp = data as { ok: boolean; reason?: string };
      setResult(resp);
      if (resp.ok) toast.success("Test message sent to Slack");
      else         toast.error("Slack test failed", { description: resp.reason });
    } catch (e) {
      const reason = (e as Error).message;
      setResult({ ok: false, reason });
      toast.error("Slack test failed", { description: reason });
    } finally {
      setPinging(false);
    }
  };

  return (
    <Card className="shadow-sm border-border/50">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-[13px] font-semibold flex items-center gap-2">
          <SlackIcon className="h-4 w-4 text-violet-600" /> Slack
        </CardTitle>
        <CardDescription className="text-[11px]">
          Action + critical notifications mirror to Slack. Info-level stuff stays in-dashboard so the channel doesn't get noisy.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2.5 text-[11px] text-muted-foreground space-y-1.5">
          <p className="font-medium text-foreground">Webhook setup (one-time, admin only)</p>
          <ol className="list-decimal pl-4 space-y-0.5">
            <li>Create an Incoming Webhook in Slack pointed at the team channel.</li>
            <li>Save the URL into the edge function secret:
              <code className="ml-1 bg-background border border-border rounded px-1.5 py-0.5 text-[10px] font-mono">npx supabase secrets set SLACK_WEBHOOK_URL=…</code>
            </li>
            <li>Hit <span className="font-medium text-foreground">Send test message</span> below to confirm it works.</li>
          </ol>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={handleTest} disabled={pinging} size="sm" className="h-8">
            {pinging ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
            Send test message
          </Button>
          {result && (
            <span className={`inline-flex items-center gap-1 text-[11px] ${result.ok ? "text-emerald-700" : "text-rose-700"}`}>
              {result.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
              {result.ok ? "Delivered" : (result.reason ?? "Failed")}
            </span>
          )}
        </div>

        <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2.5 text-[11px] text-muted-foreground space-y-1.5">
          <p className="font-medium text-foreground">Severity model</p>
          <ul className="space-y-0.5">
            <li><span className="inline-block w-2 h-2 rounded-full bg-rose-500 mr-1.5" /><span className="font-medium text-rose-700">Critical</span> — Slack channel post + dashboard.</li>
            <li><span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1.5" /><span className="font-medium text-amber-700">Needs action</span> — Slack mention of the assigned owner + dashboard.</li>
            <li><span className="inline-block w-2 h-2 rounded-full bg-slate-400 mr-1.5" /><span className="font-medium text-slate-600">Info</span> — dashboard only.</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

/** Per-user Slack handle so @-mentions route correctly when the
 *  notification's `for_user` matches the signed-in account. */
function MyNotificationPrefsCard({ session }: { session: { user?: { email?: string } } | null }) {
  const myEmail = session?.user?.email ?? "";
  const [handle, setHandle] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!myEmail) return;
    void (async () => {
      const { data } = await supabase
        .from("user_profiles")
        .select("slack_handle")
        .eq("email", myEmail)
        .maybeSingle();
      setHandle((data as { slack_handle?: string | null } | null)?.slack_handle ?? "");
      setLoaded(true);
    })();
  }, [myEmail]);

  const save = async () => {
    setSaving(true);
    try {
      // Routed through the `set_my_slack_handle` RPC: security-definer,
      // upserts by auth.uid(), only ever touches the calling user's
      // slack_handle column. Avoids the RLS UPDATE-policy rabbit hole
      // and the non-unique-email ON CONFLICT trap.
      const { error } = await supabase.rpc("set_my_slack_handle", { handle });
      if (error) throw error;
      toast.success("Slack handle saved");
    } catch (e) {
      toast.error("Couldn't save", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="shadow-sm border-border/50">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-[13px] font-semibold">Your Slack handle</CardTitle>
        <CardDescription className="text-[11px]">
          We'll @-mention this when a notification is assigned to you. Leave blank to fall back to your email.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-muted-foreground">@</span>
          <Input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="rodaina"
            disabled={!loaded || saving}
            className="h-8 text-[12px] max-w-[200px]"
          />
          <Button size="sm" onClick={save} disabled={!loaded || saving} className="h-8">
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
