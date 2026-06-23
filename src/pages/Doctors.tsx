/**
 * /doctors — single hub for everything doctor-shaped.
 *
 * Two tabs, one shared search:
 *   - Doctor Progress  → <LeadsPipeline embedded /> — the pipeline view
 *   - Profiles         → <WpCandidates  embedded /> — the canonical
 *                        profile record for each doctor (mirror of the
 *                        WP candidate CPT). Linked rows are read-only
 *                        until edited; unlinked rows are editable from
 *                        the same dialog. New candidates created here
 *                        auto-link to the AA roster on the way in.
 *
 * Search lives in `?q=...`. Each embedded view reads it and writes back
 * to it, so typing once filters whichever tab you're on. Tab state lives
 * in `?tab=progress|profiles`.
 *
 * Legacy routes /leads-pipeline + /doctor-profiles + /wp-candidates all
 * redirect into here so existing bookmarks keep working.
 */
import { lazy, Suspense, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Search, UserSquare, GitBranch, Inbox, LayoutGrid } from "lucide-react";

const DoctorsOverview = lazy(() => import("./DoctorsOverview"));
const LeadsPipeline  = lazy(() => import("./LeadsPipeline"));
const WpCandidates   = lazy(() => import("./WpCandidates"));
const Forms          = lazy(() => import("./Forms"));

type Tab = "overview" | "responses" | "profiles" | "progress";

const TAB_META: Record<Tab, { label: string; icon: typeof UserSquare; subtitle: string; placeholder: string }> = {
  overview: {
    label:       "Overview",
    icon:        LayoutGrid,
    subtitle:    "Everyone on the board — Zoho facts up front, expand a doctor for their full profile, form submissions and CV.",
    placeholder: "Search doctors by name, email, specialty, country, recruiter…",
  },
  responses: {
    label:       "Responses",
    icon:        Inbox,
    subtitle:    "Incoming form submissions (Typeform + JotForm). New ones auto-stage to a draft profile — review + publish from Profiles.",
    placeholder: "",
  },
  profiles: {
    label:       "Doctor Profiles",
    icon:        UserSquare,
    subtitle:    "The canonical doctor profile — mirrors allocationassist.com. Edit any candidate (linked or not). New profiles auto-link to the AA roster.",
    placeholder: "Search any field — name, specialty, license, country, salary, location…",
  },
  progress: {
    label:       "Doctor Progress",
    icon:        GitBranch,
    subtitle:    "Where each doctor sits in the placement pipeline — Zoho lead stages + AA's manual signals.",
    placeholder: "Search by name, specialty, recruiter, country, license, destination…",
  },
};

export default function Doctors() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));
  const q   = searchParams.get("q") ?? "";

  const meta = TAB_META[tab];

  const setTab = (t: Tab) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", t);
    // Keep the shared `q` across tab switches — that's the whole point.
    setSearchParams(next, { replace: false });
  };

  const setQ = (v: string) => {
    const next = new URLSearchParams(searchParams);
    if (v) next.set("q", v); else next.delete("q");
    setSearchParams(next, { replace: true });
  };

  // KPI hint shown on the right of the tab strip — counts get baked into
  // each view's own header still, this is just a contextual cue.
  const cue = useMemo(() => meta.subtitle, [meta]);

  return (
    <DashboardLayout title="Doctors" subtitle={cue} docSlug="hospital-introduction/doctors">
      {/* Shared search bar — hidden on Responses (the Forms view has its
          own per-form search + filters). */}
      {tab !== "responses" && (
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

      {/* Tab strip */}
      <div className="border-b border-border/60 mb-4 flex items-center gap-1 overflow-x-auto">
        {(Object.keys(TAB_META) as Tab[]).map(key => {
          const m = TAB_META[key];
          const Icon = m.icon;
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`relative flex items-center gap-1.5 px-3 py-2 text-[12.5px] font-medium transition-colors -mb-px border-b-2 ${
                active
                  ? "text-teal-700 border-teal-600"
                  : "text-slate-600 border-transparent hover:text-slate-900 hover:border-slate-300"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Active tab body — keyed so React unmounts/mounts cleanly on switch.
          Suspense fence is per-tab so a slow chunk on one doesn't blank
          the whole shell. */}
      <Suspense fallback={<TabSkeleton />}>
        <div key={tab}>
          {tab === "overview"  && <DoctorsOverview />}
          {tab === "responses" && <Forms         embedded />}
          {tab === "profiles"  && <WpCandidates  embedded />}
          {tab === "progress"  && <LeadsPipeline embedded />}
        </div>
      </Suspense>
    </DashboardLayout>
  );
}

function parseTab(raw: string | null): Tab {
  if (raw === "overview" || raw === "responses" || raw === "progress" || raw === "profiles") return raw;
  // Legacy `?tab=wp` (the old WP Candidates tab name) lands on Profiles.
  if (raw === "wp") return "profiles";
  // Default landing — the new Overview tab.
  return "overview";
}

function TabSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-24 rounded-md border bg-slate-50 animate-pulse" />
      <div className="h-64 rounded-md border bg-slate-50 animate-pulse" />
    </div>
  );
}
