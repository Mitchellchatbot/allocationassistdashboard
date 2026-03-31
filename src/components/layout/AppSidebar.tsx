import {
  LayoutDashboard,
  TrendingUp,
  Megaphone,
  GitBranch,
  Users,
  DollarSign,
  Settings,
  HeartPulse,
  ChevronDown,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const mainNav = [
  { title: "Overview", url: "/", icon: LayoutDashboard },
  { title: "Sales", url: "/sales", icon: TrendingUp },
  { title: "Marketing", url: "/marketing", icon: Megaphone },
  { title: "Leads Pipeline", url: "/leads-pipeline", icon: GitBranch },
  { title: "Team", url: "/team", icon: Users },
  { title: "Finance", url: "/finance", icon: DollarSign },
];

const bottomNav = [
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 py-5 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary">
            <HeartPulse className="h-4 w-4 text-white" />
          </div>
          {!collapsed && (
            <span className="text-[15px] font-semibold text-white tracking-tight">
              Allocation Assist
            </span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 pt-4">
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-sidebar-foreground/40 px-3 mb-1">Main</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="rounded-lg px-3 py-2 text-[13px] text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="mr-2.5 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-2 pb-4 border-t border-sidebar-border pt-3">
        <SidebarMenu>
          {bottomNav.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild>
                <NavLink
                  to={item.url}
                  className="rounded-lg px-3 py-2 text-[13px] text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                  activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                >
                  <item.icon className="mr-2.5 h-4 w-4" />
                  {!collapsed && <span>{item.title}</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
        {!collapsed && (
          <div className="mt-3 mx-1 flex items-center gap-2.5 rounded-lg bg-sidebar-accent/50 p-2.5 cursor-pointer hover:bg-sidebar-accent transition-colors">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sidebar-primary/20 text-sidebar-primary text-[10px] font-bold">
              AA
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-sidebar-foreground truncate">Admin User</p>
              <p className="text-[10px] text-sidebar-foreground/40 truncate">admin@allocationassist.com</p>
            </div>
            <ChevronDown className="h-3 w-3 text-sidebar-foreground/40" />
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
