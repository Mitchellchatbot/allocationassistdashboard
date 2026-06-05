import {
  LayoutDashboard,
  TrendingUp,
  Megaphone,
  Users as UsersIcon,
  DollarSign,
  Settings,
  ClipboardList,
  BarChart3,
  Mailbox,
  Link2,
  Image,
  LogOut,
  Upload,
  FileSignature,
  BellRing,
  PhoneCall,
  Workflow,
  UserSquare,
  Search,
  ChevronRight,
  Inbox,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import logo from "@/assets/logo.png";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate, Link } from "react-router-dom";
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
import { useNotifications } from "@/hooks/use-notifications";
import { useUniversalSearch } from "@/lib/universal-search-context";

interface NavItem {
  title:   string;
  url:     string;
  icon:    LucideIcon;
  /** Function returning a count to render as a badge. Hidden when 0. */
  badge?:  (ctx: BadgeContext) => number;
}

interface NavSection {
  label: string;
  items: NavItem[];
  /** Accent color for icons + header chevron. Picked to pop against the
   *  teal-green sidebar background. */
  accent: string;
}

interface BadgeContext {
  unreadNotifications: number;
}

// Sections (top → bottom). Sidebar used to be 18 flat items — now grouped so
// the team sees their tools clustered: the Hospital Introduction module is
// its own block, sales/growth/admin live elsewhere. Order within each block
// is by frequency of use.
const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    accent: "#fbbf24",  // vivid amber
    items: [
      { title: "Dashboard", url: "/", icon: LayoutDashboard, badge: (c) => c.unreadNotifications },
    ],
  },
  {
    label: "Hospital Introduction",
    accent: "#fb923c",  // vivid orange
    items: [
      { title: "My Workspace",    url: "/my-workspace",    icon: Inbox },
      { title: "Doctors",         url: "/doctors",         icon: UserSquare },
      { title: "Automations",     url: "/automations",     icon: Workflow },
      { title: "Vacancies",       url: "/vacancies",       icon: ClipboardList },
      { title: "Batch Sends",     url: "/batches",         icon: Mailbox },
      { title: "Reports",         url: "/reports",         icon: BarChart3 },
    ],
  },
  {
    label: "Sales",
    accent: "#38bdf8",  // vivid sky blue
    items: [
      { title: "Sales Tracker",     url: "/sales",           icon: TrendingUp },
      { title: "Follow-ups",        url: "/follow-ups",      icon: BellRing },
      { title: "Calls",             url: "/calls",           icon: PhoneCall },
      { title: "Contract Builder",  url: "/contracts",       icon: FileSignature },
    ],
  },
  {
    label: "Growth",
    accent: "#e879f9",  // vivid fuchsia
    items: [
      { title: "Marketing",         url: "/marketing",       icon: Megaphone },
      { title: "Meta Ads",          url: "/meta-ads",        icon: Image },
      { title: "Forms",             url: "/forms",           icon: ClipboardList },
      { title: "Team Performance",  url: "/team",            icon: UsersIcon },
      { title: "Finance",           url: "/finance",         icon: DollarSign },
    ],
  },
];

const ADMIN_SECTION: NavSection = {
  label: "Admin",
  accent: "#fb7185",  // vivid rose
  items: [
    { title: "Connections",  url: "/connections", icon: Link2 },
    { title: "Bulk Import",  url: "/import-bulk", icon: Upload },
    { title: "Import Data",  url: "/import",      icon: Upload },
    { title: "Settings",     url: "/settings",    icon: Settings },
  ],
};

// Section headers can be expanded/collapsed individually; choice persists in
// localStorage. Admin defaults to collapsed because it's reference material
// rather than primary navigation.
const COLLAPSED_KEY = "aa-sidebar-collapsed-sections";
const DEFAULT_COLLAPSED: Record<string, boolean> = { Admin: true };

