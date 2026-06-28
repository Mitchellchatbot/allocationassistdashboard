import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronDown, ChevronRight, Mail, ArrowRight } from "lucide-react";
import { EmailPreview } from "@/components/EmailPreview";
import { FullScreenEmailPreview } from "@/components/FullScreenEmailPreview";
import { useEmailTemplates, renderTemplate, type EmailTemplate } from "@/hooks/use-email-templates";
import type { StagedProfile } from "@/hooks/use-wp-candidates";

/**
 * Preview every email in the doctor's flow chain, rendered against
 * the actual staged-profile data (so the team can see what the
 * hospital + the doctor will actually receive, end-to-end, before
 * anything goes out). Mirrors the STAGE_ROUTES order in
 * supabase/functions/send-flow-email/index.ts.
 *
 * Grouped by flow (Profile Sent → Shortlist → Interview → Contract
 * Check-in → Relocation → Second Payment) with each entry collapsible.
 * The default-expanded section is whichever flow the caller is most
 * likely about to send (passed via initialFlowKey), fallback to
 * profile_sent since that's the demo's centerpiece.
 */

interface ChainEntry {
  templateKey: string;
  label:       string;
  recipient:   "hospital" | "doctor" | "team";
  /** Optional description for the step header — when does this fire. */
  trigger?:    string;
  /** Filenames this email attaches (shown as chips in the preview). */
  attachments?: string[];
}

interface ChainGroup {
  flowKey: string;
  title:   string;
  emoji:   string;
  steps:   ChainEntry[];
}

const CHAIN: ChainGroup[] = [
  {
    flowKey: "profile_sent",
    title:   "Profile Sent",
    emoji:   "📤",
    steps: [
      { templateKey: "profile_sent_hospital", label: "Profile → hospital", recipient: "hospital", trigger: "Fires when you click Publish and dispatch the intro." },
      { templateKey: "profile_sent_doctor",   label: "Heads-up → doctor",  recipient: "doctor",   trigger: "Fires automatically right after the hospital email." },
    ],
  },
  {
    flowKey: "shortlist",
    title:   "Shortlist",
    emoji:   "✅",
    steps: [
      { templateKey: "shortlist_confirmation", label: "Shortlist confirmation → doctor", recipient: "doctor", trigger: "Fires when the hospital responds Yes." },
    ],
  },
  {
    flowKey: "interview",
    title:   "Interview",
    emoji:   "🗓️",
    steps: [
      { templateKey: "interview_tips_confirmation", label: "Interview tips → doctor", recipient: "doctor", trigger: "Fires when the hospital proposes interview times." },
    ],
  },
  {
    flowKey: "contract_signing",
    title:   "Contract Check-in",
    emoji:   "📄",
    steps: [
      { templateKey: "contract_checkin_doctor",   label: "Congrats → doctor",        recipient: "doctor",   trigger: "Fires when the offer is extended." },
      { templateKey: "contract_checkin_hospital", label: "Follow up → hospital",     recipient: "hospital", trigger: "Fires right after — keeps the hospital looped in." },
      { templateKey: "contract_checkin_reminder", label: "Reminder → doctor",        recipient: "doctor",   trigger: "Fires if the contract isn't signed in 3 days." },
    ],
  },
  {
    flowKey: "relocation",
    title:   "Relocation",
    emoji:   "✈️",
    steps: [
      { templateKey: "relocation_guide",        label: "Relocation guide → doctor", recipient: "doctor", trigger: "Fires once the contract is signed.",
        // Placeholder pack for the preview — the real send attaches the shared
        // _default guides + the doctor's city guide from the relocation-guides
        // bucket (here, the Dubai set, since the sample hospital is in Dubai).
        attachments: [
          "Dubai Relocation Guide.pdf",
          "British Curriculum Schools.pdf",
          "Dubai Schools Information.pdf",
          "IB & European Curriculum Schools.pdf",
          "US Curriculum Schools.pdf",
          "Property Rental Prices.pdf",
          "Useful Apps & Websites.pdf",
        ] },
      { templateKey: "relocation_attestation",  label: "Attestation info → doctor", recipient: "doctor", trigger: "Fires right after the relocation guide." },
    ],
  },
  {
    flowKey: "second_payment",
    title:   "Second Payment",
    emoji:   "💳",
    steps: [
      { templateKey: "second_payment_invoice",         label: "Invoice → doctor",          recipient: "doctor", trigger: "Fires when the joining date is logged." },
      { templateKey: "second_payment_reminder_25",     label: "25-day reminder → doctor",  recipient: "doctor", trigger: "Fires 25 working days after the invoice." },
      { templateKey: "second_payment_reminder_due",    label: "Overdue reminder → doctor", recipient: "doctor", trigger: "Fires once the due date passes." },
      { templateKey: "second_payment_reminder_weekly", label: "Weekly nudge → doctor",     recipient: "doctor", trigger: "Fires weekly until paid." },
    ],
  },
];

