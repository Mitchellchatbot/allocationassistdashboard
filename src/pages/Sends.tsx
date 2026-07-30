import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUnreadReplyCount } from "@/hooks/use-replies";
import { SendProfilePanel } from "./ProfileSent";
import { EmailChainPanel } from "./Automations";
import { BatchesPanel } from "./Batches";
import { RepliesPanel } from "./Replies";
import { PastSentPanel } from "./PastSent";

/**
 * Sends — one home for the whole outbound workflow, replacing five separate
 * sidebar items (Profile Sent, Automations, Batch Sends, Replies, Past Sent).
 * A horizontal tab bar drives which panel mounts; the active tab lives in the
 * `?tab=` query param so links are shareable and the old routes can redirect
 * straight into the right tab (see RedirectToSends in App.tsx).
 *
 * Only the ACTIVE panel is mounted (conditional render, not all five), so
 * switching tabs is what triggers each panel's data to load. React Query
 * caches across remounts, so flipping back to a tab you've already opened is
 * instant.
 */
const TABS = [
  { key: "send-profile", label: "Send Profile" },
  { key: "email-chain",  label: "Email Chain" },
  { key: "batch-sends",  label: "Batch Sends" },
  { key: "replies",      label: "Replies" },
  { key: "past-sent",    label: "Past Sent" },
] as const;

type TabKey = (typeof TABS)[number]["key"];
const TAB_KEYS = TABS.map(t => t.key) as readonly string[];

export default function Sends() {
  const [searchParams, setSearchParams] = useSearchParams();
  const unreadReplies = useUnreadReplyCount();

  const raw = searchParams.get("tab") ?? "";
  const active: TabKey = TAB_KEYS.includes(raw) ? (raw as TabKey) : "send-profile";

  // Explicit tab click resets to just ?tab=X — deliberately dropping any stale
  // flow / compose / run params left behind by the previously-active tab.
  const onTabChange = (v: string) => setSearchParams({ tab: v });

  return (
    <DashboardLayout>
      <Tabs value={active} onValueChange={onTabChange} className="w-full">
        <TabsList className="h-auto flex-wrap justify-start gap-1 bg-muted/60 p-1">
          {TABS.map(t => (
            <TabsTrigger key={t.key} value={t.key} className="gap-1.5">
              {t.label}
              {t.key === "replies" && unreadReplies > 0 && (
                <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-semibold text-white">
                  {unreadReplies > 99 ? "99+" : unreadReplies}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="mt-4">
        {active === "send-profile" && <SendProfilePanel />}
        {active === "email-chain"  && <EmailChainPanel />}
        {active === "batch-sends"  && <BatchesPanel />}
        {active === "replies"      && <RepliesPanel />}
        {active === "past-sent"    && <PastSentPanel />}
      </div>
    </DashboardLayout>
  );
}
