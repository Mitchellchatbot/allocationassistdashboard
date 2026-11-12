/**
 * Password box for admins setting someone else's password (Add User with no
 * invite, or "Set password" for a @sales.com login). Hidden by default, with
 * Show, Generate and Copy — the admin has to pass the password on, so they
 * need to be able to read it, but it shouldn't sit on screen in plain text.
 */
import { useState } from "react";
import { Eye, EyeOff, Copy, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { generatePassword, MIN_PASSWORD_LENGTH } from "@/lib/password-policy";

export function AdminPasswordField({ id, value, onChange }: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);

  const iconBtn = "flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40";

  return (
    <div className="flex gap-1.5">
      <Input
        id={id}
        type={show ? "text" : "password"}
        autoComplete="new-password"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
        className="h-8 text-[12px] font-mono"
      />
      <button type="button" className={iconBtn} onClick={() => setShow(s => !s)} title={show ? "Hide" : "Show"} aria-label={show ? "Hide password" : "Show password"}>
        {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
      <button type="button" className={iconBtn} title="Generate" aria-label="Generate a password"
        onClick={() => { onChange(generatePassword()); setShow(true); }}>
        <Wand2 className="h-3.5 w-3.5" />
      </button>
      <button type="button" className={iconBtn} title="Copy" aria-label="Copy password" disabled={!value}
        onClick={() => { navigator.clipboard.writeText(value).then(() => toast.success("Password copied")); }}>
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
