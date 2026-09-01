import { useMemo, useState, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { Mail, X, Plus, Search, Eye, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  isHospitalPaused, hospitalAllowsSpecialty, type Hospital,
} from "@/hooks/use-hospitals";
import {
  resolveRecipient, resolveAllRecipients, type HospitalContact,
} from "@/hooks/use-hospital-contacts";
import { useCustomContacts } from "@/hooks/use-custom-contacts";
import { normCountry, countryFilterOptions } from "@/lib/normalize-country";

/**
 * Shared recipient editor for EVERY send preview (singular + batch), so both
 * "show the same thing": the list of hospitals being emailed, a per-hospital
 * contact override, remove, a country filter, and add-a-hospital. Consolidates
 * the three previously-divergent implementations (SendProfileDialog's
 * `HospitalRecipientsOverride`, the batch preview's inline panel, and the bulk
 * dialog's contact picker).
 *
 * Contact overrides are canonicalised as `Record<hospitalId, string[]>` (the
 * ticked contact emails). A caller storing a comma-joined string adapts at the
 * boundary.
 */
// Pull every email-looking token out of arbitrary pasted text. Robust to
// spreadsheet paste (tabs / newlines / "Name <email>" / "Name\temail" columns)
// so the team can copy a block of cells and drop them straight in.
const EMAIL_TOKEN_RE = /[^\s,;<>()"']+@[^\s,;<>()"']+\.[^\s,;<>()"']+/g;
function extractEmails(raw: string): string[] {
  return (raw.match(EMAIL_TOKEN_RE) ?? [])
    .map(s => s.replace(/[.,;]+$/, "").trim())
    .filter(Boolean);
}
function dedupeEmails(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of list) {
    const k = e.toLowerCase();
    if (k && !seen.has(k)) { seen.add(k); out.push(e); }
  }
  return out;
}

/**
 * Manually-editable "To" for one hospital (team feedback #10: "Remove the
 * automatic email selection — enter addresses manually, with the ability to
 * paste multiple from our spreadsheet"). Starts EMPTY — no auto-selected
 * recipients — and offers the hospital's saved contacts as autocomplete
 * suggestions only. Recipients render as removable chips; `onChange` gets the
 * explicit list, or `null` when empty (server then falls back to the hospital's
 * primary so a send is never left with no recipient).
 */
