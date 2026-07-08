import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Hospital as HospitalIcon, Image as ImageIcon, Search, Save, Eye, RotateCcw, Pencil, Wand2, Plus, Sparkles, Trash2, Users, Mail } from "lucide-react";
import { toast } from "sonner";
import { useHospitals, useCreateHospital, useUpdateHospital, useDeleteHospital, type Hospital, type HospitalInput } from "@/hooks/use-hospitals";
import { useHospitalContacts } from "@/hooks/use-hospital-contacts";
import { HospitalDialog, HospitalContactsPanel } from "@/components/automations/HospitalsTab";
import { Dialog as UiDialog, DialogContent as UiDialogContent, DialogHeader as UiDialogHeader, DialogTitle as UiDialogTitle } from "@/components/ui/dialog";
import {
  useEmailTemplates, useCreateEmailTemplate, useUpdateEmailTemplate, useDeleteEmailTemplate,
  renderTemplate, type EmailTemplate,
} from "@/hooks/use-email-templates";
import { uploadEmailAttachment } from "@/lib/email-attachments";
import { EmailPreview } from "@/components/EmailPreview";

// The doctor "working opportunity" email — the one carrying the hospital photo
// ({{hospital_image}}). send-flow-email's email_doctor stage defaults to this and
// falls back to the hospital's own variant (hospitals.doctor_template_key).
const DEFAULT_DOCTOR_KEY = "profile_sent_doctor";
const ownKeyFor = (h: Hospital) => `${DEFAULT_DOCTOR_KEY}__${h.id}`;

// Put the photo just after the greeting when a template lacks the slot.
function withImageSlot(html: string): string {
  if (!html || html.includes("{{hospital_image}}")) return html;
  const i = html.indexOf("</p>");
  return i === -1 ? `{{hospital_image}}\n${html}` : `${html.slice(0, i + 4)}\n{{hospital_image}}${html.slice(i + 4)}`;
}

// Full send signature (logo + website) so the preview matches the real email.
const PREVIEW_LOGO_URL = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/email-assets/logo.png`;
const PREVIEW_SANS = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`;
const FULL_SIGNATURE_HTML = `
<p style="margin:24px 0 0;font-family:${PREVIEW_SANS};font-size:14px;color:#1a2332;line-height:1.5;">&nbsp;</p>
<p style="color:#14b8a6;font-weight:700;font-size:14px;margin:0 0 2px;line-height:1.45;font-family:${PREVIEW_SANS};">Warmest Regards,</p>
<p style="color:#14b8a6;font-weight:700;font-size:14px;margin:0 0 2px;line-height:1.45;font-family:${PREVIEW_SANS};">The Allocation Assist team</p>
<p style="color:#475569;font-size:13px;margin:6px 0 2px;line-height:1.45;font-family:${PREVIEW_SANS};"><span style="color:#14b8a6;">&#x1F4CD;</span> Jumeirah Lakes Towers, Dubai, UAE</p>
<p style="font-size:13px;margin:2px 0 16px;line-height:1.45;font-family:${PREVIEW_SANS};"><a href="https://www.allocationassist.com" style="color:#1d4ed8;text-decoration:underline;">www.allocationassist.com</a></p>
<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 0;">
  <tr><td style="padding:0;"><img src="${PREVIEW_LOGO_URL}" alt="Allocation Assist" width="180" height="119" style="display:block;border:0;outline:none;max-width:180px;width:180px;height:auto;" /></td></tr>
</table>`;
const FULL_SIGNATURE_TEXT = `\n\nWarmest Regards,\nThe Allocation Assist team\n\nJumeirah Lakes Towers, Dubai, UAE\nwww.allocationassist.com\n`;

// Concrete values people type in a draft → the token they become.
const KNOWN_FIELDS: Array<{ token: string; label: string; sample: string }> = [
  { token: "doctor_name",           label: "Doctor name",     sample: "Dr. Heena Sharma" },
  { token: "doctor_speciality",     label: "Specialty",       sample: "Pediatrics" },
  { token: "hospital_name",         label: "Hospital",        sample: "Mediclinic" },
  { token: "hospital_contact_name", label: "Hospital contact", sample: "Hassan" },
  { token: "city",                  label: "City",            sample: "Dubai" },
  { token: "country",               label: "Country",         sample: "UAE" },
];
const INSERT_TOKENS: Array<{ token: string; label: string }> = [
  { token: "hospital_image",        label: "Hospital photo" },
  { token: "signature",             label: "Signature" },
  { token: "doctor_card_html",      label: "Doctor card" },
  { token: "doctor_row_table_html", label: "Doctor details table" },
];
const stub = (label: string) => `<p style="color:#94a3b8;font-style:italic;">[${label} renders here at send time]</p>`;
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "template";

// ── Simple mode: friendly [placeholders] instead of {{tokens}}, no HTML ──────
// Laymen write plain words and click chips; we convert to/from the stored
// {{token}} + HTML shape behind the scenes. Photo + signature are automatic.
const FRIENDLY: Array<{ label: string; token: string; bracket: string }> = [
  { label: "Doctor's name",  token: "doctor_name",           bracket: "[Doctor's name]" },
  { label: "Hospital name",  token: "hospital_name",         bracket: "[Hospital name]" },
  { label: "City",           token: "city",                  bracket: "[City]" },
  { label: "Country",        token: "country",               bracket: "[Country]" },
  { label: "Contact person", token: "hospital_contact_name", bracket: "[Contact person]" },
];
const friendlyToTokens = (s: string) => FRIENDLY.reduce((a, f) => a.split(f.bracket).join(`{{${f.token}}}`), s);
const tokensToFriendly = (s: string) => FRIENDLY.reduce((a, f) => a.split(`{{${f.token}}}`).join(f.bracket), s);
const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const linkify = (s: string) => s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#1d4ed8;text-decoration:underline;">$1</a>');

/** Simple friendly-text → stored HTML body: escape words, [placeholders] →
 *  {{tokens}}, wrap blank-line blocks in <p>, drop the photo slot in, append
 *  the signature. */
