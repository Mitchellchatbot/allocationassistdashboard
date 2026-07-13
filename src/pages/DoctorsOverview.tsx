/**
 * Doctors → Overview tab.
 *
 * A single, global view of every doctor on the board (Zoho Doctors-on-Board),
 * filterable by when they were added and searchable by name/email/specialty.
 *
 * Each row shows the FLAT Zoho facts only (kept deliberately uncluttered).
 * Expanding a row lazily loads — and collapses by default — the rest of that
 * doctor's world: their website/profile record, every form they submitted, and
 * the parsed contents of their CV. Detail data is fetched only on expand (the
 * dossier hooks are `enabled` by doctorId), so the list stays fast.
 *
 * Doctor key: a DoB row maps to the AA id `dob:<zohoId>` — the same key that
 * doctor_profiles / form_responses / cv_uploads carry, so the join is exact.
 */
import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useZohoData, type ZohoDoctorOnBoard } from "@/hooks/use-zoho-data";
import { useDebounce } from "@/hooks/use-zoho-leads";
import { useDoctorProfile, calcCompletion } from "@/hooks/use-doctor-profiles";
import { useWpCandidateForDoctor, useUpsertWpCandidate, useUploadWpCv, type WpCandidateUpsertPayload } from "@/hooks/use-wp-candidates";
import { generateCvPdfFile } from "@/lib/generate-cv-pdf";
import { useForms, type FormResponse } from "@/hooks/use-forms";
import { useDoctorFormResponses, useDoctorCvUploads, useAnalyzeCv, useBooksInvoices } from "@/hooks/use-doctor-dossier";
import { useUpdateDoctorOnBoard } from "@/hooks/use-update-doctor";
import { LicensingSpend } from "@/components/LicensingSpend";
import { LicensingReview } from "@/components/LicensingReview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  ChevronDown, ChevronRight, Mail, Phone, MapPin, Building2, UserCog,
  FileText, IdCard, Calendar, ExternalLink, Loader2, FileSearch, CircleUser,
  Pencil, ScanLine, Check, X, Banknote, Receipt, Globe,
} from "lucide-react";
import {
  Pagination, PaginationContent, PaginationEllipsis,
  PaginationItem, PaginationLink, PaginationNext, PaginationPrevious,
} from "@/components/ui/pagination";

const PAGE_SIZE = 30;

type RangeKey = "all" | "7" | "30" | "90" | "365";
const RANGE_LABELS: Record<RangeKey, string> = {
  all: "All time", "7": "Last 7 days", "30": "Last 30 days", "90": "Last 90 days", "365": "Last 12 months",
};

const specialtyOf = (d: ZohoDoctorOnBoard) => d.Specialty_New || d.Speciality || null;

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso);
  if (isNaN(t.getTime())) return "—";
  return t.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function rangeCutoff(range: RangeKey): number | null {
  if (range === "all") return null;
  return Date.now() - Number(range) * 24 * 60 * 60 * 1000;
}

const fmtAED = (v: number) => `AED ${Math.round(v).toLocaleString()}`;

/** Normalise a doctor / invoice-customer name for matching — drops a title
 *  prefix ("Dr", "Dr.", "Prof"…) and collapses spaces. */
function normDoctorName(n: string | null | undefined): string {
  return (n ?? "").toLowerCase()
    .replace(/^\s*(dr|doctor|prof|professor|mr|mrs|ms|miss)\.?\s+/i, "")
    .replace(/\s+/g, " ").trim();
}

function doctorDisplayName(d: ZohoDoctorOnBoard): string {
  return d.Full_Name || `${d.First_Name ?? ""} ${d.Last_Name ?? ""}`.trim() || "Unnamed doctor";
}

interface BillingSummary { billed: number; outstanding: number; count: number }
type BillFilter = "all" | "invoiced" | "outstanding";
const BILL_FILTER_LABELS: Record<BillFilter, string> = {
  all: "All billing", invoiced: "Has invoices", outstanding: "Has outstanding",
};

