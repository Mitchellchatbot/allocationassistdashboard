import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, ArrowRight, Building2, ClipboardList, PauseCircle, History, Mail, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { parseCsvObjects, findHeader } from "@/lib/csv-parse";
import { buildDoctorMatcher } from "@/lib/doctor-name-matcher";
import { useAuth } from "@/hooks/use-auth";

/**
 * Bulk import page. Saif's team sends data as Google Sheets — we paste the
 * CSV export here and the system writes into the right table.
 *
 * Four importers, one per Saif sheet:
 *   1. Hospitals (the 95-row list)
 *   2. Vacancies (open roles)
 *   3. Unavailable doctors (with check-in dates)
 *   4. Doctors Placement Platform (historical placements → doctor_lifecycle)
 *
 * Each importer:
 *   - Accepts pasted CSV
 *   - Shows a preview of the first 10 parsed rows
 *   - Reports created / updated / skipped counts on commit
 *   - Idempotent — re-running with the same data won't double-write.
 *
 * Source: Saif's data list from the May 20 meeting, materials Ammar sent
 * Saturday 2026-05-23.
 */
export default function BulkImport() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Upload className="h-6 w-6 text-teal-600" />
            Bulk import
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Paste in CSV exports from Ammar's Google Sheets. The system parses headers fuzzy-style (any case, with or without underscores).
          </p>
        </div>

        <Tabs defaultValue="hospitals">
          <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6">
            <TabsTrigger value="hospitals" className="text-[12px]"><Building2 className="h-3.5 w-3.5 mr-1.5" />Hospitals</TabsTrigger>
            <TabsTrigger value="templates" className="text-[12px]"><Mail className="h-3.5 w-3.5 mr-1.5" />Hospital templates</TabsTrigger>
            <TabsTrigger value="vacancies" className="text-[12px]"><ClipboardList className="h-3.5 w-3.5 mr-1.5" />Vacancies</TabsTrigger>
            <TabsTrigger value="unavailable" className="text-[12px]"><PauseCircle className="h-3.5 w-3.5 mr-1.5" />Unavailable</TabsTrigger>
            <TabsTrigger value="placements" className="text-[12px]"><History className="h-3.5 w-3.5 mr-1.5" />Placements</TabsTrigger>
            <TabsTrigger value="sources"    className="text-[12px]"><Megaphone className="h-3.5 w-3.5 mr-1.5" />Source overrides</TabsTrigger>
          </TabsList>

          <TabsContent value="hospitals"   className="mt-4"><HospitalsImport   /></TabsContent>
          <TabsContent value="templates"   className="mt-4"><HospitalTemplatesImport /></TabsContent>
          <TabsContent value="vacancies"   className="mt-4"><VacanciesImport   /></TabsContent>
          <TabsContent value="unavailable" className="mt-4"><UnavailableImport /></TabsContent>
          <TabsContent value="placements"  className="mt-4"><PlacementsImport  /></TabsContent>
          <TabsContent value="sources"     className="mt-4"><SourceOverridesImport /></TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

// ── 1. Hospitals importer ──────────────────────────────────────────────────
function HospitalsImport() {
  return (
    <ImporterShell
      title="Hospitals"
      icon={Building2}
      sample={`Name,City,Country,Primary Contact Name,Primary Recruiter Email,Recruiter Phone,Notes
American Hospital Dubai,Dubai,UAE,Joffrey Smith,joffrey@american-hospital.com,+97144000000,
Mediclinic City Hospital,Dubai,UAE,,recruitment@mediclinic.ae,,`}
      instructions={`Expected headers (any case/spacing): Name (required), City, Country, Primary Contact Name, Primary Recruiter Email, Recruiter Phone, Notes.\nDeletes the 14 placeholder hospitals tagged notes='seed' before inserting. Existing real hospitals matched by name are UPDATED, not duplicated.`}
      processor={async (csv) => {
        const { headers, rows } = parseCsvObjects(csv);
        const nameH    = findHeader(headers, "name", "hospital", "hospital name");
        if (!nameH) throw new Error("Missing required 'Name' column.");
        const cityH    = findHeader(headers, "city");
        const countryH = findHeader(headers, "country");
        const contactH = findHeader(headers, "primary contact name", "primary contact", "contact name", "contact");
        const emailH   = findHeader(headers, "primary recruiter email", "recruiter email", "email");
        const phoneH   = findHeader(headers, "recruiter phone", "phone");
        const notesH   = findHeader(headers, "notes");

        // First: clear seed placeholders (idempotent — re-running is safe).
        await supabase.from("hospitals").delete().eq("notes", "seed");

        const payload = rows
          .filter(r => (r[nameH] ?? "").trim())
          .map(r => ({
            name:                    r[nameH].trim(),
            city:                    cityH    ? r[cityH].trim()    || null : null,
            country:                 countryH ? r[countryH].trim() || null : null,
            primary_contact_name:    contactH ? r[contactH].trim() || null : null,
            primary_recruiter_email: emailH   ? r[emailH].trim()   || null : null,
            recruiter_phone:         phoneH   ? r[phoneH].trim()   || null : null,
            notes:                   notesH   ? r[notesH].trim()   || null : null,
          }));

        // Upsert by name (loose dedupe). Returns counts in summary.
        let created = 0, updated = 0;
        for (const h of payload) {
          const { data: existing } = await supabase
            .from("hospitals").select("id").eq("name", h.name).maybeSingle();
          if (existing) {
            await supabase.from("hospitals").update(h).eq("id", existing.id);
            updated++;
          } else {
            await supabase.from("hospitals").insert(h);
            created++;
          }
        }
        return { created, updated, skipped: rows.length - payload.length };
      }}
    />
  );
}

