/**
 * Tour registry — maps each dashboard section to its guided training tour.
 *
 * The topbar "Tour" button and any first-visit prompts look up the tour for the
 * CURRENT route here, so every section gets its own walkthrough (modelled on the
 * Hospital Introduction tour). Add a new section tour by importing its steps and
 * adding an entry below.
 */
import type { TourStep } from "@/components/OnboardingTour";
import { HI_TOUR_ID, HI_TOUR_STEPS } from "./hi-onboarding-tour";
import { SALES_TOUR_ID, SALES_TOUR_STEPS } from "./sales-tour";

export interface SectionTour {
  id:    string;
  label: string;
  steps: TourStep[];
}

interface Section {
  paths: string[];
  tour:  SectionTour;
}

const SECTIONS: Section[] = [
  {
    paths: ["/sales", "/follow-ups", "/calls", "/contracts"],
    tour:  { id: SALES_TOUR_ID, label: "Sales", steps: SALES_TOUR_STEPS },
  },
  {
    // Hospital Introduction — the original tour.
    paths: ["/", "/my-workspace", "/automations", "/doctors", "/vacancies", "/batches", "/reports", "/forms"],
    tour:  { id: HI_TOUR_ID, label: "Hospital Introduction", steps: HI_TOUR_STEPS },
  },
];

/** The tour for the section a path belongs to, or null if none yet. */
export function tourForPath(pathname: string): SectionTour | null {
  for (const s of SECTIONS) if (s.paths.includes(pathname)) return s.tour;
  return null;
}
