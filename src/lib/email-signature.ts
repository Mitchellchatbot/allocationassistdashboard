// Preview-side mirror of the server's signatureHtml() in
// supabase/functions/send-flow-email/index.ts. Kept in sync so the dashboard
// preview (personalized composer AND the Mail → Scheduled reader) shows the
// same Garamond signature + logo block the recipient will see, rather than a
// literal `{{signature}}` token. When the server-side signature changes, update
// both. Extracted to a shared lib so every client renderer stays in lockstep.

const PREVIEW_LOGO_URL = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/email-assets/logo.png`;
// Mirrors the server's FONT_STACK (Garamond) + bumped sizes so the preview
// reads exactly like the sent email. Keep in sync with send-flow-email.
const PREVIEW_FONT = `Garamond, 'EB Garamond', Georgia, 'Times New Roman', serif`;

export interface PreviewSender { first: string; last: string; title: string; phone: string; }

// Per-sender signature (feedback #5: "selecting the sender should insert their
// signature"). MIRRORS the SENDERS registry + signatureHtml/signatureText in
// supabase/functions/send-flow-email/index.ts — keep in lockstep.
export const PREVIEW_SENDERS: Record<string, PreviewSender> = {
  "rodaina@allocationassist.com":        { first: "Rodaina", last: "Thabit",  title: "Hospital Introduction Officer", phone: "" },
  "mohamed.othman@allocationassist.com": { first: "Mohamed", last: "Othman",  title: "Hospital Introduction Officer", phone: "" },
  "sohaila@allocationassist.com":        { first: "Sohaila", last: "Mohamed", title: "Hospital Introduction Officer", phone: "" },
  "ishak@allocationassist.com":          { first: "Ishak",   last: "Boulaat", title: "Hospital Introduction Officer", phone: "" },
  "ammar@allocationassist.com":          { first: "Ammar",   last: "",        title: "Founder",                       phone: "" },
  // Generic company sender — signs off as the team (server: hello@ → team).
  "hello@allocationassist.com":          { first: "The Allocation Assist", last: "team", title: "", phone: "" },
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Resolve a sender email → signature name/title/phone. Unknown/empty falls
 *  back to the generic Allocation Assist team, matching server pickSender(). */
export function previewSenderProfile(email: string | null | undefined): PreviewSender {
  const key = (email ?? "").trim().toLowerCase();
  return PREVIEW_SENDERS[key] ?? { first: "The Allocation Assist", last: "team", title: "", phone: "" };
}

export function previewSignatureHtml(first: string, last: string, title: string, phone: string): string {
  const fullName = [first, last].filter(Boolean).join(" ") || "Allocation Assist";
  const teal     = `color:#14b8a6;font-weight:700;font-size:16px;margin:0 0 2px;line-height:1.45;font-family:${PREVIEW_FONT};`;
  const grey     = `color:#475569;font-size:15px;margin:6px 0 2px;line-height:1.45;font-family:${PREVIEW_FONT};`;
  const linkLine = `font-size:15px;margin:2px 0 16px;line-height:1.45;font-family:${PREVIEW_FONT};`;
  return `
<p style="margin:14px 0 0;font-family:${PREVIEW_FONT};font-size:16px;color:#1a2332;line-height:1.45;">&nbsp;</p>
<p style="${teal}">Warmest Regards,</p>
<p style="${teal}">${esc(fullName)}</p>
${title ? `<p style="${teal}">${esc(title)}</p>` : ""}
${phone ? `<p style="${teal}">${esc(phone)}</p>` : ""}
<p style="${grey}"><span style="color:#14b8a6;">&#x1F4CD;</span> Jumeirah Lakes Towers, Dubai, UAE</p>
<p style="${linkLine}"><a href="https://www.allocationassist.com" style="color:#1d4ed8;text-decoration:underline;">www.allocationassist.com</a></p>
<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 0;">
  <tr>
    <td style="padding:0;">
      <img src="${PREVIEW_LOGO_URL}" alt="Allocation Assist — The source of workforce" width="180" height="119" style="display:block;border:0;outline:none;max-width:180px;width:180px;height:auto;" />
    </td>
  </tr>
</table>`;
}

export function previewSignatureText(first: string, last: string, title: string, phone: string): string {
  const fullName = [first, last].filter(Boolean).join(" ") || "Allocation Assist";
  return ["", "", "Warmest Regards,", fullName, title || "", phone || "",
    "Jumeirah Lakes Towers, Dubai, UAE", "www.allocationassist.com", "", ""].join("\n");
}

/** Sender-aware signature for a From email — used by the preview AND the
 *  verbatim html_override so the sign-off matches the picked sender. */
export function previewSignatureHtmlFor(email: string | null | undefined): string {
  const p = previewSenderProfile(email);
  return previewSignatureHtml(p.first, p.last, p.title, p.phone);
}
export function previewSignatureTextFor(email: string | null | undefined): string {
  const p = previewSenderProfile(email);
  return previewSignatureText(p.first, p.last, p.title, p.phone);
}

// Generic team default — used by the step 1/2 wizard preview (before a sender
// is picked) and anywhere a specific sender isn't in scope.
export const PREVIEW_SIGNATURE_HTML = previewSignatureHtmlFor(null);
export const PREVIEW_SIGNATURE_TEXT = previewSignatureTextFor(null);