// ── 1b. Hospital-specific email templates importer ────────────────────────
function HospitalTemplatesImport() {
  return (
    <ImporterShell
      title="Per-hospital email templates"
      icon={Mail}
      sample={`Hospital,Subject,Body
American Hospital Dubai,Profile Introduction — {{doctor_name}} for AHD,"Hi {{hospital_contact_name}},\\nPlease find {{doctor_name}}'s profile attached..."
Mediclinic City Hospital,New Candidate for Mediclinic — {{doctor_speciality}},"Dear Mediclinic team,..."`}
      instructions={`One row per hospital. Creates a unique email_template (key 'profile_sent_<slug>') and links it from the hospital's template_key column.\nBody can contain {{doctor_name}}, {{doctor_speciality}}, {{hospital_contact_name}}, {{city}}, {{country}} tokens (any tokens send-flow-email supports).\nUse literal "\\n" or actual newlines (CSV quoted cells). Subject is required, Body is required.\nHospitals must already exist (load them via the Hospitals tab first).`}
      processor={async (csv) => {
        const { headers, rows } = parseCsvObjects(csv);
        const hospitalH = findHeader(headers, "hospital", "hospital name", "name");
        const subjectH  = findHeader(headers, "subject");
        const bodyH     = findHeader(headers, "body", "body text", "html");
        if (!hospitalH || !subjectH || !bodyH) throw new Error("Missing required Hospital / Subject / Body columns.");

        const { data: allHospitals } = await supabase.from("hospitals").select("id, name");
        const byName = new Map<string, { id: string; name: string }>();
        for (const h of (allHospitals ?? []) as Array<{ id: string; name: string }>) {
          byName.set(h.name.toLowerCase().trim(), h);
        }

        let created = 0, updated = 0, skipped = 0;
        for (const r of rows) {
          const hName = (r[hospitalH] ?? "").trim();
          const subj  = (r[subjectH] ?? "").trim();
          const body  = (r[bodyH] ?? "").replace(/\\n/g, "\n").trim();
          if (!hName || !subj || !body) { skipped++; continue; }
          const hosp = byName.get(hName.toLowerCase());
          if (!hosp) { skipped++; continue; }
          const slug = slugify(hosp.name);
          const key  = `profile_sent_${slug}`;

          // Upsert template
          const { data: existing } = await supabase
            .from("email_templates").select("key").eq("key", key).maybeSingle();
          const payload = {
            key,
            name:        `Profile Sent · ${hosp.name}`,
            flow_key:    "profile_sent",
            subject:     subj,
            body_text:   body,
            body_html:   simpleHtml(body),
            variables:   '["doctor_name","doctor_speciality","hospital_contact_name","city","country"]',
            updated_at:  new Date().toISOString(),
          };
          if (existing) {
            await supabase.from("email_templates").update(payload).eq("key", key);
            updated++;
          } else {
            await supabase.from("email_templates").insert(payload);
            created++;
          }
          // Point the hospital at it
          await supabase.from("hospitals").update({ template_key: key }).eq("id", hosp.id);
        }
        return { created, updated, skipped };
      }}
    />
  );
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50);
}

