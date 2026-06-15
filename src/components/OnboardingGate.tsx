import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTour, hasSeenTour } from "@/components/OnboardingTour";
import { supabase } from "@/lib/supabase";
import { buildOnboardingTour, hasOnboardingContent, ONBOARDING_TOUR_ID } from "@/lib/tours";

/**
 * Forces non-admin users through a one-time, non-skippable onboarding tour the
 * first time they sign in.
 *
 * The tour is BUILT from the pages the user can actually access (their
 * allowed_pages), so it never navigates to a page they're blocked from — which
 * is what makes it safe for users with partial / custom access (e.g. someone
 * with /sales + /calls but not the rest of the Sales group).
 *
 * Completion is persisted to the user's auth metadata (`onboarded_at`), so it's
 * cross-device, survives a cache clear, and never fires again once done.
 * Admins (who set the system up) and workers (separate single-page portal) are
 * exempt.
 */
export function OnboardingGate() {
  const { role, allowedPages, user, loading } = useAuth();
  const tour = useTour();
  const launchedRef = useRef(false);

  useEffect(() => {
    if (loading || !user) return;
    if (launchedRef.current) return;
    if (role === "admin" || role === "worker") return;

    // Server-side flag is authoritative; the localStorage "seen" flag is a
    // fallback so people who finished before this shipped aren't re-onboarded.
    const onboardedAt = (user.user_metadata as { onboarded_at?: string } | undefined)?.onboarded_at;
    if (onboardedAt || hasSeenTour(ONBOARDING_TOUR_ID)) return;

    // Don't trap a user with no tourable pages in an empty mandatory tour.
    if (!hasOnboardingContent(allowedPages)) return;

    launchedRef.current = true;
    const built = buildOnboardingTour(allowedPages);
    tour.start(built.steps, {
      id:        built.id,
      label:     built.label,
      mandatory: true,
      onComplete: () => {
        // Best-effort: even if this write fails, the engine has set the local
        // "seen" flag, so they won't be re-prompted on this device.
        supabase.auth
          .updateUser({ data: { onboarded_at: new Date().toISOString() } })
          .catch(() => { /* ignore */ });
      },
    });
  }, [role, allowedPages, user, loading, tour]);

  return null;
}
