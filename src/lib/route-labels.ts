/**
 * Path → display label + parent-section. Kept in sync with the sidebar
 * NAV_SECTIONS so the breadcrumb top bar AND the recent-items widget show
 * the same label.
 */
export const ROUTE_LABELS: Record<string, { label: string; section: string }> = {
  "/":                 { label: "Dashboard",        section: "Overview" },
  "/sales":            { label: "Sales Tracker",    section: "Sales" },
  "/marketing":        { label: "Marketing",        section: "Growth" },
  "/team":             { label: "Team Performance", section: "Growth" },
  "/finance":          { label: "Finance",          section: "Growth" },
  "/settings":         { label: "Settings",         section: "Admin" },
  "/follow-ups":       { label: "Follow-ups",       section: "Sales" },
  "/calls":            { label: "Calls",            section: "Sales" },
  "/meta-ads":         { label: "Meta Ads",         section: "Growth" },
  "/automations":      { label: "Automations",      section: "Hospital Introduction" },
  "/my-workspace":     { label: "My Workspace",     section: "Hospital Introduction" },
  "/doctors":          { label: "Doctors",          section: "Hospital Introduction" },
  "/forms":            { label: "Forms",            section: "Growth" },
  // Legacy paths still kept for breadcrumb labels on direct visits —
  // App.tsx redirects them into /doctors with the right tab pre-selected.
  "/leads-pipeline":   { label: "Doctor Progress",  section: "Hospital Introduction" },
  "/doctor-profiles":  { label: "Doctor Profiles",  section: "Hospital Introduction" },
  "/wp-candidates":    { label: "WP Candidates",    section: "Hospital Introduction" },
  "/vacancies":        { label: "Vacancies",        section: "Hospital Introduction" },
  "/reports":          { label: "Reports",          section: "Hospital Introduction" },
  "/batches":          { label: "Batch Sends",      section: "Hospital Introduction" },
  "/contracts":        { label: "Contract Builder", section: "Sales" },
  "/import-bulk":      { label: "Bulk Import",      section: "Admin" },
  "/import":           { label: "Import Data",      section: "Admin" },
  "/connections":      { label: "Connections",      section: "Admin" },
  "/feedback":         { label: "Feedback",         section: "Admin" },
};

export function lookupRoute(pathname: string): { label: string; section: string } | null {
  return ROUTE_LABELS[pathname] ?? null;
}