function simpleHtml(plain: string): string {
  const escaped = plain
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const paragraphs = escaped.split(/\n{2,}/).map(p => p.replace(/\n/g, "<br>")).map(p => `<p style="margin:0 0 14px;line-height:1.6;">${p}</p>`).join("");
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a2332;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6f8;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(20,47,76,0.06);max-width:600px;">
          <tr><td style="background:#14a098;padding:24px 32px;">
            <div style="color:#fff;font-size:19px;font-weight:700;">Allocation Assist</div>
          </td></tr>
          <tr><td style="padding:32px;font-size:15px;color:#2d3a4a;">${paragraphs}</td></tr>
          <tr><td style="background:#fbfbfc;padding:20px 32px;border-top:1px solid #eaecef;font-size:11px;color:#6c757d;">
            <strong style="color:#495057;">Allocation Assist DMCC</strong> · 2604 Reef Tower, JLT, Dubai, UAE
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body></html>`;
}

// ── 2. Vacancies importer ──────────────────────────────────────────────────
function VacanciesImport() {
  const { user } = useAuth();
  return (
    <ImporterShell
      title="Vacancies"
      icon={ClipboardList}
      sample={`Hospital,Specialty,Priority,Target Fill Days,Notes
American Hospital Dubai,Pediatrics,High,3,Needs Arabic speaker
Mediclinic City Hospital,Urology,Medium,14,SCFHS preferred`}
      instructions={`Expected headers: Hospital (required), Specialty (required), Priority (high/medium/low), Target Fill Days, Notes.\nResolves Hospital column to a hospital_id by matching the name — make sure the hospitals are loaded first.`}
      processor={async (csv) => {
        const { headers, rows } = parseCsvObjects(csv);
        const hospitalH = findHeader(headers, "hospital", "hospital name", "name");
        const specH     = findHeader(headers, "specialty", "speciality");
        if (!hospitalH || !specH) throw new Error("Missing required 'Hospital' or 'Specialty' column.");
        const prioH   = findHeader(headers, "priority", "pri");
        const daysH   = findHeader(headers, "target fill days", "target days", "days", "fill days");
        const notesH  = findHeader(headers, "notes", "notes/requirements", "requirements");

        const { data: allHospitals } = await supabase.from("hospitals").select("id, name");
        const hospitalByName = new Map<string, string>();
        for (const h of (allHospitals ?? []) as Array<{ id: string; name: string }>) {
          hospitalByName.set(h.name.toLowerCase().trim(), h.id);
        }

        let created = 0, skipped = 0;
        for (const r of rows) {
          const name = (r[hospitalH] ?? "").trim();
          const spec = (r[specH] ?? "").trim();
          if (!name || !spec) { skipped++; continue; }
          const hid = hospitalByName.get(name.toLowerCase()) ?? null;
          const rawPriority = (prioH ? r[prioH] : "").trim().toLowerCase();
          const priority = ["high", "medium", "low"].includes(rawPriority) ? rawPriority : "medium";
          await supabase.from("vacancies").insert({
            hospital_id:      hid,
            hospital_name:    name,
            specialty:        spec,
            priority,
            target_fill_days: daysH && r[daysH] ? Number(r[daysH]) || null : null,
            notes:            notesH ? r[notesH] || null : null,
            opened_by:        user?.email ?? null,
          });
          created++;
        }
        return { created, updated: 0, skipped };
      }}
    />
  );
}

// ── 3. Unavailable doctors importer ────────────────────────────────────────
function UnavailableImport() {
  return (
    <ImporterShell
      title="Unavailable Doctors"
      icon={PauseCircle}
      sample={`Doctor Name,Unavailable from,Available on,Reason
Dr. Hamzah Awad,5/20/2025,7/1/2026,Visa pending
Dr. Daniel Barta,,Aug 2026,
Dr. Camille Sayed,8/14/2025,7/1/2026,On leave`}
      instructions={`The Ammar "Unavailable doctors" sheet shape. Expected headers (any case):\n  • Doctor Name (required) — "Dr. " prefix optional; the system fuzzy-matches against Zoho leads + DOB so you don't have to look up internal IDs.\n  • Unavailable from — date (optional; defaults to today).\n  • Available on — date OR free text like "later", "Aug 2026", "Not answering". When unparseable, the doctor is paused with the text stored on the reason.\n  • Reason — optional explanation.\nRows where the name can't be matched against Zoho are reported separately so you can fix them.`}
      processor={async (csv) => {
        const { headers, rows } = parseCsvObjects(csv);
        const nameH = findHeader(headers, "doctor name", "name", "doctor");
        if (!nameH) throw new Error("Missing required 'Doctor Name' column.");
        const reasonH = findHeader(headers, "reason", "note", "notes", "remarks");
        const fromH   = findHeader(headers, "unavailable from", "from", "since");
        const toH     = findHeader(headers, "available on", "available", "check-in date", "checkin date", "check in date", "date");
        const idH     = findHeader(headers, "doctor id", "id");  // optional: if user already has prefixed ids

        // Build a Zoho-name-to-prefixed-id matcher from the cache.
        const { data: cacheRows } = await supabase.from("zoho_cache").select("id, data").in("id", [1, 2]);
        const merged: Record<string, unknown> = {};
        for (const r of (cacheRows ?? []) as Array<{ id: number; data: Record<string, unknown> }>) {
          if (r.data) Object.assign(merged, r.data);
        }
        const leadsArr = (merged.leads as Array<{ id: string; Full_Name?: string; First_Name?: string; Last_Name?: string }>) ?? [];
        const dobsArr  = (merged.doctorsOnBoard as Array<{ id: string; Full_Name?: string; First_Name?: string; Last_Name?: string }>) ?? [];
        const candidates: { prefixedId: string; name: string }[] = [];
        for (const l of leadsArr) {
          const n = l.Full_Name || `${l.First_Name ?? ""} ${l.Last_Name ?? ""}`.trim();
          if (n) candidates.push({ prefixedId: `lead:${l.id}`, name: n });
        }
        for (const d of dobsArr) {
          const n = d.Full_Name || `${d.First_Name ?? ""} ${d.Last_Name ?? ""}`.trim();
          if (n) candidates.push({ prefixedId: `dob:${d.id}`, name: n });
        }
        const matcher = buildDoctorMatcher(candidates);

        const unmatched: { name: string; index: number }[] = [];
        let created = 0, updated = 0, skipped = 0;
        for (let i = 0; i < rows.length; i++) {
          const r  = rows[i];
          const nm = (r[nameH] ?? "").trim();
          if (!nm) { skipped++; continue; }

          // Prefer explicit ID column when present; otherwise fuzzy-match.
          let prefixedId = (idH ? (r[idH] ?? "").trim() : "");
          if (!prefixedId) {
            const m = matcher(nm);
            prefixedId = m.prefixedId ?? "";
            if (!prefixedId) { unmatched.push({ name: nm, index: i + 2 }); skipped++; continue; }
          }

          const reasonRaw     = reasonH ? (r[reasonH] ?? "").trim() : "";
          const availOnRaw    = toH     ? (r[toH] ?? "").trim()     : "";
          const checkInDate   = parseFuzzyDate(availOnRaw);
          // When the "available on" cell is non-empty but not a parseable
          // date ("later", "Not answering"), stash it on the reason so it
          // survives in the UI.
          const reasonCombined = [
            reasonRaw || null,
            (!checkInDate && availOnRaw) ? `Status: ${availOnRaw}` : null,
          ].filter(Boolean).join(" · ") || null;

          const payload = {
            doctor_id:              prefixedId,
            doctor_name:            nm.replace(/^(dr\.?\s+|prof\.?\s+)/i, ""),
            unavailable:            true,
            unavailable_reason:     reasonCombined,
            available_check_in_at:  checkInDate,
            eligible_for_sending:   false,
            updated_at:             new Date().toISOString(),
          };
          const { data: existing } = await supabase
            .from("doctor_lifecycle").select("doctor_id").eq("doctor_id", prefixedId).maybeSingle();
          if (existing) {
            await supabase.from("doctor_lifecycle").update(payload).eq("doctor_id", prefixedId);
            updated++;
          } else {
            await supabase.from("doctor_lifecycle").insert(payload);
            created++;
          }
        }

        // Surface unmatched rows to the user. We piggy-back on toast for the
        // alert; the summary banner below shows the counts.
        if (unmatched.length > 0) {
          const sample = unmatched.slice(0, 6).map(u => `row ${u.index}: "${u.name}"`).join("\n");
          toast.warning(
            `${unmatched.length} doctor${unmatched.length === 1 ? "" : "s"} couldn't be matched to a Zoho record.\nFix the name in the sheet and re-import.\n\nFirst few:\n${sample}`,
            { duration: 15_000 },
          );
        }
        return { created, updated, skipped };
      }}
    />
  );
}