function buildHtmlFromSimple(friendly: string, wantSlot: boolean): string {
  const tokenText = friendlyToTokens(friendly);
  const paras = tokenText.split(/\n{2,}/).map(b => b.trim()).filter(Boolean)
    .map(b => `<p>${linkify(escHtml(b)).replace(/\n/g, "<br>")}</p>`).join("\n");
  const withPhoto = wantSlot ? withImageSlot(paras) : paras;
  return `${withPhoto}\n{{signature}}`;
}
const buildTextFromSimple = (friendly: string) => `${friendlyToTokens(friendly).trim()}\n\n{{signature_text}}`;

/** Stored HTML body → friendly editable text (strip photo/signature, unwrap
 *  tags, {{tokens}} → [placeholders]) so laymen can edit existing templates. */
function htmlToFriendly(html: string): string {
  let s = html || "";
  s = s.replace(/\{\{hospital_image\}\}/g, "").replace(/\{\{signature(_text)?\}\}/g, "");
  s = s.replace(/<a\b[^>]*>(.*?)<\/a>/gis, "$1");
  s = s.replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n\n").replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  s = s.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#39;/gi, "'").replace(/&quot;/gi, '"');
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return tokensToFriendly(s);
}

// Dictionaries for "Auto-detect".
const CITY_LIST = ["Abu Dhabi", "Al Ain", "Al Dhafra", "Dubai", "Sharjah", "Ras Al Khaimah", "Ajman", "Fujairah", "Umm Al Quwain", "Doha", "Riyadh", "Jeddah", "Dammam", "Al Ahsa", "Dhahran", "Khobar", "Mecca", "Medina", "Manama", "Kuwait City", "Muscat"];
const COUNTRY_LIST = ["United Arab Emirates", "Saudi Arabia", "UAE", "KSA", "Qatar", "Oman", "Bahrain", "Kuwait"];
const SPECIALTY_LIST = ["Emergency Medicine", "Family Medicine", "Internal Medicine", "General Surgery", "Plastic Surgery", "Intensive Care", "Neonatology", "Neurosurgery", "Paediatrics", "Pediatrics", "Cardiology", "Neurology", "Orthopaedics", "Orthopedics", "Radiology", "Anaesthesiology", "Anesthesiology", "Dermatology", "Oncology", "Psychiatry", "Obstetrics", "Gynaecology", "Gynecology", "Ophthalmology", "Otolaryngology", "Urology", "Nephrology", "Gastroenterology", "Endocrinology", "Pulmonology", "Pathology", "Haematology", "Hematology", "Rheumatology", "ENT"];

function detectValues(text: string, hospitalNames: string[]): Partial<Record<string, string>> {
  const out: Record<string, string> = {};
  const dr = text.match(/\bDr\.?\s+[A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+){0,2}/);
  if (dr) out.doctor_name = dr[0].replace(/\s+/g, " ").trim();
  const lc = text.toLowerCase();
  let bestHospital = "";
  for (const n of hospitalNames) {
    if (n && n.length > 4 && lc.includes(n.toLowerCase()) && n.length > bestHospital.length) bestHospital = n;
  }
  if (bestHospital) out.hospital_name = bestHospital;
  const firstMatch = (list: string[]) =>
    [...list].sort((a, b) => b.length - a.length).find(x => new RegExp(`\\b${escapeRegExp(x)}\\b`, "i").test(text));
  const city = firstMatch(CITY_LIST);       if (city) out.city = city;
  const country = firstMatch(COUNTRY_LIST);  if (country) out.country = country;
  const spec = firstMatch(SPECIALTY_LIST);   if (spec) out.doctor_speciality = spec;
  return out;
}

// "Type" of a NEW template. Profile Sent covers two audiences (hospital + doctor)
// on one flow_key — split here. `keyBase` seeds the template key so the audience
// picker routes it right. Onboarding is retired (see automation-flows FLOW_ORDER).
const TYPE_OPTIONS: Array<{ value: string; label: string; flowKey: string; keyBase: string; from: string }> = [
  { value: "profile_sent_doctor",   label: "Profile Sent to Doctor (Working Opportunity)", flowKey: "profile_sent",     keyBase: "profile_sent_doctor",   from: "Opportunities <opportunities@allocationassist.com>" },
  { value: "profile_sent_hospital", label: "Profile Sent to Hospital",                     flowKey: "profile_sent",     keyBase: "profile_sent_hospital", from: "Hospital Intro <hospitalintro@allocationassist.com>" },
  { value: "shortlist",             label: "Shortlist Confirmation",                       flowKey: "shortlist",        keyBase: "shortlist",             from: "Allocation Assist <hello@allocationassist.com>" },
  { value: "interview",             label: "Interview Tips + Confirmation",                flowKey: "interview",        keyBase: "interview",             from: "Allocation Assist <hello@allocationassist.com>" },
  { value: "contract_signing",      label: "Contract Check-in",                            flowKey: "contract_signing", keyBase: "contract",              from: "Allocation Assist <hello@allocationassist.com>" },
  { value: "relocation",            label: "Relocation Guide + Attestation",               flowKey: "relocation",       keyBase: "relocation",            from: "Allocation Assist <hello@allocationassist.com>" },
  { value: "second_payment",        label: "Second Payment Invoice",                       flowKey: "second_payment",   keyBase: "second_payment",        from: "Accounts <accounts@allocationassist.com>" },
];

/** The single hospitals view: a photo gallery where every card also carries the
 *  registry (recruiter, contacts) and every action — edit the email + photo,
 *  edit details, manage contacts/routing, delete — plus Add hospital. Nothing
 *  from the old registry table is lost; it's just all in one consistent place. */
