import { Suspense, lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FilterProvider } from "@/lib/FilterProvider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AIPageContextProvider } from "@/lib/ai-page-context";
import { CurrencyProvider } from "@/lib/CurrencyProvider";

// Login stays eagerly loaded — it's the first thing unauthenticated users see
import Login from "./pages/Login";

// All dashboard pages are lazy-loaded — they're only bundled when first visited.
// This cuts the initial JS payload by ~60% for users who only use a few pages.
const Index           = lazy(() => import("./pages/Index"));
const Sales           = lazy(() => import("./pages/Sales"));
const Marketing       = lazy(() => import("./pages/Marketing"));
const LeadsPipeline   = lazy(() => import("./pages/LeadsPipeline"));
const TeamPerformance = lazy(() => import("./pages/TeamPerformance"));
const Finance         = lazy(() => import("./pages/Finance"));
const Settings        = lazy(() => import("./pages/Settings"));
const MetaAds         = lazy(() => import("./pages/MetaAds"));
const WorkerDashboard = lazy(() => import("./pages/WorkerDashboard"));
const CallLogImport   = lazy(() => import("./pages/CallLogImport"));
const Contracts       = lazy(() => import("./pages/Contracts"));
const FollowUps       = lazy(() => import("./pages/FollowUps"));
const NotFound        = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

// Minimal full-page skeleton shown while a lazy chunk loads (<200ms on fast connections)
function PageSkeleton() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AIPageContextProvider>
      <CurrencyProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<PageSkeleton />}>
            <Routes>
              {/* Public */}
              <Route path="/login" element={<Login />} />

              {/* Protected — page-level role gating via requiredPage.
                  FilterProvider wraps each route element so every page mount
                  gets its own date-range scope (state resets on navigation). */}
              <Route path="/"               element={<ProtectedRoute requiredPage="/"><FilterProvider><Index /></FilterProvider></ProtectedRoute>} />
              <Route path="/sales"          element={<ProtectedRoute requiredPage="/sales"><FilterProvider><Sales /></FilterProvider></ProtectedRoute>} />
              <Route path="/marketing"      element={<ProtectedRoute requiredPage="/marketing"><FilterProvider><Marketing /></FilterProvider></ProtectedRoute>} />
              <Route path="/leads-pipeline" element={<ProtectedRoute requiredPage="/leads-pipeline"><FilterProvider><LeadsPipeline /></FilterProvider></ProtectedRoute>} />
              <Route path="/team"           element={<ProtectedRoute requiredPage="/team"><FilterProvider><TeamPerformance /></FilterProvider></ProtectedRoute>} />
              <Route path="/finance"        element={<ProtectedRoute requiredPage="/finance"><FilterProvider><Finance /></FilterProvider></ProtectedRoute>} />
              <Route path="/settings"       element={<ProtectedRoute requiredPage="/settings"><FilterProvider><Settings /></FilterProvider></ProtectedRoute>} />
              <Route path="/meta-ads"       element={<ProtectedRoute requiredPage="/meta-ads"><FilterProvider><MetaAds /></FilterProvider></ProtectedRoute>} />
              <Route path="/worker"         element={<ProtectedRoute requiredPage="/worker"><FilterProvider><WorkerDashboard /></FilterProvider></ProtectedRoute>} />
              <Route path="/import"         element={<ProtectedRoute requiredPage="/"><FilterProvider><CallLogImport /></FilterProvider></ProtectedRoute>} />
              <Route path="/contracts"      element={<ProtectedRoute requiredPage="/"><FilterProvider><Contracts /></FilterProvider></ProtectedRoute>} />
              <Route path="/follow-ups"     element={<ProtectedRoute requiredPage="/follow-ups"><FilterProvider><FollowUps /></FilterProvider></ProtectedRoute>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </CurrencyProvider>
      </AIPageContextProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