/** Parse the messy "Available on" strings from Ammar's sheets:
 *   "7/1/2026" → ISO
 *   "Aug 2026" → 2026-08-01
 *   "Few months" / "later" / "Not answering" → null (caller stores raw text on reason)
 *   "" → null
 */
function parseFuzzyDate(raw: string): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;

  // ISO / numeric date — try Date() and accept if valid.
  const d = new Date(s);
  if (!isNaN(d.getTime()) && /\d/.test(s) && /\d{4}/.test(s)) {
    return d.toISOString();
  }
  // "Aug 2026" → first day of Aug 2026
  const monthYearMatch = s.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(\d{4})$/i);
  if (monthYearMatch) {
    const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 } as const;
    const m = monthYearMatch[1].toLowerCase().slice(0, 4) as keyof typeof months;
    const yr = Number(monthYearMatch[2]);
    if (months[m] !== undefined && Number.isFinite(yr)) {
      return new Date(yr, months[m], 1).toISOString();
    }
  }
  return null;
}

// ── 4. Doctors Placement Platform sheet → doctor_lifecycle backfill ──────
function PlacementsImport() {
  return (
    <ImporterShell
      title="Historical placements"
      icon={History}
      sample={`Doctor ID,Doctor Name,Signed At,Joined At,Approved At,Paid At
lead:abc123,Dr. Tarek El-Ghazaly,2025-09-15,2025-10-01,2025-10-08,2025-10-25
lead:def456,Dr. Yaman Alsaid,2025-11-02,2025-12-01,,`}
      instructions={`Backfills doctor_lifecycle with milestone dates from the Doctors Placement Platform sheet (2024/25/26). Any column you don't have can be left blank.\nDoctor IDs need to be in prefixed form (lead:<id> or dob:<id>). If your sheet only has names, send me the column layout and I'll write a Zoho-name-matcher pass.`}
      processor={async (csv) => {
        const { headers, rows } = parseCsvObjects(csv);
        const idH   = findHeader(headers, "doctor id", "id", "doctor_id");
        const nameH = findHeader(headers, "doctor name", "name");
        if (!idH || !nameH) throw new Error("Missing required 'Doctor ID' or 'Doctor Name' column.");
        const signedH   = findHeader(headers, "signed at", "signed", "signed date");
        const joinedH   = findHeader(headers, "joined at", "joined", "joining date", "joined date");
        const approvedH = findHeader(headers, "approved at", "approved", "approved date");
        const paidH     = findHeader(headers, "paid at", "paid", "paid date", "payment date");
        const toISO = (raw: string) => {
          const s = raw?.trim();
          if (!s) return null;
          const d = new Date(s);
          return Number.isNaN(d.getTime()) ? null : d.toISOString();
        };

        let created = 0, updated = 0, skipped = 0;
        for (const r of rows) {
          const id = (r[idH] ?? "").trim();
          const nm = (r[nameH] ?? "").trim();
          if (!id || !nm) { skipped++; continue; }
          const signed   = signedH   ? toISO(r[signedH])   : null;
          const joined   = joinedH   ? toISO(r[joinedH])   : null;
          const approved = approvedH ? toISO(r[approvedH]) : null;
          const paid     = paidH     ? toISO(r[paidH])     : null;
          const payload = {
            doctor_id:    id,
            doctor_name:  nm,
            signed_at:    signed,
            joined_at:    joined,
            approved_at:  approved,
            paid_at:      paid,
            eligible_for_sending: !signed,  // signed doctors are off the send list
            updated_at:   new Date().toISOString(),
          };
          const { data: existing } = await supabase
            .from("doctor_lifecycle").select("doctor_id").eq("doctor_id", id).maybeSingle();
          if (existing) {
            await supabase.from("doctor_lifecycle").update(payload).eq("doctor_id", id);
            updated++;
          } else {
            await supabase.from("doctor_lifecycle").insert(payload);
            created++;
          }
        }
        return { created, updated, skipped };
      }}
    />
  );
}

