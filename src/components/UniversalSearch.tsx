import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem,
} from "@/components/ui/command";
import {
  Users, DollarSign, Megaphone, User as UserIcon,
  LayoutDashboard, Receipt, BarChart3,
  UserSquare, Workflow, ClipboardList, Building2, Mailbox, Mail,
  Tag, Bell, FileText, Clock, SearchX, CornerDownLeft, Briefcase,
  Send, Star, History, X as XIcon,
} from "lucide-react";
import { useSearchIndex, type SearchKind, type SearchEntity } from "@/hooks/use-search-index";
import { useRecentItems } from "@/hooks/use-recent-items";
import { useSavedSearches } from "@/hooks/use-saved-searches";
import { toast } from "sonner";
import { SearchFilterChips, chipMatches, type SentChip } from "@/components/search/SearchFilterChips";

// Visual identity per kind: icon, group heading, sort order in results, and
// the colored pill we render on the right of each row so the searcher can see
// at a glance whether the hit is a doctor / vacancy / hospital / flow / etc.
const KIND_META: Record<SearchKind, { icon: React.ElementType; heading: string; order: number; badge: string }> = {
  Metric:       { icon: BarChart3,       heading: "Metrics & insights",        order: 0,  badge: "bg-slate-100 text-slate-700 border-slate-200" },
  Page:         { icon: LayoutDashboard, heading: "Pages",                     order: 1,  badge: "bg-sky-100 text-sky-700 border-sky-200" },
  Lead:         { icon: UserSquare,      heading: "Doctors · Leads",           order: 2,  badge: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  Doctor:       { icon: UserSquare,      heading: "Doctors · On Board",        order: 3,  badge: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  Profile:      { icon: UserSquare,      heading: "Doctor profiles",           order: 4,  badge: "bg-violet-100 text-violet-700 border-violet-200" },
  Placement:    { icon: Briefcase,       heading: "Placements (milestones)",   order: 5,  badge: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  Flow:         { icon: Workflow,        heading: "Active flow runs",          order: 6,  badge: "bg-teal-100 text-teal-700 border-teal-200" },
  Vacancy:      { icon: ClipboardList,   heading: "Vacancies",                 order: 6,  badge: "bg-amber-100 text-amber-700 border-amber-200" },
  Hospital:     { icon: Building2,       heading: "Hospitals",                 order: 7,  badge: "bg-cyan-100 text-cyan-700 border-cyan-200" },
  Batch:        { icon: Mailbox,         heading: "Batch sends",               order: 8,  badge: "bg-purple-100 text-purple-700 border-purple-200" },
  Sent:         { icon: Send,            heading: "Sent history",              order: 8.5, badge: "bg-teal-100 text-teal-700 border-teal-200" },
  Template:     { icon: Mail,            heading: "Email templates",           order: 9,  badge: "bg-pink-100 text-pink-700 border-pink-200" },
  Specialty:    { icon: Tag,             heading: "Specialties",               order: 10, badge: "bg-violet-50 text-violet-700 border-violet-200" },
  Notification: { icon: Bell,            heading: "Notifications",             order: 11, badge: "bg-rose-100 text-rose-700 border-rose-200" },
  Deal:         { icon: DollarSign,      heading: "Deals",                     order: 12, badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  Channel:      { icon: Megaphone,       heading: "Channels",                  order: 13, badge: "bg-orange-100 text-orange-700 border-orange-200" },
  Recruiter:    { icon: UserIcon,        heading: "Recruiters",                order: 14, badge: "bg-blue-100 text-blue-700 border-blue-200" },
  Campaign:     { icon: Megaphone,       heading: "Campaigns",                 order: 15, badge: "bg-orange-50 text-orange-700 border-orange-200" },
  Transaction:  { icon: Receipt,         heading: "Transactions",              order: 16, badge: "bg-slate-50 text-slate-700 border-slate-200" },
};

interface UniversalSearchProps {
  open:        boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Universal search dialog. Lazy-mounts its heavy contents (the search index
 * aggregation + 1,000s of CommandItem rows) only when the user opens it —
 * before this split, every render of DashboardLayout ran the full index
 * build, which made the first open feel laggy.
 */
export function UniversalSearch({ open, onOpenChange }: UniversalSearchProps) {
  // Track whether the user has EVER opened the dialog. Once mounted, keep
  // the contents alive so subsequent opens are instant.
  const [hasOpened, setHasOpened] = useState(false);
  useEffect(() => { if (open) setHasOpened(true); }, [open]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      {hasOpened
        ? <SearchContents open={open} onClose={() => onOpenChange(false)} />
        : <div className="flex items-center gap-2 px-4 py-6 text-[12px] text-muted-foreground">
            <div className="h-3.5 w-3.5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            Loading search index…
          </div>}
    </CommandDialog>
  );
}

function SearchContents({ open, onClose }: { open: boolean; onClose: () => void }) {
  const index   = useSearchIndex();
  const recent  = useRecentItems();
  const navigate = useNavigate();
  const { saved, recent: recentQueries, save, remove, pushRecent } = useSavedSearches();
  const [query, setQuery] = useState("");
  // Sent-history filter chip (Amir #6).
  const [chip, setChip] = useState<SentChip>("all");

  // Reset query + chip when the dialog closes (parent flips `open`).
  useEffect(() => { if (!open) { setQuery(""); setChip("all"); } }, [open]);

  // Per-chip counts over the Sent entities, for the chip labels.
  const chipCounts = useMemo(() => {
    const c: Record<string, number> = { all: 0, "1st": 0, "2nd": 0, top15: 0, specialty: 0, individual: 0 };
    for (const e of index) {
      if (e.kind !== "Sent") continue;
      c.all++;
      (["1st", "2nd", "top15", "specialty", "individual"] as SentChip[]).forEach(k => {
        if (chipMatches(k, e.meta?.sentKind, e.meta?.slot)) c[k]++;
      });
    }
    return c;
  }, [index]);

  // Group entities by kind. When there's no query yet we cap each group hard
  // so the dialog opens instantly even with thousands of entities indexed.
  // cmdk filters as the user types, so once they're typing the full set is
  // already in the DOM and matches happen against the rendered items.
  const grouped = useMemo(() => {
    const groups = new Map<SearchKind, SearchEntity[]>();
    for (const e of index) {
      // When a sent-history chip is active, show ONLY matching Sent records.
      if (chip !== "all") {
        if (e.kind !== "Sent") continue;
        if (!chipMatches(chip, e.meta?.sentKind, e.meta?.slot)) continue;
      }
      const arr = groups.get(e.kind) ?? [];
      arr.push(e);
      groups.set(e.kind, arr);
    }
    return Array.from(groups.entries())
      .sort((a, b) => KIND_META[a[0]].order - KIND_META[b[0]].order);
  }, [index, chip]);

  // Initial render cap per kind when no query — keeps the dialog snappy at
  // ~200 DOM nodes total instead of ~1,500+.
  const PER_KIND_CAP_NO_QUERY = 8;
  const PER_KIND_CAP_QUERY    = 60;

  const handleSelect = (route: string) => {
    if (query.trim()) pushRecent(query);
    onClose();
    navigate(route);
  };

  const total = useMemo(() => index.length, [index]);

  return (
    <>
      <CommandInput
        placeholder={`Search doctors, specialties, hospitals, sent history (1st/2nd profile, top 15, daily specialty)...`}
        value={query}
        onValueChange={setQuery}
        autoFocus
      />
      {/* Sent-history filter chips (Amir #6) + save-search star. */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b overflow-x-auto">
        <SearchFilterChips active={chip} onChange={setChip} counts={chipCounts} />
        <button
          type="button"
          title={(!query.trim() && chip === "all") ? "Type a query or pick a chip to save a search" : "Save this search"}
          disabled={!query.trim() && chip === "all"}
          onClick={() => { save(query, chip, query || (chip !== "all" ? chip : "All sent")); toast.success("Search saved"); }}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500 hover:text-teal-700 hover:border-teal-300 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-slate-500 disabled:hover:border-slate-200"
        >
          <Star className="h-3 w-3" /> Save
        </button>
      </div>
      {!query && (
        <div className="px-3 py-2 text-[10px] text-muted-foreground border-b flex items-center justify-between gap-3">
          <span>Searching <strong>{total.toLocaleString()}</strong> entities. Start typing to narrow.</span>
          <span className="hidden sm:flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded border border-border bg-muted/60 font-mono text-[9px]">↑</kbd>
            <kbd className="px-1 py-0.5 rounded border border-border bg-muted/60 font-mono text-[9px]">↓</kbd>
            <span>navigate</span>
            <kbd className="px-1 py-0.5 rounded border border-border bg-muted/60 font-mono text-[9px] ml-1">↵</kbd>
            <span>open</span>
          </span>
        </div>
      )}
      <CommandList>
        <CommandEmpty>
          <div className="py-8 px-4 flex flex-col items-center text-center">
            <SearchX className="h-6 w-6 text-muted-foreground/50 mb-2" />
            <p className="text-[12px] font-medium">No matches for "{query}"</p>
            <p className="text-[11px] text-muted-foreground mt-1">Try a doctor name, hospital, specialty, or flow stage.</p>
          </div>
        </CommandEmpty>

        {/* Saved searches (Amir #6) — star a query+chip to pin it here. */}
        {!query && saved.length > 0 && (
          <CommandGroup heading="Saved searches">
            {saved.map(s => (
              <CommandItem
                key={`saved:${s.id}`}
                value={`saved ${s.label} ${s.query} ${s.chip}`}
                onSelect={() => { setQuery(s.query); setChip(s.chip as SentChip); }}
                className="gap-2"
              >
                <Star className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium truncate">{s.label}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{s.chip !== "all" ? `chip: ${s.chip}` : "all"}{s.query ? ` · "${s.query}"` : ""}</p>
                </div>
                <button type="button" onClick={(e) => { e.stopPropagation(); remove(s.id); }} className="opacity-50 hover:opacity-100 shrink-0" title="Remove">
                  <XIcon className="h-3 w-3" />
                </button>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Recent searches — last queries typed. */}
        {!query && recentQueries.length > 0 && (
          <CommandGroup heading="Recent searches">
            {recentQueries.map(q => (
              <CommandItem key={`recentq:${q}`} value={`recentq ${q}`} onSelect={() => setQuery(q)} className="gap-2">
                <History className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
                <p className="text-[12px] truncate flex-1">{q}</p>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Recent items — shown when no query so the dialog feels useful
            even with empty input. Caps at 6 to stay scannable. */}
        {!query && recent.length > 0 && (
          <CommandGroup heading="Recent">
            {recent.slice(0, 6).map(r => (
              <CommandItem
                key={`recent:${r.path}`}
                value={`recent ${r.label} ${r.path}`}
                onSelect={() => handleSelect(r.path)}
                className="gap-2"
              >
                <Clock className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium truncate">{r.label}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{r.path}</p>
                </div>
                <CornerDownLeft className="h-3 w-3 text-muted-foreground/40 shrink-0 opacity-0 group-data-[selected=true]:opacity-100" />
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {grouped.map(([kind, items]) => {
          const meta = KIND_META[kind];
          const Icon = meta.icon;
          const cap = query ? PER_KIND_CAP_QUERY : PER_KIND_CAP_NO_QUERY;
          const visible = items.slice(0, cap);
          return (
            <CommandGroup key={kind} heading={meta.heading}>
              {visible.map(item => (
                <CommandItem
                  key={item.id}
                  // cmdk fuzzy-matches against `value`. We concatenate label,
                  // sublabel and keywords so typos and synonyms still hit.
                  value={`${item.label} ${item.sublabel ?? ""} ${item.keywords}`}
                  onSelect={() => handleSelect(item.route)}
                  className="gap-2"
                >
                  <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium truncate">{item.label}</p>
                    {item.sublabel && (
                      <p className="text-[10px] text-muted-foreground truncate">{item.sublabel}</p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 text-[9px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded-md border ${meta.badge}`}
                  >
                    {kind}
                  </span>
                </CommandItem>
              ))}
              {items.length > cap && (
                <div className="px-2 py-1 text-[9px] text-muted-foreground italic">
                  {query
                    ? `Showing ${cap} of ${items.length}. Type more to narrow.`
                    : `+${items.length - cap} more — type to search.`}
                </div>
              )}
            </CommandGroup>
          );
        })}
      </CommandList>
    </>
  );
}

void FileText; void Users;
