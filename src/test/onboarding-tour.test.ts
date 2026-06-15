import { describe, it, expect } from "vitest";
import { buildOnboardingTour, hasOnboardingContent, ONBOARDING_TOUR_ID } from "@/lib/tours";

/**
 * Guards the mandatory onboarding tour's à-la-carte safety: the tour is built
 * from a user's allowed_pages and must NEVER route them to a page the
 * ProtectedRoute guard would bounce them off of. If it did, the mandatory tour
 * (which can't be skipped) would derail on a redirect.
 */

// Mirror of requiredPageForPath() in App.tsx — the guard non-admins hit.
function requiredPageForPath(pathname: string): string {
  if (pathname === "/import" || pathname === "/contracts" || pathname === "/import-bulk" || pathname === "/connections") return "/";
  if (pathname === "/leads-pipeline" || pathname === "/doctor-profiles" || pathname === "/wp-candidates") return "/doctors";
  return pathname;
}
const basePath = (route: string) => route.split("?")[0];
const routedBases = (pages: string[]) =>
  buildOnboardingTour(pages).steps.filter(s => s.route).map(s => basePath(s.route!));

// Representative access sets (mirror ROLE_PRESETS + tricky custom ones).
const HI_MEMBER = ["/", "/my-workspace", "/automations", "/doctors", "/vacancies", "/batches", "/reports", "/forms", "/settings"];
const SALES     = ["/", "/sales", "/marketing", "/doctors", "/team", "/calls", "/settings"];
const FINANCE   = ["/", "/finance", "/settings"];
const CUSTOM_NARROW = ["/sales", "/calls"];          // à-la-carte slice of a group
const CUSTOM_CONN_WITH_ROOT = ["/", "/connections"]; // admin page reachable (/ granted)

describe("onboarding tour — à-la-carte access", () => {
  const SETS: Record<string, string[]> = { HI_MEMBER, SALES, FINANCE, CUSTOM_NARROW, CUSTOM_CONN_WITH_ROOT };

  for (const [name, pages] of Object.entries(SETS)) {
    it(`never routes a ${name} user to a page they can't reach`, () => {
      for (const step of buildOnboardingTour(pages).steps) {
        if (!step.route) continue; // centred / universal steps don't navigate
        const guard = requiredPageForPath(basePath(step.route));
        expect(pages.includes(guard), `${name}: route ${step.route} (guard=${guard}) not allowed`).toBe(true);
      }
    });
  }

  it("includes only the pages a narrow custom user actually has", () => {
    expect(routedBases(CUSTOM_NARROW).sort()).toEqual(["/calls", "/sales"]);
  });

  it("excludes a page granted WITHOUT its guard page (/connections without /)", () => {
    expect(routedBases(["/connections"])).not.toContain("/connections");
    expect(hasOnboardingContent(["/connections"])).toBe(false);
  });

  it("includes /connections when / is also granted", () => {
    expect(routedBases(CUSTOM_CONN_WITH_ROOT)).toContain("/connections");
  });

  it("always appends universal steps + a welcome and finale", () => {
    const tour = buildOnboardingTour(HI_MEMBER);
    const targets = tour.steps.map(s => s.target);
    expect(targets).toContain("ai-floating-button");
    expect(targets).toContain("sidebar-docs");
    expect(targets).toContain("topbar-search");
    expect(tour.steps[0].placement).toBe("center");                     // welcome
    expect(tour.steps.at(-1)!.placement).toBe("center");                // finale
    expect(tour.id).toBe(ONBOARDING_TOUR_ID);
  });

  it("has no tourable content for workers / empty access", () => {
    expect(hasOnboardingContent(["/worker"])).toBe(false);
    expect(hasOnboardingContent([])).toBe(false);
  });
});
