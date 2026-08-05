import { useState } from "react";
import { X, Plus, AlertTriangle } from "lucide-react";

/** Loose email check — good enough to stop obvious typos landing in a send. */
export function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

/**
 * Build a "does this look like a HOSPITAL address?" check from the hospitals
 * list. A CC/BCC here rides the send (a manager copy), so flagging a hospital
 * recruiter / domain typed in by mistake stops a hospital contact from being
 * copied on a send they shouldn't see. Internal allocationassist.com addresses
 * are never flagged.
 */
export function makeHospitalFlag(
  hospitals: Array<{ primary_recruiter_email?: string | null; cc_emails?: string[] | null }>,
): (email: string) => string | null {
  const emails = new Set<string>();
  const domains = new Set<string>();
  const addr = (raw?: string | null) => {
    const e = (raw ?? "").trim().toLowerCase();
    if (!e.includes("@")) return;
    emails.add(e);
    const dom = e.split("@")[1];
    if (dom && dom !== "allocationassist.com") domains.add(dom);
  };
  for (const h of hospitals) {
    addr(h.primary_recruiter_email);
    for (const c of (h.cc_emails ?? [])) addr(c);
  }
  return (email: string) => {
    const e = email.trim().toLowerCase();
    if (emails.has(e)) return "This is a hospital's saved contact — it'll be copied on the send.";
    const dom = e.split("@")[1];
    if (dom && domains.has(dom)) return "This matches a hospital's email domain — it'll be copied on the send.";
    return null;
  };
}

/**
 * Free-form CC + BCC entry for any email send. Type an address and press Enter
 * (or comma) to add it as a chip; optional roster quick-adds (the AA team) are
 * offered as one-click chips. The caller owns the two lists and forwards them
 * as cc_override / bcc_override — which every send path already honours.
 *
 * `flagHospital` (optional) marks any address that looks like a hospital
 * contact/domain in amber with a warning — it still adds (a manager may
 * genuinely intend it), it just makes an accidental hospital CC obvious.
 */
export function CcBccPicker({
  cc, bcc, onCcChange, onBccChange, ccRoster = [], bccRoster = [], flagHospital, disabled, hideCc,
}: {
  cc:  string[];
  bcc: string[];
  onCcChange:  (next: string[]) => void;
  onBccChange: (next: string[]) => void;
  ccRoster?:  Array<{ name: string; email: string }>;
  bccRoster?: Array<{ name: string; email: string }>;
  flagHospital?: (email: string) => string | null;
  disabled?: boolean;
  /** Hide the CC field (BCC-only) — used where CC is managed elsewhere (the
   *  per-hospital recipients panel) so there aren't two CC sections. */
  hideCc?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      {!hideCc && <Field label="CC" values={cc} onChange={onCcChange} roster={ccRoster} flagHospital={flagHospital} placeholder="Add a CC email…" disabled={disabled} />}
      <Field label="BCC" values={bcc} onChange={onBccChange} roster={bccRoster} flagHospital={flagHospital} placeholder="Add a BCC email…" disabled={disabled} />
    </div>
  );
}

/** Standalone reusable CC/BCC row (exported so callers can compose a single
 *  CC field elsewhere — e.g. a "CC everyone" row inside a recipients panel). */
export function EmailChipField(props: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  roster?: Array<{ name: string; email: string }>;
  flagHospital?: (email: string) => string | null;
  placeholder: string;
  disabled?: boolean;
}) {
  return <Field {...props} roster={props.roster ?? []} />;
}

function Field({ label, values, onChange, roster, flagHospital, placeholder, disabled }: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  roster: Array<{ name: string; email: string }>;
  flagHospital?: (email: string) => string | null;
  placeholder: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const has = (e: string) => values.some(v => v.toLowerCase() === e.trim().toLowerCase());
  const add = (email: string) => {
    const e = email.trim();
    if (!isEmail(e) || has(e)) { setDraft(""); return; }
    onChange([...values, e]);
    setDraft("");
  };
  const remove = (e: string) => onChange(values.filter(v => v !== e));
  const unusedRoster = roster.filter(r => !has(r.email));
  const flagged = flagHospital ? values.map(v => flagHospital(v)) : [];
  const flagCount = flagged.filter(Boolean).length;

  return (
    <div className="rounded-md border border-slate-200 bg-white p-1.5">
      <div className="flex flex-wrap items-center gap-1">
        <span className="w-7 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
        {values.map((e, i) => {
          const warn = flagged[i];
          return (
            <span
              key={e}
              title={warn ?? undefined}
              className={`inline-flex items-center gap-1 rounded-full py-0.5 pl-2 pr-1 text-[11px] ${
                warn ? "bg-amber-50 text-amber-800 ring-1 ring-amber-300" : "bg-slate-100 text-slate-700"
              }`}
            >
              {warn && <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />}
              <span className="max-w-[180px] truncate">{e}</span>
              {!disabled && (
                <button type="button" onClick={() => remove(e)} className="rounded-full p-0.5 hover:bg-black/10" aria-label={`Remove ${e}`}>
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          );
        })}
        <input
          value={draft}
          disabled={disabled}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(draft); } }}
          onBlur={() => { if (draft) add(draft); }}
          placeholder={values.length ? "" : placeholder}
          className="min-w-[110px] flex-1 bg-transparent py-0.5 text-[11px] text-slate-800 outline-none placeholder:text-slate-400 disabled:opacity-50"
        />
      </div>
      {flagCount > 0 && (
        <div className="mt-1 pl-7 flex items-center gap-1 text-[10px] text-amber-700">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {flagCount === 1 ? "1 address looks like a hospital contact" : `${flagCount} addresses look like hospital contacts`} — it'll be copied on the send. Remove it if that's not intended.
        </div>
      )}
      {unusedRoster.length > 0 && !disabled && (
        <div className="mt-1 flex flex-wrap gap-1 pl-7">
          {unusedRoster.map(r => (
            <button
              key={r.email}
              type="button"
              onClick={() => add(r.email)}
              title={r.email}
              className="inline-flex items-center gap-0.5 rounded-full border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500 transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700"
            >
              <Plus className="h-2.5 w-2.5" /> {r.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
