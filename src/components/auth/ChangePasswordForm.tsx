/**
 * Change your own password while signed in.
 *
 * Supabase's updateUser doesn't ask for the current password, so we check it
 * ourselves first by signing in with it — otherwise anyone at an unlocked
 * laptop could change the password and lock the owner out. After the change
 * every other session is signed out.
 *
 * Used inline on Settings → Password and in a dialog on the worker dashboard
 * (workers can't reach /settings).
 */
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { validatePassword, MIN_PASSWORD_LENGTH } from "@/lib/password-policy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function ChangePasswordForm({ onDone }: { onDone?: () => void }) {
  const { user } = useAuth();
  const [current, setCurrent] = useState("");
  const [next,    setNext]    = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.email) return;
    const problem = validatePassword(next, confirm)
      ?? (next === current ? "The new password must be different from the current one." : null);
    if (problem) { setError(problem); return; }

    setError("");
    setSaving(true);
    try {
      const { error: authErr } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
      if (authErr) { setError("Your current password is incorrect."); return; }

      const { error: updErr } = await supabase.auth.updateUser({ password: next });
      if (updErr) { setError(updErr.message); return; }

      await supabase.auth.signOut({ scope: "others" }).catch(() => {});
      toast.success("Password changed. You've been signed out on your other devices.");
      setCurrent(""); setNext(""); setConfirm("");
      onDone?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Hidden username so password managers file the new password under the right account */}
      <input type="text" name="username" autoComplete="username" value={user?.email ?? ""} readOnly hidden />
      <div className="space-y-1.5">
        <Label htmlFor="cp-current" className="text-[12px] font-medium">Current password</Label>
        <Input id="cp-current" type="password" autoComplete="current-password" required
          value={current} onChange={e => setCurrent(e.target.value)} className="h-10 text-[13px]" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cp-new" className="text-[12px] font-medium">New password</Label>
        <Input id="cp-new" type="password" autoComplete="new-password" required
          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
          value={next} onChange={e => setNext(e.target.value)} className="h-10 text-[13px]" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cp-confirm" className="text-[12px] font-medium">Confirm new password</Label>
        <Input id="cp-confirm" type="password" autoComplete="new-password" required
          value={confirm} onChange={e => setConfirm(e.target.value)} className="h-10 text-[13px]" />
      </div>
      {error && <p role="alert" className="text-[12px] text-destructive">{error}</p>}
      <Button type="submit" disabled={saving} className="w-full h-10 text-[13px]">
        {saving ? "Changing…" : "Change password"}
      </Button>
    </form>
  );
}

export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Change password</DialogTitle>
          <DialogDescription className="text-[12px]">You'll stay signed in here and be signed out everywhere else.</DialogDescription>
        </DialogHeader>
        <ChangePasswordForm onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
