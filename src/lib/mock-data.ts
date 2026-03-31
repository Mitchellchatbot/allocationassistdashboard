// ===== OVERVIEW KPIs =====
export const overviewKpis = [
  { label: "Active Doctors", value: "1,284", change: +12.4, period: "vs last quarter", icon: "users" as const },
  { label: "Placements (Q1)", value: "89", change: +18.6, period: "vs Q4 2025", icon: "check" as const },
  { label: "In Licensing", value: "156", change: +8.2, period: "vs last month", icon: "file" as const },
  { label: "Hospital Partners", value: "84", change: +4.8, period: "total active", icon: "building" as const },
  { label: "Avg. Processing", value: "34 days", change: -12.5, period: "vs last quarter", icon: "clock" as const },
  { label: "Revenue (Q1)", value: "$1.24M", change: +22.8, period: "vs Q4 2025", icon: "dollar" as const },
];

// ===== LEADS OVER TIME =====
export const leadsOverTime = [
  { month: "Jul", doctors: 68, qualified: 42, placed: 14 },
  { month: "Aug", doctors: 82, qualified: 51, placed: 18 },
  { month: "Sep", doctors: 95, qualified: 62, placed: 22 },
  { month: "Oct", doctors: 108, qualified: 71, placed: 26 },
  { month: "Nov", doctors: 124, qualified: 82, placed: 31 },
  { month: "Dec", doctors: 118, qualified: 78, placed: 28 },
  { month: "Jan", doctors: 142, qualified: 94, placed: 36 },
  { month: "Feb", doctors: 156, qualified: 104, placed: 42 },
  { month: "Mar", doctors: 168, qualified: 112, placed: 48 },
];

// ===== PLACEMENT FUNNEL =====
export const placementFunnel = [
  { stage: "Applications", count: 1284, pct: 100 },
  { stage: "Screening", count: 842, pct: 65.6 },
  { stage: "Qualified", count: 528, pct: 41.1 },
  { stage: "Interview", count: 312, pct: 24.3 },
  { stage: "Licensing", count: 156, pct: 12.1 },
  { stage: "Placed", count: 89, pct: 6.9 },
];

// ===== CHANNELS =====
export const channelPerformance = [
  { channel: "Facebook Ads", doctors: 420, cost: 24200, placed: 38, cpa: 637 },
  { channel: "Google Ads", doctors: 280, cost: 28800, placed: 22, cpa: 1309 },
  { channel: "LinkedIn", doctors: 185, cost: 12400, placed: 14, cpa: 886 },
  { channel: "SEO / Organic", doctors: 248, cost: 4200, placed: 12, cpa: 350 },
  { channel: "Referrals", doctors: 151, cost: 1800, placed: 3, cpa: 600 },
];

// ===== REGIONS =====
export const regionData = [
  { region: "UAE", doctors: 520, hospitals: 42, placements: 38, revenue: "$486K" },
  { region: "Saudi Arabia", doctors: 380, hospitals: 24, placements: 28, revenue: "$412K" },
  { region: "Qatar", doctors: 184, hospitals: 12, placements: 14, revenue: "$198K" },
  { region: "Kuwait", doctors: 120, hospitals: 6, placements: 9, revenue: "$144K" },
];

// ===== PIPELINE STAGES =====
export const pipelineStages = [
  { stage: "New Application", count: 142, color: "hsl(210, 75%, 52%)" },
  { stage: "Screening", count: 98, color: "hsl(170, 55%, 45%)" },
  { stage: "Document Collection", count: 76, color: "hsl(38, 88%, 50%)" },
  { stage: "Interview Prep", count: 54, color: "hsl(280, 50%, 52%)" },
  { stage: "Hospital Interview", count: 38, color: "hsl(340, 60%, 52%)" },
  { stage: "Licensing", count: 28, color: "hsl(158, 50%, 42%)" },
  { stage: "Placed", count: 12, color: "hsl(120, 45%, 42%)" },
];

// ===== SALES METRICS =====
export const salesMetrics = {
  dealsClosed: 89,
  conversionRate: 6.9,
  avgCycleTime: "34 days",
  outboundCalls: 2847,
  emailsSent: 8420,
  followUpsPending: 124,
};

export const topRecruiters = [
  { name: "Sarah Ahmed", role: "Senior Recruiter", doctors: 24, placements: 14, revenue: "$186K", region: "UAE", score: 96 },
  { name: "James Mitchell", role: "Account Manager", doctors: 18, placements: 11, revenue: "$143K", region: "KSA", score: 89 },
  { name: "Priya Patel", role: "Recruiter", doctors: 16, placements: 9, revenue: "$118K", region: "UAE", score: 84 },
  { name: "Omar Hassan", role: "Senior Recruiter", doctors: 14, placements: 8, revenue: "$96K", region: "Qatar", score: 78 },
  { name: "Lisa Chen", role: "Recruiter", doctors: 11, placements: 6, revenue: "$73K", region: "UAE", score: 71 },
  { name: "David Kim", role: "Junior Recruiter", doctors: 8, placements: 4, revenue: "$48K", region: "KSA", score: 62 },
];

