/**
 * Tiny relative-time helpers shared by the workspace cards. Mirrors the
 * `relativeAge` the MyWorkspace page already ships — pulled out here so the
 * cards under src/components/workspace/ can format timestamps without
 * importing from the page.
 */

/** Human "Xm/h/d ago" for a past ISO timestamp. */
export function relativeAge(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hrs  = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24)  return `${hrs}h ago`;
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Human "in Xd / Xd overdue" for a follow-up due date (future OR past). */
export function relativeDue(iso: string | null): string {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - Date.now();
  const past = diff < 0;
  const days = Math.floor(Math.abs(diff) / 86_400_000);
  const hrs  = Math.floor(Math.abs(diff) / 3_600_000);
  if (past) {
    if (days >= 1) return `${days}d overdue`;
    return hrs >= 1 ? `${hrs}h overdue` : "due now";
  }
  if (days >= 1) return `in ${days}d`;
  return hrs >= 1 ? `in ${hrs}h` : "due now";
}