export function HospitalTemplatesManager() {
  const { data: hospitals = [], isLoading } = useHospitals();
  const contactsIdx = useHospitalContacts();
  const updateH = useUpdateHospital();
  const deleteH = useDeleteHospital();
  const [search, setSearch] = useState("");
  const [editingEmail,   setEditingEmail]   = useState<Hospital | null>(null); // photo + WO email
  const [editingDetails, setEditingDetails] = useState<Hospital | null>(null); // name/city/recruiter/…
  const [contactsFor,    setContactsFor]    = useState<Hospital | null>(null); // Zoho contacts + routing
  const [creating, setCreating] = useState(false);

  function rank(h: Hospital) {
    return (h.image_url ? 2 : 0) + (h.doctor_template_key ? 1 : 0);
  }
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    // A literal em-dash search shows rows missing a country (matches HospitalsTab).
    const base = q === "—"
      ? hospitals.filter(h => !h.country)
      : q
        ? hospitals.filter(h =>
            h.name.toLowerCase().includes(q) ||
            h.city?.toLowerCase().includes(q) ||
            h.country?.toLowerCase().includes(q) ||
            h.primary_recruiter_email?.toLowerCase().includes(q))
        : hospitals;
    return [...base].sort((a, b) => rank(b) - rank(a));
  }, [hospitals, search]);

  const byCountry = useMemo(() => {
    const m: Record<string, number> = {};
    for (const h of hospitals) { const k = h.country ?? "—"; m[k] = (m[k] ?? 0) + 1; }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [hospitals]);
  const needsCountry = hospitals.filter(h => !h.country).length;
  const withPhoto = hospitals.filter(h => h.image_url).length;
  const withCopy  = hospitals.filter(h => h.doctor_template_key).length;

  // Live copies so open dialogs reflect edits (their state holds a stale row ref).
  const liveDetails  = editingDetails ? hospitals.find(h => h.id === editingDetails.id) ?? editingDetails : null;
  const liveContacts = contactsFor    ? hospitals.find(h => h.id === contactsFor.id)    ?? contactsFor    : null;

  const handleDelete = async (h: Hospital) => {
    if (!confirm(`Delete ${h.name}? This can't be undone.`)) return;
    await deleteH.mutateAsync(h.id);
    toast.success(`Deleted ${h.name}`);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <HospitalIcon className="h-4 w-4 text-teal-600" /> Hospitals
            </CardTitle>
            <CardDescription className="mt-1 max-w-[760px]">
              Every hospital in one place — its photo, its "we have an opportunity" email, its recruiter + contacts, and
              routing. Click a card to edit the email &amp; photo; use the buttons for details, contacts, or delete.
              Adding one creates the record, its email, and its photo together.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className="text-[10px]">{withPhoto} photo</Badge>
            <Badge variant="outline" className="text-[10px]">{withCopy} copy</Badge>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add hospital
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {needsCountry > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50/50 px-3 py-2 flex items-center gap-2">
            <span className="text-[11px] text-amber-900 flex-1">
              <strong>{needsCountry}</strong> hospital{needsCountry === 1 ? "" : "s"} missing a country — country-scoped batch sends skip these. Click "Show them", then edit each.
            </span>
            <button onClick={() => setSearch("—")} className="text-[11px] font-medium text-amber-900 hover:underline">Show them</button>
          </div>
        )}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, city, country, or recruiter email..." className="pl-7 text-[12px] h-8" />
          </div>
          <div className="text-[11px] text-muted-foreground">{filtered.length} of {hospitals.length}</div>
          <div className="flex gap-1.5 flex-wrap">
            {byCountry.map(([c, n]) => <Badge key={c} variant="outline" className="text-[10px]">{c}: {n}</Badge>)}
          </div>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-[12px] text-muted-foreground">Loading hospitals…</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[560px] overflow-y-auto pr-1">
            {/* Add-hospital tile */}
            <button
              onClick={() => setCreating(true)}
              className="rounded-lg border-2 border-dashed border-slate-200 hover:border-teal-300 hover:bg-teal-50/30 transition-colors flex flex-col items-center justify-center gap-1 min-h-[150px] text-slate-400 hover:text-teal-600"
            >
              <Plus className="h-6 w-6" />
              <span className="text-[11px] font-medium">Add hospital</span>
            </button>
            {filtered.map(h => {
              const contactCount = contactsIdx.forHospital(h.name).length;
              return (
                <div key={h.id} className="group rounded-lg border border-slate-200 bg-white overflow-hidden hover:border-teal-300 hover:shadow-sm transition-all flex flex-col">
                  <button onClick={() => setEditingEmail(h)} className="text-left" title="Edit email & photo">
                    <div className="relative aspect-[16/10] bg-slate-100">
                      {h.image_url ? (
                        <img src={h.image_url} alt={h.name} loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-slate-300"><HospitalIcon className="h-7 w-7" /></div>
                      )}
                      <div className="absolute inset-0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-medium text-slate-700 shadow">
                          <Mail className="h-3 w-3" /> Email &amp; photo
                        </span>
                      </div>
                      {h.doctor_template_key && (
                        <span className="absolute top-1.5 left-1.5 rounded-full bg-teal-600 text-white text-[8.5px] font-medium px-1.5 py-0.5 shadow-sm">Custom copy</span>
                      )}
                      {h.contact_mode === "cycle" && (
                        <span className="absolute top-1.5 right-1.5 rounded-full bg-violet-600 text-white text-[8.5px] font-medium px-1.5 py-0.5 shadow-sm">cycle</span>
                      )}
                    </div>
                    <div className="px-2.5 py-1.5">
                      <div className="text-[11.5px] font-medium text-slate-800 truncate">{h.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{[h.city, h.country].filter(Boolean).join(" · ") || "No location"}</div>
                      <div className="text-[10px] text-muted-foreground truncate mt-0.5">{h.primary_recruiter_email || <span className="italic text-slate-300">no recruiter email</span>}</div>
                    </div>
                  </button>
                  <div className="mt-auto flex border-t border-slate-100 divide-x divide-slate-100 text-[10px] text-slate-500">
                    <button onClick={() => setEditingDetails(h)} className="flex-1 py-1.5 inline-flex items-center justify-center gap-1 hover:bg-slate-50 hover:text-slate-700" title="Edit details">
                      <Pencil className="h-3 w-3" /> Details
                    </button>
                    <button onClick={() => setContactsFor(h)} className="flex-1 py-1.5 inline-flex items-center justify-center gap-1 hover:bg-slate-50 hover:text-slate-700" title="Contacts & routing">
                      <Users className="h-3 w-3" /> {contactCount || "Contacts"}
                    </button>
                    <button onClick={() => handleDelete(h)} className="flex-1 py-1.5 inline-flex items-center justify-center gap-1 hover:bg-rose-50 hover:text-rose-600" title="Delete hospital">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && search.trim() && (
              <div className="col-span-full py-6 text-center text-[12px] text-muted-foreground">No hospitals match "{search}".</div>
            )}
          </div>
        )}
      </CardContent>

      {editingEmail && (
        <TemplateStudio mode="hospital" hospital={editingEmail} hospitals={hospitals} onClose={() => setEditingEmail(null)} />
      )}
      {creating && (
        <TemplateStudio mode="new" hospitals={hospitals} onClose={() => setCreating(false)} />
      )}
      {liveDetails && (
        <HospitalDialog
          open
          onClose={() => setEditingDetails(null)}
          title={`Edit ${liveDetails.name}`}
          initial={liveDetails}
          onSubmit={async (input: HospitalInput) => { await updateH.mutateAsync({ id: liveDetails.id, ...input }); toast.success(`Updated ${input.name}`); }}
        />
      )}
      {liveContacts && (
        <UiDialog open onOpenChange={v => !v && setContactsFor(null)}>
          <UiDialogContent className="sm:max-w-[720px] max-h-[88vh] overflow-y-auto">
            <UiDialogHeader>
              <UiDialogTitle className="flex items-center gap-2"><Users className="h-4 w-4 text-teal-600" /> {liveContacts.name} — contacts &amp; routing</UiDialogTitle>
            </UiDialogHeader>
            <HospitalContactsPanel
              hospital={liveContacts}
              contacts={contactsIdx.forHospital(liveContacts.name)}
              onUpdate={patch => updateH.mutateAsync({ id: liveContacts.id, name: liveContacts.name, ...patch })}
            />
          </UiDialogContent>
        </UiDialog>
      )}
    </Card>
  );
}

export function TemplateStudio({ mode, hospital, hospitals, onClose, initialAdvanced }: {
  mode: "hospital" | "new";
  hospital?: Hospital;
  hospitals: Hospital[];
  onClose: () => void;
  /** Open straight into Advanced (Type dropdown + HTML + tokenizer) — used by the
   *  general "New template" maker in the All-templates list. */
  initialAdvanced?: boolean;
}) {
  // Full template bodies load only now (when a hospital's editor opens), not on
  // the Hospitals gallery — so browsing hospitals stays fast.
  const { data: templates = [] } = useEmailTemplates();
  const createH   = useCreateHospital();
  const updateH   = useUpdateHospital();
  const createTpl = useCreateEmailTemplate();
  const updateTpl = useUpdateEmailTemplate();
  const deleteTpl = useDeleteEmailTemplate();
  const hospitalNames = useMemo(() => hospitals.map(h => h.name).filter(Boolean), [hospitals]);

  // ── Resolve the base template (hospital mode edits an existing one) ───────
  const ownKey    = hospital ? ownKeyFor(hospital) : "";
  const ownTpl    = hospital ? templates.find(t => t.key === ownKey) ?? null : null;
  const linkedTpl = hospital?.doctor_template_key ? templates.find(t => t.key === hospital.doctor_template_key) ?? null : null;
  const base = mode === "hospital"
    ? (ownTpl ?? linkedTpl ?? templates.find(t => t.key === DEFAULT_DOCTOR_KEY) ?? null)
    : null;
  const editTpl = mode === "hospital" ? (ownTpl ?? (linkedTpl && linkedTpl.key !== DEFAULT_DOCTOR_KEY ? linkedTpl : null)) : null;
  const linked = !!editTpl;
  const seedHtml = mode === "hospital" ? withImageSlot(base?.body_html ?? "") : "";

  // ── State ────────────────────────────────────────────────────────────────
  const [typeValue, setTypeValue] = useState<string>(TYPE_OPTIONS[0].value);
  const opt = TYPE_OPTIONS.find(o => o.value === typeValue) ?? TYPE_OPTIONS[0];
  const isProfileSent = mode === "new" && opt.flowKey === "profile_sent";
  const audience: "doctor" | "hospital" | null =
    opt.keyBase.includes("doctor") ? "doctor" : opt.keyBase.includes("hospital") ? "hospital" : null;
  const wantSlot = mode === "hospital" || audience === "doctor";

  const [linkMode, setLinkMode] = useState<"new" | "existing">("new");
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>("");
  const [hName, setHName] = useState("");
  const [hCity, setHCity] = useState("");
  const [hCountry, setHCountry] = useState("");
  const [hRecruiter, setHRecruiter] = useState("");
  const [hContact, setHContact] = useState("");
  const [name, setName] = useState(""); // generic (non-hospital) template name

  const [imageUrl, setImageUrl] = useState(hospital?.image_url ?? "");
  const [subject, setSubject]   = useState(base?.subject ?? "");
  const [bodyHtml, setBodyHtml] = useState(seedHtml);
  const [bodyText, setBodyText] = useState(base?.body_text ?? "");
  const [values, setValues]     = useState<Record<string, string>>(
    hospital ? { hospital_name: hospital.name, city: hospital.city ?? "", country: hospital.country ?? "" } : {},
  );
  const [mobileTab, setMobileTab] = useState<"edit" | "preview">("edit");
  const [imgBusy, setImgBusy] = useState(false);
  const [saving, setSaving]   = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Simple mode (default): plain-language message + [placeholders], no HTML.
  const simpleAvailable = mode === "hospital" || isProfileSent;
  const [advanced, setAdvanced] = useState(!!initialAdvanced);
  const simple = simpleAvailable && !advanced;
  const [simpleBody, setSimpleBody] = useState<string>(() => mode === "hospital" ? htmlToFriendly(base?.body_html ?? "") : "");
  const simpleRef = useRef<HTMLTextAreaElement>(null);
  const insertFriendly = (bracket: string) => {
    const el = simpleRef.current;
    if (!el) { setSimpleBody(s => s + bracket); return; }
    const start = el.selectionStart ?? simpleBody.length;
    const end   = el.selectionEnd ?? simpleBody.length;
    setSimpleBody(simpleBody.slice(0, start) + bracket + simpleBody.slice(end));
    requestAnimationFrame(() => { el.focus(); const p = start + bracket.length; el.setSelectionRange(p, p); });
  };
  // Keep the two modes in sync when the user flips the switch.
  const toggleAdvanced = (adv: boolean) => {
    if (adv) { setBodyHtml(buildHtmlFromSimple(simpleBody, wantSlot)); setBodyText(buildTextFromSimple(simpleBody)); }
    else { setSimpleBody(htmlToFriendly(bodyHtml)); }
    setAdvanced(adv);
  };

  // Hospital mode: re-seed when the base template resolves.
  useEffect(() => {
    if (mode !== "hospital") return;
    setSubject(base?.subject ?? "");
    setBodyText(base?.body_text ?? "");
    setBodyHtml(withImageSlot(base?.body_html ?? ""));
    setSimpleBody(htmlToFriendly(base?.body_html ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base?.id]);

  // New + profile-sent: seed the copy from the generic template for that audience
  // (only while the body is still empty, so we never trample edits).
  useEffect(() => {
    if (mode !== "new" || !isProfileSent || !audience) return;
    const gen = templates.find(t => t.key === (audience === "doctor" ? "profile_sent_doctor" : "profile_sent_hospital"));
    setSubject(s => s || gen?.subject || "");
    setBodyText(t => t || gen?.body_text || "");
    setBodyHtml(b => b.trim() ? b : (audience === "doctor" ? withImageSlot(gen?.body_html ?? "") : (gen?.body_html ?? "")));
    setSimpleBody(s => s.trim() ? s : htmlToFriendly(gen?.body_html ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience]);

  // Keep the tokenise boxes + preview in sync with the hospital being made/picked.
  const pickedHospital = linkMode === "existing" ? hospitals.find(h => h.id === selectedHospitalId) ?? null : null;
  useEffect(() => {
    if (mode !== "new" || !isProfileSent) return;
    const nm = linkMode === "new" ? hName : (pickedHospital?.name ?? "");
    const cy = linkMode === "new" ? hCity : (pickedHospital?.city ?? "");
    const co = linkMode === "new" ? hCountry : (pickedHospital?.country ?? "");
    setValues(v => ({ ...v, hospital_name: nm, city: cy, country: co }));
    if (linkMode === "existing" && pickedHospital) setImageUrl(pickedHospital.image_url ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hName, hCity, hCountry, selectedHospitalId, linkMode, isProfileSent]);

  // Picking an EXISTING hospital re-seeds the editor from that hospital's own
  // template (not the generic) so saving never clobbers its current copy.
  useEffect(() => {
    if (mode !== "new" || linkMode !== "existing" || !selectedHospitalId || !audience) return;
    const h = hospitals.find(x => x.id === selectedHospitalId);
    if (!h) return;
    const key = audience === "doctor" ? h.doctor_template_key : h.template_key;
    const tpl = (key ? templates.find(t => t.key === key) : null)
      ?? templates.find(t => t.key === (audience === "doctor" ? "profile_sent_doctor" : "profile_sent_hospital"));
    setSubject(tpl?.subject ?? "");
    setBodyText(tpl?.body_text ?? "");
    setBodyHtml(audience === "doctor" ? withImageSlot(tpl?.body_html ?? "") : (tpl?.body_html ?? ""));
    setSimpleBody(htmlToFriendly(tpl?.body_html ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHospitalId]);

  // ── Helpers ────────────────────────────────────────────────────────────
  const insertToken = (tok: string) => {
    const el = bodyRef.current;
    const wrapped = `{{${tok}}}`;
    if (!el) { setBodyHtml(h => h + wrapped); return; }
    const start = el.selectionStart ?? bodyHtml.length;
    const end   = el.selectionEnd ?? bodyHtml.length;
    setBodyHtml(bodyHtml.slice(0, start) + wrapped + bodyHtml.slice(end));
    requestAnimationFrame(() => { el.focus(); const p = start + wrapped.length; el.setSelectionRange(p, p); });
  };

  const autoDetect = () => {
    const fullText = `${subject}\n${bodyHtml}\n${bodyText}`;
    const found = detectValues(fullText, hospitalNames);
    const keys = Object.keys(found);
    if (!keys.length) { toast.info("Couldn't auto-detect anything — type the values in the boxes."); return; }
    setValues(v => {
      const next = { ...v };
      for (const [k, val] of Object.entries(found)) {
        const cur = next[k]?.trim();
        const curInText = !!cur && new RegExp(escapeRegExp(cur), "i").test(fullText);
        if (!cur || !curInText) next[k] = val!;
      }
      return next;
    });
    toast.success(`Detected ${keys.length}: ${keys.map(k => found[k]).join(", ")}. Review, then Replace.`);
  };

  const makeTemplate = () => {
    let s = subject, h = bodyHtml, t = bodyText, count = 0;
    for (const f of KNOWN_FIELDS) {
      const val = (values[f.token] ?? "").trim();
      if (val.length < 2) continue;
      const re = new RegExp(escapeRegExp(val), "gi");
      const tok = `{{${f.token}}}`;
      const rep = (str: string) => str.replace(re, () => { count++; return tok; });
      s = rep(s); h = rep(h); t = rep(t);
    }
    setSubject(s); setBodyHtml(h); setBodyText(t);
    if (count) toast.success(`Replaced ${count} value${count === 1 ? "" : "s"} with variables.`);
    else toast.info("Fill the boxes with the exact words from your draft first.");
  };

  const uploadImg = async (file: File) => {
    setImgBusy(true);
    try { const att = await uploadEmailAttachment(file); setImageUrl(att.path); toast.success("Photo uploaded."); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed"); }
    finally { setImgBusy(false); }
  };

  // ── Preview ────────────────────────────────────────────────────────────
  const previewVars: Record<string, string> = {
    ...Object.fromEntries(KNOWN_FIELDS.map(f => [f.token, (values[f.token]?.trim() || f.sample)])),
    signature: FULL_SIGNATURE_HTML,
    signature_text: FULL_SIGNATURE_TEXT,
    hospital_image: imageUrl
      ? `<img src="${imageUrl}" alt="${values.hospital_name || "Hospital"}" width="560" style="display:block;width:100%;max-width:560px;height:auto;border-radius:12px;margin:18px 0;border:0;" />`
      : "",
    doctor_card_html: stub("the doctor profile card"),
    doctor_row_table_html: stub("the doctor details table"),
    doctors_table_html: stub("the multi-doctor table"),
    logo_header: "",
  };
  // Effective bodies: advanced uses the raw HTML/text; simple builds them from
  // the friendly message. Both the preview and the save use these.
  const effSubject = advanced ? subject : friendlyToTokens(subject);
  const effHtml    = advanced ? (wantSlot ? withImageSlot(bodyHtml) : bodyHtml) : buildHtmlFromSimple(simpleBody, wantSlot);
  const effText    = advanced ? bodyText : buildTextFromSimple(simpleBody);
  const previewSubject = renderTemplate(effSubject, previewVars);
  const previewText    = renderTemplate(effText, previewVars);
  const previewHtml    = renderTemplate(
    effHtml || `<pre style="font-family:inherit;white-space:pre-wrap;">${effText}</pre>`,
    previewVars, { html: true },
  );

  const showHospitalFields = mode === "hospital" || isProfileSent;
  const simpleBaseline = mode === "hospital" ? htmlToFriendly(base?.body_html ?? "") : "";
  const dirty = mode === "hospital"
    ? imageUrl !== (hospital?.image_url ?? "") || subject !== (base?.subject ?? "")
      || (advanced ? (bodyText !== (base?.body_text ?? "") || bodyHtml !== seedHtml) : simpleBody !== simpleBaseline)
    : isProfileSent
      ? !!((linkMode === "new" ? hName.trim() : selectedHospitalId) && (subject.trim() || bodyHtml.trim() || simpleBody.trim()))
      : !!(name.trim() && (subject.trim() || bodyHtml.trim()));

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!subject.trim()) { toast.error("Subject is required."); return; }
    setSaving(true);
    try {
      const bodyToSave = effHtml;

      if (mode === "hospital" && hospital) {
        if (imageUrl !== (hospital.image_url ?? "")) {
          await updateH.mutateAsync({ id: hospital.id, name: hospital.name, image_url: imageUrl || null });
        }
        let key = editTpl?.key ?? "";
        if (editTpl) await updateTpl.mutateAsync({ id: editTpl.id, subject: effSubject, body_text: effText, body_html: bodyToSave });
        else {
          key = ownKey;
          await createTpl.mutateAsync({ key, name: `Working Opportunity — ${hospital.name}`, flow_key: "profile_sent", subject: effSubject, body_text: effText, body_html: bodyToSave, variables: base?.variables ?? [] });
        }
        if (hospital.doctor_template_key !== key) await updateH.mutateAsync({ id: hospital.id, name: hospital.name, doctor_template_key: key });
        toast.success(`Saved ${hospital.name}'s working-opportunity template.`);
      } else if (isProfileSent) {
        // Add/attach a hospital + its per-hospital template, all linked.
        let hospId: string, hospName: string;
        if (linkMode === "new") {
          if (!hName.trim()) { toast.error("Hospital name is required."); setSaving(false); return; }
          hospId = await createH.mutateAsync({
            name: hName.trim(), city: hCity.trim() || null, country: hCountry.trim() || null,
            primary_recruiter_email: hRecruiter.trim() || null, primary_contact_name: hContact.trim() || null,
            image_url: imageUrl || null,
          });
          hospName = hName.trim();
        } else {
          const h = hospitals.find(x => x.id === selectedHospitalId);
          if (!h) { toast.error("Pick a hospital to attach this to."); setSaving(false); return; }
          hospId = h.id; hospName = h.name;
          if (imageUrl !== (h.image_url ?? "")) await updateH.mutateAsync({ id: h.id, name: h.name, image_url: imageUrl || null });
        }
        const key = `${opt.keyBase}__${hospId}`;
        const existing = templates.find(t => t.key === key);
        const tplName = `${audience === "doctor" ? "Working Opportunity" : "Profile Intro"} — ${hospName}`;
        if (existing) await updateTpl.mutateAsync({ id: existing.id, subject: effSubject, body_text: effText, body_html: bodyToSave });
        else await createTpl.mutateAsync({ key, name: tplName, flow_key: "profile_sent", subject: effSubject, body_text: effText, body_html: bodyToSave, variables: KNOWN_FIELDS.map(f => f.token) });
        if (audience === "doctor") await updateH.mutateAsync({ id: hospId, name: hospName, doctor_template_key: key });
        else await updateH.mutateAsync({ id: hospId, name: hospName, template_key: key });
        toast.success(linkMode === "new" ? `Added ${hospName} with its email + photo.` : `Saved ${hospName}'s template.`);
      } else {
        // Generic template (shortlist / interview / …), no hospital.
        if (!name.trim()) { toast.error("Give the template a name."); setSaving(false); return; }
        let key = `${opt.keyBase}_${slugify(name)}`;
        for (let n = 2; templates.some(t => t.key === key); n++) key = `${opt.keyBase}_${slugify(name)}_${n}`;
        await createTpl.mutateAsync({ key, name: name.trim(), flow_key: opt.flowKey, subject: effSubject, body_text: effText, body_html: bodyToSave, variables: KNOWN_FIELDS.map(f => f.token) });
        toast.success(`Created template "${name.trim()}".`);
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const revertToDefault = async () => {
    if (!hospital) return;
    if (!confirm(`Revert ${hospital.name} to the generic working-opportunity copy? Its custom photo stays; its custom wording is unlinked.`)) return;
    setSaving(true);
    try {
      await updateH.mutateAsync({ id: hospital.id, name: hospital.name, doctor_template_key: null });
      if (ownTpl) await deleteTpl.mutateAsync(ownTpl.id);
      toast.success(`${hospital.name} now uses the generic copy.`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Revert failed");
    } finally {
      setSaving(false);
    }
  };

  const title = mode === "new" ? "Add hospital" : hospital!.name;
  const saveLabel = saving ? "Saving…"
    : mode === "hospital" ? "Save template"
    : isProfileSent && linkMode === "new" ? "Create hospital + email"
    : isProfileSent ? "Save template"
    : "Create template";

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-[1120px] max-h-[94vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2">
                {mode === "new" ? <Wand2 className="h-4 w-4 text-teal-600" /> : <HospitalIcon className="h-4 w-4 text-teal-600" />}
                {title}
              </DialogTitle>
              <DialogDescription className="text-[12px] mt-1">
                {simple
                  ? (mode === "new"
                      ? "Add the hospital's details and a photo, then write the email in plain words. The photo and signature are added for you."
                      : "Edit the photo and the email wording. The photo and signature are handled for you.")
                  : (mode === "new"
                      ? "Advanced: full control over template type, HTML, and variables."
                      : "Advanced: edit the raw HTML and variables directly.")}
              </DialogDescription>
            </div>
            {simpleAvailable && (
              <div className="flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5 text-[11px] shrink-0">
                <button type="button" onClick={() => toggleAdvanced(false)}
                  className={`rounded-md px-2.5 py-1 font-medium transition-colors ${!advanced ? "bg-white shadow-sm text-teal-700" : "text-slate-500 hover:text-slate-700"}`}>Simple</button>
                <button type="button" onClick={() => toggleAdvanced(true)}
                  className={`rounded-md px-2.5 py-1 font-medium transition-colors ${advanced ? "bg-white shadow-sm text-teal-700" : "text-slate-500 hover:text-slate-700"}`}>Advanced</button>
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="flex lg:hidden gap-1 px-6 pt-3">
          {(["edit", "preview"] as const).map(t => (
            <button key={t} onClick={() => setMobileTab(t)}
              className={`px-3 py-1 text-[11px] rounded-md border ${mobileTab === t ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}>
              {t === "edit" ? "Write" : "Preview"}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
          {/* ── Left: write ──────────────────────────────────────────── */}
          <div className={`${mobileTab === "preview" ? "hidden lg:block" : ""} p-6 space-y-4 lg:border-r`}>
            {mode === "new" && advanced && (
              <div>
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Type</Label>
                <Select value={typeValue} onValueChange={setTypeValue}>
                  <SelectTrigger className="mt-1 h-9 text-[12px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value} className="text-[12px]">{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* New + profile-sent: attach to a new or existing hospital */}
            {mode === "new" && isProfileSent && (
              <div className="rounded-lg border border-slate-200 p-3 space-y-3 bg-slate-50/50">
                <div className="flex items-center gap-1 rounded-lg bg-white border p-0.5 text-[12px] w-fit">
                  {(["new", "existing"] as const).map(m => (
                    <button key={m} type="button" onClick={() => setLinkMode(m)}
                      className={`rounded-md px-3 py-1 font-medium transition-colors ${linkMode === m ? "bg-teal-600 text-white" : "text-slate-500 hover:text-slate-700"}`}>
                      {m === "new" ? "New hospital" : "Existing hospital"}
                    </button>
                  ))}
                </div>
                {linkMode === "new" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Hospital name *</Label>
                      <Input value={hName} onChange={e => setHName(e.target.value)} placeholder="e.g. Cleveland Clinic Abu Dhabi" className="mt-1 h-8 text-[12px]" />
                    </div>
                    <div><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">City</Label>
                      <Input value={hCity} onChange={e => setHCity(e.target.value)} placeholder="Dubai" className="mt-1 h-8 text-[12px]" /></div>
                    <div><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Country</Label>
                      <Input value={hCountry} onChange={e => setHCountry(e.target.value)} placeholder="UAE" className="mt-1 h-8 text-[12px]" /></div>
                    <div><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Recruiter email</Label>
                      <Input value={hRecruiter} onChange={e => setHRecruiter(e.target.value)} placeholder="recruiter@hospital.com" className="mt-1 h-8 text-[12px]" /></div>
                    <div><Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Contact name</Label>
                      <Input value={hContact} onChange={e => setHContact(e.target.value)} placeholder="Hassan" className="mt-1 h-8 text-[12px]" /></div>
                  </div>
                ) : (
                  <Select value={selectedHospitalId} onValueChange={setSelectedHospitalId}>
                    <SelectTrigger className="h-8 text-[12px]"><SelectValue placeholder="Choose a hospital…" /></SelectTrigger>
                    <SelectContent className="max-h-[280px]">
                      {[...hospitals].sort((a, b) => a.name.localeCompare(b.name)).map(h => (
                        <SelectItem key={h.id} value={h.id} className="text-[12px]">{h.name}{h.city ? ` · ${h.city}` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* Generic template name (non-profile-sent types) */}
            {mode === "new" && !isProfileSent && (
              <div>
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Template name</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Shortlist congrats — Riyadh" className="mt-1 text-[12px]" />
              </div>
            )}

            {/* Photo (hospital mode + profile-sent new mode) */}
            {showHospitalFields && (
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Hospital photo</Label>
                <div className="flex items-center gap-2">
                  <Input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="Paste an image URL, or upload →" className="h-9 text-[12px] flex-1" />
                  <label className={`shrink-0 inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-[12px] cursor-pointer hover:bg-slate-50 ${imgBusy ? "opacity-60 pointer-events-none" : ""}`}>
                    {imgBusy ? "Uploading…" : "Upload"}
                    <input type="file" accept="image/png,image/jpeg" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadImg(f); e.currentTarget.value = ""; }} />
                  </label>
                </div>
                {imageUrl.trim() && (
                  <div className="flex items-center gap-2 pt-1">
                    <img src={imageUrl} alt="" className="h-16 w-28 rounded object-cover border border-slate-200" />
                    <button type="button" onClick={() => setImageUrl("")} className="text-[11px] text-rose-600 hover:underline">Remove photo</button>
                  </div>
                )}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between">
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Subject</Label>
                <span className={`text-[10px] ${subject.length > 70 ? "text-rose-600 font-medium" : subject.length > 55 ? "text-amber-600" : "text-muted-foreground"}`}>{subject.length} chars</span>
              </div>
              <Input value={subject} onChange={e => setSubject(e.target.value)} className="mt-1 text-[12px]" placeholder="We have an opportunity for you" />
            </div>

            {!simple ? (<>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Email body</Label>
                <div className="flex flex-wrap gap-1 justify-end">
                  {INSERT_TOKENS.map(t => (
                    <button key={t.token} type="button" onClick={() => insertToken(t.token)} title={`Insert {{${t.token}}}`}
                      className="text-[10px] rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-slate-600 hover:border-teal-300 hover:text-teal-700">
                      + {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <Textarea
                ref={bodyRef}
                value={bodyHtml}
                onChange={e => setBodyHtml(e.target.value)}
                className="text-[12.5px] min-h-[300px] font-mono leading-relaxed"
                placeholder={"Hi Dr. Heena Sharma!\n\nWe have an opportunity with Mediclinic in Dubai and we highly recommend your profile.\n\n(Write naturally — Make template turns the names into variables.)"}
              />
            </div>

            <div className="rounded-lg border border-teal-200 bg-teal-50/40 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-medium text-teal-900 flex items-center gap-1.5"><Wand2 className="h-3.5 w-3.5" /> Make template</div>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="ghost" className="h-7 text-[11px] text-teal-800 hover:bg-teal-100" onClick={autoDetect} title="Scan the draft and fill the boxes automatically">
                    <Sparkles className="h-3.5 w-3.5 mr-1" /> Auto-detect
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-[11px] border-teal-300 text-teal-800 hover:bg-teal-100" onClick={makeTemplate}>
                    Replace with variables
                  </Button>
                </div>
              </div>
              <p className="text-[10.5px] text-teal-900/70">
                <strong>Auto-detect</strong> finds obvious values (Dr. names, known hospitals, GCC cities/specialties) — or type the
                exact words yourself. Then <strong>Replace</strong> swaps every match for its variable (e.g.
                <code className="bg-white/70 px-1 rounded mx-0.5">Heena Sharma</code>→<code className="bg-white/70 px-1 rounded mx-0.5">{`{{doctor_name}}`}</code>).
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {KNOWN_FIELDS.map(f => (
                  <div key={f.token} className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-500 w-20 shrink-0">{f.label}</span>
                    <Input value={values[f.token] ?? ""} onChange={e => setValues(v => ({ ...v, [f.token]: e.target.value }))} placeholder={f.sample} className="h-7 text-[11px]" />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Plain-text fallback (optional)</Label>
              <Textarea value={bodyText} onChange={e => setBodyText(e.target.value)} className="mt-1 text-[12px] min-h-[100px] font-mono" placeholder="Same message without formatting…" />
            </div>
            </>) : (
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Your message</Label>
              </div>
              <div className="flex flex-wrap gap-1 mb-1.5">
                {FRIENDLY.map(f => (
                  <button key={f.token} type="button" onClick={() => insertFriendly(f.bracket)}
                    title={`Insert the ${f.label.toLowerCase()}`}
                    className="text-[10.5px] rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-teal-800 hover:bg-teal-100">
                    + {f.label}
                  </button>
                ))}
              </div>
              <Textarea ref={simpleRef} value={simpleBody} onChange={e => setSimpleBody(e.target.value)}
                className="text-[13px] min-h-[340px] leading-relaxed"
                placeholder={"Hi [Doctor's name]!\n\nWe have an opportunity with [Hospital name] in [City] and we'd love to recommend your profile.\n\nClick a chip above to drop in a name — you'll see it fill in on the right."} />
              <p className="text-[10.5px] text-muted-foreground mt-1.5">
                Write it like a normal email. The <strong>hospital photo</strong> and your <strong>signature</strong> are added automatically — no need to touch them. The chips (e.g. <span className="text-teal-700">[Doctor's name]</span>) fill in per doctor when the email is sent.
              </p>
            </div>
            )}
          </div>

          {/* ── Right: live preview ─────────────────────────────────── */}
          <div className={`${mobileTab === "edit" ? "hidden lg:block" : ""} p-6 bg-slate-50/50`}>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2">
              <Eye className="h-3.5 w-3.5" /> Live preview
            </Label>
            <EmailPreview
              subject={previewSubject}
              html={previewHtml}
              text={previewText}
              from={mode === "hospital" ? "Opportunities <opportunities@allocationassist.com>" : opt.from}
              to={audience === "hospital" ? "[hospital recruiter]" : "[doctor]"}
              templateKey={editTpl?.key ?? (mode === "hospital" ? DEFAULT_DOCTOR_KEY : opt.value)}
              banner={<>Preview with sample values — real sends use live data.</>}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between px-6 py-4 border-t">
          <div>
            {mode === "hospital" && linked && (
              <Button variant="ghost" onClick={revertToDefault} disabled={saving} className="text-rose-600 hover:text-rose-700">
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Revert to generic copy
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !dirty}>
              <Save className="h-3.5 w-3.5 mr-1.5" /> {saveLabel}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
