import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight, Check, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

type QuestionType = "text" | "email" | "url" | "tel" | "textarea" | "radio" | "checkbox";

interface Question {
  id: string;
  section: string;
  sectionNumber: number;
  question: string;
  type: QuestionType;
  required?: boolean;
  options?: string[];
  hasOther?: boolean;
  placeholder?: string;
}

const questions: Question[] = [
  // Section 1 — Company Information
  { id: "company_name", section: "Company Information", sectionNumber: 1, question: "What is your company name?", type: "text", required: true, placeholder: "e.g. Gulf Medical Staffing" },
  { id: "company_website", section: "Company Information", sectionNumber: 1, question: "What is your company website?", type: "url", placeholder: "https://yourcompany.com" },
  { id: "contact_name", section: "Company Information", sectionNumber: 1, question: "What is the primary contact person's full name?", type: "text", required: true, placeholder: "e.g. Ahmed Al Maktoum" },
  { id: "contact_email", section: "Company Information", sectionNumber: 1, question: "What is the primary contact's email address?", type: "email", required: true, placeholder: "ahmed@company.com" },
  { id: "contact_phone", section: "Company Information", sectionNumber: 1, question: "What is the primary contact's phone number?", type: "tel", required: true, placeholder: "+971 50 123 4567" },
  { id: "role", section: "Company Information", sectionNumber: 1, question: "What is your role within the company?", type: "radio", required: true, options: ["CEO / Managing Director", "Operations Manager", "HR / Recruitment Lead", "Marketing Manager", "Finance Manager"], hasOther: true },

  // Section 2 — Business Overview
  { id: "years_operating", section: "Business Overview", sectionNumber: 2, question: "How long has your company been operating in healthcare recruitment?", type: "radio", required: true, options: ["Less than 1 year", "1–3 years", "3–5 years", "5–10 years", "10+ years"] },
  { id: "pipeline_size", section: "Business Overview", sectionNumber: 2, question: "How many doctors/healthcare professionals do you currently have in your pipeline?", type: "radio", required: true, options: ["0–50", "51–200", "201–500", "501–1,000", "1,000+"] },
  { id: "monthly_placements", section: "Business Overview", sectionNumber: 2, question: "How many doctors do you place per month on average?", type: "radio", required: true, options: ["1–5", "6–15", "16–30", "31–50", "50+"] },
  { id: "team_size", section: "Business Overview", sectionNumber: 2, question: "How many recruiters/team members are on your staff?", type: "radio", required: true, options: ["1–3", "4–10", "11–25", "26–50", "50+"] },

  // Section 3 — Regions & Licensing
  { id: "recruit_for_regions", section: "Regions & Licensing", sectionNumber: 3, question: "Which regions do you actively recruit doctors FOR?", type: "checkbox", required: true, options: ["UAE — Dubai (DHA)", "UAE — Abu Dhabi (HAAD)", "UAE — Other Emirates (MOH)", "Saudi Arabia (MOH/SCFHS)", "Qatar (QCHP)", "Kuwait (KIMS)", "Bahrain", "Oman"], hasOther: true },
  { id: "recruit_from_countries", section: "Regions & Licensing", sectionNumber: 3, question: "Which countries do you recruit doctors FROM?", type: "checkbox", required: true, options: ["India", "Pakistan", "Egypt", "Philippines", "Jordan", "UK", "South Africa", "Nigeria"], hasOther: true },
  { id: "specialties", section: "Regions & Licensing", sectionNumber: 3, question: "Which medical specialties do you focus on?", type: "checkbox", required: true, options: ["General Practice / Family Medicine", "Internal Medicine", "Pediatrics", "Cardiology", "Orthopedics", "Dermatology", "Dentistry", "Nursing", "Radiology", "Emergency Medicine", "OB/GYN", "Surgery"], hasOther: true },
  { id: "licensing_bodies", section: "Regions & Licensing", sectionNumber: 3, question: "Which licensing bodies do you deal with most frequently?", type: "checkbox", required: true, options: ["DHA (Dubai Health Authority)", "HAAD (Health Authority Abu Dhabi)", "MOH (Ministry of Health — UAE)", "MOH (Ministry of Health — Saudi)", "QCHP (Qatar Council for Healthcare Practitioners)", "SCFHS (Saudi Commission for Health Specialties)", "KIMS (Kuwait Institute for Medical Specializations)"], hasOther: true },

  // Section 4 — Current Pipeline & Operations
  { id: "current_pipeline", section: "Pipeline & Operations", sectionNumber: 4, question: "What does your current doctor placement pipeline look like? What stages does a doctor go through?", type: "textarea", required: true, placeholder: "Describe your workflow from application to placement..." },
  { id: "current_tools", section: "Pipeline & Operations", sectionNumber: 4, question: "What tools do you currently use to track your recruitment pipeline?", type: "checkbox", required: true, options: ["Spreadsheets (Excel/Google Sheets)", "CRM software (HubSpot, Salesforce, etc.)", "Email & manual tracking", "WhatsApp groups", "Custom internal software", "Nothing — just memory"], hasOther: true },
  { id: "bottlenecks", section: "Pipeline & Operations", sectionNumber: 4, question: "What are the biggest bottlenecks or pain points in your current process?", type: "checkbox", required: true, options: ["Licensing delays", "Document collection from doctors", "Interview scheduling with hospitals", "Slow hospital response times", "Tracking doctor status across stages", "Recruiter accountability/performance tracking", "Marketing ROI — not knowing which channels work", "Financial visibility — cost per placement unclear", "Manual/repetitive administrative work", "No centralized database"], hasOther: true },
  { id: "avg_placement_time", section: "Pipeline & Operations", sectionNumber: 4, question: "On average, how long does it take to place a doctor from application to placement?", type: "radio", required: true, options: ["Less than 1 month", "1–2 months", "2–4 months", "4–6 months", "6+ months", "We don't track this"] },

  // Section 5 — Marketing & Lead Generation
  { id: "lead_sources", section: "Marketing & Leads", sectionNumber: 5, question: "How do doctors typically find you?", type: "checkbox", required: true, options: ["Facebook Ads", "Google Ads", "LinkedIn", "SEO / Organic search", "Referrals from placed doctors", "Job boards (Bayt, Indeed, etc.)", "Direct outreach", "Medical conferences/events", "Partnerships with universities/hospitals"], hasOther: true },
  { id: "marketing_budget", section: "Marketing & Leads", sectionNumber: 5, question: "What is your approximate monthly marketing budget?", type: "radio", required: true, options: ["Less than $1,000", "$1,000–$5,000", "$5,000–$15,000", "$15,000–$30,000", "$30,000+", "We don't have a marketing budget"] },
  { id: "track_roi", section: "Marketing & Leads", sectionNumber: 5, question: "Do you currently track cost-per-placement or ROI by marketing channel?", type: "radio", required: true, options: ["Yes — we track it well", "Partially — we have some idea", "No — we have no visibility"] },

  // Section 6 — Hospital Partnerships
  { id: "partner_hospitals", section: "Hospital Partnerships", sectionNumber: 6, question: "How many partner hospitals/healthcare facilities do you work with?", type: "radio", required: true, options: ["1–10", "11–30", "31–60", "61–100", "100+"] },
  { id: "hospital_management", section: "Hospital Partnerships", sectionNumber: 6, question: "How do you currently manage hospital relationships and job vacancies?", type: "textarea", required: true, placeholder: "Describe how you coordinate with hospitals..." },
  { id: "vacancy_sharing", section: "Hospital Partnerships", sectionNumber: 6, question: "Do hospitals share real-time vacancy data with you, or do you check manually?", type: "radio", required: true, options: ["Real-time sharing via portal/system", "They email us periodically", "We call/check manually", "Mix of methods"] },

  // Section 7 — Dashboard Priorities
  { id: "priority_features", section: "Dashboard Priorities", sectionNumber: 7, question: "Which dashboard features are MOST important to you? (Select top 5)", type: "checkbox", required: true, options: ["Real-time pipeline overview with placement funnel", "Individual doctor progress tracking", "Recruiter performance leaderboard", "Marketing channel ROI analytics", "Financial metrics (revenue, cost per placement, spend)", "Licensing stage tracking by authority", "Operations health monitoring", "Regional performance breakdown", "Bottleneck detection & alerts", "Strategic roadmap tracking", "Hospital vacancy management", "Automated notifications & reminders"] },
  { id: "dashboard_users", section: "Dashboard Priorities", sectionNumber: 7, question: "How many people on your team would need access to the dashboard?", type: "radio", required: true, options: ["1–3", "4–10", "11–20", "20+"] },
  { id: "role_based_access", section: "Dashboard Priorities", sectionNumber: 7, question: "Do you need role-based access? (e.g., recruiters see their doctors only, managers see everything)", type: "radio", required: true, options: ["Yes", "No", "Not sure yet"] },

  // Section 8 — Goals & Timeline
  { id: "goals", section: "Goals & Timeline", sectionNumber: 8, question: "What are your top 3 goals for the next 6 months?", type: "textarea", required: true, placeholder: "e.g. Place 50 doctors in Saudi Arabia, reduce licensing time by 30%..." },
  { id: "go_live", section: "Goals & Timeline", sectionNumber: 8, question: "When would you like to go live with the dashboard?", type: "radio", required: true, options: ["ASAP — within 2 weeks", "Within 1 month", "Within 2–3 months", "No rush — exploring options"] },
  { id: "additional_notes", section: "Goals & Timeline", sectionNumber: 8, question: "Is there anything else we should know about your operations or specific requirements?", type: "textarea", placeholder: "Any other details that would help us configure your dashboard..." },
];

