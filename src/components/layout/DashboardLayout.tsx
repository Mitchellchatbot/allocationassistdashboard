import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { PageTransition } from "./PageTransition";
import { DocLink } from "@/components/DocLink";
import { Bell, Download, AlertTriangle, ChevronRight, Home, Sparkles, RefreshCw, Info, CheckCircle2, Send, RotateCcw, X, Search, FileSignature, Copy, GraduationCap, Settings as SettingsIcon } from "lucide-react";
import { useTour } from "@/components/OnboardingTour";
import { tourForPath } from "@/lib/tours";
import { ChatChart, parseCharts } from "@/components/ChatChart";
import { ChatActionBar, parseActions } from "@/components/ChatActions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CurrencyToggle } from "@/components/CurrencyToggle";
import { NotificationsPopover } from "@/components/NotificationsPopover";
import { UniversalSearch } from "@/components/UniversalSearch";
import { UniversalSearchContext } from "@/lib/universal-search-context";
import { lookupRoute } from "@/lib/route-labels";
import { useRecentItemsTracker } from "@/hooks/use-recent-items";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFilters } from "@/lib/filters";
import { useAIPageContext } from "@/lib/ai-page-context";
import { useFilteredData } from "@/hooks/use-filtered-data";
import { useState, useEffect, useRef, useCallback, useMemo, useContext, createContext, KeyboardEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { useZohoData } from "@/hooks/use-zoho-data";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { zohoSync } from "@/lib/zoho";
import { WEEKLY_SALES_QUERY_KEY, fetchWeeklySalesRaw } from "@/hooks/use-weekly-sales";
import { useContractActivity } from "@/hooks/use-contract-activity";
import { toast } from "sonner";

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const ALERT_ICON_MAP = {
  warning: { icon: AlertTriangle, color: "text-warning" },
  info:    { icon: Info,          color: "text-info"    },
  success: { icon: CheckCircle2,  color: "text-success" },
} as const;

// Breadcrumb map is shared with the sidebar + recent-items widget — single
// source of truth lives in src/lib/route-labels.ts.

interface DashboardLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  /** Optional docs slug — renders a help (ⓘ) button next to the page title that
   *  deep-links to /docs?p=<slug>. */
  docSlug?: string;
}

/**
 * Persistent layout pattern.
 *
 * The Suspense fallback used to wrap the WHOLE app, so every lazy route
 * transition replaced the sidebar + topbar + AI panel with a full-screen
 * spinner — felt like a hard reload. To keep the chrome persistent, App.tsx
 * now renders DashboardLayout ONCE around an <Outlet/>, and each page still
 * does <DashboardLayout title="..."> on the inside.
 *
 * This context lets the inner DashboardLayout detect it's already nested and
 * just pass children through (no second copy of the chrome), while still
 * pushing its title/subtitle up to the outer instance so the page header
 * updates correctly.
 */
const LayoutContext = createContext<{
  mounted:     boolean;
  setTitle:    (s: string) => void;
  setSubtitle: (s: string | undefined) => void;
  setDocSlug:  (s: string | undefined) => void;
} | null>(null);

