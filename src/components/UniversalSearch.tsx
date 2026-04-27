import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem,
} from "@/components/ui/command";
import {
  Users, DollarSign, Megaphone, User as UserIcon,
  LayoutDashboard, Receipt, BarChart3,
} from "lucide-react";
import { useSearchIndex, type SearchKind } from "@/hooks/use-search-index";

const KIND_META: Record<SearchKind, { icon: React.ElementType; heading: string; order: number }> = {
  Metric:      { icon: BarChart3,       heading: "Metrics & Insights", order: 0 },
  Page:        { icon: LayoutDashboard, heading: "Pages",            order: 1 },
  Lead:        { icon: Users,           heading: "Doctors / Leads",  order: 2 },
  Deal:        { icon: DollarSign,      heading: "Deals",            order: 3 },
  Channel:     { icon: Megaphone,       heading: "Channels",         order: 4 },
  Recruiter:   { icon: UserIcon,        heading: "Recruiters",       order: 5 },
  Campaign:    { icon: Megaphone,       heading: "Campaigns",        order: 6 },
  Transaction: { icon: Receipt,         heading: "Transactions",     order: 7 },
};

interface UniversalSearchProps {
  open:        boolean;
  onOpenChange: (open: boolean) => void;
}

export function UniversalSearch({ open, onOpenChange }: UniversalSearchProps) {
  const index = useSearchIndex();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  // Reset query when the dialog closes
  useEffect(() => { if (!open) setQuery(""); }, [open]);

  // Group entities by kind so the dialog renders sectioned results.
  // cmdk's built-in fuzzy matcher does the actual scoring across `value`.
  const grouped = useMemo(() => {
    const groups = new Map<SearchKind, typeof index>();
    for (const e of index) {
      const arr = groups.get(e.kind) ?? [];
      arr.push(e);
      groups.set(e.kind, arr);
    }
    return Array.from(groups.entries())
      .sort((a, b) => KIND_META[a[0]].order - KIND_META[b[0]].order);
  }, [index]);

  const handleSelect = (route: string) => {
    onOpenChange(false);
    navigate(route);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search doctors, deals, channels, pages…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {grouped.map(([kind, items]) => {
          const Icon = KIND_META[kind].icon;
          // Cap each group so the dialog stays scannable; cmdk filters by score
          // first so the "best" matches per group survive the cap.
          const visible = items.slice(0, 50);
          return (
            <CommandGroup key={kind} heading={KIND_META[kind].heading}>
              {visible.map(item => (
                <CommandItem
                  key={item.id}
                  // cmdk fuzzy-matches against `value`. We concatenate label,
                  // sublabel and keywords so typos and synonyms still hit.
                  value={`${item.label} ${item.sublabel ?? ""} ${item.keywords}`}
                  onSelect={() => handleSelect(item.route)}
                >
                  <Icon className="mr-2 h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium truncate">{item.label}</p>
                    {item.sublabel && (
                      <p className="text-[10px] text-muted-foreground truncate">{item.sublabel}</p>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}
