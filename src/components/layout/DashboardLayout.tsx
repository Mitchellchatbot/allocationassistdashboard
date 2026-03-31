import { useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { Bell, Download, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface DashboardLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

export function DashboardLayout({ children, title, subtitle }: DashboardLayoutProps) {
  const [timeRange, setTimeRange] = useState("30d");
  const [region, setRegion] = useState("all");

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Bar */}
          <header className="h-[56px] flex items-center justify-between border-b bg-card px-4 lg:px-6 shrink-0">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <div className="hidden sm:block h-5 w-px bg-border" />
              <div>
                <h1 className="text-[15px] font-semibold text-foreground leading-tight">{title}</h1>
                {subtitle && <p className="text-[11px] text-muted-foreground leading-tight">{subtitle}</p>}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Time Range Filter */}
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="h-8 w-[130px] text-xs bg-muted/50 border-0">
                  <CalendarDays className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                  <SelectItem value="12m">Last 12 months</SelectItem>
                </SelectContent>
              </Select>

              {/* Region Filter */}
              <Select value={region} onValueChange={setRegion}>
                <SelectTrigger className="h-8 w-[120px] text-xs bg-muted/50 border-0 hidden md:flex">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Regions</SelectItem>
                  <SelectItem value="uae">UAE</SelectItem>
                  <SelectItem value="saudi">Saudi Arabia</SelectItem>
                  <SelectItem value="qatar">Qatar</SelectItem>
                  <SelectItem value="kuwait">Kuwait</SelectItem>
                </SelectContent>
              </Select>

              <div className="hidden sm:block h-5 w-px bg-border" />

              {/* Export */}
              <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hidden sm:flex">
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Export
              </Button>

              {/* Notifications */}
              <Button variant="ghost" size="icon" className="relative h-8 w-8">
                <Bell className="h-4 w-4 text-muted-foreground" />
                <Badge className="absolute -top-0.5 -right-0.5 h-4 w-4 p-0 flex items-center justify-center text-[9px]">3</Badge>
              </Button>
            </div>
          </header>

          <main className="flex-1 overflow-auto p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
