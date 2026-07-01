import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Check, RotateCcw, Mail, Star, Clock, Repeat } from "lucide-react";
import { renderTemplate, type EmailTemplate } from "@/hooks/use-email-templates";
import { FLOW_DEFINITIONS } from "@/lib/automation-flows";
import { getFavorites, toggleFavorite, getRecent, pushRecent } from "@/lib/template-prefs";
import { cn } from "@/lib/utils";
import { EmailFrame } from "@/components/EmailFrame";

/**
 * TemplatePicker — Amir #3. A grouped, searchable dropdown to choose WHICH
 * email template a send uses (e.g. the doctor "working opportunity" email).
 * Shows a live mini-preview of the highlighted template rendered with the real
 * send vars, a "default" chip on the flow default, and a "draft" chip on any
 * template whose copy still starts with PLACEHOLDER. Pure presentational — the
 * caller decides what picking a key does (re-seed the preview, ship as override,
 * persist a default, …). Fully testable in npm run dev.
 */
export function TemplatePicker({
  templates: allTemplates, value, onChange, defaultKey, renderVars, label, flowFilter,
}: {
  templates: EmailTemplate[];
  value: string;
  onChange: (key: string) => void;
  defaultKey?: string;
  renderVars: Record<string, string>;
  label: string;
  /** Restrict the choosable list to one flow (e.g. "profile_sent"), so the
   *  profile-send pickers don't surface shortlist/interview/etc. templates. */
  flowFilter?: string;
}) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState("");
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>(() => getFavorites());
  const [recent, setRecent]       = useState<string[]>(() => getRecent());

  // The choosable set — scoped to flowFilter when provided. `allTemplates` is
  // still used for resolving the current selection / preview, so a value that's
  // somehow out of scope still renders in the trigger + preview.
  const templates = useMemo(
    () => (flowFilter ? allTemplates.filter(t => (t.flow_key ?? "other") === flowFilter) : allTemplates),
    [allTemplates, flowFilter],
  );

  const selected = allTemplates.find(t => t.key === value);

  // Pick = record as recent + delegate to the caller.
  const pick = (key: string) => { setRecent(pushRecent(key)); onChange(key); setOpen(false); };
  const onToggleFav = (key: string) => setFavorites(toggleFavorite(key));

  const searching = query.trim().length > 0;

  // Favorites / recently-used quick rows — only when NOT searching (search should
  // show the full matching set). De-duped: recent excludes anything already
  // pinned. Limited to templates that still exist.
  const byKey = useMemo(() => new Map(templates.map(t => [t.key, t])), [templates]);
  const favItems   = useMemo(() => (searching ? [] : favorites.map(k => byKey.get(k)).filter((t): t is EmailTemplate => !!t)), [searching, favorites, byKey]);
  const recentItems = useMemo(() => (searching ? [] : recent.filter(k => !favorites.includes(k)).map(k => byKey.get(k)).filter((t): t is EmailTemplate => !!t)), [searching, recent, favorites, byKey]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? templates.filter(t =>
          t.name.toLowerCase().includes(q) ||
          t.key.toLowerCase().includes(q) ||
          t.subject.toLowerCase().includes(q) ||
          (t.flow_key ?? "").toLowerCase().includes(q))
      : templates;
    const m = new Map<string, EmailTemplate[]>();
    for (const t of filtered) {
      const k = t.flow_key ?? "other";
      (m.get(k) ?? m.set(k, []).get(k))!.push(t);
    }
    return [...m.entries()];
  }, [templates, query]);

  const flowLabel = (k: string) =>
    (FLOW_DEFINITIONS as Record<string, { label?: string }>)[k]?.label ?? (k === "other" ? "Other" : k);

  const previewTpl = allTemplates.find(t => t.key === (hoverKey ?? value));
  const previewHtml = previewTpl
    ? renderTemplate(previewTpl.body_html || previewTpl.body_text, renderVars, { html: true })
    : "";
  const previewSubject = previewTpl ? renderTemplate(previewTpl.subject, renderVars) : "";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
        {defaultKey && value !== defaultKey && (
          <button
            type="button"
            onClick={() => onChange(defaultKey)}
            className="inline-flex items-center gap-1 text-[10px] text-teal-700 hover:underline"
            title="Reset to the flow default template"
          >
            <RotateCcw className="h-2.5 w-2.5" /> Reset to default
          </button>
        )}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="Click to choose a different template"
            className="group w-full inline-flex items-center justify-between gap-2 rounded-lg border border-teal-300 bg-white px-3 py-2 text-[12px] shadow-sm hover:border-teal-400 hover:bg-teal-50/50 transition-colors"
          >
            <span className="flex items-center gap-2 min-w-0">
              <Mail className="h-4 w-4 text-teal-600 shrink-0" />
              <span className="flex flex-col items-start min-w-0 leading-tight">
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Template</span>
                <span className="truncate font-semibold text-slate-800 max-w-[220px]">{selected?.name ?? value}</span>
              </span>
              {selected && value === defaultKey && <Badge variant="outline" className="text-[8px] bg-slate-50 text-slate-500 border-slate-200 uppercase">default</Badge>}
              {selected && selected.body_text.startsWith("PLACEHOLDER") && <Badge variant="outline" className="text-[8px] bg-amber-50 text-amber-700 border-amber-200 uppercase">draft</Badge>}
            </span>
            <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-teal-600 text-white px-3 py-1.5 text-[11px] font-semibold shadow-sm group-hover:bg-teal-700 transition-colors">
              <Repeat className="h-3.5 w-3.5" /> Change template
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" collisionPadding={16} className="w-[740px] max-w-[92vw] p-0 overflow-hidden">
          <div className="grid grid-cols-[260px_1fr]">
            {/* List */}
            <div className="border-r max-h-[420px] overflow-y-auto">
              <div className="sticky top-0 bg-white p-2 border-b">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search templates…" className="h-8 pl-7 text-[12px]" />
                </div>
              </div>
              {/* Favorites + recently-used quick rows (browse shortcut for big
                  template sets). Hidden while searching — search shows the full
                  matching list. */}
              {favItems.length > 0 && (
                <div>
                  <div className="px-2.5 py-1 text-[9px] uppercase tracking-wider text-amber-600 bg-amber-50/60 sticky top-[49px] flex items-center gap-1"><Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" /> Favorites</div>
                  {favItems.map(t => (
                    <TemplateRow key={`fav-${t.key}`} t={t} value={value} defaultKey={defaultKey} isFav onPick={pick} onToggleFav={onToggleFav} onHover={setHoverKey} />
                  ))}
                </div>
              )}
              {recentItems.length > 0 && (
                <div>
                  <div className="px-2.5 py-1 text-[9px] uppercase tracking-wider text-slate-500 bg-slate-50/70 sticky top-[49px] flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> Recently used</div>
                  {recentItems.map(t => (
                    <TemplateRow key={`recent-${t.key}`} t={t} value={value} defaultKey={defaultKey} isFav={favorites.includes(t.key)} onPick={pick} onToggleFav={onToggleFav} onHover={setHoverKey} />
                  ))}
                </div>
              )}

              {groups.length === 0 && <div className="p-4 text-[11px] text-muted-foreground italic">No templates match.</div>}
              {groups.map(([flow, items]) => (
                <div key={flow}>
                  <div className="px-2.5 py-1 text-[9px] uppercase tracking-wider text-muted-foreground bg-slate-50/70 sticky top-[49px]">{flowLabel(flow)}</div>
                  {items.map(t => (
                    <TemplateRow key={t.key} t={t} value={value} defaultKey={defaultKey} isFav={favorites.includes(t.key)} onPick={pick} onToggleFav={onToggleFav} onHover={setHoverKey} />
                  ))}
                </div>
              ))}
            </div>
            {/* Preview */}
            <div className="flex flex-col min-w-0">
              <div className="px-4 py-2.5 border-b bg-slate-50/60">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Subject</div>
                <div className="text-[13px] font-semibold text-slate-800 leading-snug">{previewSubject || "—"}</div>
              </div>
              <div className="flex-1 min-h-0 bg-slate-100/50 p-3">
                {previewHtml
                  ? <EmailFrame
                      html={previewHtml}
                      title="Template preview"
                      height={360}
                      className="w-full bg-white rounded-md border border-slate-200 shadow-sm"
                    />
                  : <div className="p-4 text-[12px] text-muted-foreground italic">Hover a template to preview it.</div>}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** One selectable template row, with a pin (favorite) toggle. Shared by the
 *  Favorites / Recently-used / flow-grouped sections. */