export default function DoctorsOverview() {
  const [params] = useSearchParams();
  const q = (params.get("q") ?? "").trim().toLowerCase();
  // Debounce only the value that drives the (potentially expensive) list
  // recompute; the raw `q` still updates instantly for typing feedback.
  const qDebounced = useDebounce(q, 300);
  const [range, setRange] = useState<RangeKey>("all");

  const [billFilter, setBillFilter] = useState<BillFilter>("all");
  const [page, setPage] = useState(1);

  const { data: zoho, isLoading } = useZohoData();
  const { data: allInvoices = [] } = useBooksInvoices();
  const dob = useMemo(
    () => ((zoho as { rawDoctorsOnBoard?: ZohoDoctorOnBoard[] } | undefined)?.rawDoctorsOnBoard ?? []),
    [zoho],
  );

  // Books billing per doctor, keyed by normalized name (for the row chip + filter).
  const billingByName = useMemo(() => {
    const m = new Map<string, BillingSummary>();
    for (const i of allInvoices) {
      const k = normDoctorName(i.customer);
      if (!k) continue;
      const cur = m.get(k) ?? { billed: 0, outstanding: 0, count: 0 };
      cur.billed += i.total; cur.outstanding += i.balance; cur.count += 1;
      m.set(k, cur);
    }
    return m;
  }, [allInvoices]);

  const filtered = useMemo(() => {
    const cutoff = rangeCutoff(range);
    return dob
      .map(d => ({ d, t: new Date(d.Created_Time).getTime(), billing: billingByName.get(normDoctorName(doctorDisplayName(d))) }))
      .filter(({ d, t, billing }) => {
        if (cutoff != null) {
          if (!Number.isFinite(t) || t < cutoff) return false;
        }
        if (qDebounced) {
          const hay = [
            d.Full_Name, d.Email, d.Phone, d.Mobile, specialtyOf(d),
            d.Country_of_Specialty_training, d.Owner?.name, d.Account_Name?.name,
          ].filter(Boolean).join(" ").toLowerCase();
          if (!hay.includes(qDebounced)) return false;
        }
        if (billFilter !== "all") {
          const b = billing;
          if (billFilter === "invoiced"    && (!b || b.count === 0))     return false;
          if (billFilter === "outstanding" && (!b || b.outstanding <= 0)) return false;
        }
        return true;
      })
      .sort((a, b) => b.t - a.t);
  }, [dob, range, qDebounced, billFilter, billingByName]);

  useEffect(() => { setPage(1); }, [qDebounced, range, billFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const pageNumbers = useMemo((): Array<number | "..."> => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const out: Array<number | "..."> = [1];
    if (safePage > 3) out.push("...");
    for (let i = Math.max(2, safePage - 1); i <= Math.min(totalPages - 1, safePage + 1); i++) out.push(i);
    if (safePage < totalPages - 2) out.push("...");
    out.push(totalPages);
    return out;
  }, [safePage, totalPages]);

  return (
    <div className="space-y-3">
      {/* Imported licensing fees that couldn't be matched to a doctor — assign
          them here; they drop into each doctor's ledger below. Renders nothing
          when the queue is empty. */}
      <LicensingReview />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[12px] text-muted-foreground">
          {isLoading ? "Loading doctors…" : (
            <><span className="font-semibold text-slate-800">{filtered.length}</span> doctor{filtered.length === 1 ? "" : "s"} on board
            {range !== "all" && <> · added in the {RANGE_LABELS[range].toLowerCase()}</>}
            {qDebounced && <> · matching “{qDebounced}”</>}</>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={billFilter} onValueChange={(v) => setBillFilter(v as BillFilter)}>
            <SelectTrigger className="h-8 w-[150px] text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(BILL_FILTER_LABELS) as BillFilter[]).map(k => (
                <SelectItem key={k} value={k} className="text-[12px]">{BILL_FILTER_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Calendar className="h-3.5 w-3.5 text-muted-foreground ml-1" />
          <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
            <SelectTrigger className="h-8 w-[150px] text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(RANGE_LABELS) as RangeKey[]).map(k => (
                <SelectItem key={k} value={k} className="text-[12px]">{RANGE_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List */}
      {!isLoading && filtered.length === 0 && (
        <div className="rounded-lg border border-dashed bg-slate-50/60 px-4 py-12 text-center text-[13px] text-muted-foreground">
          No doctors on board {range !== "all" ? "in this time range" : ""}{qDebounced ? ` matching “${qDebounced}”` : ""}.
        </div>
      )}

      <div className="space-y-2">
        {paginated.map(({ d, billing }) => <DoctorRow key={d.id} d={d} billing={billing} />)}
      </div>
      {totalPages > 1 && (
        <Pagination className="mt-2">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={(e) => { e.preventDefault(); setPage(p => Math.max(1, p - 1)); }}
                aria-disabled={safePage === 1}
                className={safePage === 1 ? "pointer-events-none opacity-50" : ""}
              />
            </PaginationItem>
            {pageNumbers.map((n, i) =>
              n === "..." ? (
                <PaginationItem key={`ell-${i}`}><PaginationEllipsis /></PaginationItem>
              ) : (
                <PaginationItem key={n}>
                  <PaginationLink
                    href="#"
                    isActive={safePage === n}
                    onClick={(e) => { e.preventDefault(); setPage(n as number); }}
                  >
                    {n}
                  </PaginationLink>
                </PaginationItem>
              )
            )}
            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={(e) => { e.preventDefault(); setPage(p => Math.min(totalPages, p + 1)); }}
                aria-disabled={safePage === totalPages}
                className={safePage === totalPages ? "pointer-events-none opacity-50" : ""}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}

const DoctorRow = memo(function DoctorRow({ d, billing }: { d: ZohoDoctorOnBoard; billing?: BillingSummary }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  // Bumped when the row's "Add cost" button is clicked — tells LicensingSpend
  // (once the detail is mounted) to open + jump straight into the add form.
  const [addCostSignal, setAddCostSignal] = useState(0);
  const doctorId = `dob:${d.id}`;
  const spec = specialtyOf(d);
  const name = doctorDisplayName(d);

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      {/* FLAT row — Zoho facts only */}
      <div className="flex items-start gap-3 px-4 py-3">
        <button type="button" onClick={() => { const next = !open; setOpen(next); if (!next) setAddCostSignal(0); }} className="flex items-start gap-3 text-left min-w-0 flex-1 group">
          {open ? <ChevronDown className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[14px] font-semibold text-slate-900 truncate group-hover:text-teal-700 transition-colors">{name}</span>
              {spec && <Badge variant="outline" className="text-[10px] bg-teal-50 text-teal-700 border-teal-200">{spec}</Badge>}
              {billing && billing.billed > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9.5px] font-semibold text-emerald-700">
                  <Receipt className="h-2.5 w-2.5" />{fmtAED(billing.billed)} billed
                </span>
              )}
              {billing && billing.outstanding > 0 && (
                <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9.5px] font-semibold text-amber-700">{fmtAED(billing.outstanding)} due</span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[11.5px] text-slate-500">
              {d.Email && <span className="inline-flex items-center gap-1 min-w-0"><Mail className="h-3 w-3 shrink-0" /><span className="truncate">{d.Email}</span></span>}
              {(d.Phone || d.Mobile) && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3 shrink-0" />{d.Phone || d.Mobile}</span>}
              {d.Country_of_Specialty_training && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3 shrink-0" />{d.Country_of_Specialty_training}</span>}
              {d.Account_Name?.name && <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3 shrink-0" />{d.Account_Name.name}</span>}
              {d.Owner?.name && <span className="inline-flex items-center gap-1"><UserCog className="h-3 w-3 shrink-0" />{d.Owner.name}</span>}
            </div>
          </div>
        </button>
        <div className="shrink-0 flex items-center gap-2">
          <div className="text-right hidden sm:block">
            <div className="text-[9px] uppercase tracking-wider text-slate-400">Added</div>
            <div className="text-[11.5px] text-slate-600">{fmtDate(d.Created_Time)}</div>
          </div>
          <button
            type="button"
            onClick={() => { setOpen(true); setAddCostSignal(s => s + 1); }}
            title="Add a licensing cost for this doctor"
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 text-slate-600 px-2 py-1.5 text-[11.5px] font-medium hover:border-teal-300 hover:text-teal-700 hover:bg-teal-50 transition-colors"
          >
            <Banknote className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Add cost</span>
          </button>
          <button
            type="button"
            onClick={() => { setEditing(e => !e); setOpen(true); }}
            title="Edit Zoho fields"
            className={`rounded-md border p-1.5 transition-colors ${editing ? "border-teal-300 bg-teal-50 text-teal-700" : "border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-50"}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-slate-100 bg-slate-50/40 px-4 py-3 space-y-2">
          {editing && <DoctorEditForm d={d} onDone={() => setEditing(false)} />}
          <DoctorDetail doctorId={doctorId} name={name} email={d.Email} phone={d.Phone || d.Mobile} addCostSignal={addCostSignal} />
        </div>
      )}
    </div>
  );
});

/** Inline editor for the doctor's Zoho (Doctors-on-Board / Contacts) fields.
 *  Saves straight back to Zoho and optimistically updates the local cache. */
const EDITABLE_FIELDS: Array<{ key: keyof ZohoDoctorOnBoard; label: string }> = [
  { key: "First_Name", label: "First name" },
  { key: "Last_Name", label: "Last name" },
  { key: "Email", label: "Email" },
  { key: "Phone", label: "Phone" },
  { key: "Mobile", label: "Mobile" },
  { key: "Specialty_New", label: "Specialty" },
  { key: "Speciality", label: "Specialty (legacy)" },
  { key: "Country_of_Specialty_training", label: "Country of training" },
  { key: "Lead_Source", label: "Lead source" },
];

function DoctorEditForm({ d, onDone }: { d: ZohoDoctorOnBoard; onDone: () => void }) {
  const update = useUpdateDoctorOnBoard();
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of EDITABLE_FIELDS) init[f.key as string] = (d[f.key] as string | null) ?? "";
    return init;
  });

  const save = async () => {
    // Only send fields that actually changed.
    const changed: Record<string, unknown> = {};
    for (const f of EDITABLE_FIELDS) {
      const k = f.key as string;
      const before = (d[f.key] as string | null) ?? "";
      if (vals[k] !== before) changed[k] = vals[k] === "" ? null : vals[k];
    }
    if (Object.keys(changed).length === 0) { onDone(); return; }
    try {
      await update.mutateAsync({ id: d.id, fields: changed });
      toast.success("Saved to Zoho.");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save to Zoho.");
    }
  };

  return (
    <div className="rounded-md border border-teal-200 bg-teal-50/40 p-3">
      <div className="flex items-center gap-1.5 mb-2 text-[11px] font-medium text-teal-800">
        <Pencil className="h-3 w-3" /> Edit Zoho fields — saves straight back to Zoho
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {EDITABLE_FIELDS.map(f => (
          <label key={f.key as string} className="block">
            <span className="text-[9.5px] uppercase tracking-wider text-slate-500">{f.label}</span>
            <Input
              value={vals[f.key as string]}
              onChange={e => setVals(v => ({ ...v, [f.key as string]: e.target.value }))}
              className="mt-0.5 h-8 text-[12px] bg-white"
            />
          </label>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-3">
        <Button size="sm" className="h-7 text-[12px]" onClick={save} disabled={update.isPending}>
          {update.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
          Save to Zoho
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-[12px]" onClick={onDone} disabled={update.isPending}>
          <X className="h-3.5 w-3.5 mr-1" /> Cancel
        </Button>
      </div>
    </div>
  );
}

/** Lazily-mounted detail (only when a row is expanded). Pulls the doctor's
 *  profile, forms, and CV and lays them out as collapsible sections. */
function DoctorDetail({
  doctorId, name, email, phone, addCostSignal,
}: {
  doctorId: string; name: string; email: string | null; phone: string | null; addCostSignal?: number;
}) {
  const doctorRef = useMemo(() => ({ id: doctorId, name, email, phone }), [doctorId, name, email, phone]);
  const wp = useWpCandidateForDoctor(doctorRef);
  const { data: profile } = useDoctorProfile(doctorId);
  const { data: responses = [], isLoading: rLoading } = useDoctorFormResponses(doctorId);
  const { data: cvs = [], isLoading: cvLoading } = useDoctorCvUploads(doctorId);
  const { data: forms = [] } = useForms();
  const analyze = useAnalyzeCv();
  const upsertWp = useUpsertWpCandidate();
  const cvUrl = wp?.cv_url || profile?.cv_url || null;

  // #4 — push a board doctor who has no WordPress record INTO WordPress, as a
  // draft prefilled from their dashboard profile. The team then finishes +
  // publishes it in Doctors → Profiles. Requires the explicit `manual_create`
  // intent (the upsert edge fn rejects unattributed creates).
  const createWpProfile = async () => {
    const num = (v: unknown) => (v == null || v === "" ? undefined : String(v));
    const acf: WpCandidateUpsertPayload["acf"] = {
      full_name:      profile?.doctor_name || name || undefined,
      job_title:      profile?.title || undefined,
      phone_number:   phone || undefined,
      email:          email || undefined,
      nationality:    profile?.nationality || undefined,
      specific_areas_of_interests_within_the_specialization: profile?.area_of_interest || undefined,
      years_of_experience_post_specialization: num(profile?.years_experience),
      country_of_training: profile?.country_training || undefined,
      languages:      profile?.languages || undefined,
      notice_period:  profile?.notice_period || undefined,
      family_status:  profile?.family_status || profile?.marital_status || undefined,
      expected_salary: profile?.salary_expectation || undefined,
      dha__haad__moh_license: profile?.license || undefined,
    };
    try {
      await upsertWp.mutateAsync({ intent: "manual_create", status: "draft", title: name, doctor_id: doctorId, acf });
      toast.success(`Created a WordPress draft for ${name}. Finish & publish it in Doctors → Profiles.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create the WordPress profile.");
    }
  };
  const CreateWpButton = () => (
    <Button size="sm" variant="outline" onClick={createWpProfile} disabled={upsertWp.isPending} className="h-7 text-[11.5px] gap-1.5">
      {upsertWp.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
      Create website profile
    </Button>
  );

  // #5 — generate a clean, AA-branded CV/PDF straight from the doctor's profile
  // data and save it to their file (uploads to the WP candidate's cv_resume, so
  // "View on website" / "Open CV file" then point at it).
  const uploadWpCv = useUploadWpCv();
  const [genCvBusy, setGenCvBusy] = useState(false);
  const generateCv = async () => {
    if (!wp) return;
    setGenCvBusy(true);
    try {
      const file = await generateCvPdfFile(wp);
      await uploadWpCv.mutateAsync({ file, candidateId: wp.id });
      toast.success(`Generated a branded CV for ${name} and saved it to their file.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't generate the CV.");
    } finally {
      setGenCvBusy(false);
    }
  };
  const GenerateCvButton = () => (
    <Button size="sm" variant="outline" onClick={generateCv} disabled={genCvBusy} className="h-7 text-[11.5px] gap-1.5">
      {genCvBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
      {genCvBusy ? "Generating…" : "Generate CV"}
    </Button>
  );
  const formName = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of forms) m.set(f.id, f.name);
    return m;
  }, [forms]);

  const completion = profile ? calcCompletion(profile) : 0;
  const cvWithData = cvs.find(c => c.status === "extracted" && c.extracted_data);

  // Zoho Books invoices billed to this doctor (matched by name).
  const { data: allInvoices = [], isLoading: invLoading } = useBooksInvoices();
  const invoices = useMemo(() => {
    const target = normDoctorName(name);
    if (!target) return [];
    return allInvoices
      .filter(i => normDoctorName(i.customer) === target)
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [allInvoices, name]);
  const billedTotal  = invoices.reduce((s, i) => s + i.total, 0);
  const outstanding  = invoices.reduce((s, i) => s + i.balance, 0);

  const profileFields: Array<[string, string | null | undefined]> = wp ? [
    ["Job title", wp.job_title], ["Specialty", wp.specialty], ["Subspecialty", wp.subspecialty],
    ["Area of interest", wp.area_of_interest], ["Years experience", wp.years_experience != null ? String(wp.years_experience) : null],
    ["Nationality", wp.nationality], ["Country of training", wp.country_of_training],
    ["Current location", wp.current_location], ["License status", wp.license_status],
    ["License types", wp.license_types?.join(", ")], ["Languages", wp.languages], ["English level", wp.english_level],
    ["Current salary", wp.current_salary], ["Expected salary", wp.expected_salary], ["Notice period", wp.notice_period],
    ["Targeted locations", wp.targeted_locations?.join(", ")], ["Family status", wp.family_status],
    ["Date of birth", wp.date_of_birth],
  ] : profile ? [
    ["Title", profile.title], ["Area of interest", profile.area_of_interest], ["Years experience", profile.years_experience != null ? String(profile.years_experience) : null],
    ["Nationality", profile.nationality], ["Country of training", profile.country_training], ["License", profile.license],
    ["Languages", profile.languages], ["Salary expectation", profile.salary_expectation], ["Notice period", profile.notice_period],
    ["Marital status", profile.marital_status], ["Family status", profile.family_status],
  ] : [];
  const hasProfile = !!wp || !!profile;

  return (
    <div className="space-y-2">
      <Section
        icon={<CircleUser className="h-3.5 w-3.5" />}
        title="Doctor profile"
        meta={wp ? "Website profile" : hasProfile ? `${completion}% complete · not on website` : "Not created yet"}
        defaultOpen={false}
      >
        {hasProfile ? (
          <div className="space-y-3">
            <KeyValueGrid pairs={profileFields} />
            {profile?.bio && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">Bio</div>
                <p className="text-[12px] text-slate-700 whitespace-pre-wrap leading-relaxed">{profile.bio}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-0.5 items-center">
              {wp?.wp_link && <LinkChip href={wp.wp_link} label="View on website" />}
              {(wp?.cv_url || profile?.cv_url) && <LinkChip href={(wp?.cv_url || profile?.cv_url)!} label="Open CV file" />}
              {profile && <Badge variant="outline" className="text-[10px]">{completion}% profile complete</Badge>}
              {!wp && <CreateWpButton />}
              {wp && <GenerateCvButton />}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[11.5px] text-muted-foreground">No profile on file yet — push {name} to WordPress as a draft to start one.</p>
            <CreateWpButton />
          </div>
        )}
      </Section>

      <Section
        icon={<Receipt className="h-3.5 w-3.5" />}
        title="Billing (Zoho Books)"
        meta={invLoading ? "loading…" : invoices.length ? `${fmtAED(billedTotal)} · ${invoices.length}` : "No invoices"}
        defaultOpen={false}
        empty={!invLoading && invoices.length === 0}
        loading={invLoading}
      >
        {invoices.length > 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px]">
              <span><span className="text-slate-400 text-[10px] uppercase tracking-wider mr-1.5">Billed</span><span className="font-semibold text-emerald-700">{fmtAED(billedTotal)}</span></span>
              <span><span className="text-slate-400 text-[10px] uppercase tracking-wider mr-1.5">Outstanding</span><span className={`font-semibold ${outstanding > 0 ? "text-amber-700" : "text-slate-500"}`}>{fmtAED(outstanding)}</span></span>
              <span><span className="text-slate-400 text-[10px] uppercase tracking-wider mr-1.5">Invoices</span><span className="font-semibold text-slate-700">{invoices.length}</span></span>
            </div>
            <div className="rounded-md border border-slate-200 overflow-hidden">
              {invoices.map((i, idx) => (
                <div key={i.number || idx} className={`flex items-center gap-2 px-2.5 py-1.5 text-[11.5px] ${idx % 2 ? "bg-slate-50/50" : "bg-white"}`}>
                  <span className="font-mono text-slate-500 w-[78px] shrink-0">{i.number || "—"}</span>
                  <span className="text-slate-500 w-[88px] shrink-0">{fmtDate(i.date)}</span>
                  <span className="font-semibold text-slate-800 tabular-nums w-[96px] shrink-0">{fmtAED(i.total)}</span>
                  <Badge variant="outline" className={`text-[9px] capitalize ${i.status === "paid" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : i.balance > 0 ? "bg-amber-50 text-amber-700 border-amber-200" : ""}`}>{i.status || "—"}</Badge>
                  {i.balance > 0 && <span className="ml-auto text-[10.5px] text-amber-700">{fmtAED(i.balance)} due</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      <Section
        icon={<FileText className="h-3.5 w-3.5" />}
        title="Form responses"
        meta={rLoading ? "loading…" : `${responses.length}`}
        defaultOpen={false}
        empty={!rLoading && responses.length === 0}
        loading={rLoading}
      >
        <div className="space-y-2">
          {responses.map(r => <ResponseBlock key={r.id} r={r} formName={formName.get(r.form_id)} />)}
        </div>
      </Section>

      <Section
        icon={<IdCard className="h-3.5 w-3.5" />}
        title="CV information"
        meta={cvLoading ? "loading…" : (cvWithData ? "Parsed" : cvs.length ? cvs[0].status : (cvUrl ? "Not analyzed" : "No CV"))}
        defaultOpen={false}
        empty={!cvLoading && cvs.length === 0 && !cvUrl}
        loading={cvLoading}
      >
        <div className="space-y-2">
          {cvs.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-slate-600">
              {cvs[0].file_name && <span className="inline-flex items-center gap-1"><FileSearch className="h-3 w-3" />{cvs[0].file_name}</span>}
              <Badge variant="outline" className="text-[10px]">{cvs[0].status}</Badge>
              {cvs[0].uploaded_at && <span>Uploaded {fmtDate(cvs[0].uploaded_at)}</span>}
            </div>
          )}
          {cvWithData ? (
            <KeyValueGrid pairs={Object.entries(cvWithData.extracted_data as Record<string, unknown>).map(([k, v]) => [prettyKey(k), stringifyVal(v)] as [string, string])} />
          ) : (
            <div className="space-y-2">
              {cvs[0]?.extraction_error && <p className="text-[11.5px] text-rose-600">Last extraction failed: {cvs[0].extraction_error}</p>}
              {cvUrl ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm" className="h-7 text-[12px]"
                    disabled={analyze.isPending}
                    onClick={async () => {
                      try { await analyze.mutateAsync({ cvUrl, doctorId, doctorName: name }); toast.success("CV analyzed."); }
                      catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't analyze the CV."); }
                    }}
                  >
                    {analyze.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ScanLine className="h-3.5 w-3.5 mr-1" />}
                    {analyze.isPending ? "Analyzing…" : "Analyze CV"}
                  </Button>
                  <LinkChip href={cvUrl} label="Open CV file" />
                  <span className="text-[10.5px] text-muted-foreground">Runs Claude on the website CV — on demand, only when you ask.</span>
                </div>
              ) : (
                <p className="text-[11.5px] text-muted-foreground">No CV on file for this doctor.</p>
              )}
            </div>
          )}
        </div>
      </Section>

      <LicensingSpend doctorId={doctorId} doctorName={name} addSignal={addCostSignal} />
    </div>
  );
}

/** A collapsible labelled section used for Profile / Forms / CV. */
function Section({
  icon, title, meta, defaultOpen, empty, loading, children,
}: {
  icon: ReactNode; title: string; meta?: string; defaultOpen?: boolean;
  empty?: boolean; loading?: boolean; children?: ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => !empty && setOpen(o => !o)}
        disabled={empty}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left ${empty ? "cursor-default" : "hover:bg-slate-50"} transition-colors`}
      >
        {!empty && (open ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />)}
        {empty && <span className="w-3.5" />}
        <span className="text-slate-500">{icon}</span>
        <span className="text-[12.5px] font-medium text-slate-800">{title}</span>
        {loading && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
        {meta && <span className={`ml-auto text-[10.5px] ${empty ? "text-slate-400" : "text-muted-foreground"}`}>{meta}</span>}
      </button>
      {open && !empty && <div className="px-3 pb-3 pt-0.5 border-t border-slate-100">{children}</div>}
    </div>
  );
}

function ResponseBlock({ r, formName }: { r: FormResponse; formName?: string }) {
  const [open, setOpen] = useState(false);
  const answers = Object.entries(r.answers ?? {}).filter(([, v]) => v != null && String(v).trim() !== "");
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/50 overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-slate-100/60">
        {open ? <ChevronDown className="h-3 w-3 text-slate-400" /> : <ChevronRight className="h-3 w-3 text-slate-400" />}
        <span className="text-[11.5px] font-medium text-slate-700 truncate">{formName ?? "Form"}</span>
        <Badge variant="outline" className="text-[9px]">{r.outreach_status}</Badge>
        <span className="ml-auto text-[10.5px] text-muted-foreground shrink-0">{fmtDate(r.submitted_at)}</span>
      </button>
      {open && (
        <div className="px-3 pb-2.5 pt-1 border-t border-slate-200">
          {answers.length
            ? <KeyValueGrid pairs={answers.map(([k, v]) => [k, String(v)] as [string, string])} />
            : <p className="text-[11px] text-muted-foreground">No answers captured.</p>}
        </div>
      )}
    </div>
  );
}

function KeyValueGrid({ pairs }: { pairs: Array<[string, string | null | undefined]> }) {
  const shown = pairs.filter(([, v]) => v != null && String(v).trim() !== "" && String(v).trim() !== "—");
  if (!shown.length) return <p className="text-[11.5px] text-muted-foreground">No details.</p>;
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 mt-1">
      {shown.map(([k, v], i) => (
        <div key={i} className="flex flex-col">
          <dt className="text-[9.5px] uppercase tracking-wider text-slate-400">{k}</dt>
          <dd className="text-[12px] text-slate-700 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function LinkChip({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer"
      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-teal-700 hover:bg-teal-50 transition-colors">
      <ExternalLink className="h-3 w-3" /> {label}
    </a>
  );
}

function prettyKey(k: string): string {
  return k.replace(/[_-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase()).trim();
}
function stringifyVal(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(x => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