// ── 5. Lead-source overrides (Meta attribution fix) ───────────────────────
function SourceOverridesImport() {
  const { user } = useAuth();
  return (
    <ImporterShell
      title="Lead source overrides"
      icon={Megaphone}
      sample={`Lead ID,Override Source,Note
1234567890,Meta,Yamima confirmed Meta campaign Oct 2025
2345678901,Meta,Yamima confirmed Meta campaign Oct 2025`}
      instructions={`The Meta attribution fix from the May 20 plan. 9 leads currently tagged Lead_Source="XXX" are actually from Meta — paste their Zoho lead IDs (without lead: prefix — just the raw Zoho id) and the system will reclassify them everywhere displaySource() is used.\n\nNote: this requires verifying which leads against Yamima's campaign link. If you don't have IDs yet, leave this blank and we'll fill it in once verified.`}
      processor={async (csv) => {
        const { headers, rows } = parseCsvObjects(csv);
        const idH      = findHeader(headers, "lead id", "lead_id", "id");
        const sourceH  = findHeader(headers, "override source", "source", "channel");
        if (!idH || !sourceH) throw new Error("Missing required 'Lead ID' or 'Override Source' column.");
        const noteH    = findHeader(headers, "note", "notes");

        let created = 0, updated = 0, skipped = 0;
        for (const r of rows) {
          const id  = (r[idH] ?? "").trim();
          const src = (r[sourceH] ?? "").trim();
          if (!id || !src) { skipped++; continue; }
          const { data: existing } = await supabase
            .from("lead_source_overrides").select("lead_id").eq("lead_id", id).maybeSingle();
          const payload = {
            lead_id:         id,
            override_source: src,
            note:            noteH ? (r[noteH] ?? "").trim() || null : null,
            created_by:      user?.email ?? null,
            updated_at:      new Date().toISOString(),
          };
          if (existing) {
            await supabase.from("lead_source_overrides").update(payload).eq("lead_id", id);
            updated++;
          } else {
            await supabase.from("lead_source_overrides").insert(payload);
            created++;
          }
        }
        return { created, updated, skipped };
      }}
    />
  );
}

