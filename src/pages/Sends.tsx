import { useSearchParams } from "react-router-dom";
import { motion, LayoutGroup } from "framer-motion";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Search, Send, Workflow, Layers, Inbox, History } from "lucide-react";
import { AnimatedTabContent } from "@/components/AnimatedTabs";
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
 * and it filters whichever tab you're on. The bar is ALWAYS present (every tab
 * consumes it: recent sends, flows, batches, replies, history), so it never
 * pops in and out. The active tab lives in `?tab=` so links are shareable and
 * the old routes can redirect straight into the right tab (RedirectToSends).
 *
 * Switching animates: the active-tab underline slides between tabs (framer
 * layoutId) and the panel body fades/slides via <AnimatedTabContent> (exit-
 * then-enter). Only the ACTIVE panel is mounted, so switching is what triggers
 * each panel's data to load; each panel shows its own loading state while it
 * fetches, and React Query caches across remounts so revisits are instant.
 */
const TABS = [
  { key: "send-profile", label: "Send Profile", icon: Send,     placeholder: "Search recent profile sends — doctor, hospital, specialty…" },
  { key: "email-chain",  label: "Email Chain",  icon: Workflow, placeholder: "Search flows — doctor, hospital, stage, status…" },
  { key: "batch-sends",  label: "Batch Sends",  icon: Layers,   placeholder: "Search batches — type, specialty, country…" },
  { key: "replies",      label: "Replies",      icon: Inbox,    placeholder: "Search replies — sender email, subject, message text…" },
  { key: "past-sent",    label: "Past Sent",    icon: History,  placeholder: "Search sent history — doctor, specialty, hospital, action, or operators (specialty: hospital: doctor: sent:)…" },
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
      {/* Shared search bar — always present; every tab filters its own list. */}
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

      {/* Tab strip — underline style (matching /doctors) with a sliding
          active-underline indicator (framer layoutId). */}
      <LayoutGroup id="sends-tabs">
        <div className="border-b border-border/60 mb-4 flex items-center gap-1 overflow-x-auto">
          {TABS.map(t => {
            const Icon = t.icon;
            const isActive = active === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => onTabChange(t.key)}
                className={`relative flex items-center gap-1.5 px-3 py-2 text-[12.5px] font-medium transition-colors -mb-px ${
                  isActive ? "text-teal-700" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
                {t.key === "replies" && unreadReplies > 0 && (
                  <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-semibold text-white">
                    {unreadReplies > 99 ? "99+" : unreadReplies}
                  </span>
                )}
                {isActive && (
                  <motion.span
                    layoutId="sends-tab-underline"
                    className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full bg-teal-600"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </LayoutGroup>

      <AnimatedTabContent active={active}>
        {active === "send-profile" && <SendProfilePanel query={q} />}
        {active === "email-chain"  && <EmailChainPanel query={q} />}
        {active === "batch-sends"  && <BatchesPanel query={q} />}
        {active === "replies"      && <RepliesPanel query={q} />}
        {active === "past-sent"    && <PastSentPanel query={q} onQueryChange={setQ} />}
      </AnimatedTabContent>
    </DashboardLayout>
  );
}
