import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FilterProvider } from "@/lib/FilterProvider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Login from "./pages/Login";
import Index from "./pages/Index";
import Sales from "./pages/Sales";
import Marketing from "./pages/Marketing";
import LeadsPipeline from "./pages/LeadsPipeline";
import TeamPerformance from "./pages/TeamPerformance";
import Finance from "./pages/Finance";
import Operations from "./pages/Operations";
import Settings from "./pages/Settings";
import MetaAds from "./pages/MetaAds";
import WorkerDashboard from "./pages/WorkerDashboard";
import CallLogImport from "./pages/CallLogImport";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <FilterProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<Login />} />

            {/* Protected — page-level role gating via requiredPage */}
            <Route path="/"               element={<ProtectedRoute requiredPage="/"><Index /></ProtectedRoute>} />
            <Route path="/sales"          element={<ProtectedRoute requiredPage="/sales"><Sales /></ProtectedRoute>} />
            <Route path="/marketing"      element={<ProtectedRoute requiredPage="/marketing"><Marketing /></ProtectedRoute>} />
            <Route path="/leads-pipeline" element={<ProtectedRoute requiredPage="/leads-pipeline"><LeadsPipeline /></ProtectedRoute>} />
            <Route path="/team"           element={<ProtectedRoute requiredPage="/team"><TeamPerformance /></ProtectedRoute>} />
            <Route path="/finance"        element={<ProtectedRoute requiredPage="/finance"><Finance /></ProtectedRoute>} />
            <Route path="/operations"     element={<ProtectedRoute requiredPage="/operations"><Operations /></ProtectedRoute>} />
            <Route path="/settings"       element={<ProtectedRoute requiredPage="/settings"><Settings /></ProtectedRoute>} />
            <Route path="/meta-ads"       element={<ProtectedRoute requiredPage="/meta-ads"><MetaAds /></ProtectedRoute>} />
            <Route path="/worker"         element={<ProtectedRoute><WorkerDashboard /></ProtectedRoute>} />
            <Route path="/import"         element={<ProtectedRoute requiredPage="/"><CallLogImport /></ProtectedRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </FilterProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
