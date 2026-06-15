/**
 * Guided product tour for the Hospital Introduction module.
 *
 * Renders a full-screen backdrop that cuts a spotlight over the current
 * step's target element + a positioned tooltip with title / body / nav.
 * Works on any element tagged with `data-tour="<id>"`.
 *
 * Triggers:
 *   - Auto-shows the first time an HI member lands on /my-workspace
 *     (persisted in localStorage so it doesn't re-open every visit).
 *   - "Simulate onboarding" button in the DashboardLayout header replays
 *     the tour any time.
 */
import { useEffect, useLayoutEffect, useState, useCallback, useRef, useMemo, createContext, useContext, type ReactNode, type CSSProperties } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Sparkles, X, ChevronLeft, ChevronRight, Check, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";

// Confetti palette for the completion finale — the teal-led brand mix.
const CONFETTI_COLORS = ["#14b8a6", "#0ea5e9", "#f59e0b", "#ec4899", "#8b5cf6", "#22c55e", "#fbbf24"];

export interface TourStep {
  /** Selector for `document.querySelector` OR the value of `data-tour=…`. */
  target?: string;
  title: string;
  body:  string;
  /** Preferred tooltip position relative to the target. "auto" picks the
   *  side with the most room. "center" shows the tooltip dead-center
   *  with no spotlight (intro / outro slides). */
  placement?: "top" | "bottom" | "left" | "right" | "auto" | "center";
  /** Padding around the spotlight rectangle, in pixels. */
  padding?: number;
  /** Optional route to navigate to before showing this step. The overlay
   *  retries `getTargetRect` until the target appears (capped at ~2s) so
   *  page mount + lazy-load delays don't break the spotlight. */
  route?: string;
}

interface TourContextValue {
  start:    (steps: TourStep[], opts?: { id?: string; label?: string }) => void;
  isActive: boolean;
}

const TourContext = createContext<TourContextValue>({ start: () => {}, isActive: false });

export function useTour() { return useContext(TourContext); }

const STORAGE_PREFIX = "aa-tour:seen:";

export function OnboardingTourProvider({ children }: { children: ReactNode }) {
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [stepIdx, setStepIdx] = useState(0);
  const [active, setActive] = useState(false);
  const [tourId, setTourId] = useState<string | null>(null);
  const [tourLabel, setTourLabel] = useState<string | null>(null);
  // When the user finishes the LAST step (vs. skipping), we swap the step
  // overlay for a short celebratory finale before fully closing.
  const [finale, setFinale] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // When entering a step that wants a different route, navigate there.
  // The overlay's retry-until-mounted logic then waits for the target.
  useEffect(() => {
    if (!active) return;
    const step = steps[stepIdx];
    if (!step?.route) return;
    if (location.pathname === step.route) return;
    navigate(step.route);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIdx]);

  const close = useCallback((markSeen = true) => {
    if (markSeen && tourId) {
      try { localStorage.setItem(`${STORAGE_PREFIX}${tourId}`, "1"); } catch { /* ignore */ }
    }
    setActive(false);
    setFinale(false);
    setSteps([]);
    setStepIdx(0);
    setTourId(null);
    setTourLabel(null);
  }, [tourId]);

  // Finishing the last step: mark the tour seen and show the celebratory
  // finale (the finale's own button / auto-timeout then fully closes).
  const finish = useCallback(() => {
    if (tourId) {
      try { localStorage.setItem(`${STORAGE_PREFIX}${tourId}`, "1"); } catch { /* ignore */ }
    }
    setFinale(true);
  }, [tourId]);

  // Guard against re-entry: when a tour step uses `route` to navigate to a
  // page that ALSO auto-launches this same tour (e.g. step 3 navigates to
  // /my-workspace, MyWorkspace's mount-effect calls start again because
  // hasSeenTour is still false mid-tour). Without this guard the tour
  // restarted from step 0 every time it crossed into /my-workspace.
  const start = useCallback((nextSteps: TourStep[], opts?: { id?: string; label?: string }) => {
    if (active && tourId && tourId === (opts?.id ?? null)) return;
    setSteps(nextSteps);
    setStepIdx(0);
    setTourId(opts?.id ?? null);
    setTourLabel(opts?.label ?? null);
    setFinale(false);
    setActive(true);
  }, [active, tourId]);

  // ESC to dismiss.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
      else if (finale) return;  // finale slide — arrows shouldn't scrub steps
      else if (e.key === "ArrowRight") setStepIdx(i => Math.min(steps.length - 1, i + 1));
      else if (e.key === "ArrowLeft")  setStepIdx(i => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, steps.length, close, finale]);

  return (
    <TourContext.Provider value={{ start, isActive: active }}>
      {children}
      {active && !finale && steps[stepIdx] && (
        <TourOverlay
          step={steps[stepIdx]}
          stepIdx={stepIdx}
          total={steps.length}
          onPrev={() => setStepIdx(i => Math.max(0, i - 1))}
          onNext={() => {
            if (stepIdx === steps.length - 1) finish();
            else setStepIdx(i => i + 1);
          }}
          onSkip={() => close(true)}
        />
      )}
      {active && finale && (
        <TourFinale label={tourLabel} onDone={() => close(false)} />
      )}
    </TourContext.Provider>
  );
}

