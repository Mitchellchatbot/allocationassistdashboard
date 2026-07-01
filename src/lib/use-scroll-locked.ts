import { useEffect, useState } from "react";

/**
 * True while a modal (Radix Dialog / AlertDialog / Sheet) is open and has locked
 * body scroll — i.e. a modal is covering the page. Floating launchers (AI
 * Assistant, Feedback) use this to get out of the way so they don't sit on top
 * of a dialog's bottom-right action buttons (the "Queue send" button was being
 * occluded). Non-modal popovers don't lock scroll, so this stays false for the
 * template picker etc.
 */
export function useScrollLocked(): boolean {
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const check = () =>
      setLocked(
        document.body.hasAttribute("data-scroll-locked") ||
        !!document.querySelector('[role="dialog"][data-state="open"][aria-modal="true"]') ||
        !!document.querySelector('[role="alertdialog"][data-state="open"]'),
      );
    check();
    const mo = new MutationObserver(check);
    mo.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-scroll-locked", "style"],
      childList: true, // dialogs portal in as body children
    });
    return () => mo.disconnect();
  }, []);
  return locked;
}