function ToField({
  hc, primary, allContacts, value, onChange, fallbackHint,
}: {
  /** This hospital's own synced contacts. */
  hc: HospitalContact[];
  /** The hospital row's primary recruiter (not a synced contact) — offered
   *  first so a hospital with no Zoho contacts still autocompletes. */
  primary: { email: string; name: string } | null;
  /** Every synced contact across all hospitals — searched once the user types. */
  allContacts: HospitalContact[];
  value: string[] | null;
  onChange: (emails: string[] | null) => void;
  fallbackHint: string;
}) {
  const emails = value ?? [];
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  // Persistent manual address book — recorded custom recipients autocomplete in
  // every send and let us greet them by name.
  const { list: customContacts, save: saveCustom, nameFor } = useCustomContacts();
  // Draft names for custom emails that aren't recorded yet (email → typed name),
  // so the user can label a freshly-added address and save it for all sends.
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  // The chip box is inside a scrollable, overflow-clipped panel, so the
  // suggestions list is portalled to <body> and fixed-positioned under the box
  // — otherwise it gets clipped by the panel's max-h/overflow.
  const boxRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const r = boxRef.current?.getBoundingClientRect();
      if (r) setRect({ left: r.left, top: r.bottom + 2, width: r.width });
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open, emails.length, draft]);

  // Ship the explicit list; empty → null so the backend's primary-contact
  // fallback keeps the send from going out with no recipient at all.
  const push = (next: string[]) => {
    const cleaned = dedupeEmails(next.map(e => e.trim()).filter(Boolean));
    onChange(cleaned.length ? cleaned : null);
  };
  const addRaw = (raw: string): boolean => {
    const found = extractEmails(raw);
    if (!found.length) return false;
    push([...emails, ...found]);
    setDraft("");
    return true;
  };
  const removeEmail = (email: string) =>
    push(emails.filter(e => e.toLowerCase() !== email.toLowerCase()));

  // Suggestions: the hospital's primary recruiter + its own contacts show on
  // focus; once the user types, the whole contact DB is searched too so any
  // known address surfaces. Deduped against what's already added.
  const suggestions = useMemo(() => {
    const term = draft.trim().toLowerCase();
    const seen = new Set(emails.map(e => e.toLowerCase()));
    const out: HospitalContact[] = [];
    const add = (c: HospitalContact) => {
      const k = c.email?.toLowerCase();
      if (!k || seen.has(k)) return;
      if (term && !(k.includes(term) || (c.name ?? "").toLowerCase().includes(term))) return;
      seen.add(k);
      out.push(c);
    };
    if (primary?.email) {
      add({ id: "hospital-row", name: primary.name || "", title: null, email: primary.email, phone: null, type: "Primary", isPrimary: true });
    }
    for (const c of hc) { if (out.length >= 8) break; add(c); }
    // Recorded manual recipients — surfaced in every send.
    for (const c of customContacts) {
      if (out.length >= 8) break;
      add({ id: `custom:${c.email}`, name: c.name, title: "Saved", email: c.email, phone: null, type: "Saved", isPrimary: false });
    }
    if (term) for (const c of allContacts) { if (out.length >= 8) break; add(c); }
    return out.slice(0, 8);
  }, [hc, primary, allContacts, customContacts, emails, draft]);

  // Added addresses we don't have a name for yet (not a synced contact, not this
  // hospital's primary, not already recorded) — offer to name + record them.
  const unnamed = useMemo(() => {
    const known = new Set<string>();
    for (const c of hc) if (c.email) known.add(c.email.toLowerCase());
    for (const c of allContacts) if (c.email) known.add(c.email.toLowerCase());
    for (const c of customContacts) known.add(c.email.toLowerCase());
    if (primary?.email) known.add(primary.email.toLowerCase());
    return emails.filter(e => !known.has(e.toLowerCase()));
  }, [emails, hc, allContacts, customContacts, primary]);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground">To</span>
        {emails.length
          ? <span className="text-[10px] font-medium text-teal-700">{emails.length} recipient{emails.length === 1 ? "" : "s"}</span>
          : <span className="truncate text-[10px] text-muted-foreground">Add recipients — or leave empty to use {fallbackHint}.</span>}
        {emails.length > 0 && (
          <button type="button" onClick={() => onChange(null)} className="text-[9.5px] text-slate-400 underline hover:text-rose-600">clear</button>
        )}
      </div>
      <div className="relative">
        <div ref={boxRef} className="flex flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-1 focus-within:border-teal-300">
          {emails.map(e => (
            <span
              key={e}
              className="inline-flex items-center gap-1 rounded bg-teal-50 px-1.5 py-0.5 text-[11px] text-teal-700"
              title={e}
            >
              <span className="truncate max-w-[180px]">{e}</span>
              <button type="button" onClick={() => removeEmail(e)} className="text-slate-400 hover:text-rose-600"><X className="h-3 w-3" /></button>
            </span>
          ))}
          <input
            value={draft}
            onChange={e => { setDraft(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => { if (draft.trim()) addRaw(draft); setTimeout(() => setOpen(false), 120); }}
            onKeyDown={e => {
              if (e.key === "Enter" || e.key === "," || e.key === ";") {
                if (draft.trim() && addRaw(draft)) e.preventDefault();
              } else if (e.key === "Backspace" && !draft && emails.length) {
                removeEmail(emails[emails.length - 1]);
              }
            }}
            onPaste={e => {
              const text = e.clipboardData.getData("text");
              if (extractEmails(text).length) { e.preventDefault(); addRaw(text); }
            }}
            placeholder={emails.length ? "Add or paste more…" : "Type or paste email addresses…"}
            className="min-w-[130px] flex-1 border-0 bg-transparent text-[11px] text-slate-700 outline-none placeholder:text-slate-300"
          />
        </div>
        {open && suggestions.length > 0 && rect && createPortal(
          <div
            className="fixed z-[9999] max-h-52 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-xl"
            style={{ left: rect.left, top: rect.top, width: rect.width }}
          >
            <div className="px-2 pb-1 text-[9px] uppercase tracking-wider text-muted-foreground">Suggestions</div>
            {suggestions.map(c => (
              <button
                key={c.id}
                type="button"
                onMouseDown={e => { e.preventDefault(); push([...emails, c.email!]); setDraft(""); }}
                className="flex w-full items-center gap-2 px-2 py-1 text-left hover:bg-teal-50"
              >
                <Mail className="h-3 w-3 shrink-0 text-slate-400" />
                <span className="min-w-0">
                  <span className="block truncate text-[11px] text-slate-700">{c.name || c.email}{c.isPrimary ? " · Primary" : c.type === "Saved" ? " · Saved" : ""}</span>
                  {c.name && <span className="block truncate text-[10px] text-muted-foreground">{c.email}</span>}
                </span>
              </button>
            ))}
          </div>,
          document.body,
        )}
      </div>

      {/* Name + record any custom address so it autocompletes — and greets by
          name — in every future send. */}
      {unnamed.map(email => {
        const nm = nameDrafts[email] ?? "";
        const saved = () => { if (nm.trim()) { saveCustom(email, nm.trim()); setNameDrafts(d => { const n = { ...d }; delete n[email]; return n; }); } };
        return (
          <div key={email} className="flex items-center gap-1.5 rounded-md border border-dashed border-amber-300 bg-amber-50/60 px-1.5 py-1">
            <span className="truncate max-w-[150px] text-[10px] font-mono text-amber-800" title={email}>{email}</span>
            <input
              value={nm}
              onChange={e => setNameDrafts(d => ({ ...d, [email]: e.target.value }))}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); saved(); } }}
              placeholder="Name this recipient…"
              className="min-w-0 flex-1 rounded border border-amber-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-700 outline-none placeholder:text-slate-300 focus:border-teal-400"
            />
            <button
              type="button"
              onClick={saved}
              disabled={!nm.trim()}
              title="Save this name — applied to all future emails"
              className="inline-flex items-center gap-1 rounded bg-teal-600 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-teal-700 disabled:opacity-40"
            >
              <Check className="h-3 w-3" /> Save
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function HospitalRecipientsPanel({
  selected, pool, contacts,
  contactOverrides, onContactOverride,
  onRemoveHospital, onAddHospital,
  specialty = null,
  activeHospitalId, onSelectHospital,
  heading,
  greetMode, onGreetMode,
}: {
  /** Hospitals currently being emailed. */
  selected: Hospital[];
  /** Full hospital pool — feeds the country options + the add picker. */
  pool: Hospital[];
  contacts: { forHospital: (name: string) => HospitalContact[]; all?: HospitalContact[] };
  /** hospitalId → ticked contact emails (empty/absent = auto-pick). */
  contactOverrides: Record<string, string[]>;
  onContactOverride: (hospitalId: string, emails: string[] | null) => void;
  onRemoveHospital: (hospitalId: string) => void;
  onAddHospital: (hospitalId: string) => void;
  /** Doctor specialty — addable hospitals honour each hospital's specialty rules. */
  specialty?: string | null;
  /** Optional: highlight one row (the hospital currently shown in the preview). */
  activeHospitalId?: string | null;
  onSelectHospital?: (hospitalId: string) => void;
  heading?: string;
  /** Optional per-hospital greeting picker (hospitalId → mode; absent = "auto").
   *  When both props are supplied, each row shows a tiny Auto/Name/Team control.
   *  Callers that don't pass these (e.g. the batch flow) render without it. */
  greetMode?: Record<string, "auto" | "contact" | "team">;
  onGreetMode?: (hospitalId: string, mode: "auto" | "contact" | "team") => void;
  /** Optional: which contact's NAME to greet by (hospitalId → contact email),
   *  decoupled from who's emailed — so you can email several people but greet
   *  one by name. Only shown when the greeting mode is "Name". "" = auto (the
   *  primary). Requires greetMode/onGreetMode too. */
  greetName?: Record<string, string>;
  onGreetName?: (hospitalId: string, contactEmail: string) => void;
}) {
  const [country, setCountry] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  // Checklist add: tick several hospitals, then add them all at once.
  const [addSel, setAddSel] = useState<Set<string>>(new Set());
  const resetAdd = () => { setAddSel(new Set()); setAddQuery(""); };
  const commitAdd = () => {
    for (const id of addSel) onAddHospital(id);
    resetAdd();
    setAddOpen(false);
  };

  const countries = useMemo(() => countryFilterOptions(pool.map(h => h.country)), [pool]);

  const selectedIds = useMemo(() => new Set(selected.map(h => h.id)), [selected]);

  // Hospitals that can be ADDED: in the pool, not already selected, not paused,
  // specialty-allowed, matching the country filter + search.
  const addable = useMemo(() => {
    const term = addQuery.trim().toLowerCase();
    return pool
      .filter(h => !selectedIds.has(h.id))
      .filter(h => !isHospitalPaused(h))
      .filter(h => hospitalAllowsSpecialty(h, specialty))
      .filter(h => country === "all" || normCountry(h.country) === country)
      .filter(h => {
        if (!term) return true;
        return h.name.toLowerCase().includes(term)
          || h.city?.toLowerCase().includes(term)
          || h.country?.toLowerCase().includes(term);
      })
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }, [pool, selectedIds, specialty, country, addQuery]);

  return (
    <div className="rounded-lg border border-sidebar-border/40 bg-white/95 p-3 space-y-2 shadow-sm text-slate-700">
      <div className="flex items-center gap-1.5 flex-wrap">
        <div className="text-[11px] font-medium text-teal-700 flex items-center gap-1.5">
          <Mail className="h-3.5 w-3.5" /> {heading ?? `Sending to ${selected.length} hospital${selected.length === 1 ? "" : "s"}`}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <select
            value={country}
            onChange={e => setCountry(e.target.value)}
            title="Filter the add-a-hospital list by country"
            className="rounded-md border border-input bg-white text-slate-800 text-[11px] px-1.5 h-7 max-w-[130px]"
          >
            <option value="all">All countries</option>
            {countries.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <Popover open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) resetAdd(); }}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md border border-teal-200 bg-teal-50 px-2 h-7 text-[11px] font-medium text-teal-700 hover:bg-teal-100"
                title="Add hospitals to this send"
              >
                <Plus className="h-3 w-3" /> Add hospital
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-2">
              <div className="relative mb-1.5">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  autoFocus
                  value={addQuery}
                  onChange={e => setAddQuery(e.target.value)}
                  placeholder="Search hospitals…"
                  className="pl-7 h-8 text-[12px]"
                />
              </div>
              {/* Checklist — tick several, then Add them all at once. */}
              <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                {addable.length === 0 ? (
                  <div className="px-2 py-4 text-center text-[11px] text-muted-foreground">
                    {country === "all" ? "No more hospitals to add." : "None in this country."}
                  </div>
                ) : addable.slice(0, 80).map(h => {
                  const checked = addSel.has(h.id);
                  return (
                    <label
                      key={h.id}
                      className="flex w-full cursor-pointer items-center gap-2 px-1.5 py-1.5 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setAddSel(prev => { const n = new Set(prev); if (n.has(h.id)) n.delete(h.id); else n.add(h.id); return n; })}
                        className="h-3.5 w-3.5 shrink-0 accent-teal-600"
                      />
                      <div className="min-w-0">
                        <div className="text-[12px] font-medium truncate text-slate-800">{h.name?.trim() || "Unnamed hospital"}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{[h.city, h.country].filter(Boolean).join(" · ") || "—"}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
              {addable.length > 0 && (
                <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-1.5">
                  <span className="text-[10.5px] text-muted-foreground">{addSel.size} selected</span>
                  <button
                    type="button"
                    disabled={addSel.size === 0}
                    onClick={commitAdd}
                    className="inline-flex items-center gap-1 rounded-md bg-teal-600 px-2.5 h-7 text-[11px] font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                  >
                    <Plus className="h-3 w-3" /> Add{addSel.size ? ` ${addSel.size}` : ""}
                  </button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {selected.length === 0 ? (
        <div className="text-[11px] text-muted-foreground italic">No hospitals yet — use “Add hospital”.</div>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {selected.map(h => {
            const hc = contacts.forHospital(h.name);
            const resolved = resolveRecipient(hc, h).contact;
            const override = contactOverrides[h.id] ?? [];
            // What Auto WOULD email — used only to seed the manual To field and to
            // detect "back to the suggested default". Original casing preserved
            // for display. (Team feedback #10: no more checkbox auto-selection —
            // the To is a manually editable, paste-friendly field.)
            const autoContacts = h.contact_mode === "all"
              ? resolveAllRecipients(hc, h)
              : (resolved ? [resolved] : []);
            let autoEmailList = autoContacts.map(c => c.email!).filter(Boolean);
            if (!autoEmailList.length && h.primary_recruiter_email) autoEmailList = [h.primary_recruiter_email];
            const autoLabel = h.contact_mode === "all"
              ? `Auto (all ${autoEmailList.length})`
              : (resolved?.name || resolved?.email || autoEmailList[0] || "no saved recipient");
            const isActive = activeHospitalId === h.id;
            return (
              <div key={h.id} className={`rounded-md border px-2 py-1.5 ${isActive ? "border-teal-300 bg-teal-50/60" : "border-slate-200 bg-white"}`}>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onSelectHospital?.(h.id)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                    title={onSelectHospital ? "Preview this hospital's email" : h.name}
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isActive ? "bg-teal-500" : "bg-slate-300"}`} />
                    <span className="truncate text-[12px] font-medium text-slate-800">{h.name}</span>
                    {isActive && onSelectHospital && <Eye className="h-3 w-3 shrink-0 text-teal-600" />}
                  </button>
                  <button
                    type="button"
                    title={`Remove ${h.name} from this send`}
                    className="shrink-0 text-slate-300 hover:text-rose-600"
                    onClick={() => onRemoveHospital(h.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-1 pl-3">
                  <ToField
                    hc={hc}
                    primary={h.primary_recruiter_email ? { email: h.primary_recruiter_email, name: h.primary_contact_name ?? "" } : null}
                    allContacts={contacts.all ?? []}
                    value={override.length ? override : null}
                    onChange={(emails) => onContactOverride(h.id, emails)}
                    fallbackHint={autoLabel}
                  />
                </div>
                {greetMode && onGreetMode && (
                  <div className="mt-1 pl-3 flex items-center gap-1 flex-wrap">
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground mr-0.5">Greeting</span>
                    {([["contact", "Name"], ["team", "Team"]] as const).map(([k, l]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => onGreetMode(h.id, k)}
                        title={k === "contact" ? "Greet the named recipient (e.g. 'Hello Ms. Sandra')" : "Greet the hospital team (e.g. 'Hello City Hospital team')"}
                        className={`rounded px-1.5 py-0.5 text-[9.5px] font-medium transition ${(greetMode[h.id] ?? "contact") === k ? "bg-teal-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
