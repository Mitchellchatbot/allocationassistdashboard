import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Search, Send, Workflow, Layers, Inbox, History } from "lucide-react";
import { useUnreadReplyCount } from "@/hooks/use-replies";
import { SendProfilePanel } from "./ProfileSent";
import { EmailChainPanel } from "./Automations";
import { BatchesPanel } from "./Batches";
import { RepliesPanel } from "./Replies";
import { PastSentPanel } from "./PastSent";

/**
 * Sends — one home for the whole outbound workflow, replacing five separate
 * sidebar items (Profile Sent, Automations, Batch Sends, Replies, Past Sent).
 *
 * Modelled on /doctors: a shared search bar sits above an underline tab strip,
 * and the query lives in `?q=` so it carries across tab switches — type once
 * and it filters whichever searchable tab you're on. The active tab lives in
 * `?tab=` so links are shareable and the old routes can redirect straight into
 * the right tab (see RedirectToSends in App.tsx).
 *
 * Two tabs consume the shared search: Past Sent (by doctor / specialty /
 * hospital / action) and Replies (by sender email / subject / text). The three
 * composer/launchpad tabs have no list to search, so — like /doctors hides its
 * search on the Responses tab — the bar is hidden there.
 *
 * Only the ACTIVE panel is mounted (conditional render, not all five), so
 * switching tabs is what triggers each panel's data to load. React Query caches
 * across remounts, so flipping back to a tab you've already opened is instant.
 */
const TABS = [
  { key: "send-profile", label: "Send Profile", icon: Send,     searchable: false, placeholder: "" },
  { key: "email-chain",  label: "Email Chain",  icon: Workflow, searchable: false, placeholder: "" },
  { key: "batch-sends",  label: "Batch Sends",  icon: Layers,   searchable: false, placeholder: "" },
  { key: "replies",      label: "Replies",      icon: Inbox,    searchable: true,  placeholder: "Search replies — sender email, subject, message text…" },
  { key: "past-sent",    label: "Past Sent",    icon: History,  searchable: true,  placeholder: "Search sent history — doctor, specialty, hospital, action, or operators (specialty: hospital: doctor: sent:)…" },
] as const;

type TabKey = (typeof TABS)[number]["key"];
const TAB_KEYS = TABS.map(t => t.key) as readonly string[];

export default function Sends() {
  const [searchParams, setSearchParams] = useSearchParams();
  const unreadReplies = useUnreadReplyCount();

  const raw = searchParams.get("tab") ?? "";
  const active: TabKey = TAB_KEYS.includes(raw) ? (raw as TabKey) : "send-profile";
  const meta = TABS.find(t => t.key === active)!;

  const q = searchParams.get("q") ?? "";

  const setQ = (v: string) => {
    const next = new URLSearchParams(searchParams);
    if (v) next.set("q", v); else next.delete("q");
    setSearchParams(next, { replace: true });
  };

  // Explicit tab click resets to ?tab=X (+ the shared ?q= if any) — deliberately
  // dropping stale flow / compose / run params left behind by the previous tab,
  // while keeping the search so it carries across tabs like /doctors does.
  const onTabChange = (k: TabKey) => {
    const next = new URLSearchParams();
    next.set("tab", k);
    if (q) next.set("q", q);
    setSearchParams(next);
  };

  return (
    <DashboardLayout>
      {/* Shared search bar — shown only on tabs that consume it (Past Sent,
          Replies), mirroring how /doctors hides its search on Responses. */}
      {meta.searchable && (
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={meta.placeholder}
            className="pl-10 pr-24 h-10 text-[13px]"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground hover:text-slate-800"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Tab strip — underline style, matching /doctors. */}
      <div className="border-b border-border/60 mb-4 flex items-center gap-1 overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon;
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onTabChange(t.key)}
              className={`relative flex items-center gap-1.5 px-3 py-2 text-[12.5px] font-medium transition-colors -mb-px border-b-2 ${
                isActive
                  ? "text-teal-700 border-teal-600"
                  : "text-slate-600 border-transparent hover:text-slate-900 hover:border-slate-300"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
              {t.key === "replies" && unreadReplies > 0 && (
                <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-semibold text-white">
                  {unreadReplies > 99 ? "99+" : unreadReplies}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div>
        {active === "send-profile" && <SendProfilePanel />}
        {active === "email-chain"  && <EmailChainPanel />}
        {active === "batch-sends"  && <BatchesPanel />}
        {active === "replies"      && <RepliesPanel query={q} />}
        {active === "past-sent"    && <PastSentPanel query={q} onQueryChange={setQ} />}
      </div>
    </DashboardLayout>
  );
}
