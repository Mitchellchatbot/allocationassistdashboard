import { useMemo, useState } from "react";
import { Mail, X, Plus, Search, Eye } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  isHospitalPaused, hospitalAllowsSpecialty, type Hospital,
} from "@/hooks/use-hospitals";
import {
  resolveRecipient, resolveAllRecipients, type HospitalContact,
} from "@/hooks/use-hospital-contacts";
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
export function HospitalRecipientsPanel({
  selected, pool, contacts,
  contactOverrides, onContactOverride,
  onRemoveHospital, onAddHospital,
  specialty = null,
  activeHospitalId, onSelectHospital,
  heading,
  greetMode, onGreetMode,
  greetName, onGreetName,
}: {
  /** Hospitals currently being emailed. */
  selected: Hospital[];
  /** Full hospital pool — feeds the country options + the add picker. */
  pool: Hospital[];
  contacts: { forHospital: (name: string) => HospitalContact[] };
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
            const selectedEmails = new Set(override.map(e => e.trim().toLowerCase()).filter(Boolean));
            // Who Auto would actually email — so the checkbox reflects the real
            // recipient BEFORE any manual override (every contact in 'all' mode,
            // else the resolved primary/cycle pick). This is what makes the
            // primary show ticked by default.
            const autoEmails = new Set(
              (h.contact_mode === "all" ? resolveAllRecipients(hc, h) : (resolved ? [resolved] : []))
                .map(c => c.email?.toLowerCase()).filter(Boolean) as string[],
            );
            // Ticked set shown in the UI: the manual override if there is one,
            // otherwise Auto's pick.
            const checkedEmails = selectedEmails.size ? selectedEmails : autoEmails;
            const toggle = (email: string) => {
              const k = email.toLowerCase();
              // Start from what's currently ticked (Auto's pick when there's no
              // override yet) so ticking a 2nd contact KEEPS the primary, and
              // clearing back to exactly Auto's pick returns to Auto mode.
              const next = new Set(checkedEmails);
              if (next.has(k)) next.delete(k); else next.add(k);
              const emails = hc.filter(c => c.email && next.has(c.email.toLowerCase())).map(c => c.email!);
              const sameAsAuto = emails.length === autoEmails.size
                && emails.every(e => autoEmails.has(e.toLowerCase()));
              onContactOverride(h.id, (emails.length && !sameAsAuto) ? emails : null); // Auto pick / empty → back to Auto
            };
            const autoLabel = h.contact_mode === "all"
              ? `Auto (all ${resolveAllRecipients(hc, h).length})`
              : `Auto (${h.contact_mode === "cycle" ? "cycle" : "primary"}) → ${resolved?.name || resolved?.email || "—"}`;
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
                {hc.length === 0 ? (
                  <div className="mt-0.5 pl-3 text-[10px] text-muted-foreground italic truncate">{h.primary_recruiter_email ?? "no recipient"}</div>
                ) : (
                  <div className="mt-1 pl-3 space-y-1">
                    <div className="text-[10px] text-muted-foreground">
                      {selectedEmails.size ? <span className="text-amber-600 font-medium">{selectedEmails.size} selected — overriding auto</span> : autoLabel}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {hc.filter(c => c.email).map(c => (
                        <label key={c.id} className="inline-flex items-center gap-1 cursor-pointer" title={c.email}>
                          <input type="checkbox" checked={checkedEmails.has(c.email!.toLowerCase())} onChange={() => toggle(c.email!)} className="h-3 w-3 accent-teal-600" />
                          <span className="truncate max-w-[150px] text-[11px] text-slate-700">{c.name || c.email}{c.isPrimary ? " · Primary" : ""}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {greetMode && onGreetMode && (
                  <div className="mt-1 pl-3 flex items-center gap-1 flex-wrap">
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground mr-0.5">Greeting</span>
                    {([["auto", "Auto"], ["contact", "Name"], ["team", "Team"]] as const).map(([k, l]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => onGreetMode(h.id, k)}
                        title={k === "auto" ? "Use this hospital's saved greeting preference" : k === "contact" ? "Greet the named recipient (e.g. 'Hello Ms. Sandra')" : "Greet the hospital team (e.g. 'Hello City Hospital team')"}
                        className={`rounded px-1.5 py-0.5 text-[9.5px] font-medium transition ${(greetMode[h.id] ?? "auto") === k ? "bg-teal-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                      >
                        {l}
                      </button>
                    ))}
                    {/* Whose NAME to greet by — decoupled from who's emailed. Only
                        relevant when greeting by Name. */}
                    {greetName && onGreetName && (greetMode[h.id] ?? "auto") === "contact" && hc.filter(c => c.email && c.name).length > 0 && (
                      <select
                        value={greetName[h.id] ?? ""}
                        onChange={e => onGreetName(h.id, e.target.value)}
                        title="Whose name to greet by"
                        className="ml-1 rounded border border-slate-200 bg-white px-1 py-0.5 text-[9.5px] text-slate-700 max-w-[140px]"
                      >
                        <option value="">Auto — {resolved?.name || resolved?.email || "primary"}</option>
                        {hc.filter(c => c.email && c.name).map(c => (
                          <option key={c.id} value={c.email!}>{c.name}</option>
                        ))}
                      </select>
                    )}
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
