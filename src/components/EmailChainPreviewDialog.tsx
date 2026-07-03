import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowRight } from "lucide-react";
import { EmailPreview } from "@/components/EmailPreview";
import { FullScreenEmailPreview } from "@/components/FullScreenEmailPreview";
import { EmailPreviewStudio, type StudioEmail } from "@/components/EmailPreviewStudio";
import { useEmailTemplates, renderTemplate, type EmailTemplate } from "@/hooks/use-email-templates";
import type { StagedProfile } from "@/hooks/use-wp-candidates";
import { cn } from "@/lib/utils";

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

const RECIPIENT_BADGE: Record<ChainEntry["recipient"], string> = {
  hospital: "bg-blue-50 text-blue-700 border-blue-200",
  doctor:   "bg-emerald-50 text-emerald-700 border-emerald-200",
  team:     "bg-slate-100 text-slate-600 border-slate-200",
};

export function EmailChainPreviewDialog({
  profile, open, onOpenChange,
}: {
  profile: StagedProfile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: templates = [], isLoading } = useEmailTemplates();
  const [active, setActive] = useState<string>(CHAIN[0].steps[0].templateKey);

  const byKey = useMemo(() => {
    const m = new Map<string, EmailTemplate>();
    for (const t of templates) m.set(t.key, t);
    return m;
  }, [templates]);

  const vars = useMemo(() => buildChainVars(profile), [profile]);
  const totalEmails = CHAIN.reduce((s, g) => s + g.steps.length, 0);

  // Every lifecycle email, flattened → one entry per StudioEmail. The preview is
  // read-only, so only the ACTIVE one mounts (mountActiveOnly) — no 14 iframes.
  const emails: StudioEmail[] = useMemo(
    () => CHAIN.flatMap(group =>
      group.steps.map(step => ({
        key:      step.templateKey,
        label:    step.label,
        subLabel: `${group.title} · ${step.recipient}`,
        preview:  <ChainStepPreview step={step} tpl={byKey.get(step.templateKey)} vars={vars} loading={isLoading} />,
      })),
    ),
    [byKey, vars, isLoading],
  );

  // Left rail: the chain as a grouped, clickable list (our own nav, so the
  // studio's built-in switcher is hidden).
  const nav = (
    <div className="space-y-3">
      <p className="px-1 text-[11px] text-muted-foreground">
        {totalEmails} emails across {CHAIN.length} flows, rendered with this doctor's data. Tokens use a placeholder hospital — the real send swaps in the actual one.
      </p>
      {CHAIN.map((group, gi) => (
        <div key={group.flowKey}>
          <div className="mb-1 flex items-center gap-1.5 px-1 text-[10.5px] uppercase tracking-wider text-slate-400">
            <span className="text-[13px]">{group.emoji}</span>
            <span className="font-semibold">{gi + 1}. {group.title}</span>
            <span className="ml-auto tabular-nums">{group.steps.length}</span>
          </div>
          <div className="space-y-0.5">
            {group.steps.map((step, si) => {
              const isActive = active === step.templateKey;
              return (
                <button
                  key={step.templateKey}
                  type="button"
                  onClick={() => setActive(step.templateKey)}
                  className={cn(
                    "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors",
                    isActive ? "bg-teal-50 text-teal-800 ring-1 ring-teal-200" : "text-slate-600 hover:bg-slate-100",
                  )}
                >
                  <span className="font-mono text-[9.5px] text-slate-400">#{si + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{step.label}</span>
                  <span className={cn("shrink-0 rounded border px-1 py-px text-[8.5px] font-medium uppercase tracking-wide", RECIPIENT_BADGE[step.recipient])}>{step.recipient}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <EmailPreviewStudio
      open={open}
      onClose={() => onOpenChange(false)}
      title={`Email chain — ${profile.full_name ?? profile.email ?? "this doctor"}`}
      subtitle={`${totalEmails} emails · ${CHAIN.length} flows`}
      emails={emails}
      activeKey={active}
      onActiveKeyChange={setActive}
      headerExtra={nav}
      hideSwitcher
      mountActiveOnly
    />
  );
}

/** One chain email in the studio's right pane — read-only render + full-screen
 *  expand. Fills the pane; its own body scrolls. */
function ChainStepPreview({
  step, tpl, vars, loading,
}: {
  step:    ChainEntry;
  tpl?:    EmailTemplate;
  vars:    Record<string, string>;
  loading: boolean;
}) {
  const [fs, setFs] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-0 w-full flex-1 items-center justify-center text-[12px] text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading templates…
      </div>
    );
  }
  if (!tpl) {
    return (
      <div className="flex min-h-0 w-full flex-1 items-center justify-center">
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
          Template not found: <code>{step.templateKey}</code>
        </div>
      </div>
    );
  }

  const subject = renderTemplate(tpl.subject ?? "", vars);
  const html    = renderTemplate(tpl.body_html ?? "", vars, { html: true });
  const text    = renderTemplate(tpl.body_text ?? "", vars);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div className="mb-2 flex shrink-0 items-center gap-2">
        <span className="text-[12.5px] font-medium text-slate-800">{step.label}</span>
        <ArrowRight className="h-3 w-3 text-slate-400" />
        <Badge variant="outline" className={`text-[9.5px] ${RECIPIENT_BADGE[step.recipient]}`}>{step.recipient}</Badge>
        {step.trigger && <span className="ml-auto truncate text-[10.5px] text-muted-foreground">{step.trigger}</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-md">
        <EmailPreview
          subject={subject}
          html={html}
          text={text}
          templateKey={step.templateKey}
          attachments={step.attachments}
          onExpand={() => setFs(true)}
        />
      </div>
      <FullScreenEmailPreview open={fs} onClose={() => setFs(false)} subject={subject} html={html} text={text} attachments={step.attachments} />
    </div>
  );
}
