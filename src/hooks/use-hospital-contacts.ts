import { useMemo } from "react";
import { useZohoData, type ZohoHospitalContact } from "@/hooks/use-zoho-data";
import type { Hospital } from "@/hooks/use-hospitals";

/** A hospital contact, flattened from the Zoho record for the UI + send flow. */
export interface HospitalContact {
  id:        string;
  name:      string;
  title:     string | null;   // HR / CEO — present once the sync fetches it
  email:     string | null;
  phone:     string | null;
  type:      string | null;   // "Primary" | "Secondary"
  isPrimary: boolean;
}

/** The parent-hospital (Account) name off a Zoho contact's Hospital lookup. */
export function hospitalNameOfContact(c: ZohoHospitalContact): string {
  const h = c.Hospital;
  if (!h) return "";
  return typeof h === "string" ? h : (h.name ?? "");
}

const norm = (s: string) => (s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
/** Looser key — drops generic hospital words so "NMC Healthcare" ≈ "NMC". */
const core = (s: string) =>
  norm(s).replace(/\b(hospital|hospitals|clinic|clinics|medical|centre|center|group|the|healthcare|health|university|llc|company)\b/g, "")
    .replace(/\s+/g, " ").trim();

function toContact(c: ZohoHospitalContact): HospitalContact {
  const type = c.Contact_Type ?? null;
  return {
    id:        c.id,
    name:      (c.Name ?? "").trim(),
    title:     (c.title ?? "")?.trim() || null,
    email:     (c.Email ?? "").trim() || null,
    phone:     (c.Phone ?? "").trim() || null,
    type,
    isPrimary: /primary/i.test(type ?? ""),
  };
}

/** Contacts grouped by parent hospital, with a fuzzy `forHospital(name)` lookup. */
export function useHospitalContacts() {
  const { data: zoho } = useZohoData();
  return useMemo(() => {
    const byCore = new Map<string, HospitalContact[]>();
    for (const raw of (zoho?.rawHospitalContacts ?? []) as ZohoHospitalContact[]) {
      const c = toContact(raw);
      if (!c.email && !c.name) continue;
      const key = core(hospitalNameOfContact(raw));
      if (!key) continue;
      const arr = byCore.get(key) ?? [];
      arr.push(c);
      byCore.set(key, arr);
    }
    for (const arr of byCore.values()) {
      arr.sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0) || a.name.localeCompare(b.name));
    }
    const total = Array.from(byCore.values()).reduce((n, a) => n + a.length, 0);
    return {
      total,
      forHospital(name: string): HospitalContact[] {
        const k = core(name);
        if (!k) return [];
        if (byCore.has(k)) return byCore.get(k)!;
        // Loose containment fallback (handles branch suffixes / word drops).
        for (const [key, arr] of byCore) {
          if (key.includes(k) || k.includes(key)) return arr;
        }
        return [];
      },
    };
  }, [zoho?.rawHospitalContacts]);
}

type HospitalRouting = Pick<Hospital,
  "contact_mode" | "cycle_cursor" | "excluded_contact_emails" | "primary_recruiter_email" | "primary_contact_name">;

/** Emailable contacts for a hospital, in rotation order, honouring exclusions. */
export function eligibleRecipients(contacts: HospitalContact[], hospital: Pick<Hospital, "excluded_contact_emails">): HospitalContact[] {
  const excluded = new Set((hospital.excluded_contact_emails ?? []).map(e => e.toLowerCase()));
  return contacts.filter(c => c.email && !excluded.has(c.email.toLowerCase()));
}

/**
 * The ONE contact a send goes to, per the hospital's mode:
 *   primary → the Primary contact (first eligible if none flagged Primary)
 *   cycle   → the contact at cycle_cursor; nextCursor is where the rotation
 *             advances to after this send.
 * Falls back to the hospital's own primary_recruiter_email when no Zoho
 * contacts matched — so nothing regresses for unmatched hospitals.
 */
export function resolveRecipient(
  contacts: HospitalContact[],
  hospital: HospitalRouting,
): { contact: HospitalContact | null; nextCursor: number; fromHospitalRow: boolean } {
  const pool = eligibleRecipients(contacts, hospital);
  const cursor = hospital.cycle_cursor ?? 0;
  if (pool.length === 0) {
    if (hospital.primary_recruiter_email) {
      return {
        contact: { id: "hospital-row", name: hospital.primary_contact_name ?? "", title: null, email: hospital.primary_recruiter_email, phone: null, type: "Primary", isPrimary: true },
        nextCursor: cursor,
        fromHospitalRow: true,
      };
    }
    return { contact: null, nextCursor: cursor, fromHospitalRow: false };
  }
  if ((hospital.contact_mode ?? "primary") === "cycle") {
    const idx = ((cursor % pool.length) + pool.length) % pool.length;
    return { contact: pool[idx], nextCursor: (idx + 1) % pool.length, fromHospitalRow: false };
  }
  const primary = pool.find(c => c.isPrimary) ?? pool[0];
  return { contact: primary, nextCursor: cursor, fromHospitalRow: false };
}