const Onboarding = () => {
  const [step, setStep] = useState<"welcome" | number | "thanks">("welcome");
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [otherValues, setOtherValues] = useState<Record<string, string>>({});
  const [direction, setDirection] = useState(1);

  const currentIndex = typeof step === "number" ? step : -1;
  const currentQuestion = typeof step === "number" ? questions[step] : null;
  const progress = typeof step === "number" ? ((step + 1) / questions.length) * 100 : step === "thanks" ? 100 : 0;

  const isCurrentValid = useCallback(() => {
    if (!currentQuestion) return true;
    if (!currentQuestion.required) return true;
    const val = answers[currentQuestion.id];
    if (!val) return false;
    if (Array.isArray(val)) return val.length > 0;
    return val.trim().length > 0;
  }, [currentQuestion, answers]);

  const goNext = () => {
    setDirection(1);
    if (step === "welcome") {
      setStep(0);
    } else if (typeof step === "number" && step < questions.length - 1) {
      setStep(step + 1);
    } else {
      setStep("thanks");
    }
  };

  const goBack = () => {
    setDirection(-1);
    if (typeof step === "number" && step > 0) {
      setStep(step - 1);
    } else if (typeof step === "number" && step === 0) {
      setStep("welcome");
    }
  };

  const handleTextChange = (id: string, value: string) => {
    setAnswers(prev => ({ ...prev, [id]: value }));
  };

  const handleRadioChange = (id: string, value: string) => {
    setAnswers(prev => ({ ...prev, [id]: value }));
  };

  const handleCheckboxToggle = (id: string, option: string) => {
    setAnswers(prev => {
      const current = (prev[id] as string[]) || [];
      return {
        ...prev,
        [id]: current.includes(option) ? current.filter(o => o !== option) : [...current, option],
      };
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && isCurrentValid()) {
      e.preventDefault();
      goNext();
    }
  };

  const showNewSection = typeof step === "number" && (step === 0 || questions[step].sectionNumber !== questions[step - 1]?.sectionNumber);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(170,40%,97%)] via-background to-[hsl(170,30%,94%)] flex flex-col">
      {/* Header */}
      {step !== "welcome" && step !== "thanks" && (
        <div className="w-full px-6 pt-4">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-2 mb-2">
              <Stethoscope className="h-5 w-5 text-primary" />
              <span className="text-sm font-semibold text-primary">Allocation Assist</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {currentIndex + 1} of {questions.length}
              </span>
            </div>
            <Progress value={progress} className="h-1.5 bg-muted" />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-2xl">
          <AnimatePresence mode="wait" custom={direction}>
            {/* Welcome Screen */}
            {step === "welcome" && (
              <motion.div
                key="welcome"
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -40 }}
                transition={{ duration: 0.35 }}
                className="text-center space-y-6"
              >
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-4">
                  <Stethoscope className="h-10 w-10 text-primary" />
                </div>
                <h1 className="text-3xl md:text-4xl font-bold text-foreground">
                  Welcome to Allocation Assist 🩺
                </h1>
                <p className="text-lg text-muted-foreground max-w-lg mx-auto leading-relaxed">
                  The Source of Workforce — Let's set up your recruitment dashboard. This form takes about 10 minutes and helps us configure everything for your organization.
                </p>
                <Button size="lg" onClick={goNext} className="px-8 py-6 text-base rounded-xl shadow-lg">
                  Let's get started
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </motion.div>
            )}

            {/* Question Screen */}
            {typeof step === "number" && currentQuestion && (
              <motion.div
                key={currentQuestion.id}
                custom={direction}
                initial={{ opacity: 0, x: direction * 80 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction * -80 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
                onKeyDown={handleKeyDown}
              >
                {/* Section badge */}
                {showNewSection && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-2">
                    Section {currentQuestion.sectionNumber} — {currentQuestion.section}
                  </div>
                )}
                {!showNewSection && (
                  <div className="text-xs text-muted-foreground font-medium">
                    {currentQuestion.section}
                  </div>
                )}

                <h2 className="text-xl md:text-2xl font-semibold text-foreground leading-snug">
                  {currentQuestion.question}
                  {currentQuestion.required && <span className="text-primary ml-1">*</span>}
                </h2>

                {/* Input based on type */}
                <div className="pt-2">
                  {(currentQuestion.type === "text" || currentQuestion.type === "email" || currentQuestion.type === "url" || currentQuestion.type === "tel") && (
                    <Input
                      type={currentQuestion.type}
                      value={(answers[currentQuestion.id] as string) || ""}
                      onChange={e => handleTextChange(currentQuestion.id, e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={currentQuestion.placeholder}
                      className="h-12 text-base border-2 border-muted focus:border-primary rounded-xl px-4"
                      autoFocus
                    />
                  )}

                  {currentQuestion.type === "textarea" && (
                    <Textarea
                      value={(answers[currentQuestion.id] as string) || ""}
                      onChange={e => handleTextChange(currentQuestion.id, e.target.value)}
                      placeholder={currentQuestion.placeholder}
                      className="min-h-[120px] text-base border-2 border-muted focus:border-primary rounded-xl px-4 py-3 resize-none"
                      autoFocus
                    />
                  )}

                  {currentQuestion.type === "radio" && (
                    <RadioGroup
                      value={(answers[currentQuestion.id] as string) || ""}
                      onValueChange={val => handleRadioChange(currentQuestion.id, val)}
                      className="space-y-2.5"
                    >
                      {currentQuestion.options?.map(option => (
                        <label
                          key={option}
                          className={cn(
                            "flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all",
                            answers[currentQuestion.id] === option
                              ? "border-primary bg-primary/5"
                              : "border-muted hover:border-primary/40"
                          )}
                        >
                          <RadioGroupItem value={option} />
                          <span className="text-sm font-medium">{option}</span>
                        </label>
                      ))}
                      {currentQuestion.hasOther && (
                        <label
                          className={cn(
                            "flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all",
                            answers[currentQuestion.id] === `Other: ${otherValues[currentQuestion.id] || ""}`
                              ? "border-primary bg-primary/5"
                              : "border-muted hover:border-primary/40"
                          )}
                          onClick={() => handleRadioChange(currentQuestion.id, `Other: ${otherValues[currentQuestion.id] || ""}`)}
                        >
                          <RadioGroupItem value={`Other: ${otherValues[currentQuestion.id] || ""}`} />
                          <span className="text-sm font-medium">Other:</span>
                          <Input
                            value={otherValues[currentQuestion.id] || ""}
                            onChange={e => {
                              setOtherValues(prev => ({ ...prev, [currentQuestion.id]: e.target.value }));
                              handleRadioChange(currentQuestion.id, `Other: ${e.target.value}`);
                            }}
                            className="h-8 text-sm border-0 border-b border-muted rounded-none px-1 flex-1 focus-visible:ring-0"
                            placeholder="Please specify..."
                          />
                        </label>
                      )}
                    </RadioGroup>
                  )}

                  {currentQuestion.type === "checkbox" && (
                    <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-2">
                      {currentQuestion.options?.map(option => {
                        const checked = ((answers[currentQuestion.id] as string[]) || []).includes(option);
                        return (
                          <label
                            key={option}
                            className={cn(
                              "flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all",
                              checked ? "border-primary bg-primary/5" : "border-muted hover:border-primary/40"
                            )}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => handleCheckboxToggle(currentQuestion.id, option)}
                            />
                            <span className="text-sm font-medium">{option}</span>
                          </label>
                        );
                      })}
                      {currentQuestion.hasOther && (
                        <label className={cn(
                          "flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all",
                          ((answers[currentQuestion.id] as string[]) || []).includes(`Other: ${otherValues[currentQuestion.id] || ""}`)
                            ? "border-primary bg-primary/5"
                            : "border-muted hover:border-primary/40"
                        )}>
                          <Checkbox
                            checked={((answers[currentQuestion.id] as string[]) || []).some(v => v.startsWith("Other:"))}
                            onCheckedChange={() => {
                              const otherVal = `Other: ${otherValues[currentQuestion.id] || ""}`;
                              const current = (answers[currentQuestion.id] as string[]) || [];
                              const hasOtherEntry = current.find(v => v.startsWith("Other:"));
                              if (hasOtherEntry) {
                                setAnswers(prev => ({ ...prev, [currentQuestion.id]: current.filter(v => !v.startsWith("Other:")) }));
                              } else {
                                setAnswers(prev => ({ ...prev, [currentQuestion.id]: [...current, otherVal] }));
                              }
                            }}
                          />
                          <span className="text-sm font-medium">Other:</span>
                          <Input
                            value={otherValues[currentQuestion.id] || ""}
                            onChange={e => {
                              const newVal = e.target.value;
                              setOtherValues(prev => ({ ...prev, [currentQuestion.id]: newVal }));
                              const current = (answers[currentQuestion.id] as string[]) || [];
                              const filtered = current.filter(v => !v.startsWith("Other:"));
                              if (current.some(v => v.startsWith("Other:"))) {
                                setAnswers(prev => ({ ...prev, [currentQuestion.id]: [...filtered, `Other: ${newVal}`] }));
                              }
                            }}
                            className="h-8 text-sm border-0 border-b border-muted rounded-none px-1 flex-1 focus-visible:ring-0"
                            placeholder="Please specify..."
                          />
                        </label>
                      )}
                    </div>
                  )}
                </div>

                {/* Navigation */}
                <div className="flex items-center justify-between pt-4">
                  <Button variant="ghost" onClick={goBack} className="gap-1.5 text-muted-foreground">
                    <ArrowLeft className="h-4 w-4" /> Back
                  </Button>
                  <div className="flex items-center gap-3">
                    {currentQuestion.type !== "radio" && (
                      <span className="text-xs text-muted-foreground hidden sm:block">
                        Press <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">Enter ↵</kbd>
                      </span>
                    )}
                    <Button onClick={goNext} disabled={!isCurrentValid()} className="gap-1.5 px-6 rounded-xl">
                      {currentIndex === questions.length - 1 ? "Submit" : "Next"}
                      {currentIndex === questions.length - 1 ? <Check className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Thank You Screen */}
            {step === "thanks" && (
              <motion.div
                key="thanks"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
                className="text-center space-y-6"
              >
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-4">
                  <Check className="h-10 w-10 text-primary" />
                </div>
                <h1 className="text-3xl md:text-4xl font-bold text-foreground">
                  Thank you! We're on it. 🎉
                </h1>
                <p className="text-lg text-muted-foreground max-w-lg mx-auto leading-relaxed">
                  Our team will review your responses and configure your Allocation Assist dashboard. Expect to hear from us within 48 hours.
                </p>
                <Button size="lg" className="px-8 py-6 text-base rounded-xl shadow-lg" asChild>
                  <a href="https://www.allocationassist.com" target="_blank" rel="noopener noreferrer">
                    Visit allocationassist.com
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </a>
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
