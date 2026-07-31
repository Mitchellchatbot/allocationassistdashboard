/**
 * Turn leftover template tokens ({{doctor_name}}) into friendly placeholder
 * "pills" for PREVIEWS — so an unfilled variable reads like a labelled chip that
 * fills in as the team completes the steps, instead of raw developer syntax.
 *
 * DISPLAY ONLY. Never run this on content that gets sent — the pills are styled
 * spans, not real tokens. Read-only previews (EmailPreview) are safe; the
 * editable send previews keep real tokens so send-flow-email fills them.
 */

// Friendly labels for the tokens we know; anything else is de-snaked + title-cased.
const LABELS: Record<string, string> = {
  doctor_name:           "Doctor's name",
  doctor_speciality:     "Specialty",
  doctor_specialty:      "Specialty",
  doctor_title:          "Doctor's title",
  doctor_bio:            "Doctor bio",
  doctor_nationality:    "Nationality",
  doctor_license:        "License",
  doctor_years_experience: "Years experience",
  doctor_age:            "Age",
  doctor_phone:          "Doctor phone",
  doctor_email:          "Doctor email",
  hospital_name:         "Hospital",
  hospital:              "Hospital",
  hospital_contact_name: "Contact person",
  city:                  "City",
  country:               "Country",
  profile_link:          "Profile link",
  form_link:             "Form link",
  upload_link:           "Upload link",
  amount:                "Amount",
  due_date:              "Due date",
  interview_datetime:    "Interview date/time",
  interview_format:      "Interview format",
  // Structural (raw) tokens the sender fills at send time.
  signature:             "Signature",
  hospital_image:        "Hospital photo",
  doctor_card_html:      "Doctor card",
  doctor_row_table_html: "Doctor details table",
  doctors_table_html:    "Doctors table",
  logo_header:           "Header",
};

function humanize(token: string): string {
  return LABELS[token] ?? token.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// Structural / raw-HTML tokens the SENDER fills at send time (server-side) — a
// leftover one in a preview isn't a mistake, so it keeps the calm blue pill even
// in flag-unfilled mode. Everything else that's still a token in a SEND preview
// is genuinely empty and would ship raw/blank, so it's flagged red.
const STRUCTURAL = new Set([
  "signature", "signature_text", "doctors_table_html", "doctor_card_html",
  "doctor_row_table_html", "logo_header", "hospital_image", "doctor_card_image_url",
]);

const PILL_BLUE = "display:inline-block;background:#eef2ff;color:#4f46e5;border:1px dashed #c7d2fe;border-radius:7px;padding:0 7px;margin:0 1px;font-size:0.85em;font-weight:500;line-height:1.7;white-space:nowrap;vertical-align:baseline;";
const PILL_RED  = "display:inline-block;background:#fee2e2;color:#b91c1c;border:1px solid #f87171;border-radius:6px;padding:0 6px;margin:0 1px;font-size:0.9em;font-weight:600;line-height:1.7;white-space:nowrap;vertical-align:baseline;";

/** Replace `{{token}}` occurrences in already-rendered HTML with a labelled pill.
 *  The `data-ph="token"` marker lets stripPlaceholderPills() turn it back into the
 *  real token before anything is sent, so pills are strictly a display layer.
 *
 *  `flagUnfilled` (SEND previews): a still-unfilled DATA token means it would ship
 *  raw/blank, so render it as a RED `{{token}}` chip that stands out — the team
 *  can spot and fix it before sending. Structural tokens stay blue; the template
 *  editor (default, flag off) keeps every token blue since tokens are the point. */
export function humanizePlaceholders(html: string, opts: { flagUnfilled?: boolean } = {}): string {
  if (!html) return html;
  const flag = !!opts.flagUnfilled;
  return html.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, token: string) => {
    const red = flag && !STRUCTURAL.has(token);
    const style = red ? PILL_RED : PILL_BLUE;
    const inner = red ? `{{${token}}}` : humanize(token);
    const title = red ? ' title="This field is empty — it will send exactly like this unless you fill it"' : "";
    return `<span data-ph="${token}" style="${style}"${title}>${inner}</span>`;
  });
}

/** Reverse of humanizePlaceholders — turn the placeholder pills back into their
 *  `{{token}}` so the SENT content is exactly what it would have been without the
 *  pretty preview. Tolerant of the browser reordering the span's attributes.
 *  MUST run on any editable-preview HTML before it's used as a send override. */
export function stripPlaceholderPills(html: string): string {
  if (!html || !html.includes("data-ph")) return html;
  return html.replace(/<span\b[^>]*\bdata-ph="([a-zA-Z0-9_]+)"[^>]*>[\s\S]*?<\/span>/gi, (_m, token: string) => `{{${token}}}`);
}