export const stageConversion = [
  { stage: "Application → Screening", rate: 65.6 },
  { stage: "Screening → Qualified", rate: 62.7 },
  { stage: "Qualified → Interview", rate: 59.1 },
  { stage: "Interview → Licensing", rate: 50.0 },
  { stage: "Licensing → Placed", rate: 57.1 },
];

// ===== MARKETING =====
export const marketingChannelMetrics = [
  { channel: "Facebook Ads", doctors: 420, spend: 24200, cpa: 637, placements: 38, roi: 4.2 },
  { channel: "Google Ads", doctors: 280, spend: 28800, cpa: 1309, placements: 22, roi: 2.1 },
  { channel: "LinkedIn", doctors: 185, spend: 12400, cpa: 886, placements: 14, roi: 3.1 },
  { channel: "SEO / Organic", doctors: 248, spend: 4200, cpa: 350, placements: 12, roi: 7.8 },
  { channel: "Referrals", doctors: 151, spend: 1800, cpa: 600, placements: 3, roi: 4.6 },
];

export const costVsConversions = [
  { channel: "Facebook", cost: 24200, placements: 38 },
  { channel: "Google", cost: 28800, placements: 22 },
  { channel: "LinkedIn", cost: 12400, placements: 14 },
  { channel: "SEO", cost: 4200, placements: 12 },
  { channel: "Referrals", cost: 1800, placements: 3 },
];

// ===== FINANCE =====
export const financeMetrics = [
  { label: "Marketing Spend", value: "$71,400", change: +8.2, period: "this quarter" },
  { label: "Placement Revenue", value: "$1.24M", change: +22.8, period: "this quarter" },
  { label: "Cost per Placement", value: "$802", change: -6.4, period: "vs last quarter" },
  { label: "Overall ROI", value: "17.4x", change: +14.2, period: "vs last quarter" },
];

export const channelROI = [
  { channel: "SEO / Organic", roi: 7.8 },
  { channel: "Referrals", roi: 4.6 },
  { channel: "Facebook Ads", roi: 4.2 },
  { channel: "LinkedIn", roi: 3.1 },
  { channel: "Google Ads", roi: 2.1 },
];

// ===== DOCTOR PIPELINE =====
export const pipelineDoctors = [
  { id: "AA-4201", name: "Dr. Amira Khan", specialty: "Cardiology", stage: "Licensing", origin: "UK", destination: "UAE", assignedTo: "Sarah Ahmed", daysInStage: 12, status: "on-track" as const, license: "DHA" },
  { id: "AA-4198", name: "Dr. Michael Torres", specialty: "Orthopedics", stage: "Hospital Interview", origin: "Canada", destination: "KSA", assignedTo: "James Mitchell", daysInStage: 8, status: "on-track" as const, license: "MOH" },
  { id: "AA-4195", name: "Dr. Elena Petrova", specialty: "Neurology", stage: "Screening", origin: "Germany", destination: "UAE", assignedTo: "Priya Patel", daysInStage: 3, status: "on-track" as const, license: "HAAD" },
  { id: "AA-4192", name: "Dr. Raj Mehta", specialty: "Pediatrics", stage: "Licensing", origin: "India", destination: "Qatar", assignedTo: "Omar Hassan", daysInStage: 28, status: "delayed" as const, license: "QCHP" },
  { id: "AA-4189", name: "Dr. Sophie Laurent", specialty: "Dermatology", stage: "Placed", origin: "France", destination: "UAE", assignedTo: "Lisa Chen", daysInStage: 2, status: "on-track" as const, license: "DHA" },
  { id: "AA-4186", name: "Dr. Chen Wei", specialty: "Internal Medicine", stage: "Document Collection", origin: "China", destination: "KSA", assignedTo: "David Kim", daysInStage: 15, status: "at-risk" as const, license: "MOH" },
  { id: "AA-4183", name: "Dr. Anna Kowalski", specialty: "Anesthesiology", stage: "New Application", origin: "Poland", destination: "UAE", assignedTo: "Sarah Ahmed", daysInStage: 1, status: "on-track" as const, license: "DHA" },
  { id: "AA-4180", name: "Dr. Hassan Ali", specialty: "General Surgery", stage: "Interview Prep", origin: "Egypt", destination: "KSA", assignedTo: "James Mitchell", daysInStage: 18, status: "at-risk" as const, license: "MOH" },
];

