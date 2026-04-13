import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { PageTransition } from "./PageTransition";
import { Bell, Download, CalendarDays, FileText, AlertTriangle, UserPlus, Award, Clock, Handshake, ChevronRight, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFilters, type TimeRange } from "@/lib/filters";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";

const notifications = [
  { id: 1, icon: AlertTriangle, color: "text-warning", title: "License Delay — Dr. Raj Mehta", detail: "Qatar license stuck for 28 days. Needs escalation.", time: "5 min ago", unread: true },
  { id: 2, icon: UserPlus, color: "text-info", title: "New Doctor Applied", detail: "Dr. Anna Kowalski — Anesthesiology, from Poland to UAE", time: "12 min ago", unread: true },
  { id: 3, icon: Award, color: "text-success", title: "Doctor Successfully Placed", detail: "Dr. Sophie Laurent placed at Cleveland Clinic Abu Dhabi", time: "1 hour ago", unread: true },
  { id: 4, icon: Clock, color: "text-warning", title: "Documents Overdue", detail: "Dr. Chen Wei — missing credentials for 15 days", time: "2 hours ago", unread: false },
  { id: 5, icon: Handshake, color: "text-primary", title: "New Hospital Partner", detail: "Hamad Medical Corporation, Qatar — agreement signed", time: "Yesterday", unread: false },
  { id: 6, icon: FileText, color: "text-primary", title: "License Approved", detail: "Dr. Amira Khan — DHA License approved, ready for placement", time: "Yesterday", unread: false },
];

const breadcrumbMap: Record<string, string> = {
  "/": "Dashboard",
  "/sales": "Sales Tracker",
  "/marketing": "Marketing",
  "/leads-pipeline": "Doctor Progress",
  "/team": "Team Performance",
  "/finance": "Finance",
  "/operations": "Operations & Roadmap",
  "/settings": "Settings",
};

interface DashboardLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

export function DashboardLayout({ children, title, subtitle }: DashboardLayoutProps) {
  const { timeRange, setTimeRange } = useFilters();
  const [readIds, setReadIds] = useState<number[]>([]);
  const unreadCount = notifications.filter(n => n.unread && !readIds.includes(n.id)).length;
  const location = useLocation();
  const currentPath = location.pathname;
  const breadcrumbLabel = breadcrumbMap[currentPath] || title;

  const markAllRead = () => setReadIds(notifications.map(n => n.id));

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top header bar */}
          <header className="h-[52px] flex items-center justify-between border-b bg-card px-3 sm:px-4 lg:px-5 shrink-0">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground shrink-0" />
              <div className="h-4 w-px bg-border/60 hidden sm:block shrink-0" />
              
              {/* Breadcrumb */}
              <nav className="flex items-center gap-1 text-[11px] min-w-0">
                <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
                  <Home className="h-3 w-3" />
                </Link>
                <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                <span className="font-medium text-foreground truncate">{breadcrumbLabel}</span>
              </nav>
            </div>
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
                <SelectTrigger className="h-7 w-[100px] sm:w-[110px] text-[11px] bg-white/60 border-0 rounded-md backdrop-blur-sm">
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
<Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 text-[11px] text-muted-foreground hidden sm:flex px-2">
                    <Download className="h-3 w-3 mr-1" />Export
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-[10px]">Download this page's data as a spreadsheet</TooltipContent>
              </Tooltip>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative h-7 w-7">
                    <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                    {unreadCount > 0 && (
                      <Badge className="absolute -top-0.5 -right-0.5 h-3.5 min-w-[14px] p-0 flex items-center justify-center text-[8px] animate-pulse">
                        {unreadCount}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[340px] p-0">
                  <div className="flex items-center justify-between px-3 py-2.5 border-b bg-muted/30">
                    <span className="text-[12px] font-semibold">Notifications</span>
                    {unreadCount > 0 && (
                      <button onClick={markAllRead} className="text-[10px] text-primary hover:underline font-medium">
                        Mark all as read
                      </button>
                    )}
                  </div>
                  <div className="max-h-[320px] overflow-auto">
                    {notifications.map(n => {
                      const isUnread = n.unread && !readIds.includes(n.id);
                      const Icon = n.icon;
                      return (
                        <div
                          key={n.id}
                          className={`flex items-start gap-2.5 px-3 py-2.5 border-b border-border/40 last:border-0 hover:bg-muted/50 cursor-pointer transition-colors ${isUnread ? "bg-primary/5" : ""}`}
                          onClick={() => !readIds.includes(n.id) && setReadIds(prev => [...prev, n.id])}
                        >
                          <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${isUnread ? "bg-primary/10" : "bg-muted"}`}>
                            <Icon className={`h-3 w-3 ${n.color}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-[11px] leading-tight ${isUnread ? "font-semibold text-foreground" : "font-medium text-muted-foreground"}`}>{n.title}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{n.detail}</p>
                          </div>
                          <div className="flex flex-col items-end shrink-0 gap-0.5">
                            <span className="text-[9px] text-muted-foreground">{n.time}</span>
                            {isUnread && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </header>

          {/* Page title section */}
          <div className="px-4 lg:px-5 pt-5 pb-3 border-b border-border/40 bg-card">
            <h1 className="text-[20px] sm:text-[22px] font-semibold text-foreground leading-tight">{title}</h1>
            {subtitle && <p className="text-[13px] text-muted-foreground mt-1">{subtitle}</p>}
          </div>

          <main className="flex-1 overflow-auto px-4 lg:px-6 pb-6 pt-5">
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
