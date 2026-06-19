import { Suspense, lazy as reactLazy, type ComponentType } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Outlet, useLocation, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FilterProvider } from "@/lib/FilterProvider";
import { PageErrorBoundary } from "@/components/PageErrorBoundary";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AIPageContextProvider } from "@/lib/ai-page-context";
import { AIPanelProvider } from "@/lib/ai-panel-context";
import { OnboardingTourProvider } from "@/components/OnboardingTour";
import { CurrencyProvider } from "@/lib/CurrencyProvider";
import { DashboardLayout, ViewportSpinner } from "@/components/layout/DashboardLayout";
import { OnboardingGate } from "@/components/OnboardingGate";

// Login stays eagerly loaded — it's the first thing unauthenticated users see
import Login from "./pages/Login";

// Self-healing lazy loader. When a chunk fails to fetch — almost always because
// a new deploy rotated the hashed filenames out from under an already-open tab
// (or a dev HMR restart did) — a plain React.lazy throws to the error boundary,
// which resets and retries the same dead URL, producing an "error flash →
// spinner" loop. Instead, on the FIRST such failure we reload once to pull the
// fresh index.html + new chunks; a time-guard prevents an infinite reload loop.
function lazy<T extends { default: ComponentType<unknown> }>(factory: () => Promise<T>) {
  return reactLazy(async () => {
    try {
      return await factory();
    } catch (err) {
      // ONLY reload for a genuine network chunk-miss (stale hashes after a
      // deploy). A module that throws at *evaluation* (a real code bug) also
      // rejects the import — we must NOT reload on that, or we'd loop and hide
      // the actual error. Detect the network case by message.
      const msg = err instanceof Error ? err.message : String(err);
      const isChunkFetchError = /dynamically imported module|module script failed|importing a module|failed to fetch/i.test(msg);
      if (isChunkFetchError) {
        const KEY = "aa-chunk-reload-at";  // shared with main.tsx's global handler
        const last = Number(sessionStorage.getItem(KEY) || 0);
        if (Date.now() - last > 30_000) {
          sessionStorage.setItem(KEY, String(Date.now()));
          window.location.reload();
          return new Promise<T>(() => {}); // hang on the spinner until the reload lands
        }
      }
      throw err; // real code error (or already reloaded) — let the boundary show it
    }
  });
}

// All dashboard pages are lazy-loaded — they're only bundled when first visited.
// This cuts the initial JS payload by ~60% for users who only use a few pages.
const Index           = lazy(() => import("./pages/Index"));
const Sales           = lazy(() => import("./pages/Sales"));
const Marketing       = lazy(() => import("./pages/Marketing"));
// LeadsPipeline / DoctorProfiles / WpCandidates are now embedded inside
// the /doctors shell — the shell does its own lazy import, so we don't
// need a top-level lazy here anymore. Their old URLs redirect into the
// shell via <Navigate /> below.
const TeamPerformance = lazy(() => import("./pages/TeamPerformance"));
const Finance         = lazy(() => import("./pages/Finance"));
const Settings        = lazy(() => import("./pages/Settings"));
const MetaAds         = lazy(() => import("./pages/MetaAds"));
const WorkerDashboard = lazy(() => import("./pages/WorkerDashboard"));
const CallLogImport   = lazy(() => import("./pages/CallLogImport"));
const Contracts       = lazy(() => import("./pages/Contracts"));
const FollowUps       = lazy(() => import("./pages/FollowUps"));
const Calls           = lazy(() => import("./pages/Calls"));
const Chatbot         = lazy(() => import("./pages/Chatbot"));
const Automations     = lazy(() => import("./pages/Automations"));
const Vacancies       = lazy(() => import("./pages/Vacancies"));
const Reports         = lazy(() => import("./pages/Reports"));
const Batches         = lazy(() => import("./pages/Batches"));
const MyWorkspace     = lazy(() => import("./pages/MyWorkspace"));
const BulkImport      = lazy(() => import("./pages/BulkImport"));
const Connections     = lazy(() => import("./pages/Connections"));
const SharedProfile   = lazy(() => import("./pages/SharedProfile"));
const Forms           = lazy(() => import("./pages/Forms"));
const Doctors         = lazy(() => import("./pages/Doctors"));
const Docs            = lazy(() => import("./pages/Docs"));
const NotFound        = lazy(() => import("./pages/NotFound"));

// Global react-query defaults tuned for this dashboard:
//   - 60s staleTime cuts refetch chatter when navigating between tabs that
//     share queries (Notifications, Hospitals, Lifecycle, Vacancies, etc.)
//   - refetchOnWindowFocus off — the team often alt-tabs; we don't need a
//     full refetch every time they come back. Realtime subscriptions handle
//     "fresh data on change" already.
//   - 1 retry instead of the default 3 — failures show up faster.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Minimal full-page skeleton — only shown for the very first chunk load (Login).
// In-app navigation uses ViewportSpinner from DashboardLayout, which preserves
// the sidebar / topbar / AI panel.
function PageSkeleton() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

