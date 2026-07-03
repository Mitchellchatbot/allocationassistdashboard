/**
 * Single source of truth for how an email BODY is rendered in every preview
 * surface, so what the team sees on-screen is byte-for-byte what the recipient
 * gets in Gmail.
 *
 * The server (supabase/functions/send-flow-email + send-batch) ships the body
 * wrapped in this exact shell:
 *
 *   <style>@import Poppins…</style>
 *   <div style="font-family:{FONT_STACK};font-size:17px;color:#1a2332;line-height:1.55;">
 *     …rendered body…
 *   </div>
 *
 * so the message renders in Garamond (serif), 17px, #1a2332, line-height 1.55.
 * Links, tables, images and anything the body doesn't style fall back to the
 * same defaults a mail client applies. Keep FONT_STACK / FONT_IMPORT / the size
 * + colour + line-height IN SYNC with:
 *   supabase/functions/send-flow-email/index.ts  (FONT_STACK / FONT_IMPORT, ~L164/746)
 *   supabase/functions/send-batch/index.ts
 *
 * Previews render this shell inside a sandboxed <iframe> (see <EmailFrame/>) so
 * the dashboard's own CSS can't leak in and repaint the email — the #1 reason
 * the old previews looked nothing like the delivered mail.
 */

/** Body font stack the server sends with — Garamond serif with graceful
 *  fallbacks. Web-font-less (Garamond is an OS font); the recipient's client
 *  resolves it exactly as this iframe will. */
export const EMAIL_FONT_STACK =
  "Garamond, 'EB Garamond', Georgia, 'Times New Roman', serif";

/** The Poppins @import the server prepends (used by the doctor card blocks
 *  whose inline font-family is Poppins). Harmless for plain bodies. */
export const EMAIL_FONT_IMPORT =
  `<style>@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');</style>`;

/** Body text metrics of the send shell — reused for the contentEditable
 *  surfaces (which can't be an iframe) so the in-place editor matches too. */
export const EMAIL_BODY_STYLE: {
  fontFamily: string; fontSize: string; color: string; lineHeight: string; background: string;
} = {
  fontFamily: EMAIL_FONT_STACK,
  fontSize:   "17px",
  color:      "#1a2332",
  lineHeight: "1.55",
  background: "#ffffff",
};

/** Child-element rules that mirror the iframe's base CSS, for contentEditable
 *  surfaces. Link colour (#1155cc — a mail client's default for un-styled
 *  links; the body's own inline colours still win) and constrained images.
 *
 *  Deliberately NO table width/layout overrides. Wide data tables (e.g. the
 *  doctor row table) are authored at their natural width with `white-space:
 *  nowrap` headers, wrapped in their own `overflow-x:auto` div — exactly how
 *  Gmail renders them (natural columns + a horizontal scrollbar). Forcing
 *  `w-full` + `table-fixed` here used to crush every column to equal widths, so
 *  the nowrap headers overflowed and overlapped. Letting the table keep its
 *  true width lets its wrapper scroll, matching the delivered mail 1:1. The
 *  outer preview panes are min-w-0 + overflow-auto, so nothing stretches the
 *  dialog. */
export const EMAIL_EDITOR_CHILD_CLASS =
  "[&_a]:[color:#1155cc] [&_a:hover]:underline " +
  "[&_img]:max-w-full [&_img]:h-auto [&_table]:border-collapse";

/**
 * The exact server send shell around a rendered body. Use for the SEND payload
 * (html_override) so an edited body ships identically to a template-rendered
 * one. Preview rendering uses buildEmailPreviewDoc, which applies the same
 * metrics via CSS, so you do NOT need to wrap before previewing.
 */
export function wrapBodyForSend(bodyHtml: string): string {
  return `${EMAIL_FONT_IMPORT}<div style="font-family:${EMAIL_FONT_STACK};font-size:${EMAIL_BODY_STYLE.fontSize};color:${EMAIL_BODY_STYLE.color};line-height:${EMAIL_BODY_STYLE.lineHeight};">${bodyHtml}</div>`;
}

/** Base stylesheet for the preview iframe — replicates the send shell's body
 *  metrics + a mail client's defaults for links/images/tables. The email's own
 *  inline styles always win over these, exactly as in Gmail. */
export const EMAIL_PREVIEW_CSS = `
  html,body{margin:0;padding:0;}
  body{
    font-family:${EMAIL_FONT_STACK};
    font-size:17px;
    color:#1a2332;
    line-height:1.55;
    background:#ffffff;
    padding:16px;
    /* overflow-wrap (not word-break:break-word) so long tokens/URLs still wrap
       when they'd overflow, but white-space:nowrap headers are NOT broken —
       that legacy value was crushing wide data tables (nowrap headers wrapped),
       so their overflow-x:auto wrapper never got the chance to scroll. */
    overflow-wrap:break-word;
  }
  a{color:#1155cc;}
  img{max-width:100%;height:auto;}
  /* No max-width on tables: wide data tables are authored at their natural
     width inside their own overflow-x:auto wrapper (nowrap headers), so they
     scroll horizontally exactly like Gmail instead of being crushed to fit. */
  table{border-collapse:collapse;}
`;

/**
 * Full sandboxed document for a preview iframe: the send shell metrics as CSS
 * + the (optionally image-stripped) body. Same output every surface renders,
 * so previews are consistent and match the delivered mail.
 */
export function buildEmailPreviewDoc(
  bodyHtml: string,
  opts: { showImages?: boolean } = {},
): string {
  const showImages = opts.showImages !== false;
  const body = showImages
    ? bodyHtml
    : bodyHtml.replace(/<img\b[^>]*>/gi, '<span style="color:#94a3b8;font-style:italic;">[image hidden]</span>');
  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<link rel="preconnect" href="https://fonts.googleapis.com">` +
    `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` +
    `<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">` +
    `<style>${EMAIL_PREVIEW_CSS}</style></head>` +
    `<body>${body}</body></html>`
  );
}