function useCollapsedSections() {
  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return DEFAULT_COLLAPSED;
    try {
      const raw = window.localStorage.getItem(COLLAPSED_KEY);
      if (!raw) return DEFAULT_COLLAPSED;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : DEFAULT_COLLAPSED;
    } catch { return DEFAULT_COLLAPSED; }
  });

  useEffect(() => {
    try { window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsedMap)); }
    catch { /* quota / private mode — ignore */ }
  }, [collapsedMap]);

  const toggle = useCallback((label: string) => {
    setCollapsedMap(m => ({ ...m, [label]: !m[label] }));
  }, []);

  return { collapsedMap, toggle };
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { collapsedMap, toggle } = useCollapsedSections();
  const { user, signOut, role, allowedPages } = useAuth();
  const navigate = useNavigate();
  const { unreadCount } = useNotifications();
  const badgeCtx: BadgeContext = { unreadNotifications: unreadCount };
  const search = useUniversalSearch();

  // Filter sections to only the items this user can see. Drop empty sections
  // entirely so we don't render headers without children.
  const visibleSections: NavSection[] = role === "admin"
    ? NAV_SECTIONS
    : NAV_SECTIONS
        .map(s => ({ ...s, items: s.items.filter(it => allowedPages.includes(it.url)) }))
        .filter(s => s.items.length > 0);

  const visibleAdmin: NavSection | null = role === "admin" ? ADMIN_SECTION : null;

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <Sidebar collapsible="offcanvas" variant="floating">
      <SidebarHeader className="px-4 py-4 border-b border-white/10">
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

      <SidebarContent className="px-2 pt-3 pb-2">
        {/* Subtle "Cmd+K" hint surfaces the existing UniversalSearch that the
            rest of the app already wires to ⌘K. Helps new users discover it
            without an onboarding modal. */}
        {!collapsed && (
          <button
            onClick={() => search?.open()}
            className="mx-2 mb-3 flex items-center gap-2 rounded-full border border-sidebar-border/30 bg-sidebar-accent/30 px-3.5 py-1.5 text-left text-[11px] text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          >
            <Search className="h-3 w-3" />
            <span className="flex-1">Quick jump...</span>
            <kbd className="hidden lg:inline-flex h-4 items-center px-1.5 rounded-full border border-sidebar-border/40 bg-sidebar/40 text-[9px] font-mono text-sidebar-foreground/50">
              ⌘K
            </kbd>
          </button>
        )}

        {visibleSections.map(section => {
          const isCollapsed = !!collapsedMap[section.label];
          return (
            <SidebarGroup key={section.label} className="pb-1">
              {!collapsed && (
                <CollapsibleHeader
                  label={section.label}
                  accent={section.accent}
                  isCollapsed={isCollapsed}
                  onToggle={() => toggle(section.label)}
                />
              )}
              {(collapsed || !isCollapsed) && (
                <SidebarGroupContent>
                  <SidebarMenu>
                    {section.items.map(item => (
                      <NavRow key={item.url} item={item} collapsed={collapsed} badgeCtx={badgeCtx} accent={section.accent} />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              )}
            </SidebarGroup>
          );
        })}

        {visibleAdmin && (
          <SidebarGroup className="pb-1 mt-2 border-t border-sidebar-border/30 pt-2">
            {!collapsed && (
              <CollapsibleHeader
                label={visibleAdmin.label}
                accent={visibleAdmin.accent}
                isCollapsed={!!collapsedMap[visibleAdmin.label]}
                onToggle={() => toggle(visibleAdmin.label)}
              />
            )}
            {(collapsed || !collapsedMap[visibleAdmin.label]) && (
              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleAdmin.items.map(item => (
                    <NavRow key={item.url} item={item} collapsed={collapsed} badgeCtx={badgeCtx} accent={visibleAdmin.accent} />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            )}
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="px-2 pb-3 border-t border-white/10 pt-3">
        {!collapsed && (
          <div className="mx-1 space-y-1.5">
            {/* The account chip itself routes to /settings — it's the most
                discoverable hook into account / notification / Slack
                configuration, and lifts Settings out from behind the
                collapsed Admin section. */}
            <Link
              to="/settings"
              className="flex items-center gap-2 rounded-full bg-sidebar-accent/50 px-2 py-1.5 hover:bg-sidebar-accent/80 transition-colors group"
              title="Settings"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sidebar-primary text-white text-[9px] font-bold shrink-0">
                {user?.email ? user.email.slice(0, 2).toUpperCase() : "AA"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-sidebar-foreground truncate">
                  {user?.email ?? "admin@allocationassist.com"}
                </p>
                <p className="text-[9px] text-sidebar-foreground/40 group-hover:text-sidebar-foreground/70 truncate transition-colors">Settings & Slack</p>
              </div>
            </Link>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/70 transition-colors"
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

function CollapsibleHeader({
  label,
  accent,
  isCollapsed,
  onToggle,
}: {
  label: string;
  accent: string;
  isCollapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <SidebarGroupLabel asChild className="px-3 mb-0.5 mt-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!isCollapsed}
        className="group flex w-full items-center gap-1.5 text-[12px] font-medium text-sidebar-foreground/65 hover:text-sidebar-foreground/90 transition-colors"
      >
        <ChevronRight
          className="h-3 w-3 shrink-0 transition-transform"
          style={{ color: accent, transform: isCollapsed ? "none" : "rotate(90deg)" }}
        />
        <span
          className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
          style={{ backgroundColor: accent }}
        />
        <span>{label}</span>
      </button>
    </SidebarGroupLabel>
  );
}

function NavRow({ item, collapsed, badgeCtx, accent }: { item: NavItem; collapsed: boolean; badgeCtx: BadgeContext; accent: string }) {
  const badge = item.badge ? item.badge(badgeCtx) : 0;
  // Onboarding-tour hook so HI_TOUR_STEPS can spotlight each sidebar entry.
  // e.g. /my-workspace → data-tour="sidebar-my-workspace".
  const tourId = `sidebar-${item.url.replace(/^\//, "").replace(/\//g, "-") || "dashboard"}`;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild>
        <NavLink
          to={item.url}
          end={item.url === "/"}
          data-tour={tourId}
          className="rounded-full px-3 py-1.5 text-[13px] text-sidebar-foreground/75 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground transition-all duration-150"
          activeClassName="bg-white/10 text-white font-medium shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]"
        >
          {/* Icon sits inside a small filled-circle that picks up the
              section's accent colour. White glyph inside reads against
              every accent we use. Slight soft shadow keeps the circles
              from looking flat in the sidebar tint. */}
          <span
            className="mr-2.5 inline-flex h-6 w-6 items-center justify-center rounded-full shrink-0 shadow-sm ring-1 ring-white/40"
            style={{ backgroundColor: accent }}
          >
            <item.icon className="h-[13px] w-[13px] text-white" />
          </span>
          {!collapsed && <span className="flex-1">{item.title}</span>}
          {!collapsed && badge > 0 && (
            <span className="ml-auto inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-semibold text-white">
              {badge > 99 ? "99+" : badge}
            </span>
          )}
          {collapsed && badge > 0 && (
            <span
              className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-rose-500"
              title={`${badge} new`}
            />
          )}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
