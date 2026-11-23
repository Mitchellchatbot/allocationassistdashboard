/**
 * Which doctor (or hospital) a Doctors Finder enquiry was about.
 *
 * SERVER MASTER. A port lives at src/lib/enquiry-target.ts for the browser,
 * because Deno cannot resolve the `@/` alias and the Vite build will not pull
 * a file out of supabase/functions. src/test/enquiry-target.test.ts runs both
 * over the same table of URLs and fails if they ever disagree - the same
 * arrangement jotform-extract.ts has with jotform-to-wp.ts.
 *
 * The forms do not ask which doctor. They sit on the doctor's own profile
 * page, so the page URL is the only evidence:
 *
 *   https://doctorsfinder.com/doctor/dr-vera-korol/        -> dr-vera-korol
 *   https://doctorsfinder.com/hospital/clemenceau-medical/ -> a hospital
 *   https://doctorsfinder.com/blog/waiting-period-uae/     -> nothing
 *   https://doctorsfinder.com/contact-us/                  -> nothing
 *
 * The team decided against adding a hidden doctor field to the forms, so this
 * is the only route and it is lossy by construction: of the older form's 15
 * submissions, 3 came from blog posts and 5 carried no referrer at all. Those
 * return null, and the dashboard says "not identified" rather than guessing.
 */

export type EnquiryTargetKind = "doctor" | "hospital";

export interface EnquiryTarget {
  kind: EnquiryTargetKind;
  /** Identity. Group and count by this - never by name. */
  slug: string;
  /** Display only. */
  name: string;
}

/** The path segments that introduce a profile, and what they mean. */
const SEGMENT: Record<string, EnquiryTargetKind> = {
  doctor:    "doctor",
  doctors:   "doctor",
  hospital:  "hospital",
  hospitals: "hospital",
};

/**
 * Title-case a slug for display: "dr-vera-korol" -> "Dr Vera Korol".
 *
 * Lossy, and deliberately so. "dr-faisal-al-rubayi" comes back as "Dr Faisal
 * Al Rubayi", not "Al-Rubayi" - the slug cannot tell a word separator from a
 * hyphenated surname. That is why the slug, not the name, is the identity.
 */
export function nameFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Read a profile out of a page URL. Null when the URL points at anything else
 * - a blog post, the contact page, the site root - or is not a URL at all.
 */
export function enquiryTargetFrom(url: string | null | undefined): EnquiryTarget | null {
  const raw = (url ?? "").trim();
  if (!raw) return null;

  let path: string;
  try {
    // Accept a bare path too ("/doctor/dr-x/"), which is what some webhook
    // payloads carry instead of an absolute URL.
    path = new URL(raw, "https://placeholder.invalid").pathname;
  } catch {
    return null;
  }

  const parts = path.split("/").filter(Boolean);
  for (let i = 0; i < parts.length - 1; i++) {
    const kind = SEGMENT[safeDecode(parts[i]).toLowerCase()];
    if (!kind) continue;
    const slug = safeDecode(parts[i + 1]).toLowerCase().trim();
    // A slug has to look like one. Guards against /doctors/page/2 and against
    // a trailing segment that is really a paging or id artefact.
    if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug) || /^\d+$/.test(slug) || RESERVED.has(slug)) continue;
    return { kind, slug, name: nameFromSlug(slug) };
  }
  return null;
}

/** decodeURIComponent throws on a stray '%'; a bad segment is just not a slug. */
function safeDecode(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

/** Segments WordPress puts where a slug would go. /doctors/page/2 is the
 *  directory's second page, not a doctor called Page. */
const RESERVED = new Set(["page", "feed", "amp", "embed", "search", "category", "tag"]);

/** Payload keys that tend to hold the page a form was submitted from. */
const URL_KEY = /referr?er|page[_-]?url|source[_-]?url|current[_-]?url|form[_-]?url|post[_-]?url/i;

/**
 * Find the submission's page URL inside an arbitrary flattened payload.
 *
 * Elementor's webhook action ships form-encoded keys with brackets
 * ("meta[page_url][value]"), its CSV export calls the column "Referrer", and
 * neither shape is guaranteed across versions. So: prefer a key that names
 * itself, then fall back to any value anywhere that resolves to a profile.
 * The fallback is what keeps this working if Elementor renames the field.
 */
export function findTargetUrl(flat: Record<string, string>): string | null {
  for (const [k, v] of Object.entries(flat)) {
    if (v && URL_KEY.test(k) && enquiryTargetFrom(v)) return v;
  }
  for (const v of Object.values(flat)) {
    if (v && enquiryTargetFrom(v)) return v;
  }
  // Nothing resolved to a profile; still return a self-described URL so the
  // page a submission came from is visible even when it is a blog post.
  for (const [k, v] of Object.entries(flat)) {
    if (v && URL_KEY.test(k) && /^https?:\/\//i.test(v)) return v;
  }
  return null;
}
