import { useCallback, useEffect, useState } from "react";

/**
 * A tiny persistent address book for MANUALLY-entered recipients.
 *
 * The hospital contacts that power the send autocomplete come read-only from
 * Zoho. But the team often types a one-off address that isn't synced (a new HR
 * contact, a covering colleague). Team request: "if they upload a custom email
 * … add a lil name thing too so we can record it for all of our emails — apply
 * it to all." So when a custom address is named here, we remember the
 * name↔email pairing and surface it as a suggestion in EVERY send from then on
 * (and greet by that name), until it eventually shows up in the Zoho sync.
 *
 * Stored in localStorage (per-browser) so it needs no backend/deploy; a shared
 * DB-backed version can replace this later without touching the callers.
 */
export interface CustomContact { email: string; name: string }

const STORAGE_KEY = "aa.customContacts.v1";
// Same-tab updates broadcast on this event (the native `storage` event only
// fires in OTHER tabs), so every mounted ToField refreshes immediately.
const CHANGE_EVENT = "aa:custom-contacts-changed";

function read(): CustomContact[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((c): CustomContact => ({ email: String(c?.email ?? "").trim(), name: String(c?.name ?? "").trim() }))
      .filter(c => c.email);
  } catch { return []; }
}

function write(list: CustomContact[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch { /* storage full / disabled — non-fatal */ }
}

export function useCustomContacts() {
  const [list, setList] = useState<CustomContact[]>(read);

  useEffect(() => {
    const refresh = () => setList(read());
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  /** Record (or rename) a manual recipient — applied to all future sends. */
  const save = useCallback((email: string, name: string) => {
    const e = email.trim();
    const n = name.trim();
    if (!e) return;
    const next = read().filter(c => c.email.toLowerCase() !== e.toLowerCase());
    next.push({ email: e, name: n });
    next.sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
    write(next);
  }, []);

  const remove = useCallback((email: string) => {
    write(read().filter(c => c.email.toLowerCase() !== email.trim().toLowerCase()));
  }, []);

  /** The saved name for an email, if any. */
  const nameFor = useCallback(
    (email: string) => read().find(c => c.email.toLowerCase() === email.trim().toLowerCase())?.name ?? "",
    [],
  );

  return { list, save, remove, nameFor };
}
