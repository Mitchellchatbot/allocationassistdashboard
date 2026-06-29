/**
 * Per-user template browsing prefs (favorites + recently-used), kept in
 * localStorage so they need no DB/migration and work in npm run dev. Used by
 * TemplatePicker to surface the handful of templates you actually reach for at
 * the top of the list — the answer to "I have 20 templates and just browse".
 */
const FAV_KEY    = "aa.templatePrefs.favorites";
const RECENT_KEY = "aa.templatePrefs.recent";
const RECENT_MAX = 6;

function read(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch { return []; }
}
function write(key: string, val: string[]): void {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* ignore */ }
}

export function getFavorites(): string[] { return read(FAV_KEY); }

/** Toggle a template key in/out of favorites; returns the new list. */
export function toggleFavorite(templateKey: string): string[] {
  const cur = getFavorites();
  const next = cur.includes(templateKey) ? cur.filter(k => k !== templateKey) : [...cur, templateKey];
  write(FAV_KEY, next);
  return next;
}

export function getRecent(): string[] { return read(RECENT_KEY); }

/** Record a template as just-used; most recent first, de-duped, capped. */
export function pushRecent(templateKey: string): string[] {
  const next = [templateKey, ...getRecent().filter(k => k !== templateKey)].slice(0, RECENT_MAX);
  write(RECENT_KEY, next);
  return next;
}
