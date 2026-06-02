/**
 * Track recently visited pages + entities in localStorage. Surfaced as a
 * tiny widget in the sidebar so the team can pick up where they left off
 * without re-searching.
 *
 * Items are deduplicated by path. Most-recent-first. Capped at 6.
 *
 * The tracker is route-based (useLocation), so every navigation
 * automatically logs an item. The label/icon are derived from a tiny
 * registry — same one the breadcrumb uses — so they stay consistent.
 */
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

const STORAGE_KEY = "aa-recent-items-v1";
const MAX_ITEMS   = 6;
// Routes we don't surface as recent — too short-lived, like /login, or
// they're already the entry point.
const SKIP_PATHS = new Set(["/login", "/"]);

export interface RecentItem {
  path:    string;   // e.g. "/vacancies" or "/doctor-profiles?id=lead:abc"
  label:   string;   // e.g. "Vacancies", "Dr. Tarek El-Ghazaly"
  section: string;   // e.g. "Hospital Introduction"
  /** ISO timestamp of when it was last visited. */
  visited: string;
}

// Single tab tracker that watches location and pushes new items into
// localStorage. Mount it ONCE inside the layout.
export function useRecentItemsTracker(labelLookup: (path: string) => { label: string; section: string } | null) {
  const location = useLocation();
  useEffect(() => {
    const path = location.pathname + (location.search || "");
    if (SKIP_PATHS.has(location.pathname)) return;
    const meta = labelLookup(location.pathname);
    if (!meta) return;
    const item: RecentItem = {
      path,
      label:   meta.label,
      section: meta.section,
      visited: new Date().toISOString(),
    };
    try {
      const existing: RecentItem[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      const filtered = existing.filter(r => r.path !== item.path);
      const next = [item, ...filtered].slice(0, MAX_ITEMS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      // Notify listeners in the same tab (localStorage 'storage' event only
      // fires across tabs).
      window.dispatchEvent(new CustomEvent("aa-recent-items-changed"));
    } catch {
      // localStorage can be full / disabled — silently no-op
    }
  }, [location, labelLookup]);
}

// Consumer hook — re-reads localStorage on changes.
export function useRecentItems(): RecentItem[] {
  const [items, setItems] = useState<RecentItem[]>(() => readItems());
  useEffect(() => {
    const refresh = () => setItems(readItems());
    window.addEventListener("aa-recent-items-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("aa-recent-items-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return items;
}

function readItems(): RecentItem[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}
