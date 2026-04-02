import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FilterProvider } from "@/lib/FilterProvider";
import Index from "./pages/Index";
import Sales from "./pages/Sales";
import Marketing from "./pages/Marketing";
import LeadsPipeline from "./pages/LeadsPipeline";
import TeamPerformance from "./pages/TeamPerformance";
import Finance from "./pages/Finance";
import Operations from "./pages/Operations";
import Settings from "./pages/Settings";
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
            <Route path="/" element={<Index />} />
            <Route path="/sales" element={<Sales />} />
            <Route path="/marketing" element={<Marketing />} />
            <Route path="/leads-pipeline" element={<LeadsPipeline />} />
            <Route path="/team" element={<TeamPerformance />} />
            <Route path="/finance" element={<Finance />} />
            <Route path="/operations" element={<Operations />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </FilterProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