/** Returns true the first time this tour id is shown; saving "seen" status
 *  is the provider's job (it does it on completion/dismiss). */
export function hasSeenTour(id: string): boolean {
  try { return !!localStorage.getItem(`${STORAGE_PREFIX}${id}`); }
  catch { return false; }
}

export function resetSeenTour(id: string) {
  try { localStorage.removeItem(`${STORAGE_PREFIX}${id}`); } catch { /* ignore */ }
}

// ── Overlay rendering ──────────────────────────────────────────────────

interface Rect { top: number; left: number; width: number; height: number }

function getTargetRect(selector: string | undefined, padding: number): Rect | null {
  if (!selector) return null;
  // Accept either `data-tour=…` shorthand or a raw CSS selector.
  const el = selector.startsWith(".") || selector.startsWith("#") || selector.startsWith("[")
    ? document.querySelector(selector)
    : document.querySelector(`[data-tour="${selector}"]`);
  if (!el) return null;
  const r = (el as HTMLElement).getBoundingClientRect();
  return {
    top:    Math.max(0, r.top - padding),
    left:   Math.max(0, r.left - padding),
    width:  r.width + padding * 2,
    height: r.height + padding * 2,
  };
}

function TourOverlay({ step, stepIdx, total, onPrev, onNext, onSkip }: {
  step:    TourStep;
  stepIdx: number;
  total:   number;
  onPrev:  () => void;
  onNext:  () => void;
  onSkip:  () => void;
}) {
  const padding = step.padding ?? 8;
  const [rect, setRect] = useState<Rect | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number; arrow: "up" | "down" | "left" | "right" | "none" }>({ top: 0, left: 0, arrow: "none" });

  // Recompute the spotlight + tooltip position when step / window changes.
  // When the step navigated to a new route, the target element may not be
  // mounted yet — retry on a short interval until it shows up or we give up.
  useLayoutEffect(() => {
    let retryCount = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const place = () => {
      if (step.placement === "center" || !step.target) {
        setRect(null);
        const vw = window.innerWidth, vh = window.innerHeight;
        setTooltipPos({ top: vh / 2 - 110, left: vw / 2 - 200, arrow: "none" });
        return;
      }
      const r = getTargetRect(step.target, padding);
      if (!r && retryCount < 30) {        // ~2s total (30 × 70ms)
        retryCount++;
        retryTimer = setTimeout(place, 70);
        return;
      }
      setRect(r);
      if (!r) {
        // Target missing after retries — show centered so the tour can still progress.
        const vw = window.innerWidth, vh = window.innerHeight;
        setTooltipPos({ top: vh / 2 - 110, left: vw / 2 - 200, arrow: "none" });
        return;
      }
      // Scroll the target into view so it's actually visible.
      const el = step.target.startsWith(".") || step.target.startsWith("#") || step.target.startsWith("[")
        ? document.querySelector(step.target)
        : document.querySelector(`[data-tour="${step.target}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });

      const tw = tooltipRef.current?.offsetWidth ?? 360;
      const th = tooltipRef.current?.offsetHeight ?? 180;
      const GAP = 14;
      const vw = window.innerWidth, vh = window.innerHeight;

      // Try each placement; pick the one that fits with the most margin.
      const candidates: Array<{ pos: { top: number; left: number; arrow: TourOverlayArrow }; score: number }> = [];
      const cand = (top: number, left: number, arrow: TourOverlayArrow) => {
        // Clamp into viewport
        const cTop  = Math.max(8, Math.min(top, vh - th - 8));
        const cLeft = Math.max(8, Math.min(left, vw - tw - 8));
        const fits  = top >= 8 && top + th <= vh - 8 && left >= 8 && left + tw <= vw - 8;
        candidates.push({ pos: { top: cTop, left: cLeft, arrow }, score: fits ? 100 : 0 });
      };

      cand(r.top + r.height + GAP,           r.left + r.width / 2 - tw / 2, "up");    // bottom
      cand(r.top - th - GAP,                  r.left + r.width / 2 - tw / 2, "down");  // top
      cand(r.top + r.height / 2 - th / 2,     r.left + r.width + GAP,        "left");  // right
      cand(r.top + r.height / 2 - th / 2,     r.left - tw - GAP,             "right"); // left

      // Preferred placement first if explicitly set.
      const pref = step.placement;
      if (pref && pref !== "auto") {
        const idx = pref === "bottom" ? 0 : pref === "top" ? 1 : pref === "right" ? 2 : 3;
        const c = candidates[idx];
        if (c.score === 100) {
          setTooltipPos(c.pos);
          return;
        }
      }
      const best = candidates.sort((a, b) => b.score - a.score)[0];
      setTooltipPos(best.pos);
    };

    place();
    // Re-position on resize/scroll.
    const onChange = () => place();
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.target, step.placement, padding, stepIdx]);

  const isFirst = stepIdx === 0;
  const isLast  = stepIdx === total - 1;

  return (
    <div className="fixed inset-0 z-[1200]" role="dialog" aria-label="Onboarding tour">
      {/* Backdrop — uses an SVG mask so the spotlight has crisp edges + a
          subtle ring. Falls back to a plain dim when no rect (intro slide). */}
      {rect ? (
        <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden>
          <defs>
            <mask id="aa-tour-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              <rect
                x={rect.left} y={rect.top}
                width={rect.width} height={rect.height}
                rx="10" ry="10"
                fill="black"
              />
            </mask>
          </defs>
          <rect x="0" y="0" width="100%" height="100%" fill="rgba(15, 23, 42, 0.62)" mask="url(#aa-tour-mask)" />
          <rect
            x={rect.left} y={rect.top}
            width={rect.width} height={rect.height}
            rx="10" ry="10"
            fill="none"
            stroke="rgba(20, 184, 166, 0.9)"
            strokeWidth="2"
          />
        </svg>
      ) : (
        <div className="absolute inset-0 bg-slate-900/60" />
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="absolute w-[360px] max-w-[92vw] rounded-2xl border border-slate-200 bg-white shadow-2xl p-4 animate-in fade-in slide-in-from-bottom-2 duration-200"
        style={{ top: tooltipPos.top, left: tooltipPos.left }}
      >
        <Arrow direction={tooltipPos.arrow} />
        <div className="flex items-start gap-2.5 mb-2">
          <div className="h-7 w-7 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
            <Sparkles className="h-3.5 w-3.5 text-teal-700" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.12em] text-teal-700/80 font-semibold">
              Step {stepIdx + 1} of {total}
            </div>
            <h3 className="text-[14px] font-semibold text-slate-900 leading-snug">{step.title}</h3>
          </div>
          <button
            onClick={onSkip}
            className="h-6 w-6 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center"
            aria-label="Skip tour"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="text-[12.5px] text-slate-600 leading-relaxed">{step.body}</p>

        {/* Progress dots */}
        <div className="mt-4 flex items-center gap-1">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === stepIdx ? "bg-teal-600 w-6" :
                i  <  stepIdx ? "bg-teal-300 w-1.5" :
                                "bg-slate-200 w-1.5"
              }`}
            />
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-[12px]"
            onClick={onPrev}
            disabled={isFirst}
          >
            <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Back
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-[12px] text-muted-foreground ml-auto"
            onClick={onSkip}
          >
            Skip
          </Button>
          <Button
            size="sm"
            className="h-8 text-[12px]"
            onClick={onNext}
          >
            {isLast ? <>Got it <Check className="h-3.5 w-3.5 ml-1" /></> : <>Next <ChevronRight className="h-3.5 w-3.5 ml-1" /></>}
          </Button>
        </div>
      </div>
    </div>
  );
}

type TourOverlayArrow = "up" | "down" | "left" | "right" | "none";

function Arrow({ direction }: { direction: TourOverlayArrow }) {
  if (direction === "none") return null;
  const base = "absolute h-3 w-3 rotate-45 bg-white border border-slate-200";
  if (direction === "up")    return <div className={`${base} -top-[7px] left-1/2 -translate-x-1/2 border-r-0 border-b-0`} />;
  if (direction === "down")  return <div className={`${base} -bottom-[7px] left-1/2 -translate-x-1/2 border-l-0 border-t-0`} />;
  if (direction === "left")  return <div className={`${base} -left-[7px] top-1/2 -translate-y-1/2 border-r-0 border-t-0`} />;
  return <div className={`${base} -right-[7px] top-1/2 -translate-y-1/2 border-l-0 border-b-0`} />;
}

// ── Completion finale ──────────────────────────────────────────────────
// A short celebration when someone FINISHES a tour (skipping doesn't trigger
// it): a confetti burst + a spring-in card that sends them on their way.
// Pure CSS animations (tailwindcss-animate + one keyframe) so we don't pull a
// heavy animation lib into the eagerly-loaded provider bundle.

interface ConfettiPiece {
  id: number; left: number; delay: number; duration: number;
  color: string; w: number; h: number; drift: string; spin: string; round: boolean;
}

function TourFinale({ label, onDone }: { label: string | null; onDone: () => void }) {
  // Auto-dismiss after a few seconds so the celebration never traps anyone.
  useEffect(() => {
    const t = setTimeout(onDone, 6500);
    return () => clearTimeout(t);
  }, [onDone]);

  const pieces = useMemo<ConfettiPiece[]>(() => Array.from({ length: 80 }, (_, i) => ({
    id:       i,
    left:     Math.random() * 100,
    delay:    Math.random() * 0.6,
    duration: 2.4 + Math.random() * 1.8,
    color:    CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    w:        6 + Math.random() * 7,
    h:        9 + Math.random() * 8,
    drift:    `${Math.round((Math.random() - 0.5) * 240)}px`,
    spin:     `${Math.round(360 + Math.random() * 600)}deg`,
    round:    Math.random() > 0.7,
  })), []);

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center" role="dialog" aria-label="Tour complete">
      {/* one-off keyframe for the falling confetti */}
      <style>{`
        @keyframes aa-confetti-fall {
          0%   { transform: translate3d(0, -12vh, 0) rotate(0deg); opacity: 1; }
          80%  { opacity: 1; }
          100% { transform: translate3d(var(--aa-drift), 112vh, 0) rotate(var(--aa-spin)); opacity: 0; }
        }
      `}</style>

      {/* backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px] animate-in fade-in duration-300"
        onClick={onDone}
      />

      {/* confetti layer */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {pieces.map(p => (
          <span
            key={p.id}
            className={`absolute top-0 ${p.round ? "rounded-full" : "rounded-[2px]"}`}
            style={{
              left:            `${p.left}%`,
              width:           p.w,
              height:          p.h,
              backgroundColor: p.color,
              animation:       `aa-confetti-fall ${p.duration}s ${p.delay}s ease-in forwards`,
              "--aa-drift":    p.drift,
              "--aa-spin":     p.spin,
            } as CSSProperties}
          />
        ))}
      </div>

      {/* card */}
      <div className="relative z-10 w-[340px] max-w-[90vw] rounded-2xl border border-slate-200 bg-white shadow-2xl px-6 py-7 text-center animate-in fade-in zoom-in-95 slide-in-from-bottom-3 duration-300">
        <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-teal-100 flex items-center justify-center animate-in zoom-in-50 duration-500">
          <Check className="h-8 w-8 text-teal-700 animate-in zoom-in-0 duration-700" strokeWidth={3} />
        </div>
        <div className="flex items-center justify-center gap-1.5 text-teal-700/80 mb-1">
          <PartyPopper className="h-3.5 w-3.5" />
          <span className="text-[10px] uppercase tracking-[0.14em] font-semibold">Tour complete</span>
        </div>
        <h3 className="text-[17px] font-bold text-slate-900">You're all set!</h3>
        <p className="mt-1.5 text-[13px] text-slate-600 leading-relaxed">
          {label ? `That's the ${label} tour done. ` : "Nice work. "}
          Replay it anytime from the Tour button up top, and the AI Assistant is always there if you get stuck.
        </p>
        <Button className="mt-5 w-full h-9 text-[13px]" onClick={onDone}>
          Let's go
        </Button>
      </div>
    </div>
  );
}
