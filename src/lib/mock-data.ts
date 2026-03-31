// ===== OVERVIEW =====
export const overviewKpis = [
  { label: "Total Leads", value: "2,847", change: +14.2, period: "this month" },
  { label: "Cost per Lead", value: "$32.40", change: -8.5, period: "vs last month" },
  { label: "Cost per Customer", value: "$284", change: -3.2, period: "vs last month" },
  { label: "Conversion Rate", value: "18.6%", change: +2.1, period: "vs last month" },
  { label: "Revenue Generated", value: "$1.24M", change: +22.8, period: "this quarter" },
  { label: "Active Pipeline", value: "$3.8M", change: +11.4, period: "total value" },
];

export const leadsOverTime = [
  { month: "Jul", leads: 180, qualified: 92, closed: 34 },
  { month: "Aug", leads: 210, qualified: 108, closed: 41 },
  { month: "Sep", leads: 245, qualified: 126, closed: 48 },
  { month: "Oct", leads: 278, qualified: 148, closed: 56 },
  { month: "Nov", leads: 312, qualified: 165, closed: 63 },
  { month: "Dec", leads: 295, qualified: 152, closed: 58 },
  { month: "Jan", leads: 340, qualified: 178, closed: 72 },
  { month: "Feb", leads: 368, qualified: 195, closed: 78 },
  { month: "Mar", leads: 410, qualified: 218, closed: 89 },
];

export const conversionFunnel = [
  { stage: "Total Leads", count: 2847, pct: 100 },
  { stage: "Qualified", count: 1284, pct: 45.1 },
  { stage: "Interview", count: 642, pct: 22.5 },
  { stage: "Placed", count: 528, pct: 18.6 },
];

export const channelPerformance = [
  { channel: "Facebook", leads: 820, cost: 24200, conversions: 148, cpl: 29.51 },
  { channel: "Google Ads", leads: 640, cost: 28800, conversions: 134, cpl: 45.00 },
  { channel: "LinkedIn", leads: 480, cost: 19200, conversions: 96, cpl: 40.00 },
  { channel: "SEO/Organic", leads: 520, cost: 8400, conversions: 104, cpl: 16.15 },
  { channel: "Social Media", leads: 387, cost: 11200, conversions: 46, cpl: 28.94 },
];

// ===== SALES =====
export const pipelineStages = [
  { stage: "New Lead", count: 342, value: "$856K", color: "hsl(210, 80%, 55%)" },
  { stage: "Contacted", count: 218, value: "$612K", color: "hsl(174, 65%, 42%)" },
  { stage: "Qualified", count: 156, value: "$487K", color: "hsl(38, 92%, 50%)" },
  { stage: "Interview", count: 89, value: "$342K", color: "hsl(280, 65%, 55%)" },
  { stage: "Placed", count: 52, value: "$284K", color: "hsl(152, 60%, 42%)" },
];

export const salesMetrics = {
  dealsClosed: 52,
  conversionRate: 18.6,
  avgCycleTime: "34 days",
  outboundCalls: 1247,
  emailsSent: 3842,
  followUpsPending: 89,
};

export const topSalesReps = [
  { name: "Sarah Ahmed", deals: 14, revenue: "$186,400", conversion: 24.1, avatar: "SA" },
  { name: "James Mitchell", deals: 11, revenue: "$142,800", conversion: 21.3, avatar: "JM" },
  { name: "Priya Patel", deals: 9, revenue: "$118,200", conversion: 19.8, avatar: "PP" },
  { name: "Omar Hassan", deals: 8, revenue: "$96,400", conversion: 17.2, avatar: "OH" },
  { name: "Lisa Chen", deals: 6, revenue: "$72,600", conversion: 15.4, avatar: "LC" },
  { name: "David Kim", deals: 4, revenue: "$48,200", conversion: 12.8, avatar: "DK" },
];

export const stageConversion = [
  { stage: "New → Contacted", rate: 63.7 },
  { stage: "Contacted → Qualified", rate: 71.6 },
  { stage: "Qualified → Interview", rate: 57.1 },
  { stage: "Interview → Placed", rate: 58.4 },
];

// ===== MARKETING =====
export const marketingChannelMetrics = [
  { channel: "Facebook Ads", leads: 820, spend: 24200, cpl: 29.51, conversions: 148, roi: 3.2 },
  { channel: "Google Ads", leads: 640, spend: 28800, cpl: 45.00, conversions: 134, roi: 2.4 },
  { channel: "LinkedIn", leads: 480, spend: 19200, cpl: 40.00, conversions: 96, roi: 2.8 },
  { channel: "SEO / Organic", leads: 520, spend: 8400, cpl: 16.15, conversions: 104, roi: 6.8 },
  { channel: "Social Media", leads: 387, spend: 11200, cpl: 28.94, conversions: 46, roi: 1.9 },
];

export const costVsConversions = [
  { channel: "Facebook", cost: 24200, conversions: 148 },
  { channel: "Google", cost: 28800, conversions: 134 },
  { channel: "LinkedIn", cost: 19200, conversions: 96 },
  { channel: "SEO", cost: 8400, conversions: 104 },
  { channel: "Social", cost: 11200, conversions: 46 },
];

