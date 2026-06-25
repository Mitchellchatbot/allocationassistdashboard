/**
 * Shared expense-group classifier for the Finance page.
 *
 * ONE source of truth so the income-statement Sankey, the P&L banner, and the
 * "Marketing Spend" KPI card all bucket Zoho Books expense categories
 * IDENTICALLY — and so the corrupted raw-Books Marketing spend (duplicate
 * Scaled-AI / Website vendor bills) can be replaced by the team's retainer
 * model in exactly one way everywhere. See `marketingOverride` usage.
 */
export const GROUPS: { name: string; color: string; match: RegExp }[] = [
  { name: "Payroll & Directors",      color: "#f43f5e", match: /salar|remunerat|payroll|wage|bonus|commission|\bhr\b|staff|employee/i },
  { name: "Licensing & Verification", color: "#f59e0b", match: /licens|dataflow|verificat|visa|permit|complian|regulator|gratuit|\bwps\b/i },
  { name: "Marketing",                color: "#8b5cf6", match: /market|advertis|website|video|\bmedia\b|\bseo\b|\bads?\b|content/i },
  { name: "Tax & Professional",       color: "#0ea5e9", match: /\bvat\b|\btax\b|account|audit|legal|consult|contractor|professional|advisor/i },
  { name: "Office & Admin",           color: "#14b8a6", match: /rent|utilit|electric|water|telephone|internet|kitchen|hygiene|subscription|software|insurance|travel|accommod|bank|charge|deprecia|leasehold|meals|office|stationer|telr/i },
];

export const OTHER_GROUP = { name: "Other", color: "#94a3b8" };
export const MARKETING_GROUP = GROUPS.find(g => g.name === "Marketing")!;

/** Bucket a Zoho Books expense category (account name) into a finance group. */
export function groupFor(category: string) {
  for (const g of GROUPS) if (g.match.test(category)) return g;
  return OTHER_GROUP;
}

/** True if a category belongs to the Marketing group (so callers can strip the
 *  corrupted raw-Books marketing lines and swap in the corrected total). */
export function isMarketingCategory(category: string): boolean {
  return MARKETING_GROUP.match.test(category) && groupFor(category).name === "Marketing";
}
