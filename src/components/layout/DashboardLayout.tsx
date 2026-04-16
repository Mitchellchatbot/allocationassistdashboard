import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { PageTransition } from "./PageTransition";
import { Bell, Download, AlertTriangle, ChevronRight, Home, Sparkles, RefreshCw, Info, CheckCircle2, Send, RotateCcw, X } from "lucide-react";
import { ChatChart, parseCharts } from "@/components/ChatChart";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DateRangePicker } from "@/components/DateRangePicker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFilters } from "@/lib/filters";
import { useFilteredData } from "@/hooks/use-filtered-data";
import { useState, useEffect, useRef, useCallback, useMemo, KeyboardEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { useZohoData } from "@/hooks/use-zoho-data";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { zohoSync } from "@/lib/zoho";
import { WEEKLY_SALES_QUERY_KEY, fetchWeeklySalesRaw } from "@/hooks/use-weekly-sales";

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

/** Manages sidebar open state relative to AI panel and navigation. */
function SidebarCloser({ aiOpen }: { aiOpen: boolean }) {
  const { setOpen, isMobile } = useSidebar();
  const location = useLocation();

  // Close sidebar when AI opens; reopen when AI closes (desktop only)
  useEffect(() => {
    if (!isMobile) setOpen(!aiOpen);
  }, [aiOpen, isMobile, setOpen]);

  // Reopen sidebar after any navigation (desktop only, AI not open)
  useEffect(() => {
    if (!isMobile && !aiOpen) setOpen(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return null;
}

export function DashboardLayout({ children, title, subtitle }: DashboardLayoutProps) {

  const { alerts: rawAlerts, filteredLeads, filteredDeals } = useFilteredData();
  const [readIdxs, setReadIdxs] = useState<number[]>([]);
  const [aiOpen, setAiOpen] = useState(false);
  // Track whether the AI panel has ever been opened — we defer mounting its
  // heavy chat UI until first use so it doesn't slow down the initial page render.
  const aiPanelMounted = useRef(false);
  if (aiOpen) aiPanelMounted.current = true;

  const [indexing, setIndexing] = useState(false);
  const [indexStatus, setIndexStatus] = useState('');

  // Chat state
  type ChatMsg = { role: 'user' | 'assistant'; content: string; isInsights?: boolean };
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatStreaming, setChatStreaming] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const location = useLocation();
  const currentPath = location.pathname;
  const breadcrumbLabel = breadcrumbMap[currentPath] || title;
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

  // Lead count for AI panel subtitle
  const compactLeads = useMemo(() => filteredLeads, [filteredLeads]);

  const unreadCount = notifications.filter((_, i) => !readIdxs.includes(i)).length;
  const markAllRead = () => setReadIdxs(notifications.map((_, i) => i));

  const INSIGHTS_PROMPT = 'Give me exactly 5 insights the recruitment team should act on today. Focus on: where leads are getting stuck, which channels are producing the most doctors, high-priority follow-ups, recruiter workload balance, and any pipeline anomalies. Number each insight 1–5.';

  // Reset chat on panel close
  useEffect(() => {
    if (!aiOpen) {
      setChatMessages([]);
      setChatInput('');
      setChatStreaming('');
    }
  }, [aiOpen]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatStreaming]);

  /** Embed leads in chunks of 500 so we never hit the Edge Function CPU timeout. */
  const runEmbedChunked = useCallback(async (silent = false) => {
    if (!silent) { setIndexing(true); setIndexStatus('Indexing leads…'); }
    const CHUNK = 500;
    let offset = 0;
    let totalEmbedded = 0;
    try {
      while (true) {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/embed-leads`, {
          method: 'POST',
          headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ offset, limit: CHUNK, onlyNew: true }),
        });
        if (!res.ok) { console.warn('[embed-leads] chunk failed', offset); break; }
        const json = await res.json();
        totalEmbedded += json.embedded ?? 0;
        if (!silent) setIndexStatus(`Indexed ${totalEmbedded} leads…`);
        if (json.done || json.embedded === 0) break;
        offset += CHUNK;
      }
      if (!silent) setIndexStatus(`Done — ${totalEmbedded} leads indexed`);
      setTimeout(() => { setIndexStatus(''); setIndexing(false); }, 3000);
    } catch (err) {
      console.warn('[embed-leads]', err);
      if (!silent) { setIndexStatus('Indexing failed'); setTimeout(() => { setIndexStatus(''); setIndexing(false); }, 3000); }
    }
  }, []);

  const sync = useMutation({
    mutationFn: zohoSync,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["zoho-data"] });
      runEmbedChunked(true); // silent background re-index after sync
    },
  });

  const sendChat = useCallback(async (presetText?: string) => {
    const text = (presetText ?? chatInput).trim();
    if (!text || chatLoading) return;
    const isInsightsRequest = presetText === INSIGHTS_PROMPT;

    const userMsg: ChatMsg = { role: 'user', content: text };
    const updatedMsgs = [...chatMessages, userMsg];
    setChatMessages(updatedMsgs);
    if (!presetText) setChatInput('');
    setChatLoading(true);
    setChatStreaming('');

    const apiMessages = updatedMsgs.map(m => ({ role: m.role, content: m.content }));

    let full = '';
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-insights`, {
        method:  'POST',
        headers: {
          'apikey':        SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!res.ok || !res.body) throw new Error('Request failed');

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      while (!done) {
        const { value, done: d } = await reader.read();
        done = d;
        if (value) { full += decoder.decode(value, { stream: !d }); setChatStreaming(full); }
      }

      setChatMessages(prev => [...prev, { role: 'assistant', content: full, isInsights: isInsightsRequest }]);
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }]);
    } finally {
      setChatStreaming('');
      setChatLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatInput, chatMessages, chatLoading, zoho, syncedAt]);


  return (
    <SidebarProvider>
      <SidebarCloser aiOpen={aiOpen} />
      <div className="h-screen flex w-full bg-background overflow-hidden">
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
                    className="hidden sm:flex items-center gap-1.5 h-7 px-2.5 text-[11px] font-medium rounded-md border border-border/60 bg-card text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/50 transition-all duration-150 disabled:opacity-50 shadow-sm"
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
              <DateRangePicker />
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

        {/* AI Panel — inline flex child, pushes content left.
            Inner content is only mounted after the first open to avoid
            blocking the initial page render with chat state and embeds. */}
        <div
          className="shrink-0 flex flex-col border-l border-border/40 overflow-hidden"
          style={{ width: aiOpen ? '460px' : '0px', transition: 'width 300ms cubic-bezier(0.4,0,0.2,1)' }}
          aria-hidden={!aiOpen}
        >
        {aiPanelMounted.current && (
          <div className="w-[460px] flex flex-col h-full bg-card">

            {/* Row 1 — blank bar that aligns with the main header (same bg, same border-b) */}
            <div className="h-[52px] shrink-0 border-b border-border/40 bg-card flex items-center justify-between px-4">
              {/* Index leads button */}
              <button
                onClick={() => runEmbedChunked(false)}
                disabled={indexing}
                title="Re-index all leads for AI search"
                className="flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] font-medium border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${indexing ? 'animate-spin' : ''}`} />
                {indexStatus || 'Index leads'}
              </button>
              <div className="flex items-center gap-1">
                {chatMessages.length > 0 && (
                  <button
                    onClick={() => { setChatMessages([]); setChatInput(''); setChatStreaming(''); }}
                    title="Clear chat"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={() => setAiOpen(false)}
                  title="Close"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Row 2 — title section that mirrors the page-title section */}
            <div className="px-5 pt-5 pb-3 border-b border-border/40 bg-card shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h2 className="text-[20px] font-semibold text-foreground leading-tight">AI Assistant</h2>
                  <p className="text-[13px] text-muted-foreground mt-0.5">RAG · {compactLeads.length} leads indexed</p>
                </div>
              </div>
            </div>

            {/* Scrollable chat area */}
            <div className="flex-1 overflow-y-auto bg-background">
            <div className="flex flex-col justify-end min-h-full px-5 py-5 space-y-4">

              {/* Empty state */}
              {chatMessages.length === 0 && !chatLoading && (
                <div className="flex flex-col items-center gap-4 py-10">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                    <Sparkles className="h-6 w-6 text-primary/40" />
                  </div>
                  <p className="text-[13px] text-muted-foreground text-center max-w-[280px]">
                    Ask anything about your recruitment data.
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {[
                      { label: '✨ Get 5 insights', prompt: INSIGHTS_PROMPT },
                      { label: 'Who needs follow-up?', prompt: 'Which leads have High Priority Follow-up status? List their names and recruiters.' },
                      { label: 'Top channels', prompt: 'Which lead sources are producing the most doctors right now?' },
                      { label: 'Pipeline summary', prompt: 'Give me a quick summary of where doctors are in the pipeline right now.' },
                    ].map(chip => (
                      <button
                        key={chip.label}
                        onClick={() => sendChat(chip.prompt)}
                        disabled={chatLoading}
                        className="rounded-full border border-border bg-card px-3.5 py-1.5 text-[12px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40"
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Chat messages */}
              {chatMessages.map((m, i) => m.role === 'user' ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[78%] rounded-2xl rounded-br-sm bg-primary px-4 py-3">
                    <p className="text-[13px] text-white leading-relaxed">{m.content}</p>
                  </div>
                </div>
              ) : (
                <div key={i} className="flex items-start gap-3">
                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {m.isInsights ? (
                      <div className="space-y-2">
                        {m.content.split(/\n(?=\d+\.)/).filter(Boolean).map((block, j) => {
                          const match = block.match(/^(\d+)\.\s*(.*)/s);
                          if (!match) return null;
                          return (
                            <div key={j} className="rounded-xl border border-border/50 bg-card p-4">
                              <div className="flex items-start gap-3">
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary mt-0.5">
                                  {match[1]}
                                </span>
                                <p className="text-[13px] text-foreground leading-relaxed">{match[2].trim()}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (() => {
                      const { text: cleanText, charts } = parseCharts(m.content);
                      return (
                        <div>
                          {cleanText && (
                            <div className="rounded-2xl rounded-bl-sm bg-card border border-border/50 px-4 py-3">
                              <p className="text-[13px] text-foreground leading-relaxed whitespace-pre-wrap">{cleanText}</p>
                            </div>
                          )}
                          {charts.map((spec, ci) => (
                            <ChatChart key={ci} spec={spec} />
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ))}

              {/* Streaming — hide any in-progress <chart> tag so raw JSON doesn't flash */}
              {chatStreaming && (() => {
                const { text: streamText, charts: streamCharts } = parseCharts(chatStreaming);
                // Also strip a partial opening tag that hasn't closed yet
                const displayText = streamText.replace(/<chart[^>]*>[^<]*$/, "").trim();
                return (
                  <div className="flex items-start gap-3">
                    <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {displayText && (
                        <div className="rounded-2xl rounded-bl-sm bg-card border border-border/50 px-4 py-3">
                          <p className="text-[13px] text-foreground leading-relaxed whitespace-pre-wrap">{displayText}</p>
                        </div>
                      )}
                      {streamCharts.map((spec, ci) => (
                        <ChatChart key={ci} spec={spec} />
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Thinking dots */}
              {chatLoading && !chatStreaming && (
                <div className="flex items-center gap-2 pl-10">
                  <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce [animation-delay:0ms]" />
                  <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce [animation-delay:150ms]" />
                  <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce [animation-delay:300ms]" />
                </div>
              )}

              <div ref={chatEndRef} />
            </div>
            </div>

            {/* Input bar */}
            <div className="shrink-0 border-t border-border/40 bg-card px-5 py-4">
              <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 focus-within:ring-1 focus-within:ring-primary/40 focus-within:border-primary/50 transition-all">
                <input
                  ref={inputRef}
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
                  }}
                  placeholder="Ask about your data…"
                  disabled={chatLoading}
                  className="flex-1 text-[13px] bg-transparent outline-none placeholder:text-muted-foreground/40 disabled:opacity-50"
                />
                <button
                  onClick={() => sendChat()}
                  disabled={!chatInput.trim() || chatLoading}
                  className="h-7 w-7 flex items-center justify-center rounded-lg bg-primary text-white transition-all disabled:opacity-25 hover:bg-primary/85 active:scale-95 shrink-0"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

          </div>
        )}{/* end deferred AI panel content */}
        </div>{/* end AI panel */}
      </div>{/* end min-h-screen flex */}

      {/* Floating button — only when panel is closed */}
      {!aiOpen && (
        <button
          onClick={() => setAiOpen(true)}
          className="fixed bottom-5 right-5 z-50 flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-white shadow-lg hover:bg-primary/90 active:scale-95 transition-all duration-150 text-[11px] font-medium"
        >
          <Sparkles className="h-3 w-3" />
          AI Assistant
        </button>
      )}
    </SidebarProvider>
  );
}
