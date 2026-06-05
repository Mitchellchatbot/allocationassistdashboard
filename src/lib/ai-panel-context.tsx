/**
 * AI panel — lifted out of DashboardLayout into a top-level provider so
 * the panel + its chat state survive route changes.
 *
 * Why this exists:
 *   Originally the chat lived inside DashboardLayout, which is rendered
 *   under a `<FilterProvider key={location.pathname}>` in App.tsx. That
 *   `key` forces a remount of every child on every navigation — chat
 *   history wiped, panel closed.
 *
 *   This provider sits ABOVE that boundary (inside BrowserRouter so
 *   useNavigate/useLocation work, but outside the route-key remount), so
 *   state survives. The panel itself is a `position: fixed` overlay so
 *   the main viewport layout doesn't have to know it exists.
 *
 * Usage:
 *   <AIPanelProvider>{routes}</AIPanelProvider>
 *   const { toggle, open, sendChat } = useAIPanel();
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type KeyboardEvent } from "react";
import { useLocation } from "react-router-dom";
import { Sparkles, Send, RotateCcw, X, RefreshCw, Copy } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatChart, parseCharts } from "@/components/ChatChart";
import { ChatActionBar, parseActions } from "@/components/ChatActions";
import { useAIPageContext } from "@/lib/ai-page-context";

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL      as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const INSIGHTS_PROMPT = 'Give me exactly 5 insights the recruitment team should act on today. Focus on: where leads are getting stuck, which channels are producing the most doctors, high-priority follow-ups, recruiter workload balance, and any pipeline anomalies. Number each insight 1–5.';

export type ChatMsg = { role: 'user' | 'assistant'; content: string; isInsights?: boolean };

export interface AIPanelContextValue {
  open:        boolean;
  setOpen:     (v: boolean) => void;
  toggle:      () => void;
  messages:    ChatMsg[];
  sendChat:    (text?: string) => Promise<void>;
  loading:     boolean;
  clearChat:   () => void;
}

const Ctx = createContext<AIPanelContextValue | null>(null);

export function useAIPanel(): AIPanelContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAIPanel must be used within <AIPanelProvider>");
  return v;
}

export function AIPanelProvider({ children }: { children: ReactNode }) {
  const [open, setOpen]                 = useState(false);
  const [messages, setMessages]         = useState<ChatMsg[]>([]);
  const [input, setInput]               = useState("");
  const [loading, setLoading]           = useState(false);
  const [streaming, setStreaming]       = useState("");
  const [indexing, setIndexing]         = useState(false);
  const [indexStatus, setIndexStatus]   = useState("");
  // Defer mounting the chat DOM until the first open so the panel
  // doesn't pay its own render cost on every page that never uses it.
  const mountedRef = useRef(false);
  if (open) mountedRef.current = true;

  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const endRef    = useRef<HTMLDivElement>(null);
  const location  = useLocation();
  const { pageData } = useAIPageContext();

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streaming]);

  const toggle    = useCallback(() => setOpen(o => !o), []);
  const clearChat = useCallback(() => { setMessages([]); setInput(""); setStreaming(""); }, []);

  // Re-index leads in 500-row chunks so the edge function CPU budget holds.
  const runEmbedChunked = useCallback(async (silent = false) => {
    if (!silent) { setIndexing(true); setIndexStatus("Indexing leads…"); }
    const CHUNK = 500;
    let offset = 0;
    let totalEmbedded = 0;
    try {
      while (true) {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/embed-leads`, {
          method:  "POST",
          headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
          body:    JSON.stringify({ offset, limit: CHUNK, onlyNew: true }),
        });
        if (!res.ok) break;
        const json = await res.json();
        totalEmbedded += json.embedded ?? 0;
        if (!silent) setIndexStatus(`Indexed ${totalEmbedded} leads…`);
        if (json.done || json.embedded === 0) break;
        offset += CHUNK;
      }
      if (!silent) setIndexStatus(`Done — ${totalEmbedded} leads indexed`);
      setTimeout(() => { setIndexStatus(""); setIndexing(false); }, 3000);
    } catch {
      if (!silent) { setIndexStatus("Indexing failed"); setTimeout(() => { setIndexStatus(""); setIndexing(false); }, 3000); }
    }
  }, []);

  const sendChat = useCallback(async (presetText?: string) => {
    const text = (presetText ?? input).trim();
    if (!text || loading) return;
    const isInsightsRequest = presetText === INSIGHTS_PROMPT;

    const userMsg: ChatMsg = { role: "user", content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    if (!presetText) setInput("");
    setLoading(true);
    setStreaming("");

    const apiMessages = updated.map(m => ({ role: m.role, content: m.content }));
    let full = "";
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-insights`, {
        method:  "POST",
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
        body:    JSON.stringify({ messages: apiMessages, currentPage: location.pathname, pageData: pageData?.data ?? null }),
      });
      if (!res.ok || !res.body) throw new Error("Request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      while (!done) {
        const { value, done: d } = await reader.read();
        done = d;
        if (value) {
          full += decoder.decode(value, { stream: !d });
          // Hide raw tags from the streaming preview — final message
          // render strips them properly.
          setStreaming(
            full
              .replace(/<chart\b[^>]*>[\s\S]*?<\/chart>/gi,   "")
              .replace(/<action\b[^>]*>[\s\S]*?<\/action>/gi, ""),
          );
        }
      }
      setMessages(prev => [...prev, { role: "assistant", content: full, isInsights: isInsightsRequest }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
    } finally {
      setStreaming("");
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [input, loading, messages, location.pathname, pageData]);

  const value = useMemo<AIPanelContextValue>(() => ({
    open, setOpen, toggle, messages, sendChat, loading, clearChat,
  }), [open, toggle, messages, sendChat, loading, clearChat]);

  return (
    <Ctx.Provider value={value}>
      {children}

      {/* Floating launcher — only when panel closed. */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          data-tour="ai-floating-button"
          className="fixed bottom-5 right-5 z-[60] flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-white shadow-lg hover:bg-primary/90 active:scale-95 transition-all duration-150 text-[11px] font-medium"
        >
          <Sparkles className="h-3 w-3" />
          AI Assistant
        </button>
      )}

      {/* Fixed-position overlay drawer. Slides in from the right; main
          viewport never has to know it exists. z-50 so it sits above
          page content; below the floating launcher (z-60) which exists
          only when closed so they never collide. */}
      <div
        className={`fixed top-2 bottom-2 right-2 z-50 w-[440px] max-w-[calc(100vw-1rem)] transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-[calc(100%+1rem)] pointer-events-none"
        }`}
        aria-hidden={!open}
      >
        {mountedRef.current && (
          <div className="h-full flex flex-col rounded-3xl border border-border/40 bg-card shadow-2xl overflow-hidden">

            {/* Header strip */}
            <div className="h-[52px] shrink-0 border-b border-border/40 bg-card flex items-center justify-between px-4">
              <button
                onClick={() => runEmbedChunked(false)}
                disabled={indexing}
                title="Re-index all leads for AI search"
                className="flex items-center gap-1.5 h-7 px-3 rounded-full text-[11px] font-medium border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${indexing ? "animate-spin" : ""}`} />
                {indexStatus || "Index leads"}
              </button>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button
                    onClick={clearChat}
                    title="Clear chat"
                    className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  title="Close"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Title strip */}
            <div className="px-5 pt-5 pb-3 border-b border-border/40 bg-card shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h2 className="text-[20px] font-semibold text-foreground leading-tight">AI Assistant</h2>
                  <p className="text-[13px] text-muted-foreground mt-0.5">Scans your data + drives the dashboard</p>
                </div>
              </div>
            </div>

            {/* Scroll area */}
            <div className="flex-1 overflow-y-auto bg-background">
              <div className="flex flex-col justify-end min-h-full px-5 py-5 space-y-4">

                {messages.length === 0 && !loading && (
                  <div className="flex flex-col items-center gap-4 py-10">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                      <Sparkles className="h-6 w-6 text-primary/40" />
                    </div>
                    <p className="text-[13px] text-muted-foreground text-center max-w-[280px]">
                      Ask anything, or tell me to take you somewhere.
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {[
                        { label: "✨ Get 5 insights", prompt: INSIGHTS_PROMPT },
                        { label: "Take me to vacancies", prompt: "Take me to the open vacancies page." },
                        { label: "Show stuck runs",    prompt: "Show me automation runs that are stale 7d+. Who owns them?" },
                        { label: "Pipeline summary",   prompt: "Give me a quick summary of where doctors are in the pipeline right now." },
                      ].map(chip => (
                        <button
                          key={chip.label}
                          onClick={() => sendChat(chip.prompt)}
                          disabled={loading}
                          className="rounded-full border border-border bg-card px-3.5 py-1.5 text-[12px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40"
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((m, i) => m.role === "user" ? (
                  <div key={i} className="flex justify-end" style={{ animation: "msgSlideUp 0.28s cubic-bezier(0.22,1,0.36,1) both" }}>
                    <div className="max-w-[78%] rounded-2xl rounded-br-sm bg-primary px-4 py-3">
                      <p className="text-[13px] text-white leading-relaxed">{m.content}</p>
                    </div>
                  </div>
                ) : (
                  <div key={i} className="flex items-start gap-3" style={{ animation: "msgSlideUp 0.32s cubic-bezier(0.22,1,0.36,1) both" }}>
                    <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {(() => {
                        const { text: noActions, actions } = parseActions(m.content);
                        const { text: cleanText, charts }  = parseCharts(noActions);
                        return (
                          <div className="space-y-2">
                            {cleanText && (
                              <div className="group relative rounded-2xl rounded-bl-sm bg-card border border-border/50 px-4 py-3">
                                <button
                                  onClick={() => { navigator.clipboard.writeText(cleanText); toast.success("Copied"); }}
                                  title="Copy"
                                  className="absolute top-2 right-2 h-6 w-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted/80 text-muted-foreground hover:text-foreground"
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm]}
                                  components={{
                                    p:      ({ children }) => <p className="text-[13px] text-foreground leading-relaxed mb-2 last:mb-0">{children}</p>,
                                    strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                                    em:     ({ children }) => <em className="italic text-foreground/80">{children}</em>,
                                    h1:     ({ children }) => <h1 className="text-[15px] font-bold text-foreground mt-3 mb-1.5 first:mt-0">{children}</h1>,
                                    h2:     ({ children }) => <h2 className="text-[14px] font-semibold text-foreground mt-3 mb-1 first:mt-0">{children}</h2>,
                                    h3:     ({ children }) => <h3 className="text-[13px] font-semibold text-foreground/90 mt-2 mb-1 first:mt-0">{children}</h3>,
                                    ul:     ({ children }) => <ul className="my-2 space-y-1 pl-1">{children}</ul>,
                                    ol:     ({ children }) => <ol className="my-2 space-y-1 pl-1 list-none counter-reset-[item]">{children}</ol>,
                                    li:     ({ children, ...props }) => {
                                      const isOrdered = (props as { ordered?: boolean }).ordered;
                                      return (
                                        <li className="flex items-start gap-2 text-[13px] text-foreground leading-relaxed">
                                          {isOrdered
                                            ? <span className="shrink-0 mt-0.5 h-4 w-4 rounded-full bg-primary/10 text-[9px] font-bold text-primary flex items-center justify-center">•</span>
                                            : <span className="shrink-0 mt-[7px] h-1.5 w-1.5 rounded-full bg-primary/60" />}
                                          <span>{children}</span>
                                        </li>
                                      );
                                    },
                                    code:   ({ children, className }) => {
                                      const isBlock = className?.includes("language-");
                                      return isBlock
                                        ? <code className="block bg-muted rounded-lg px-3 py-2 text-[12px] font-mono text-foreground my-2 overflow-x-auto">{children}</code>
                                        : <code className="bg-muted rounded px-1.5 py-0.5 text-[11px] font-mono text-primary">{children}</code>;
                                    },
                                    table:   ({ children }) => <div className="overflow-x-auto my-2"><table className="w-full border-collapse text-[11px]">{children}</table></div>,
                                    thead:   ({ children }) => <thead className="bg-muted/50">{children}</thead>,
                                    tbody:   ({ children }) => <tbody>{children}</tbody>,
                                    tr:      ({ children }) => <tr className="border-b border-border/40 last:border-0">{children}</tr>,
                                    th:      ({ children }) => <th className="text-left px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{children}</th>,
                                    td:      ({ children }) => <td className="px-2 py-1.5 text-[11px] text-foreground">{children}</td>,
                                    blockquote: ({ children }) => <blockquote className="border-l-2 border-primary/40 pl-3 italic text-foreground/70 my-2">{children}</blockquote>,
                                    hr: () => <hr className="border-border/40 my-3" />,
                                  }}
                                >
                                  {cleanText}
                                </ReactMarkdown>
                              </div>
                            )}
                            {charts.map((spec, ci) => (
                              <div key={ci} style={{ animation: `msgSlideUp 0.35s cubic-bezier(0.22,1,0.36,1) ${ci * 80}ms both` }}>
                                <ChatChart spec={spec} />
                              </div>
                            ))}
                            {actions.length > 0 && <ChatActionBar actions={actions} />}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                ))}

                {loading && streaming && (
                  <div className="flex gap-3">
                    <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 ring-1 ring-primary/20">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="prose prose-sm max-w-none text-[13px] leading-relaxed text-foreground/90 [&_p]:my-1 [&_h2]:text-[14px] [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1 [&_ul]:my-1 [&_li]:my-0.5 [&_strong]:font-semibold [&_strong]:text-foreground">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{streaming}</ReactMarkdown>
                      </div>
                      <div className="inline-flex items-center gap-1 mt-1">
                        <span className="h-1 w-1 rounded-full bg-primary/60 animate-bounce [animation-delay:0ms]" />
                        <span className="h-1 w-1 rounded-full bg-primary/60 animate-bounce [animation-delay:150ms]" />
                        <span className="h-1 w-1 rounded-full bg-primary/60 animate-bounce [animation-delay:300ms]" />
                      </div>
                    </div>
                  </div>
                )}

                {loading && !streaming && (
                  <div className="flex items-center gap-2 pl-10">
                    <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce [animation-delay:0ms]" />
                    <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce [animation-delay:150ms]" />
                    <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce [animation-delay:300ms]" />
                  </div>
                )}

                <div ref={endRef} />
              </div>
            </div>

            {/* Input bar */}
            <div className="shrink-0 border-t border-border/40 bg-card px-5 py-4">
              <div className="flex items-end gap-3 rounded-xl border border-border bg-background px-4 py-3 focus-within:ring-1 focus-within:ring-primary/40 focus-within:border-primary/50 transition-all">
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={input}
                  onChange={e => {
                    setInput(e.target.value);
                    const el = e.currentTarget;
                    el.style.height = "auto";
                    el.style.height = `${Math.min(el.scrollHeight, 5 * 22)}px`;
                  }}
                  onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
                  }}
                  placeholder="Ask, or 'take me to…'   (Shift+Enter for newline)"
                  disabled={loading}
                  className="flex-1 text-[13px] bg-transparent outline-none placeholder:text-muted-foreground/40 disabled:opacity-50 resize-none leading-[22px] max-h-[110px]"
                />
                <button
                  onClick={() => sendChat()}
                  disabled={!input.trim() || loading}
                  className="h-7 w-7 flex items-center justify-center rounded-lg bg-primary text-white transition-all disabled:opacity-25 hover:bg-primary/85 active:scale-95 shrink-0"
                  title="Send (Enter)"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}