export const workflowStages = [
  { name: "New Application", count: 142 },
  { name: "Screening", count: 98 },
  { name: "Document Collection", count: 76 },
  { name: "Interview Prep", count: 54 },
  { name: "Hospital Interview", count: 38 },
  { name: "Licensing", count: 28 },
  { name: "Placed", count: 12 },
];

// ===== TEAM =====
export const campaignPerformance = [
  { name: "ME Healthcare Recruitment Q1", channel: "Facebook", doctors: 420, spend: 12400, status: "active" as const },
  { name: "Doctor Relocation Guide", channel: "SEO", doctors: 180, spend: 3200, status: "active" as const },
  { name: "LinkedIn Outreach — Cardiology", channel: "LinkedIn", doctors: 85, spend: 8400, status: "completed" as const },
  { name: "Google PPC — KSA Hospitals", channel: "Google Ads", doctors: 142, spend: 9800, status: "active" as const },
  { name: "Instagram — Doctor Stories", channel: "Social Media", doctors: 64, spend: 4200, status: "paused" as const },
];

// ===== ACTIVITY =====
export const recentActivity = [
  { action: "New application received", detail: "Dr. Anna Kowalski — Anesthesiology, Poland", time: "2 min ago", type: "lead" as const },
  { action: "Doctor placed successfully", detail: "Dr. Sophie Laurent → Cleveland Clinic Abu Dhabi", time: "1 hour ago", type: "placement" as const },
  { action: "License approved", detail: "Dr. Amira Khan — DHA License granted", time: "3 hours ago", type: "license" as const },
  { action: "Licensing delayed", detail: "Dr. Raj Mehta — QCHP (28 days, bottleneck)", time: "5 hours ago", type: "alert" as const },
  { action: "Interview scheduled", detail: "Dr. Michael Torres — King Faisal Hospital, KSA", time: "Yesterday", type: "interview" as const },
  { action: "Documents received", detail: "Dr. Chen Wei — CV and credentials uploaded", time: "Yesterday", type: "document" as const },
  { action: "New hospital partnership", detail: "Hamad Medical Corporation, Qatar — signed", time: "2 days ago", type: "partnership" as const },
];

// ===== OPERATIONS / ROADMAP =====
export const operationalHealth = [
  { metric: "SOP Coverage", value: 35, target: 100, unit: "%" },
  { metric: "CRM Data Quality", value: 48, target: 90, unit: "%" },
  { metric: "Avg Response Time", value: 18, target: 4, unit: "hrs" },
  { metric: "Automation Level", value: 12, target: 60, unit: "%" },
];

export const roadmapPhases = [
  {
    phase: "Phase 1",
    timeline: "0–3 Months",
    status: "in-progress" as const,
    progress: 45,
    items: [
      { task: "Define roles & responsibilities", done: true },
      { task: "Develop SOPs for core processes", done: false },
      { task: "Clean CRM data & set mandatory fields", done: true },
      { task: "Decide CRM direction (Zoho vs Custom)", done: false },
      { task: "Launch Doctor Value Package", done: false },
      { task: "Set up customer support function", done: true },
    ],
  },
  {
    phase: "Phase 2",
    timeline: "3–9 Months",
    status: "upcoming" as const,
    progress: 0,
    items: [
      { task: "Build automated workflows", done: false },
      { task: "Implement vacancy management system", done: false },
      { task: "Launch licensing workflow system", done: false },
      { task: "Build operational dashboards", done: false },
      { task: "Strengthen KSA marketing", done: false },
      { task: "Hospital acquisition program", done: false },
    ],
  },
  {
    phase: "Phase 3",
    timeline: "9–18 Months",
    status: "planned" as const,
    progress: 0,
    items: [
      { task: "AI vacancy matching", done: false },
      { task: "AI CV rewriting", done: false },
      { task: "Doctor portal & mobile app", done: false },
      { task: "European university outreach", done: false },
      { task: "Predictive analytics", done: false },
      { task: "Financial automation", done: false },
    ],
  },
];

export const bottlenecks = [
  { area: "Licensing (QCHP)", severity: "high" as const, avgDelay: "18 days", affected: 8, detail: "Qatar licensing backlog" },
  { area: "Document Collection", severity: "medium" as const, avgDelay: "12 days", affected: 14, detail: "Missing credentials from doctors" },
  { area: "Hospital Scheduling", severity: "medium" as const, avgDelay: "8 days", affected: 6, detail: "Interview slot availability" },
  { area: "CRM Data Entry", severity: "low" as const, avgDelay: "3 days", affected: 22, detail: "Manual entry backlog" },
];
