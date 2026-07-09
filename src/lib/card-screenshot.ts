// Turn the doctor profile CARD (the teal photo + facts block that normally
// ships as an HTML <div> in the hospital intro email) into a single flat PNG.
//
// Why: HTML email clients render that card inconsistently (Outlook mangles the
// flex/table layout, dark-mode inverts colours, some strip background colours).
// Sending the card as ONE inline image guarantees the hospital sees it exactly
// as designed — pixel for pixel. The trade-off (accepted by the team): the card
// image is flat, so the "View full profile"/"View CV" buttons inside it stop
// being clickable. The email body's own text links are unaffected.
//
// html2canvas ships transitively (via html2pdf.js, already a direct dep) so we
// import it without adding to package.json — no lockfile churn / deploy risk.
import html2canvas from "html2canvas";
import { supabase } from "@/lib/supabase";

/** The width we render + capture the card at, in CSS px. Matches a typical
 *  desktop-Gmail content column so the image looks natural inline; the email
 *  <img> is `width:100%;max-width:CARD_IMAGE_WIDTH` so it never up-scales past
 *  its captured resolution (we grab at 2× for retina crispness). */
export const CARD_IMAGE_WIDTH = 700;

const CARD_IMAGE_BUCKET = "email-card-images";

/** The <img> tag that replaces {{doctor_card_html}} once a screenshot exists.
 *  Kept identical to the server's swap (send-flow-email) so the preview matches
 *  the delivered mail. */
export function cardImageTag(url: string): string {
  return (
    `<img src="${url}" alt="Doctor profile" ` +
    `style="display:block;width:100%;max-width:${CARD_IMAGE_WIDTH}px;height:auto;` +
    `border:0;margin:20px 0 0;border-radius:14px;" />`
  );
}

/** Wait until every <img> under `root` has finished loading (or errored) so the
 *  element has its true height before html2canvas measures it. Never rejects —
 *  a broken image resolves too, so one bad URL can't hang the capture. */
function waitForImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  return Promise.all(
    imgs.map(img =>
      img.complete && img.naturalWidth > 0
        ? Promise.resolve()
        : new Promise<void>(res => {
            img.addEventListener("load", () => res(), { once: true });
            img.addEventListener("error", () => res(), { once: true });
          }),
    ),
  ).then(() => undefined);
}

/**
 * Render `cardHtml` into an off-screen container and rasterise it to a PNG blob.
 * The container is fixed-width (CARD_IMAGE_WIDTH) and off-screen so the capture
 * is deterministic regardless of the dialog's size.
 *
 * External images (doctor photo, fact icons) are drawn via `useCORS` — the
 * Supabase-hosted assets send permissive CORS headers, so they rasterise fine.
 * A photo hosted somewhere without CORS may come out blank; that's the only
 * fidelity caveat and it's rare (photos live in our own storage).
 */
export async function captureCardPng(cardHtml: string, opts: { width?: number } = {}): Promise<Blob> {
  const width = opts.width ?? CARD_IMAGE_WIDTH;
  const holder = document.createElement("div");
  holder.style.cssText =
    `position:fixed;left:-99999px;top:0;width:${width}px;` +
    `background:#ffffff;padding:0;margin:0;z-index:-1;pointer-events:none;` +
    // Poppins so the capture matches the card's intended typeface.
    `font-family:'Poppins','Helvetica Neue',Helvetica,Arial,sans-serif;`;
  holder.innerHTML = cardHtml;
  document.body.appendChild(holder);
  try {
    await waitForImages(holder);
    // Give web-fonts a beat so glyph metrics are final before rasterising.
    if (document.fonts?.ready) {
      try { await document.fonts.ready; } catch { /* non-fatal */ }
    }
    const canvas = await html2canvas(holder, {
      scale: 2,                 // retina-crisp
      useCORS: true,            // draw cross-origin (Supabase) images
      allowTaint: false,        // keep the canvas exportable
      backgroundColor: "#ffffff",
      width,
      windowWidth: width,
      logging: false,
    });
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        b => (b ? resolve(b) : reject(new Error("Could not encode the screenshot."))),
        "image/png",
      ),
    );
  } finally {
    document.body.removeChild(holder);
  }
}

/** Upload a card PNG to the public `email-card-images` bucket and return its
 *  public URL. Random UUID path — unguessable, nothing is listed. The URL is
 *  hot-linked by Resend when the email is built, so the bucket must be public. */
export async function uploadCardImage(blob: Blob): Promise<string> {
  const path = `cards/${crypto.randomUUID()}.png`;
  const { error } = await supabase.storage
    .from(CARD_IMAGE_BUCKET)
    .upload(path, blob, { contentType: "image/png", upsert: false });
  if (error) throw error;
  return supabase.storage.from(CARD_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Trigger a browser download of `blob` as `filename`. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** Capture the card → upload it → return the public URL to attach to the send.
 *  No auto-download (the browser's Save-As dialog was unwanted friction); use
 *  `downloadBlob` separately if a local copy is ever needed. Throws on
 *  capture/upload failure so the caller can toast. */
export async function captureAndUploadCard(cardHtml: string, opts: { width?: number } = {}): Promise<string> {
  const blob = await captureCardPng(cardHtml, opts);
  return uploadCardImage(blob);
}
