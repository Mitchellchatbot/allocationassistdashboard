import {
  LayoutDashboard,
  TrendingUp,
  Megaphone,
  Users as UsersIcon,
  DollarSign,
  Settings,
  ChevronDown,
  GitBranch,
  ClipboardList,
  Image,
  LogOut,
  Upload,
  FileSignature,
} from "lucide-react";
import logo from "@/assets/logo.png";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router-dom";
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
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Sales Tracker", url: "/sales", icon: TrendingUp },
  { title: "Marketing", url: "/marketing", icon: Megaphone },
  { title: "Doctor Progress", url: "/leads-pipeline", icon: GitBranch },
  { title: "Team Performance", url: "/team", icon: UsersIcon },
  { title: "Finance", url: "/finance", icon: DollarSign },
  { title: "Operations & Roadmap", url: "/operations", icon: ClipboardList },
  { title: "Meta Ads", url: "/meta-ads", icon: Image },
];

const bottomNav = [
  { title: "Contract Builder", url: "/contracts", icon: FileSignature },
  { title: "Import Data", url: "/import", icon: Upload },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { user, signOut, role, allowedPages } = useAuth();
  const navigate = useNavigate();

  // Admins see all nav items; restricted users only see their allowed pages
  const visibleNav = role === "admin"
    ? mainNav
    : mainNav.filter(item => allowedPages.includes(item.url));

  // Settings only shown to admins
  const visibleBottom = role === "admin" ? bottomNav : [];

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="px-4 py-4 border-b border-sidebar-border" style={{ backgroundColor: "hsl(170, 45%, 28%)" }}>
        <div className="flex items-center justify-center gap-2.5">
          <img src={logo} alt="Allocation Assist" className="h-12 w-12 shrink-0 object-contain" />
          {!collapsed && (
            <div className="leading-tight">
              <span className="text-[14px] font-semibold text-white tracking-tight block">
                Allocation Assist
              </span>
              <span className="text-[10px] text-white/70 block">The source of workforce</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 pt-3">
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.1em] text-sidebar-foreground/35 px-3 mb-0.5">
              Menu
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleNav.map((item) => (
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
          {visibleBottom.map((item) => (
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
          <div className="mt-2 mx-1 rounded-md bg-sidebar-accent/50 overflow-hidden">
            <div className="flex items-center gap-2 p-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-sidebar-primary text-white text-[9px] font-bold shrink-0">
                {user?.email ? user.email.slice(0, 2).toUpperCase() : "AA"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-sidebar-foreground truncate">
                  {user?.email ?? "admin@allocationassist.com"}
                </p>
                <p className="text-[9px] text-sidebar-foreground/40 truncate">Signed in</p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors border-t border-sidebar-border/30"
            >
              <LogOut className="h-3 w-3" />
              Sign out
            </button>
          </div>
        )}
        {collapsed && (
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center py-2 text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