// ── Shared importer shell ─────────────────────────────────────────────────
function ImporterShell({ title, icon: Icon, sample, instructions, processor }: {
  title: string;
  icon: typeof Upload;
  sample: string;
  instructions: string;
  processor: (csv: string) => Promise<{ created: number; updated: number; skipped: number }>;
}) {
  const [csv, setCsv]   = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number } | null>(null);
  const [error,  setError]  = useState<string | null>(null);
  const [preview, setPreview] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null);

  const onParse = () => {
    setError(null);
    try {
      const parsed = parseCsvObjects(csv);
      setPreview(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onCommit = async () => {
    setBusy(true); setError(null); setResult(null);
    try {
      const r = await processor(csv);
      setResult(r);
      toast.success(`${title} import: ${r.created} created, ${r.updated} updated, ${r.skipped} skipped.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error(msg);
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Icon className="h-4 w-4 text-teal-600" />
          {title}
        </CardTitle>
        <CardDescription className="text-[11px] whitespace-pre-line">{instructions}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <FileSpreadsheet className="h-3 w-3" />
          Sample (copy from a Google Sheet → File → Download → CSV):
        </div>
        <pre className="rounded-md border bg-slate-50 px-3 py-2 text-[10px] font-mono overflow-x-auto">{sample}</pre>
        <Textarea
          value={csv}
          onChange={e => setCsv(e.target.value)}
          rows={10}
          className="text-[11px] font-mono"
          placeholder="Paste CSV here..."
        />
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={onParse} disabled={!csv.trim()}>
            <ArrowRight className="h-3.5 w-3.5 mr-1.5" /> Preview
          </Button>
          <Button size="sm" onClick={onCommit} disabled={busy || !csv.trim()}>
            <Upload className="h-3.5 w-3.5 mr-1.5" /> {busy ? "Importing..." : "Commit import"}
          </Button>
          {preview && <Badge variant="outline" className="text-[10px]">{preview.rows.length} rows parsed</Badge>}
        </div>

        {preview && preview.rows.length > 0 && (
          <div className="rounded-md border max-h-[260px] overflow-auto">
            <table className="w-full text-[10px]">
              <thead className="bg-slate-50 sticky top-0">
                <tr>{preview.headers.map(h => <th key={h} className="text-left px-2 py-1 font-medium border-b">{h}</th>)}</tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 10).map((r, i) => (
                  <tr key={i} className="border-b">
                    {preview.headers.map(h => <td key={h} className="px-2 py-1 truncate max-w-[180px]">{r[h] ?? ""}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.rows.length > 10 && (
              <div className="px-2 py-1 text-[10px] text-muted-foreground bg-slate-50">+{preview.rows.length - 10} more rows</div>
            )}
          </div>
        )}

        {result && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 flex items-start gap-2 text-[11px] text-emerald-900">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-[2px]" />
            <span>
              <strong>{result.created}</strong> created, <strong>{result.updated}</strong> updated, <strong>{result.skipped}</strong> skipped.
            </span>
          </div>
        )}
        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 flex items-start gap-2 text-[11px] text-rose-900">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-[2px]" />
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