function TemplateRow({ t, value, defaultKey, isFav, onPick, onToggleFav, onHover }: {
  t:           EmailTemplate;
  value:       string;
  defaultKey?: string;
  isFav:       boolean;
  onPick:      (key: string) => void;
  onToggleFav: (key: string) => void;
  onHover:     (key: string) => void;
}) {
  const isDraft = t.body_text.startsWith("PLACEHOLDER");
  return (
    <div
      onMouseEnter={() => onHover(t.key)}
      className={cn(
        "group w-full px-2.5 py-1.5 flex items-start gap-1.5 hover:bg-teal-50/60 transition-colors",
        t.key === value && "bg-teal-50",
      )}
    >
      <button
        type="button"
        onClick={() => onPick(t.key)}
        onFocus={() => onHover(t.key)}
        className="flex-1 min-w-0 text-left flex items-start gap-1.5"
      >
        {t.key === value ? <Check className="h-3.5 w-3.5 text-teal-600 mt-0.5 shrink-0" /> : <span className="w-3.5 shrink-0" />}
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="text-[12px] font-medium truncate">{t.name}</span>
            {t.key === defaultKey && <Badge variant="outline" className="text-[8px] bg-slate-50 text-slate-500 border-slate-200 uppercase">default</Badge>}
            {isDraft && <Badge variant="outline" className="text-[8px] bg-amber-50 text-amber-700 border-amber-200 uppercase">draft</Badge>}
          </span>
          <span className="block text-[10px] text-muted-foreground truncate">{t.subject}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => onToggleFav(t.key)}
        title={isFav ? "Unpin from favorites" : "Pin to favorites"}
        className={cn(
          "shrink-0 mt-0.5 rounded p-0.5 transition-opacity",
          isFav ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
      >
        <Star className={cn("h-3.5 w-3.5", isFav ? "fill-amber-400 text-amber-400" : "text-slate-400 hover:text-amber-400")} />
      </button>
    </div>
  );
}
