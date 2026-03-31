import {
  LayoutDashboard,
  TrendingUp,
  Megaphone,
  Users as UsersIcon,
  DollarSign,
  Settings,
  HeartPulse,
  ChevronDown,
  GitBranch,
  ClipboardList,
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
  { title: "Sales & Pipeline", url: "/sales", icon: TrendingUp },
  { title: "Marketing", url: "/marketing", icon: Megaphone },
  { title: "Doctor Pipeline", url: "/leads-pipeline", icon: GitBranch },
  { title: "Team", url: "/team", icon: UsersIcon },
  { title: "Finance", url: "/finance", icon: DollarSign },
  { title: "Operations", url: "/operations", icon: ClipboardList },
];

const bottomNav = [
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 py-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary">
            <HeartPulse className="h-4 w-4 text-white" />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <span className="text-[14px] font-semibold text-white tracking-tight block">
                Allocation Assist
              </span>
              <span className="text-[10px] text-sidebar-foreground/50 block">The source of workforce</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 pt-3">
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.1em] text-sidebar-foreground/35 px-3 mb-0.5">
              Navigation
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="rounded-md px-3 py-1.5 text-[13px] text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="mr-2.5 h-[15px] w-[15px]" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-2 pb-3 border-t border-sidebar-border pt-3">
        <SidebarMenu>
          {bottomNav.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild>
                <NavLink
                  to={item.url}
                  className="rounded-md px-3 py-1.5 text-[13px] text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                  activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                >
                  <item.icon className="mr-2.5 h-[15px] w-[15px]" />
                  {!collapsed && <span>{item.title}</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
        {!collapsed && (
          <div className="mt-2 mx-1 flex items-center gap-2 rounded-md bg-sidebar-accent/50 p-2 cursor-pointer hover:bg-sidebar-accent transition-colors">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-sidebar-primary text-white text-[9px] font-bold">
              RA
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium text-sidebar-foreground truncate">Ruba AbuHussein</p>
              <p className="text-[9px] text-sidebar-foreground/40 truncate">admin@allocationassist.com</p>
            </div>
            <ChevronDown className="h-3 w-3 text-sidebar-foreground/30" />
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
