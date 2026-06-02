import { createContext, useContext } from "react";

/** Tiny context so any descendant of DashboardLayout (sidebar, top bar,
 *  cards, etc.) can open the universal search dialog without dispatching
 *  a synthetic ⌘K keyboard event. The previous keydown-dispatch path had a
 *  noticeable latency because the synthetic event had to bubble through the
 *  global listener, queue a re-render, and only then flip the dialog open. */
export const UniversalSearchContext = createContext<{
  open: () => void;
} | null>(null);

export function useUniversalSearch() {
  return useContext(UniversalSearchContext);
}
