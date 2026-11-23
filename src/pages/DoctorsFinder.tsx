/**
 * Doctors Finder — every enquiry from doctorsfinder.com, and who it was for.
 *
 * The brief was "lists every form submission as it comes in, with the date,
 * the enquiry details, and the doctor it was sent to, so we can start
 * tracking volume per doctor. Keep it simple and easy to read." So: two
 * blocks and nothing else. Per doctor on the left, because that is the
 * question being asked; the raw feed beside it, because that is the evidence
 * for it.
 *
 * Deliberately separate from /forms. That page is a tab per form with an
 * outreach workflow attached; this one spans the forms and counts by doctor,
 * and the two shapes fight each other on one screen.
 *
 * The doctor comes from the page a submission was made on - see
 * enquiry-target.ts. Some submissions have none, and those are shown as a
 * stated count rather than hidden, because the team needs to know how much
 * of the picture is missing.
 */
import { useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Stethoscope, Inbox, Mail, Phone, Building2, ExternalLink, CalendarDays } from "lucide-react";
import { useDoctorsFinderEnquiries, volumeByDoctor, type Enquiry } from "@/hooks/use-doctors-finder";

/** Answer keys that are plumbing, not enquiry detail. Both Doctors Finder
 *  forms ship the enquirer's own contact details as answers; those already
 *  have their own line, so repeating them in the detail block is noise. */
const NOT_DETAIL = /^(contact ?name|name|first ?name|last ?name|email|email ?address|phone|phone ?number|submission id|form name.*|user id|user agent|user ip|referrer|created at)$/i;

/** Detail fields worth leading with, in the order a reader wants them.
 *  Anything else the form collects still shows, just after these. */
const DETAIL_ORDER = [
  "Symptoms or Reason for Visit", "Message", "Subject",
  "Severity", "Preferred Date", "Available Date:", "Preferred Location", "Location",
  "Relevant Medical History", "Additional Notes",
];

function detailPairs(answers: Record<string, string>): Array<[string, string]> {
  const kept = Object.entries(answers).filter(([k, v]) => v?.trim() && !NOT_DETAIL.test(k.trim()));
  const rank = (k: string) => {
    const i = DETAIL_ORDER.findIndex(d => d.toLowerCase() === k.trim().toLowerCase());
    return i === -1 ? DETAIL_ORDER.length : i;
  };
  return kept.sort((a, b) => rank(a[0]) - rank(b[0]));
}

