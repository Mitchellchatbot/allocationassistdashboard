import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { PageTransition } from "./PageTransition";
import { Bell, Download, CalendarDays, AlertTriangle, ChevronRight, Home, Sparkles, RefreshCw, Info, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useFilters, type TimeRange } from "@/lib/filters";
import { useFilteredData } from "@/hooks/use-filtered-data";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { useZohoData } from "@/hooks/use-zoho-data";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { zohoSync } from "@/lib/zoho";

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const ALERT_ICON_MAP = {
  warning: { icon: AlertTriangle, color: "text-warning" },
  info:    { icon: Info,          color: "text-info"    },
  success: { icon: CheckCircle2,  color: "text-success" },
} as const;

const breadcrumbMap: Record<string, string> = {
  "/": "Dashboard",
  "/sales": "Sales Tracker",
  "/marketing": "Marketing",
  "/leads-pipeline": "Doctor Progress",
  "/team": "Team Performance",
  "/finance": "Finance",
  "/operations": "Operations & Roadmap",
  "/settings": "Settings",
};

interface DashboardLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

function formatSyncedAt(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  const hrs  = Math.floor(diffMs / 3_600_000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs  < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function DashboardLayout({ children, title, subtitle }: DashboardLayoutProps) {
  const { timeRange, setTimeRange } = useFilters();
  const { alerts: rawAlerts } = useFilteredData();
  const [readIdxs, setReadIdxs] = useState<number[]>([]);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const location = useLocation();
  const currentPath = location.pathname;
  const breadcrumbLabel = breadcrumbMap[currentPath] || title;
  const { data: zoho } = useZohoData();
  const syncedAt = zoho?.syncedAt;
  const queryClient = useQueryClient();

  // Build notification objects from real alerts
  const notifications = useMemo(() => {
    if (!rawAlerts || rawAlerts.length === 0) return [];
    return rawAlerts.slice(0, 5).map((a, i) => ({
      id: i,
      ...ALERT_ICON_MAP[a.type],
      title: a.message,
      detail: '',
      time: 'Live data',
    }));
  }, [rawAlerts]);

  const unreadCount = notifications.filter((_, i) => !readIdxs.includes(i)).length;
  const markAllRead = () => setReadIdxs(notifications.map((_, i) => i));

  const fetchInsights = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setAiText("");
    setAiLoading(true);

    // Build a concise stats summary from cached Zoho data
    const leads = zoho?.rawLeads ?? [];
    const deals = zoho?.rawDeals ?? [];
    const calls = zoho?.rawCalls ?? [];
    const cutoff7  = Date.now() - 7  * 86_400_000;
    const cutoff30 = Date.now() - 30 * 86_400_000;

    const statusCounts: Record<string, number> = {};
    const sourceCounts: Record<string, number> = {};
    for (const l of leads) {
      statusCounts[l.Lead_Status] = (statusCounts[l.Lead_Status] ?? 0) + 1;
      const src = l.Lead_Source ?? "Unknown";
      sourceCounts[src] = (sourceCounts[src] ?? 0) + 1;
    }

    const stats = {
      totalLeads:     leads.length,
      totalDeals:     deals.length,
      totalCalls:     calls.length,
      newLeads7d:     leads.filter(l => new Date(l.Created_Time).getTime() >= cutoff7).length,
      newLeads30d:    leads.filter(l => new Date(l.Created_Time).getTime() >= cutoff30).length,
      leadsByStatus:  statusCounts,
      leadsBySource:  sourceCounts,
      syncedAt:       syncedAt ?? null,
    };

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-insights`, {
        method: 'POST',
        headers: {
          'apikey':        SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify(stats),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        setAiText("Could not load insights. Please try again.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      while (!done) {
        const { value, done: d } = await reader.read();
        done = d;
        if (value) setAiText(prev => prev + decoder.decode(value, { stream: !d }));
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setAiText("Could not load insights. Please try again.");
      }
    } finally {
      setAiLoading(false);
    }
  }, [zoho, syncedAt]);

  // Fetch insights whenever the panel is opened
  useEffect(() => {
    if (aiOpen) fetchInsights();
    return () => { abortRef.current?.abort(); };
  }, [aiOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const sync = useMutation({
    mutationFn: zohoSync,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["zoho-data"] }),
  });


  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top header bar */}
          <header className="h-[52px] flex items-center justify-between border-b bg-card px-3 sm:px-4 lg:px-5 shrink-0">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground shrink-0" />
              <div className="h-4 w-px bg-border/60 hidden sm:block shrink-0" />
              
              {/* Breadcrumb */}
              <nav className="flex items-center gap-1 text-[11px] min-w-0">
                <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
                  <Home className="h-3 w-3" />
                </Link>
                <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                <span className="font-medium text-foreground truncate">{breadcrumbLabel}</span>
              </nav>
            </div>
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => !sync.isPending && sync.mutate()}
                    disabled={sync.isPending}
                    className="hidden sm:flex items-center gap-1 text-[9px] text-muted-foreground/70 hover:text-foreground transition-colors disabled:opacity-50 rounded px-1 py-0.5 hover:bg-muted"
                  >
                    <RefreshCw className={`h-2.5 w-2.5 ${sync.isPending ? "animate-spin" : ""}`} />
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
              <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
                <SelectTrigger className="h-7 w-[100px] sm:w-[110px] text-[11px] bg-white/60 border-0 rounded-md backdrop-blur-sm">
                  <CalendarDays className="h-3 w-3 mr-1 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="quarter">This Quarter</SelectItem>
                  <SelectItem value="year">This Year</SelectItem>
                </SelectContent>
              </Select>
<Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 text-[11px] text-muted-foreground hidden sm:flex px-2">
                    <Download className="h-3 w-3 mr-1" />Export
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[10px]">Download this page's data as a spreadsheet</TooltipContent>
              </Tooltip>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative h-7 w-7">
                    <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                    {unreadCount > 0 && (
                      <Badge className="absolute -top-0.5 -right-0.5 h-3.5 min-w-[14px] p-0 flex items-center justify-center text-[8px] animate-pulse">
                        {unreadCount}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[340px] p-0">
                  <div className="flex items-center justify-between px-3 py-2.5 border-b bg-muted/30">
                    <span className="text-[12px] font-semibold">Notifications</span>
                    {unreadCount > 0 && (
                      <button onClick={markAllRead} className="text-[10px] text-primary hover:underline font-medium">
                        Mark all as read
                      </button>
                    )}
                  </div>
                  <div className="max-h-[320px] overflow-auto">
                    {notifications.length === 0 ? (
                      <div className="flex items-center gap-2.5 px-3 py-4 text-[11px] text-muted-foreground">
                        <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                        All caught up — no urgent items.
                      </div>
                    ) : (
                      notifications.map((n, i) => {
                        const isUnread = !readIdxs.includes(i);
                        const Icon = n.icon;
                        return (
                          <div
                            key={i}
                            className={`flex items-start gap-2.5 px-3 py-2.5 border-b border-border/40 last:border-0 hover:bg-muted/50 cursor-pointer transition-colors ${isUnread ? "bg-primary/5" : ""}`}
                            onClick={() => !readIdxs.includes(i) && setReadIdxs(prev => [...prev, i])}
                          >
                            <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${isUnread ? "bg-primary/10" : "bg-muted"}`}>
                              <Icon className={`h-3 w-3 ${n.color}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-[11px] leading-tight ${isUnread ? "font-semibold text-foreground" : "font-medium text-muted-foreground"}`}>{n.title}</p>
                              {n.detail && <p className="text-[10px] text-muted-foreground truncate">{n.detail}</p>}
                            </div>
                            <div className="flex flex-col items-end shrink-0 gap-0.5">
                              <span className="text-[9px] text-muted-foreground">{n.time}</span>
                              {isUnread && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </header>

          {/* Page title section */}
          <div className="px-4 lg:px-5 pt-5 pb-3 border-b border-border/40 bg-card">
            <h1 className="text-[20px] sm:text-[22px] font-semibold text-foreground leading-tight">{title}</h1>
            {subtitle && <p className="text-[13px] text-muted-foreground mt-1">{subtitle}</p>}
          </div>

          <main className="flex-1 overflow-auto px-4 lg:px-6 pb-6 pt-5">
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
      </div>

      {/* AI Insight floating button */}
      <button
        onClick={() => setAiOpen(true)}
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-white shadow-lg hover:bg-primary/90 active:scale-95 transition-all duration-150 text-[12px] font-medium"
      >
        <Sparkles className="h-3.5 w-3.5" />
        AI Insights
      </button>

      {/* AI Insight Sheet */}
      <Sheet open={aiOpen} onOpenChange={setAiOpen}>
        <SheetContent side="right" className="w-[340px] sm:w-[400px] flex flex-col gap-0 p-0">
          <SheetHeader className="px-5 py-4 border-b bg-gradient-to-r from-primary/5 to-primary/10">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div>
                <SheetTitle className="text-[15px]">AI Insights</SheetTitle>
                <SheetDescription className="text-[11px]">Powered by Claude</SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-auto px-5 py-5">
            {aiLoading && !aiText && (
              <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Sparkles className="h-5 w-5 text-primary animate-pulse" />
                </div>
                <p className="text-[12px] text-muted-foreground">Analysing your recruitment data…</p>
              </div>
            )}

            {aiText && (
              <div className="space-y-3">
                {aiText.split(/\n(?=\d+\.)/).filter(Boolean).map((block, i) => {
                  const match = block.match(/^(\d+)\.\s*(.*)/s);
                  if (!match) return null;
                  return (
                    <div key={i} className="rounded-lg border border-border/60 bg-card p-3.5">
                      <div className="flex items-start gap-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                          {match[1]}
                        </span>
                        <p className="text-[12px] text-foreground leading-relaxed">{match[2].trim()}</p>
                      </div>
                    </div>
                  );
                })}
                {aiLoading && (
                  <div className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:300ms]" />
                  </div>
                )}
              </div>
            )}

            {!aiLoading && !aiText && (
              <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 px-4 py-6 text-center">
                <Sparkles className="h-8 w-8 text-primary/40 mx-auto mb-3" />
                <p className="text-[13px] font-medium text-foreground mb-1">No insights yet</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Close and re-open this panel to generate fresh insights.
                </p>
              </div>
            )}
          </div>

          {/* Refresh button at bottom */}
          <div className="px-5 pb-5 border-t pt-4">
            <button
              onClick={fetchInsights}
              disabled={aiLoading}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-[12px] font-medium py-2.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${aiLoading ? "animate-spin" : ""}`} />
              {aiLoading ? "Generating…" : "Refresh insights"}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  );
}