/** Build the SAMPLE_VARS for rendering, using the staged-profile data
 *  for every doctor-side field. Plumbs the same logo + signature mirror
 *  as the EmailTemplatesTab preview so the chain reads identically to
 *  what the recipient will see. */
function buildChainVars(profile: StagedProfile): Record<string, string> {
  const acf = (profile.acf ?? {}) as Record<string, unknown>;
  const cv  = (profile.extracted_cv_data ?? {}) as Record<string, unknown>;
  const v = (k: string): string => {
    const x = acf[k];
    return (x === null || x === undefined) ? "" : typeof x === "string" ? x : String(x);
  };
  const cvv = (k: string): string => {
    const x = cv[k];
    return (x === null || x === undefined) ? "" : typeof x === "string" ? x : Array.isArray(x) ? String(x.length) + " entries" : String(x);
  };

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const PREVIEW_SANS = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`;
  const PREVIEW_LOGO  = `${supabaseUrl}/storage/v1/object/public/email-assets/logo.png`;
  const SIGNATURE_HTML = `
<p style="margin:24px 0 0;font-family:${PREVIEW_SANS};font-size:14px;color:#1a2332;line-height:1.5;">&nbsp;</p>
<p style="color:#14b8a6;font-weight:700;font-size:14px;margin:0 0 2px;line-height:1.45;font-family:${PREVIEW_SANS};">Warmest Regards,</p>
<p style="color:#14b8a6;font-weight:700;font-size:14px;margin:0 0 2px;line-height:1.45;font-family:${PREVIEW_SANS};">The Allocation Assist team</p>
<p style="color:#475569;font-size:13px;margin:6px 0 2px;line-height:1.45;font-family:${PREVIEW_SANS};"><span style="color:#14b8a6;">&#x1F4CD;</span> Jumeirah Lakes Towers, Dubai, UAE</p>
<p style="font-size:13px;margin:2px 0 16px;line-height:1.45;font-family:${PREVIEW_SANS};"><a href="https://www.allocationassist.com" style="color:#1d4ed8;text-decoration:underline;">www.allocationassist.com</a></p>
<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 0;">
  <tr><td style="padding:0;"><img src="${PREVIEW_LOGO}" alt="Allocation Assist — The source of workforce" width="180" height="119" style="display:block;border:0;outline:none;max-width:180px;width:180px;height:auto;" /></td></tr>
</table>`;
  const SIGNATURE_TEXT = `
Warmest Regards,
The Allocation Assist team

Jumeirah Lakes Towers, Dubai, UAE
www.allocationassist.com

`;

  return {
    doctor_name:        profile.full_name ?? v("full_name") ?? "",
    doctor_email:       profile.email     ?? v("email")     ?? "",
    doctor_phone:       profile.phone     ?? v("phone_number") ?? "",
    doctor_title:                                              v("job_title") || cvv("title"),
    doctor_bio:                                                v("bio")       || cvv("bio"),
    doctor_area_of_interest:                                   v("specific_areas_of_interests_within_the_specialization") || cvv("area_of_interest"),
    doctor_country_training:                                   v("country_of_training") || cvv("country_training"),
    doctor_years_experience:                                   v("years_of_experience_post_specialization"),
    doctor_nationality:                                        v("nationality"),
    doctor_age:                                                v("age"),
    doctor_marital_status:                                     v("marital_status"),
    doctor_family_status:                                      v("family_status"),
    doctor_license:                                            v("dha__haad__moh_license"),
    doctor_salary_expectation:                                 v("expected_salary"),
    doctor_notice_period:                                      v("notice_period"),
    doctor_specialty:                                          v("specialty") || profile.specialty || "",
    doctor_subspecialty:                                       v("subspecialty"),
    doctor_languages:                                          v("languages"),
    doctor_english_level:                                      v("english_level"),
    doctor_current_location:                                   v("current_location"),
    // Hospital placeholder so chain reads naturally; team can override
    // these in the actual SendProfileDialog at send time.
    hospital_name:         "American Hospital Dubai",
    hospital_contact_name: "Hassan",
    city:                  "Dubai",
    country:               "UAE",
    // Placeholders for later-flow tokens.
    form_link:             "https://allocationassist.com/forms/xyz",
    upload_link:           "https://allocationassist.com/upload-cv/xyz",
    payment_link:          "https://allocationassist.com/pay/xyz",
    amount:                "AED 21,000",
    invoice_number:        "INV-2026-1042",
    due_date:              "30 June 2026",
    days_overdue:          "12",
    interview_datetime:    "23 June 2026 · 14:00 GST",
    interview_format:      "Microsoft Teams",
    interview_link:        "https://teams.microsoft.com/l/meetup-join/xyz",
    guide_link:            "https://allocationassist.com/guides/dubai.pdf",
    guide_label:           "Relocating to Dubai",
    joining_date:          "1 August 2026",
    signature:             SIGNATURE_HTML,
    signature_text:        SIGNATURE_TEXT,
    // Real sends render {{logo_header}} as "" (the brand lives in the
    // signature at the bottom). Mirror that here so the preview doesn't show
    // a literal "{{logo_header}}" at the top of every plain template.
    logo_header:           "",
  };
}

export function EmailChainPreviewDialog({
  profile, open, onOpenChange,
}: {
  profile: StagedProfile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: templates = [], isLoading } = useEmailTemplates();
  const [openFlowKey, setOpenFlowKey] = useState<string>("profile_sent");

  const byKey = useMemo(() => {
    const m = new Map<string, EmailTemplate>();
    for (const t of templates) m.set(t.key, t);
    return m;
  }, [templates]);

  const vars = useMemo(() => buildChainVars(profile), [profile]);

  const totalEmails = CHAIN.reduce((s, g) => s + g.steps.length, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName="bg-slate-900/40 backdrop-blur-[2px]" className="max-w-[1100px] w-[96vw] max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="px-7 pt-5 pb-3 border-b">
          <DialogTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4 text-teal-600" />
            Full email chain for {profile.full_name ?? profile.email ?? "this doctor"}
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            Every email that fires across the lifecycle, rendered with this doctor's data. {totalEmails} emails in {CHAIN.length} flows. Tokens use a placeholder hospital — actual send swaps in the real one.
          </DialogDescription>
        </DialogHeader>

        <div className="px-7 py-4 space-y-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground py-8">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading templates…
            </div>
          ) : CHAIN.map((group, gi) => (
            <ChainGroupSection
              key={group.flowKey}
              group={group}
              index={gi}
              isOpen={openFlowKey === group.flowKey}
              onToggle={() => setOpenFlowKey(k => k === group.flowKey ? "" : group.flowKey)}
              byKey={byKey}
              vars={vars}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChainGroupSection({
  group, index, isOpen, onToggle, byKey, vars,
}: {
  group:    ChainGroup;
  index:    number;
  isOpen:   boolean;
  onToggle: () => void;
  byKey:    Map<string, EmailTemplate>;
  vars:     Record<string, string>;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/40 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-100/60 transition-colors"
      >
        {isOpen ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
        <span className="text-[18px]">{group.emoji}</span>
        <div className="flex-1 text-left">
          <div className="text-[13px] font-semibold text-slate-800">
            <span className="text-slate-400 mr-1.5">{index + 1}.</span>
            {group.title}
          </div>
          <div className="text-[10.5px] text-muted-foreground">{group.steps.length} email{group.steps.length === 1 ? "" : "s"}</div>
        </div>
        <Badge variant="outline" className="text-[10px] bg-white border-slate-200">flow: {group.flowKey}</Badge>
      </button>
      {isOpen && (
        <div className="px-4 pb-4 space-y-3">
          {group.steps.map((step, si) => (
            <ChainStep key={step.templateKey} step={step} index={si} byKey={byKey} vars={vars} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChainStep({
  step, index, byKey, vars,
}: {
  step:  ChainEntry;
  index: number;
  byKey: Map<string, EmailTemplate>;
  vars:  Record<string, string>;
}) {
  const tpl = byKey.get(step.templateKey);
  const [fs, setFs] = useState(false);

  if (!tpl) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
        Template not found: <code>{step.templateKey}</code>
      </div>
    );
  }

  const subject = renderTemplate(tpl.subject ?? "", vars);
  const html    = renderTemplate(tpl.body_html ?? "", vars, { html: true });
  const text    = renderTemplate(tpl.body_text ?? "", vars);

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10.5px] font-mono text-slate-400">#{index + 1}</span>
        <span className="text-[12.5px] font-medium text-slate-800">{step.label}</span>
        <ArrowRight className="h-3 w-3 text-slate-400" />
        <Badge variant="outline" className={`text-[9.5px] ${
          step.recipient === "hospital" ? "bg-blue-50 text-blue-700 border-blue-200" :
          step.recipient === "doctor"   ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                          "bg-slate-100 text-slate-600 border-slate-200"
        }`}>
          {step.recipient}
        </Badge>
        {step.trigger && <span className="text-[10.5px] text-muted-foreground ml-auto">{step.trigger}</span>}
      </div>
      <EmailPreview
        subject={subject}
        html={html}
        text={text}
        templateKey={step.templateKey}
        attachments={step.attachments}
        onExpand={() => setFs(true)}
      />
      <FullScreenEmailPreview open={fs} onClose={() => setFs(false)} subject={subject} html={html} text={text} attachments={step.attachments} />
    </div>
  );
}