const pick = (answers: Record<string, string>, re: RegExp): string | null => {
  for (const [k, v] of Object.entries(answers)) if (re.test(k) && v?.trim()) return v.trim();
  return null;
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtDay(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function DoctorsFinder() {
  const { data: enquiries = [], isLoading } = useDoctorsFinderEnquiries();
  const [search, setSearch] = useState("");
  const [onlyDoctor, setOnlyDoctor] = useState<string | null>(null);

  const doctors = useMemo(() => volumeByDoctor(enquiries), [enquiries]);

  const unattributed = useMemo(
    () => enquiries.filter(e => e.target_kind !== "doctor" || !e.target_slug).length,
    [enquiries],
  );

  const thisMonth = useMemo(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return enquiries.filter(e => new Date(e.submitted_at).getTime() >= from).length;
  }, [enquiries]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enquiries.filter(e => {
      if (onlyDoctor && e.target_slug !== onlyDoctor) return false;
      if (!q) return true;
      const hay = [e.target_name, e.enquirer_name, e.enquirer_email, e.form_name, ...Object.values(e.answers)]
        .filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [enquiries, search, onlyDoctor]);

  const topCount = doctors[0]?.count ?? 1;

  return (
    <DashboardLayout>
      <div className="space-y-6 p-4 md:p-6">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-violet-600" /> Doctors Finder
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Every enquiry from doctorsfinder.com, and which doctor it was sent to.
          </p>
        </div>

        {/* Four counts is the most a strip can carry and still be read at a
            glance. "Not identified" earns its place because it is the honest
            limit of everything else on the page. */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Kpi label="Enquiries"             value={enquiries.length} loading={isLoading} />
          <Kpi label="This month"            value={thisMonth}        loading={isLoading} />
          <Kpi label="Doctors approached"    value={doctors.length}   loading={isLoading} />
          <Kpi label="Doctor not identified" value={unattributed}     loading={isLoading} muted
               hint="Submitted from a page that names no doctor — a blog post, or with no referrer at all." />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] gap-6 items-start">
          {/* ── Volume per doctor ─────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Enquiries per doctor</CardTitle>
              <CardDescription className="text-[11px]">
                Click a doctor to filter the list. The green figure is the last 30 days.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {isLoading ? (
                <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
              ) : doctors.length === 0 ? (
                <Empty>No enquiry has named a doctor yet.</Empty>
              ) : (
                <div className="divide-y divide-slate-100">
                  {doctors.map(d => (
                    <button
                      key={d.slug}
                      type="button"
                      aria-pressed={onlyDoctor === d.slug}
                      onClick={() => setOnlyDoctor(onlyDoctor === d.slug ? null : d.slug)}
                      className={`w-full text-left py-2 px-1 rounded transition-colors ${onlyDoctor === d.slug ? "bg-violet-50" : "hover:bg-slate-50"}`}
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="flex-1 min-w-0 truncate text-sm">{d.name}</span>
                        <span className="tabular-nums text-sm font-semibold">{d.count}</span>
                        {d.recent > 0 && <span className="tabular-nums text-[10px] text-emerald-600">+{d.recent}</span>}
                      </div>
                      <div className="mt-1 h-1 rounded bg-slate-100 overflow-hidden">
                        <div className="h-full bg-violet-500" style={{ width: `${Math.max(4, (d.count / topCount) * 100)}%` }} />
                      </div>
                      <div className="mt-1 text-[10px] text-muted-foreground">Last {fmtDay(d.lastAt)}</div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── The feed ──────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <CardTitle className="text-base">Enquiries</CardTitle>
                  <CardDescription className="text-[11px]">Newest first, updating as they arrive.</CardDescription>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search name, doctor, message…"
                    className="pl-8 h-8 text-sm"
                  />
                </div>
              </div>
              {onlyDoctor && (
                <button
                  type="button"
                  onClick={() => setOnlyDoctor(null)}
                  className="self-start text-[11px] text-violet-700 underline underline-offset-2"
                >
                  Showing {doctors.find(d => d.slug === onlyDoctor)?.name ?? onlyDoctor} only — clear
                </button>
              )}
            </CardHeader>
            <CardContent className="pt-0">
              {isLoading ? (
                <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
              ) : shown.length === 0 ? (
                <Empty>
                  {enquiries.length === 0
                    ? "Nothing yet. Once a Doctors Finder form is wired to its webhook on the Forms page, submissions appear here as they arrive."
                    : "No enquiry matches that search."}
                </Empty>
              ) : (
                <div className="divide-y divide-slate-100">
                  {shown.map(e => <EnquiryRow key={e.id} e={e} />)}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

function EnquiryRow({ e }: { e: Enquiry }) {
  const phone  = pick(e.answers, /phone|mobile|tel|whatsapp/i);
  const detail = detailPairs(e.answers);

  return (
    <div className="py-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {e.target_kind === "doctor" && e.target_name ? (
              <span className="text-sm font-medium flex items-center gap-1.5">
                <Stethoscope className="h-3.5 w-3.5 text-violet-600" /> {e.target_name}
              </span>
            ) : e.target_kind === "hospital" && e.target_name ? (
              <span className="text-sm font-medium flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-sky-600" /> {e.target_name}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground italic">Doctor not identified</span>
            )}
            <Badge variant="outline" className="text-[10px] font-normal">{e.form_name}</Badge>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground flex items-center gap-x-3 gap-y-0.5 flex-wrap">
            <span>{e.enquirer_name || "Anonymous"}</span>
            {e.enquirer_email && (
              <a href={`mailto:${e.enquirer_email}`} className="inline-flex items-center gap-1 hover:underline">
                <Mail className="h-3 w-3" />{e.enquirer_email}
              </a>
            )}
            {phone && (
              <a href={`tel:${phone}`} className="inline-flex items-center gap-1 hover:underline">
                <Phone className="h-3 w-3" />{phone}
              </a>
            )}
          </div>
        </div>
        <div className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1.5 shrink-0">
          <CalendarDays className="h-3 w-3" />{fmtDate(e.submitted_at)}
          {e.target_kind === "doctor" && e.target_slug && (
            <a
              href={`https://doctorsfinder.com/doctor/${e.target_slug}/`}
              target="_blank"
              rel="noreferrer noopener"
              title="Open this doctor's profile on doctorsfinder.com"
              className="hover:text-violet-600"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      {detail.length > 0 && (
        <dl className="mt-2 grid grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
          {detail.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground whitespace-nowrap">{k.replace(/:$/, "")}</dt>
              <dd className="min-w-0 break-words">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function Kpi({ label, value, loading, muted, hint }: {
  label: string; value: number; loading: boolean; muted?: boolean; hint?: string;
}) {
  return (
    <Card title={hint}>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        {loading
          ? <Skeleton className="h-7 w-12 mt-1" />
          : <div className={`text-2xl font-semibold tabular-nums mt-0.5 ${muted ? "text-muted-foreground" : ""}`}>{value}</div>}
      </CardContent>
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-10 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
      <Inbox className="h-5 w-5 opacity-50" />
      <p className="max-w-sm">{children}</p>
    </div>
  );
}
