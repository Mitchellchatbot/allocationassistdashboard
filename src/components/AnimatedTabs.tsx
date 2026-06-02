import { useState, type ReactNode } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { cn } from "@/lib/utils";

export interface AnimatedTabItem {
  /** Stable key used as the active value. */
  value: string;
  /** Visible label content. Can include badges / icons. */
  label: ReactNode;
  /** Optional count rendered as a chip on the right of the label. */
  count?: number;
}

interface AnimatedTabsListProps {
  items:    AnimatedTabItem[];
  value:    string;
  onChange: (next: string) => void;
  /** Optional groupId — used to coordinate `layoutId` when multiple tab
   *  groups appear on the same page so each gets its own sliding pill. */
  groupId?: string;
  className?: string;
}

/**
 * Pill-shaped tab list with a sliding active indicator (framer-motion
 * layoutId magic). Inactive tabs are gray text on the light pill background;
 * the active tab is white text on a teal pill that smoothly slides between
 * positions when the user switches.
 *
 * Pair with `<AnimatedTabPanel>` (one per tab `value`) to get content fade /
 * slide transitions in addition to the indicator animation.
 */
export function AnimatedTabsList({ items, value, onChange, groupId = "tabs", className }: AnimatedTabsListProps) {
  return (
    <LayoutGroup id={groupId}>
      <div
        className={cn(
          "inline-flex items-center rounded-full bg-white/80 backdrop-blur",
          "border border-slate-200/80 p-1 shadow-sm",
          className,
        )}
      >
        {items.map(item => {
          const active = item.value === value;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => onChange(item.value)}
              className={cn(
                "relative rounded-full px-4 py-1.5 text-[12.5px] transition-colors duration-150",
                "outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40",
                active
                  ? "text-white font-medium"
                  : "text-slate-500 hover:text-slate-800",
              )}
            >
              {active && (
                <motion.span
                  layoutId={`${groupId}-pill`}
                  className="absolute inset-0 rounded-full bg-teal-500 shadow-[0_2px_8px_-2px_rgba(20,184,166,0.45)]"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative z-10 inline-flex items-center gap-1.5 whitespace-nowrap">
                {item.label}
                {item.count !== undefined && (
                  <span
                    className={cn(
                      "rounded-full text-[10px] px-1.5 py-0.5 min-w-[20px] text-center",
                      active
                        ? "bg-white/25 text-white"
                        : "bg-slate-200/70 text-slate-600",
                    )}
                  >
                    {item.count}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

interface AnimatedTabContentProps {
  /** The currently-active tab value. Used as the AnimatePresence key, so
   *  changing it triggers exit-then-enter (mode="wait"). */
  active:   string;
  children: ReactNode;
  className?: string;
}

/**
 * Wraps the tab content area with a single AnimatePresence in mode="wait"
 * so the outgoing panel finishes exiting before the new one enters. Inside,
 * render whichever panel matches `active` — typically as a chain of
 * conditional renders. The whole subtree is keyed by `active`, so swapping
 * values cleanly triggers the animation.
 */
export function AnimatedTabContent({ active, children, className }: AnimatedTabContentProps) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={active}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/** Convenience wrapper for the common pattern of `value === active && <X />`.
 *  Renders its children only when its `value` matches `active`. No animation
 *  here — the surrounding `<AnimatedTabContent>` handles transitions. */
export function AnimatedTabPanel({ value, active, children }: { value: string; active: string; children: ReactNode }) {
  if (value !== active) return null;
  return <>{children}</>;
}

/** Helper used by pages that want a tiny demo / standalone setup. Most
 *  callers will manage their own state and use `AnimatedTabsList` +
 *  `AnimatedTabPanel` directly. */
export function AnimatedTabs({
  items, defaultValue, children, groupId, className,
}: {
  items:    AnimatedTabItem[];
  defaultValue: string;
  children: (active: string) => ReactNode;
  groupId?: string;
  className?: string;
}) {
  const [active, setActive] = useState(defaultValue);
  return (
    <div className={className}>
      <AnimatedTabsList items={items} value={active} onChange={setActive} groupId={groupId} />
      <div className="mt-4">{children(active)}</div>
    </div>
  );
}
