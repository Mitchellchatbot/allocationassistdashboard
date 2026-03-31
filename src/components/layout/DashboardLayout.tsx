import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { Bell, Download, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useFilters, getTimeLabel, getRegionLabel, type TimeRange, type Region } from "@/lib/filters";

interface DashboardLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

export function DashboardLayout({ children, title, subtitle }: DashboardLayoutProps) {
  const { timeRange, setTimeRange, region, setRegion } = useFilters();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-[52px] flex items-center justify-between border-b bg-card px-4 lg:px-5 shrink-0">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <div className="h-4 w-px bg-border hidden sm:block" />
              <div>
                <h1 className="text-[14px] font-semibold text-foreground leading-tight">{title}</h1>
                {subtitle && <p className="text-[11px] text-muted-foreground leading-tight">{subtitle}</p>}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
                <SelectTrigger className="h-7 w-[110px] text-[11px] bg-secondary border-0 rounded-md">
                  <CalendarDays className="h-3 w-3 mr-1 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="quarter">This Quarter</SelectItem>
                  <SelectItem value="year">This Year</SelectItem>
                </SelectContent>
              </Select>
              <Select value={region} onValueChange={(v) => setRegion(v as Region)}>
                <SelectTrigger className="h-7 w-[100px] text-[11px] bg-secondary border-0 rounded-md hidden md:flex">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Regions</SelectItem>
                  <SelectItem value="uae">UAE</SelectItem>
                  <SelectItem value="ksa">Saudi Arabia</SelectItem>
                  <SelectItem value="qatar">Qatar</SelectItem>
                  <SelectItem value="kuwait">Kuwait</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" className="h-7 text-[11px] text-muted-foreground hidden sm:flex px-2">
                <Download className="h-3 w-3 mr-1" />Export
              </Button>
              <Button variant="ghost" size="icon" className="relative h-7 w-7">
                <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                <Badge className="absolute -top-0.5 -right-0.5 h-3.5 min-w-[14px] p-0 flex items-center justify-center text-[8px]">3</Badge>
              </Button>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-4 lg:p-5">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
