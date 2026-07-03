import { useState } from "react";
import { X, Plus } from "lucide-react";

/** Loose email check — good enough to stop obvious typos landing in a send. */
export function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

/**
 * Free-form CC + BCC entry for any email send. Type an address and press Enter
 * (or comma) to add it as a chip; optional roster quick-adds (the AA team) are
 * offered as one-click chips. The caller owns the two lists and forwards them
 * as cc_override / bcc_override — which every send path already honours.
 */
export function CcBccPicker({
  cc, bcc, onCcChange, onBccChange, ccRoster = [], bccRoster = [], disabled,
}: {
  cc:  string[];
  bcc: string[];
  onCcChange:  (next: string[]) => void;
  onBccChange: (next: string[]) => void;
  ccRoster?:  Array<{ name: string; email: string }>;
  bccRoster?: Array<{ name: string; email: string }>;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Field label="CC"  values={cc}  onChange={onCcChange}  roster={ccRoster}  placeholder="Add a CC email…"  disabled={disabled} />
      <Field label="BCC" values={bcc} onChange={onBccChange} roster={bccRoster} placeholder="Add a BCC email…" disabled={disabled} />
    </div>
  );
}

function Field({ label, values, onChange, roster, placeholder, disabled }: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  roster: Array<{ name: string; email: string }>;
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

  return (
    <div className="rounded-md border border-slate-200 bg-white p-1.5">
      <div className="flex flex-wrap items-center gap-1">
        <span className="w-7 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
        {values.map(e => (
          <span key={e} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-2 pr-1 text-[11px] text-slate-700">
            <span className="max-w-[180px] truncate">{e}</span>
            {!disabled && (
              <button type="button" onClick={() => remove(e)} className="rounded-full p-0.5 hover:bg-slate-200" aria-label={`Remove ${e}`}>
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
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
