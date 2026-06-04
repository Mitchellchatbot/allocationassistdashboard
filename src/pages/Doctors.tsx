/**
 * /doctors — single hub for everything doctor-shaped.
 *
 * Three tabs, one shared search:
 *   - Doctor Progress  → existing <LeadsPipeline embedded /> view
 *   - AA Profiles      → existing <DoctorProfiles embedded /> view
 *   - WP Candidates    → existing <WpCandidates  embedded /> view
 *
 * Search lives in `?q=...`. Each embedded view reads it and writes back
 * to it, so typing once filters whichever tab you're on. Tab state lives
 * in `?tab=progress|profiles|wp`, so the active tab survives reloads and
 * is sharable in a link.
 *
 * The old standalone routes (/leads-pipeline, /doctor-profiles,
 * /wp-candidates) still exist and just redirect into here with the
 * right tab pre-selected, so muscle-memory + bookmarks keep working.
 */
import { lazy, Suspense, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Search, UserSquare, GitBranch, Stethoscope } from "lucide-react";

const LeadsPipeline  = lazy(() => import("./LeadsPipeline"));
const DoctorProfiles = lazy(() => import("./DoctorProfiles"));
const WpCandidates   = lazy(() => import("./WpCandidates"));

type Tab = "progress" | "profiles" | "wp";

const TAB_META: Record<Tab, { label: string; icon: typeof UserSquare; subtitle: string; placeholder: string }> = {
  progress: {
    label:       "Doctor Progress",
    icon:        GitBranch,
    subtitle:    "Where each doctor sits in the placement pipeline — Zoho lead stages + AA's manual signals.",
    placeholder: "Search by name, specialty, recruiter, country, license, destination…",
  },
  profiles: {
    label:       "AA Profiles",
    icon:        UserSquare,
    subtitle:    "Our editable canon — the fields hospitals see when we send a Profile Sent email.",
    placeholder: "Search by name, email, specialty…",
  },
  wp: {
    label:       "WP Candidates",
    icon:        Stethoscope,
    subtitle:    "The 1,243 doctor profiles curated for hospitals on allocationassist.com.",
    placeholder: "Search any field — name, specialty, license, country, salary, location…",
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
    <DashboardLayout title="Doctors" subtitle={cue}>
      {/* Shared search bar */}
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
          {tab === "progress" && <LeadsPipeline  embedded />}
          {tab === "profiles" && <DoctorProfiles embedded />}
          {tab === "wp"       && <WpCandidates   embedded />}
        </div>
      </Suspense>
    </DashboardLayout>
  );
}

function parseTab(raw: string | null): Tab {
  if (raw === "progress" || raw === "profiles" || raw === "wp") return raw;
  // Default landing — Progress is the highest-traffic view for HI staff.
  return "progress";
}

function TabSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-24 rounded-md border bg-slate-50 animate-pulse" />
      <div className="h-64 rounded-md border bg-slate-50 animate-pulse" />
    </div>
  );
}
