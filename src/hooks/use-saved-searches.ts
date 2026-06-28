/**
 * use-saved-searches — Amir #6. localStorage-backed saved + recent searches for
 * UniversalSearch, mirroring use-recent-items.ts (read/write + same-tab change
 * event). Pure local state — fully testable in npm run dev, no backend.
 */
import { useEffect, useState } from "react";

const SAVED_KEY  = "aa-saved-searches-v1";
const RECENT_KEY = "aa-recent-searches-v1";
const MAX_SAVED  = 12;
const MAX_RECENT = 8;
const EVT = "aa-searches-changed";

export interface SavedSearch {
  id:    string;
  query: string;
  chip:  string;   // active SentChip when saved
  label: string;
}

function read<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) ?? "[]"); } catch { return []; }
}
function write<T>(key: string, v: T[]): void {
  try { localStorage.setItem(key, JSON.stringify(v)); window.dispatchEvent(new CustomEvent(EVT)); } catch { /* ignore */ }
}

export function useSavedSearches() {
  const [saved, setSaved]   = useState<SavedSearch[]>(() => read<SavedSearch>(SAVED_KEY));
  const [recent, setRecent] = useState<string[]>(() => read<string>(RECENT_KEY));

  useEffect(() => {
    const refresh = () => { setSaved(read<SavedSearch>(SAVED_KEY)); setRecent(read<string>(RECENT_KEY)); };
    window.addEventListener(EVT, refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener(EVT, refresh); window.removeEventListener("storage", refresh); };
  }, []);

  const save = (query: string, chip: string, label?: string) => {
    if (!query.trim() && chip === "all") return;
    const id = `${chip}::${query}`;
    const entry: SavedSearch = { id, query, chip, label: label || query || chip };
    write(SAVED_KEY, [entry, ...read<SavedSearch>(SAVED_KEY).filter(s => s.id !== id)].slice(0, MAX_SAVED));
  };
  const remove = (id: string) => write(SAVED_KEY, read<SavedSearch>(SAVED_KEY).filter(s => s.id !== id));

  /** Record an executed query into recent history (deduped, capped). */
  const pushRecent = (query: string) => {
    const q = query.trim();
    if (!q) return;
    write(RECENT_KEY, [q, ...read<string>(RECENT_KEY).filter(r => r !== q)].slice(0, MAX_RECENT));
  };
  const clearRecent = () => write(RECENT_KEY, []);

  return { saved, recent, save, remove, pushRecent, clearRecent };
}
