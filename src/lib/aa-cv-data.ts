// Shared helpers for working with AaCvData — used by the Convert CV tab
// (src/pages/ConvertCv.tsx) and the in-send CV studio
// (src/components/cv/CvStudioDialog.tsx). Keeps the doctor-backfill + HTML-split
// logic in one place so both surfaces behave identically.
import type { AaCvData } from "@/lib/aa-cv-template";
import type { WpCandidate } from "@/hooks/use-wp-candidates";

/** Strip a leading "Dr."/"Dr " so we don't end up with "Dr. Dr. …". */
export const drOff = (s: string | null | undefined) => (s ?? "").replace(/^\s*dr\.?\s+/i, "").trim();

/** Up-to-two-letter initials for an avatar fallback. */
export const cvInitials = (n?: string | null) =>
  drOff(n).split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join("") || "Dr";

/** "1982-04-15" → "April 15, 1982" (the reference CV style). Pass-through on
 *  anything unparseable. */
export function fmtDob(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(/T/.test(iso) ? iso : `${iso}T00:00:00`);
  return isNaN(d.valueOf()) ? iso : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/** A filesystem-safe name for the CV PDF, e.g. "Ashraf Mahmood". */
export function cvSafeName(name: string | null | undefined, fallback = "Doctor"): string {
  return (drOff(name) || fallback).replace(/[^a-zA-Z0-9 ._-]/g, "").trim() || fallback;
}

/** Split buildAaCvHtml() output into [<style>…</style>, <div class="aacv">…].
 *  Lets the caller keep the style OUT of a contentEditable region so a stray
 *  edit can't delete it, while still shipping both to html2pdf. */
export function splitCvHtml(html: string): [style: string, body: string] {
  const i = html.indexOf("</style>");
  return i >= 0 ? [html.slice(0, i + 8), html.slice(i + 8)] : ["", html];
}

/** Fill any EMPTY AaCvData field from the doctor's canonical WP record. The CV's
 *  own content always wins; this only backfills gaps ("data points from other
 *  sources"). An explicit headshot upload (photoOverride) beats the doctor photo. */
export function mergeDoctorData(cv: AaCvData, c: WpCandidate | null | undefined, photoOverride?: string): AaCvData {
  const personal: Record<string, string> = { ...(cv.personal ?? {}) };
  if (c) {
    const put = (k: string, val: string | null | undefined) => {
      const t = (val ?? "").trim();
      if (t && !(personal[k] ?? "").trim()) personal[k] = t;
    };
    put("Name", drOff(c.full_name));
    put("Date of Birth", fmtDob(c.date_of_birth));
    put("Nationality", c.nationality);
    put("Languages Spoken", c.languages);
    put("Current Location", c.current_location);
  }
  return {
    ...cv,
    name:      (cv.name ?? "").trim() || drOff(c?.full_name),
    title:     (cv.title ?? "").trim() || c?.job_title || c?.specialty || "",
    email:     (cv.email ?? "").trim() || c?.email || undefined,
    phone:     (cv.phone ?? "").trim() || c?.phone || undefined,
    photo_url: photoOverride || cv.photo_url || c?.photo_url || undefined,
    personal:  Object.keys(personal).length ? personal : cv.personal,
  };
}
