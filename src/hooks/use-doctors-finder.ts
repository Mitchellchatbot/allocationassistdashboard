/**
 * Doctors Finder enquiries — every submission from the doctorsfinder.com
 * forms, newest first, with the doctor each one was about.
 *
 * Why not reuse useFormResponsesPage: that one is keyed to a single form id,
 * because the Forms page is a tab per form. Doctors Finder is the other shape
 * - the team asked for one feed and one per-doctor count across whichever
 * forms happen to be wired up (there are two today, an older and a newer),
 * and a per-form split would put the same doctor in two places. So this
 * selects by form_type instead and merges.
 *
 * A form joins this section by having form_type = 'doctors_finder'. That is
 * set when someone connects the form on /forms, and it is the only switch -
 * wiring a third enquiry form needs no code change here.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useTableSubscription } from "@/lib/realtime-registry";

/** The form_type that marks a form as a Doctors Finder enquiry form. */
export const DOCTORS_FINDER_TYPE = "doctors_finder";

export interface Enquiry {
  id:              string;
  form_id:         string;
  form_name:       string;
  submitted_at:    string;
  /** Flattened question -> answer, as the webhook stored it. */
  answers:         Record<string, string>;
  enquirer_name:   string | null;
  enquirer_email:  string | null;
  /** The doctor (or hospital) approached. Null when the submission carried
   *  no identifying page URL - see enquiry-target.ts. */
  target_kind:     "doctor" | "hospital" | null;
  target_slug:     string | null;
  target_name:     string | null;
}

interface Row {
  id: string; form_id: string; submitted_at: string;
  answers: Record<string, string> | null;
  respondent_name: string | null; respondent_email: string | null;
  target_kind: "doctor" | "hospital" | null;
  target_slug: string | null; target_name: string | null;
  forms: { name: string | null; form_type: string } | null;
}

const KEY = ["doctors-finder-enquiries"] as const;

export function useDoctorsFinderEnquiries() {
  const qc = useQueryClient();
  // The feed is meant to show submissions "as they come in", so it follows
  // the same realtime channel the Forms page uses rather than polling.
  useTableSubscription("form_responses", useCallback(() => {
    qc.invalidateQueries({ queryKey: KEY });
  }, [qc]));

  return useQuery<Enquiry[]>({
    queryKey: KEY,
    queryFn: async () => {
      // Supabase caps a response at 1,000 rows whatever .limit() says, so
      // page with .range(). !inner makes the form_type filter a join
      // condition rather than a post-filter that would return empty parents.
      const PAGE = 1000;
      const all: Enquiry[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("form_responses")
          .select(
            "id, form_id, submitted_at, answers, respondent_name, respondent_email," +
            " target_kind, target_slug, target_name, forms!inner(name, form_type)",
          )
          .eq("forms.form_type", DOCTORS_FINDER_TYPE)
          .is("archived_at", null)
          .order("submitted_at", { ascending: false })
          // id breaks ties: paging on a non-unique sort lets rows with the
          // same timestamp repeat on one page and vanish from another.
          .order("id", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const page = (data ?? []) as unknown as Row[];
        all.push(...page.map(toEnquiry));
        if (page.length < PAGE) break;
      }
      return all;
    },
    staleTime: 30_000,
  });
}

function toEnquiry(r: Row): Enquiry {
  return {
    id:             r.id,
    form_id:        r.form_id,
    form_name:      r.forms?.name ?? "Doctors Finder",
    submitted_at:   r.submitted_at,
    answers:        r.answers ?? {},
    enquirer_name:  r.respondent_name,
    enquirer_email: r.respondent_email,
    target_kind:    r.target_kind,
    target_slug:    r.target_slug,
    target_name:    r.target_name,
  };
}

export interface DoctorVolume {
  slug:   string;
  name:   string;
  count:  number;
  lastAt: string;
  /** Enquiries in the last 30 days, for the "still active" read. */
  recent: number;
}

/**
 * Enquiries per doctor — the number the client actually asked for.
 *
 * Keyed on slug, never on name: the display name is a lossy render of the
 * slug, so two renderings of one doctor would split the count. Submissions
 * with no identified doctor are left out and counted separately by the
 * caller, because folding them into an "Unknown" row would rank an absence
 * of data against real doctors.
 */
export function volumeByDoctor(enquiries: Enquiry[], now = Date.now()): DoctorVolume[] {
  const cutoff = now - 30 * 86_400_000;
  const by = new Map<string, DoctorVolume>();
  for (const e of enquiries) {
    if (e.target_kind !== "doctor" || !e.target_slug) continue;
    const at = e.submitted_at;
    const isRecent = new Date(at).getTime() >= cutoff ? 1 : 0;
    const hit = by.get(e.target_slug);
    if (hit) {
      hit.count++;
      hit.recent += isRecent;
      if (at > hit.lastAt) hit.lastAt = at;
    } else {
      by.set(e.target_slug, {
        slug:   e.target_slug,
        name:   e.target_name || e.target_slug,
        count:  1,
        lastAt: at,
        recent: isRecent,
      });
    }
  }
  return [...by.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