// ===== FINANCE =====
export const financeMetrics = [
  { label: "Marketing Spend", value: "$91,800", change: +8.2 },
  { label: "Revenue (Closed)", value: "$1.24M", change: +22.8 },
  { label: "CAC", value: "$284", change: -3.2 },
  { label: "Overall ROI", value: "3.4x", change: +12.1 },
];

export const channelROI = [
  { channel: "SEO", roi: 6.8 },
  { channel: "Facebook", roi: 3.2 },
  { channel: "LinkedIn", roi: 2.8 },
  { channel: "Google Ads", roi: 2.4 },
  { channel: "Social Media", roi: 1.9 },
];

// ===== LEADS PIPELINE =====
export const pipelineLeads = [
  { id: "AA-4201", name: "Dr. Amira Khan", specialty: "Cardiology", stage: "Licensing", country: "UK", assignedTo: "Sarah Ahmed", daysInStage: 12, status: "on-track" as const },
  { id: "AA-4198", name: "Dr. Michael Torres", specialty: "Orthopedics", stage: "Interview", country: "Canada", assignedTo: "James Mitchell", daysInStage: 8, status: "on-track" as const },
  { id: "AA-4195", name: "Dr. Elena Petrova", specialty: "Neurology", stage: "Contacted", country: "Germany", assignedTo: "Priya Patel", daysInStage: 3, status: "on-track" as const },
  { id: "AA-4192", name: "Dr. Raj Mehta", specialty: "Pediatrics", stage: "Licensing", country: "India", assignedTo: "Omar Hassan", daysInStage: 28, status: "delayed" as const },
  { id: "AA-4189", name: "Dr. Sophie Laurent", specialty: "Dermatology", stage: "Placement", country: "France", assignedTo: "Lisa Chen", daysInStage: 5, status: "on-track" as const },
  { id: "AA-4186", name: "Dr. Chen Wei", specialty: "Internal Med", stage: "Qualified", country: "China", assignedTo: "David Kim", daysInStage: 15, status: "at-risk" as const },
  { id: "AA-4183", name: "Dr. Anna Kowalski", specialty: "Anesthesiology", stage: "New Lead", country: "Poland", assignedTo: "Sarah Ahmed", daysInStage: 1, status: "on-track" as const },
  { id: "AA-4180", name: "Dr. Hassan Ali", specialty: "Surgery", stage: "In Process", country: "Egypt", assignedTo: "James Mitchell", daysInStage: 18, status: "at-risk" as const },
];

export const workflowStages = [
  { name: "Lead Assigned", count: 342, active: true },
  { name: "Contacted", count: 218, active: true },
  { name: "In Process", count: 156, active: true },
  { name: "Licensing", count: 89, active: true },
  { name: "Placement", count: 52, active: true },
];

// ===== TEAM PERFORMANCE =====
export const teamLeaderboard = [
  { name: "Sarah Ahmed", role: "Senior Recruiter", calls: 342, campaigns: 8, deals: 14, revenue: "$186.4K", score: 96 },
  { name: "James Mitchell", role: "Account Manager", calls: 287, campaigns: 5, deals: 11, revenue: "$142.8K", score: 89 },
  { name: "Priya Patel", role: "Recruiter", calls: 264, campaigns: 6, deals: 9, revenue: "$118.2K", score: 84 },
  { name: "Omar Hassan", role: "Senior Recruiter", calls: 231, campaigns: 4, deals: 8, revenue: "$96.4K", score: 78 },
  { name: "Lisa Chen", role: "Recruiter", calls: 198, campaigns: 7, deals: 6, revenue: "$72.6K", score: 71 },
  { name: "David Kim", role: "Junior Recruiter", calls: 156, campaigns: 3, deals: 4, revenue: "$48.2K", score: 62 },
];

export const campaignPerformance = [
  { name: "ME Healthcare Q1", channel: "Facebook", leads: 420, spend: 12400, status: "active" as const },
  { name: "Doctor Relocation Guide", channel: "SEO", leads: 280, spend: 3200, status: "active" as const },
  { name: "LinkedIn Outreach Feb", channel: "LinkedIn", leads: 165, spend: 8400, status: "completed" as const },
  { name: "Google PPC - Cardiology", channel: "Google Ads", leads: 142, spend: 9800, status: "active" as const },
  { name: "Instagram Stories Q1", channel: "Social Media", leads: 98, spend: 4200, status: "paused" as const },
];

// ===== ACTIVITY LOG =====
export const recentActivity = [
  { action: "New lead assigned", detail: "Dr. Anna Kowalski → Sarah Ahmed", time: "2 min ago", type: "lead" as const },
  { action: "Deal closed", detail: "Dr. Sophie Laurent placed at Cleveland Clinic Abu Dhabi", time: "1 hour ago", type: "deal" as const },
  { action: "Campaign launched", detail: "ME Healthcare Q1 - Facebook Ads", time: "3 hours ago", type: "campaign" as const },
  { action: "Follow-up overdue", detail: "Dr. Raj Mehta - licensing delay (28 days)", time: "5 hours ago", type: "alert" as const },
  { action: "Interview scheduled", detail: "Dr. Michael Torres - King Faisal Hospital", time: "Yesterday", type: "interview" as const },
  { action: "Licensing approved", detail: "Dr. Amira Khan - DHA License", time: "Yesterday", type: "milestone" as const },
];
