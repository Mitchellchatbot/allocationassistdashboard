/**
 * Hospital Introduction team roster — confirmed by Saif Ullah 2026-06-02.
 *
 * Used by:
 *   - Reports page filter (per-member activity counts)
 *   - Activity dashboard (per-member shortlists / interviews / offers / signs)
 *   - Anywhere we surface a "HI team member" dropdown
 *
 * Two lists here so we don't conflate concepts:
 *   HI_TEAM_MEMBERS  — the 4 dedicated HI specialists
 *   AA_SENDERS       — every internal mailbox that can send doctor emails
 *                      (the 4 above + Ammar). Mirrors the SENDERS registry
 *                      in supabase/functions/send-flow-email/index.ts;
 *                      keep them in lockstep when adding a person.
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

/** Everyone whose mailbox is wired up as a valid 'From' on outbound
 *  emails (HI specialists + Ammar). Used by the assigned-owner picker
 *  on flow runs so any of them can be set as the sender. */
export const AA_SENDERS: HiTeamMember[] = [
  ...HI_TEAM_MEMBERS,
  { name: "Ammar", email: "ammar@allocationassist.com" },
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
