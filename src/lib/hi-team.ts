/**
 * Hospital Introduction team roster — confirmed by Saif Ullah 2026-06-02.
 *
 * Used by:
 *   - Reports page filter (per-member activity counts)
 *   - Activity dashboard (per-member shortlists / interviews / offers / signs)
 *   - Anywhere we surface a "HI team member" dropdown
 *
 * Three lists here so we don't conflate concepts:
 *   HI_TEAM_MEMBERS   — the dedicated HI specialists. Drive the Reports
 *                       per-member columns, activity dashboards and the
 *                       reassign / approval-assignee dropdowns.
 *   HI_SECTION_GUESTS — people granted access to the WHOLE HI section who
 *                       are NOT tracked specialists (e.g. product owners).
 *                       Kept separate on purpose so they don't show up as
 *                       specialists in the reports or as selectable email
 *                       senders — use-auth grants them the hi_member page
 *                       set (HI_MEMBER_PAGES) and nothing else.
 *   AA_SENDERS        — every internal mailbox that can send doctor emails
 *                       (the specialists + Ammar). Mirrors the SENDERS
 *                       registry in supabase/functions/send-flow-email/
 *                       index.ts; keep them in lockstep when adding a person.
 *
 * Source of truth lives here rather than in a DB table because the team is
 * small + slow-changing. If churn picks up, move to a `hi_team_members`
 * table with an admin editor.
 */

export interface HiTeamMember {
  name:  string;
  email: string;
}

export const HI_TEAM_MEMBERS: HiTeamMember[] = [
  { name: "Rodaina Thabit",  email: "Rodaina@allocationassist.com"        },
  { name: "Mohamed Othman",  email: "mohamed.othman@allocationassist.com" },
  { name: "Sohaila Mohamed", email: "sohaila@allocationassist.com"        },
  { name: "Ishak Boulaat",   email: "ishak@allocationassist.com"          },
];

/** People granted access to the whole HI section who are NOT tracked
 *  specialists. Adding someone here gives them the hi_member page set via
 *  use-auth (see findHiAccessByEmail / hasHiSectionAccess) WITHOUT listing
 *  them in the Reports per-member breakdown, the reassign/approval
 *  dropdowns, or the AA_SENDERS email-sender roster. Grant, not roster. */
export const HI_SECTION_GUESTS: HiTeamMember[] = [
  { name: "Amir",    email: "amir@allocationassist.com"   },
  { name: "Charles", email: "charls@allocationassist.com" },
  { name: "Plinky",  email: "plinky@allocationassist.com" },
];

/** Everyone whose mailbox is wired up as a valid 'From' on outbound
 *  emails. Used by the assigned-owner picker on flow runs so any of them
 *  can be set as the sender. (Ammar left the team — removed so he's no
 *  longer selectable. The backend send-flow-email SENDERS registry keeps
 *  his entry as a fallback so any run still assigned to him can deliver.) */
export const AA_SENDERS: HiTeamMember[] = [
  ...HI_TEAM_MEMBERS,
];

/** Quick lookup by email (case-insensitive). Returns null when an email
 *  doesn't belong to a known HI team member. */
export function findHiMemberByEmail(email: string | null | undefined): HiTeamMember | null {
  if (!email) return null;
  const lower = email.toLowerCase().trim();
  return HI_TEAM_MEMBERS.find(m => m.email.toLowerCase() === lower) ?? null;
}

/** Lookup across the broader sender roster (HI team + Ammar). */
export function findSenderByEmail(email: string | null | undefined): HiTeamMember | null {
  if (!email) return null;
  const lower = email.toLowerCase().trim();
  return AA_SENDERS.find(m => m.email.toLowerCase() === lower) ?? null;
}

/** True when the email matches a HI team member. */
export function isHiTeamMember(email: string | null | undefined): boolean {
  return findHiMemberByEmail(email) != null;
}

/** Lookup across everyone allowed into the HI section: dedicated specialists
 *  PLUS granted guests. This — not findHiMemberByEmail — is what use-auth
 *  should use to decide HI-section access, so a grant doesn't imply
 *  specialist status. Specialists win on name collisions. */
export function findHiAccessByEmail(email: string | null | undefined): HiTeamMember | null {
  if (!email) return null;
  const lower = email.toLowerCase().trim();
  return (
    HI_TEAM_MEMBERS.find(m => m.email.toLowerCase() === lower) ??
    HI_SECTION_GUESTS.find(m => m.email.toLowerCase() === lower) ??
    null
  );
}

/** True when the email may access the HI section (specialist OR granted guest). */
export function hasHiSectionAccess(email: string | null | undefined): boolean {
  return findHiAccessByEmail(email) != null;
}