function ViewportSpinner() {
  return (
    <div className="flex h-full w-full items-center justify-center py-24">
      <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}
export { ViewportSpinner };

function formatSyncedAt(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  const hrs  = Math.floor(diffMs / 3_600_000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs  < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Reopens the sidebar after navigation on desktop. The AI panel is
 *  a fixed overlay now (rendered by <AIPanelProvider>) so it doesn't
 *  compete for layout — we just always reopen the sidebar on nav. */
function SidebarOpener() {
  const { setOpen, isMobile } = useSidebar();
  const location = useLocation();
  useEffect(() => {
    if (!isMobile) setOpen(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);
  return null;
}

export function DashboardLayout({ children, title: pageTitle, subtitle: pageSubtitle, docSlug: pageDocSlug }: DashboardLayoutProps) {

  // If an outer DashboardLayout has already rendered the chrome, just pass
  // children through and push the page title up to the outer instance via
  // setTitle/setSubtitle. This is the no-op path for nested mounts — the
  // shell stays put while the Outlet swaps.
  const outerCtx = useContext(LayoutContext);
  useEffect(() => {
    if (outerCtx?.mounted) {
      outerCtx.setTitle(pageTitle ?? "");
      outerCtx.setSubtitle(pageSubtitle);
      outerCtx.setDocSlug(pageDocSlug);
    }
  }, [outerCtx, pageTitle, pageSubtitle, pageDocSlug]);
  if (outerCtx?.mounted) return <>{children}</>;

  // Outer layout owns the title/subtitle state so nested pages can push
  // updates into it as they mount. Initial values come from whatever the
  // outer caller passed (App.tsx passes nothing, so falls back to "").
  const [title, setTitleState]       = useState<string>(pageTitle ?? "");
  const [subtitle, setSubtitleState] = useState<string | undefined>(pageSubtitle);
  const [docSlug, setDocSlugState]   = useState<string | undefined>(pageDocSlug);

  const { alerts: rawAlerts, filteredLeads, filteredDeals } = useFilteredData();
  const [readIdxs, setReadIdxs] = useState<number[]>([]);
  // Universal search dialog
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(o => !o);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const location = useLocation();
  const currentPath = location.pathname;
  const tour = useTour();
  // The Tour button launches the training tour for whatever section you're in.
  const sectionTour = tourForPath(currentPath);
  const startSectionTour = useCallback(() => {
    if (sectionTour) tour.start(sectionTour.steps, { id: sectionTour.id, label: sectionTour.label });
  }, [tour, sectionTour]);
  const breadcrumbEntry  = lookupRoute(currentPath);
  const breadcrumbLabel  = breadcrumbEntry?.label ?? title;
  const breadcrumbSection = breadcrumbEntry?.section && breadcrumbEntry.section !== "Overview"
    ? breadcrumbEntry.section
    : null;
  // Track the current route into recent-items localStorage (consumed by the
  // sidebar widget).
  useRecentItemsTracker(lookupRoute);
  const { data: zoho } = useZohoData();
  const syncedAt = zoho?.syncedAt;
  const queryClient = useQueryClient();

  // Prefetch weekly sales after a short delay so it doesn't compete with
  // the critical Zoho fetch that renders the dashboard on login.
  useEffect(() => {
    const t = setTimeout(() => {
      queryClient.prefetchQuery({
        queryKey:  WEEKLY_SALES_QUERY_KEY,
        queryFn:   fetchWeeklySalesRaw,
        staleTime: 10 * 60 * 1000,
      });
    }, 3000);
    return () => clearTimeout(t);
  }, [queryClient]);

  // Subscribe to contract activity. Realtime channel inside this hook
  // refetches contract_sends whenever it changes, and onSigned fires once
  // per row when its status flips to "signed" — surfaces a toast on
  // whichever page the user is on.
  const { data: contractActivity } = useContractActivity({
    onSigned: (row) => {
      toast.success(`${row.doctor_name} signed their contract`, {
        description: row.zoho_contact_id
          ? "Doctors on Board record created and lead marked Closed Won."
          : "Awaiting Zoho automation — refresh in a moment.",
      });
    },
  });

  // Build notification objects from real alerts + recent contract signings.
  // Contract events get priority placement (top of the list) since they're
  // time-sensitive and actionable.
  const notifications = useMemo(() => {
    const items: Array<{ icon: any; color: string; title: string; detail: string; time: string }> = [];

    // Recent signed contracts (last 7 days) → at the top.
    if (contractActivity) {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const recentlySigned = contractActivity
        .filter(r => r.status === "signed" && r.signed_at && new Date(r.signed_at).getTime() > cutoff)
        .slice(0, 3);
      for (const r of recentlySigned) {
        items.push({
          icon:   FileSignature,
          color:  "text-emerald-600",
          title:  `${r.doctor_name} signed their contract`,
          detail: r.zoho_contact_id ? "Added to Doctors on Board" : "Zoho automation pending",
          time:   new Date(r.signed_at!).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
        });
      }
    }

    // Existing data alerts → after.
    if (rawAlerts && rawAlerts.length > 0) {
      for (const a of rawAlerts.slice(0, 5 - items.length)) {
        items.push({
          ...ALERT_ICON_MAP[a.type],
          title:  a.message,
          detail: "",
          time:   "Live data",
        });
      }
    }

    return items;
  }, [rawAlerts, contractActivity]);

  const unreadCount = notifications.filter((_, i) => !readIdxs.includes(i)).length;
  const markAllRead = () => setReadIdxs(notifications.map((_, i) => i));

  const sync = useMutation({
    mutationFn: zohoSync,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["zoho-data"] });
    },
  });

  return (
    <LayoutContext.Provider value={{ mounted: true, setTitle: setTitleState, setSubtitle: setSubtitleState, setDocSlug: setDocSlugState }}>
    <UniversalSearchContext.Provider value={{ open: () => setSearchOpen(true) }}>
    <SidebarProvider>
      <style>{`
        @keyframes msgSlideUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <SidebarOpener />
      <div className="h-screen flex w-full bg-muted/40 overflow-hidden">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0 pt-2 pr-2 pb-2 gap-2">
          {/* Top header bar — its own floating pill panel: margins on
              all sides, rounded, drop-shadow. Sits visually parallel to
              the floating sidebar. */}
          <header className="h-[52px] flex items-center justify-between bg-card px-3 sm:px-4 lg:px-5 shrink-0 rounded-3xl border border-border/40 shadow-lg">
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground hover:bg-muted/60 shrink-0 rounded-full h-8 w-8" />

              {/* Breadcrumb pill — Home › Section › Page on one chip so it
                  reads as a single sleek control rather than loose text. */}
              <nav className="flex items-center gap-1.5 text-[11px] min-w-0 rounded-full bg-muted/40 border border-border/40 px-3 py-1.5">
                <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors shrink-0 inline-flex">
                  <Home className="h-3 w-3" />
                </Link>
                {breadcrumbSection && (
                  <>
                    <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                    <span className="text-muted-foreground truncate">{breadcrumbSection}</span>
                  </>
                )}
                <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                <span className="font-medium text-foreground truncate">{breadcrumbLabel}</span>
              </nav>
            </div>
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => !sync.isPending && sync.mutate()}
                    disabled={sync.isPending}
                    className="hidden sm:flex items-center gap-1.5 h-8 px-3 text-[11px] font-medium rounded-full border border-border/40 bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-150 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3 w-3 shrink-0 ${sync.isPending ? "animate-spin" : ""}`} />
                    {sync.isPending
                      ? "Syncing…"
                      : syncedAt
                        ? `Synced ${formatSyncedAt(syncedAt)}`
                        : "Sync now"
                    }
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[10px]">
                  {sync.isPending
                    ? "Fetching latest data from Zoho CRM…"
                    : syncedAt
                      ? `Last synced at ${new Date(syncedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · Click to refresh now`
                      : "Click to pull latest data from Zoho CRM"
                  }
                </TooltipContent>
              </Tooltip>
              {sectionTour && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={startSectionTour}
                      data-tour="topbar-tour-button"
                      className="hidden md:flex items-center gap-1.5 h-8 px-3 text-[11px] font-medium rounded-full border border-teal-200/70 bg-teal-50 text-teal-800 hover:bg-teal-100 hover:border-teal-300 transition-all duration-150"
                      aria-label={`Replay the ${sectionTour.label} training tour`}
                    >
                      <GraduationCap className="h-3 w-3 shrink-0" />
                      Tour
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-[10px]">
                    Training tour — replay the guided walkthrough of {sectionTour.label}.
                  </TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setSearchOpen(true)}
                    data-tour="topbar-search"
                    className="hidden sm:flex items-center gap-1.5 h-8 px-3 text-[11px] font-medium rounded-full border border-border/40 bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-150"
                  >
                    <Search className="h-3 w-3 shrink-0" />
                    Search
                    <kbd className="ml-1 hidden md:inline-flex items-center gap-0.5 rounded-full bg-background/80 px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground border border-border/40">
                      ⌘K
                    </kbd>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[10px]">Search anything · ⌘K</TooltipContent>
              </Tooltip>
              <CurrencyToggle />
<Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 text-[11px] text-muted-foreground hidden sm:flex px-3 rounded-full">
                    <Download className="h-3 w-3 mr-1" />Export
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[10px]">Download this page's data as a spreadsheet</TooltipContent>
              </Tooltip>
              <NotificationsPopover />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    to="/settings"
                    className="flex items-center justify-center h-8 w-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                    aria-label="Settings"
                  >
                    <SettingsIcon className="h-3.5 w-3.5" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[10px]">Settings (Slack, account, users…)</TooltipContent>
              </Tooltip>
            </div>
          </header>

          {/* Page panel — title + content live inside one floating
              panel below the header so the screen reads as a stack of
              two pills (header pill / content pill) against the muted
              background. */}
          <div className="flex-1 flex flex-col min-h-0 rounded-3xl border border-border/40 bg-card shadow-lg overflow-hidden">
            <div className="px-4 lg:px-5 pt-5 pb-3 border-b border-border/40">
              <h1 className="text-[20px] sm:text-[22px] font-semibold text-foreground leading-tight flex items-center gap-2">
                {title || breadcrumbLabel}
                {docSlug && <DocLink slug={docSlug} />}
              </h1>
              {subtitle && <p className="text-[13px] text-muted-foreground mt-1">{subtitle}</p>}
            </div>

            <main className="flex-1 overflow-auto px-4 lg:px-6 pb-6 pt-5">
              <div className="max-w-[1400px] mx-auto">
                <PageTransition>{children}</PageTransition>
              </div>
            </main>
          </div>
        </div>

      </div>{/* end min-h-screen flex */}

      {/* Universal search (Cmd+K) — fuzzy-matches across leads, deals, channels, recruiters, pages */}
      <UniversalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </SidebarProvider>
    </UniversalSearchContext.Provider>
    </LayoutContext.Provider>
  );
}