/**
 * Protected layout route — renders the dashboard chrome ONCE around an
 * <Outlet/> with its own Suspense. Page chunks loading mid-navigation only
 * blank out the main content area, never the sidebar/topbar/AI panel.
 *
 * Each page still does `<DashboardLayout title="X">` on the inside; the
 * inner DashboardLayout detects it's nested (via LayoutContext) and just
 * passes children through after syncing title/subtitle up to this outer
 * instance.
 */
function ProtectedShell() {
  const location = useLocation();
  return (
    <ProtectedRoute requiredPage={requiredPageForPath(location.pathname)}>
      {/* Mandatory first-login onboarding for non-admins. Sits outside the
          path-keyed FilterProvider so it persists across navigation (launches
          once per session, not per page). */}
      <OnboardingGate />
      <FilterProvider key={location.pathname}>
        <DashboardLayout>
          <Suspense fallback={<ViewportSpinner />}>
            {/* Page-level error boundary — one render crash on /reports
                (e.g. a chart with bad data) used to take down the whole
                shell + nuked the AI panel + tour overlay. Now it just
                replaces the page body with a recovery card; navigation
                still works. Re-keyed on pathname so leaving the broken
                page auto-recovers. */}
            <PageErrorBoundary resetKey={location.pathname}>
              <Outlet />
            </PageErrorBoundary>
          </Suspense>
        </DashboardLayout>
      </FilterProvider>
    </ProtectedRoute>
  );
}

/** Map current path to its requiredPage gate. Most routes are 1:1; a few
 *  utility routes share the dashboard gate ("/" — admin-only) since they
 *  don't have their own row in the user_pages config. */
function requiredPageForPath(pathname: string): string {
  if (pathname === "/import" || pathname === "/contracts" || pathname === "/import-bulk" || pathname === "/connections") return "/";
  // Legacy doctor URLs gate on /doctors (the page they redirect into)
  if (pathname === "/leads-pipeline" || pathname === "/doctor-profiles" || pathname === "/wp-candidates") return "/doctors";
  return pathname;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AIPageContextProvider>
      <CurrencyProvider>
        <Toaster />
        <Sonner />
        {/* BrowserRouter must wrap OnboardingTourProvider — the tour
            provider calls useNavigate/useLocation to drive route-bound
            steps, and those hooks need a Router ancestor. */}
        <BrowserRouter>
          {/* AIPanelProvider sits INSIDE BrowserRouter so useNavigate /
              useLocation work, but OUTSIDE Routes — meaning its state
              survives every route change. The panel is a fixed
              overlay; the main viewport doesn't participate in its
              layout. */}
          <AIPanelProvider>
          <OnboardingTourProvider>
          <Suspense fallback={<PageSkeleton />}>
            <Routes>
              {/* Public */}
              <Route path="/login" element={<Login />} />
              <Route path="/shared-profile/:token" element={<SharedProfile />} />

              {/* Protected — one shell, many children. The shell renders the
                  dashboard chrome (sidebar/topbar/AI panel) just once; the
                  Outlet swaps page content with a viewport-scoped Suspense. */}
              <Route element={<ProtectedShell />}>
                <Route path="/"               element={<Index />} />
                <Route path="/sales"          element={<Sales />} />
                <Route path="/marketing"      element={<Marketing />} />
                <Route path="/team"           element={<TeamPerformance />} />
                <Route path="/finance"        element={<Finance />} />
                <Route path="/settings"       element={<Settings />} />
                <Route path="/meta-ads"       element={<MetaAds />} />
                <Route path="/worker"         element={<WorkerDashboard />} />
                <Route path="/import"         element={<CallLogImport />} />
                <Route path="/contracts"      element={<Contracts />} />
                <Route path="/follow-ups"     element={<FollowUps />} />
                <Route path="/calls"          element={<Calls />} />
                <Route path="/chatbot"        element={<Chatbot />} />
                <Route path="/my-workspace"   element={<MyWorkspace />} />
                <Route path="/automations"    element={<Automations />} />
                <Route path="/doctors"        element={<Doctors />} />
                {/* Legacy routes — keep bookmarks working by redirecting
                    into the unified /doctors shell with the right tab pre-selected. */}
                <Route path="/leads-pipeline"  element={<Navigate to="/doctors?tab=progress" replace />} />
                <Route path="/doctor-profiles" element={<Navigate to="/doctors?tab=profiles" replace />} />
                <Route path="/wp-candidates"   element={<Navigate to="/doctors?tab=profiles" replace />} />
                <Route path="/vacancies"      element={<Vacancies />} />
                <Route path="/reports"        element={<Reports />} />
                <Route path="/batches"        element={<Batches />} />
                <Route path="/import-bulk"    element={<BulkImport />} />
                <Route path="/connections"    element={<Connections />} />
                <Route path="/forms"          element={<Forms />} />
                {/* Documentation — open to every signed-in user (gated as a
                    special case in ProtectedRoute). */}
                <Route path="/docs"           element={<Docs />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          </OnboardingTourProvider>
          </AIPanelProvider>
        </BrowserRouter>
      </CurrencyProvider>
      </AIPageContextProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
