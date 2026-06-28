/**
 * Shared preview/sample tokens for rendering email templates outside a real
 * send (template editor, the per-send TemplatePicker, and the Feature Lab).
 * Single source of truth so every "what would this look like" surface renders
 * the same sample email. PREVIEW-ONLY — send-flow-email mints the real tokens
 * (profile_url, signature, etc.) at send time.
 */

const PREVIEW_LOGO_URL = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/email-assets/logo.png`;
const PREVIEW_SANS = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`;

export const PREVIEW_SIGNATURE_HTML = `
<p style="margin:24px 0 0;font-family:${PREVIEW_SANS};font-size:14px;color:#1a2332;line-height:1.5;">&nbsp;</p>
<p style="color:#14b8a6;font-weight:700;font-size:14px;margin:0 0 2px;line-height:1.45;font-family:${PREVIEW_SANS};">Warmest Regards,</p>
<p style="color:#14b8a6;font-weight:700;font-size:14px;margin:0 0 2px;line-height:1.45;font-family:${PREVIEW_SANS};">The Allocation Assist team</p>
<p style="color:#475569;font-size:13px;margin:6px 0 2px;line-height:1.45;font-family:${PREVIEW_SANS};"><span style="color:#14b8a6;">&#x1F4CD;</span> Jumeirah Lakes Towers, Dubai, UAE</p>
<p style="font-size:13px;margin:2px 0 16px;line-height:1.45;font-family:${PREVIEW_SANS};"><a href="https://www.allocationassist.com" style="color:#1d4ed8;text-decoration:underline;">www.allocationassist.com</a></p>
<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 0;">
  <tr><td style="padding:0;">
    <img src="${PREVIEW_LOGO_URL}" alt="Allocation Assist — The source of workforce" width="180" height="119" style="display:block;border:0;outline:none;max-width:180px;width:180px;height:auto;" />
  </td></tr>
</table>`;

export const PREVIEW_SIGNATURE_TEXT = `

Warmest Regards,
The Allocation Assist team

Jumeirah Lakes Towers, Dubai, UAE
www.allocationassist.com

`;

/** Realistic token values so previews read like a genuine send. */
export const SAMPLE_VARS: Record<string, string> = {
  doctor_name:             "Dr. Mónica Costeira",
  doctor_speciality:       "Paediatrics",
  doctor_specialty:        "Paediatrics",
  doctor_title:            "Consultant Paediatrician",
  doctor_subspecialty:     "General & Emergency Paediatrics",
  doctor_bio:              "Portuguese Board-certified Consultant Paediatrician with 12+ years of clinical experience, a Specialist Degree in Paediatrics (with distinction), and international humanitarian deployments with Médecins Sans Frontières.",
  doctor_area_of_interest: "Emergency Paediatrics, Neonatology, Public Health",
  doctor_country_training: "Portugal (Portuguese Board)",
  doctor_years_experience: "12",
  doctor_nationality:      "Portuguese",
  doctor_age:              "39",
  doctor_marital_status:   "Married",
  doctor_family_status:    "Married, 2 children",
  doctor_license:          "DHA — eligible",
  doctor_salary_expectation: "AED 55,000 / month",
  doctor_notice_period:    "1 month",
  doctor_languages:        "Portuguese, English (C1), French, Spanish",
  doctor_english_level:    "Fluent",
  doctor_current_location: "Vila Nova de Gaia, Portugal",
  doctor_email:            "monica.costeira@example.com",
  doctor_phone:            "+351 912 759 750",
  hospital_name:           "American Hospital Dubai",
  hospital_contact_name:   "Hassan",
  city:                    "Dubai",
  country:                 "UAE",
  form_link:               "https://allocationassist.com/forms/abc123",
  upload_link:             "https://allocationassist.com/upload-cv/abc123",
  profile_link:            "https://allocationassist.com/shared-profile/monica-costeira",
  profile_url:             "https://allocationassist.com/shared-profile/monica-costeira",
  guide_link:              "https://allocationassist.com/guides/dubai.pdf",
  guide_label:             "Relocating to Dubai",
  payment_link:            "https://allocationassist.com/pay/xyz789",
  amount:                  "AED 10,500",
  due_date:                "July 30, 2026",
  days_overdue:            "12",
  interview_datetime:      "July 23, 2026 · 14:00 GST",
  interview_format:        "Microsoft Teams",
  joining_date:            "September 1, 2026",
  signature:               PREVIEW_SIGNATURE_HTML,
  signature_text:          PREVIEW_SIGNATURE_TEXT,
};

/** A self-contained sample hospital-intro email body for the Feature Lab so the
 *  editor toolbar (table insert, full-screen, rich text) has real content to
 *  work on without any data setup. Inline-styled like a real send. */
export const SAMPLE_HOSPITAL_EMAIL_HTML = `
<p style="margin:0 0 14px;">Dear ${SAMPLE_VARS.hospital_contact_name},</p>
<p style="margin:0 0 14px;">I'd like to introduce <strong>${SAMPLE_VARS.doctor_name}</strong>, a ${SAMPLE_VARS.doctor_title} we believe is an excellent fit for ${SAMPLE_VARS.hospital_name} in ${SAMPLE_VARS.city}.</p>
<p style="margin:0 0 14px;">${SAMPLE_VARS.doctor_bio}</p>
<ul style="margin:0 0 14px;padding-left:20px;">
  <li style="margin:4px 0;"><strong>Specialty:</strong> ${SAMPLE_VARS.doctor_specialty}</li>
  <li style="margin:4px 0;"><strong>Experience:</strong> ${SAMPLE_VARS.doctor_years_experience} years</li>
  <li style="margin:4px 0;"><strong>Nationality:</strong> ${SAMPLE_VARS.doctor_nationality}</li>
  <li style="margin:4px 0;"><strong>License:</strong> ${SAMPLE_VARS.doctor_license}</li>
</ul>
<p style="margin:0 0 14px;">You can view the full profile here: <a href="${SAMPLE_VARS.profile_url}" style="color:#14b8a6;">${SAMPLE_VARS.doctor_name}'s profile</a>.</p>
${PREVIEW_SIGNATURE_HTML}`;

export const SAMPLE_DOCTOR_EMAIL_HTML = `
<p style="margin:0 0 14px;">Dear ${SAMPLE_VARS.doctor_name},</p>
<p style="margin:0 0 14px;">Great news — your profile has been shared with <strong>${SAMPLE_VARS.hospital_name}</strong> for a working opportunity in ${SAMPLE_VARS.city}, ${SAMPLE_VARS.country}.</p>
<p style="margin:0 0 14px;">We'll be in touch as soon as we hear back. In the meantime, please make sure your documents are up to date.</p>
${PREVIEW_SIGNATURE_HTML}`;
