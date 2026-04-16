import { useState, useCallback } from "react";
import Papa from "papaparse";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Upload, FileText, CheckCircle, AlertTriangle,
  Loader2, X, Phone, Users, BarChart2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CallLogRow {
  call_date:        string;
  status:           string;
  doctor_name:      string;
  specialty:        string;
  country_training: string;
  country_origin:   string;
  years_experience: number | null;
  notes:            string;
}

interface WeeklySalesRow {
  member_name:      string;
  date_col:         string;
  full_sales_calls: number;
  good_calls:       number;
  sales_count:      number;
}

interface MetaLeadRow {
  first_name:         string;
  last_name:          string;
  email:              string;
  phone:              string;
  country:            string;
  age:                string;
  employed:           string;
  profession:         string;
  speciality:         string;
  monthly_salary:     string;
  years_experience:   string;
  additional_notes:   string;
  family_medicine:    string;
  training_countries: string;
  submitted_at:       string;
  channel:            string;
  utm_source:         string;
  utm_medium:         string;
  utm_campaign:       string;
  utm_content:        string;
}

interface DoctorSessionRow {
  session_date:     string;
  status:           string;
  doctor_name:      string;
  specialty:        string;
  qualifications:   string;
  call_state:       string;
  meeting_type:     string;
  country_training: string;
  notes:            string;
}

// ─── Parsers ─────────────────────────────────────────────────────────────────

const DATE_RE = /^\d{1,2}[\s\-\/][A-Za-z]{3}/;
const KNOWN_STATUSES = new Set([
  "high potential", "follow up in the future", "declined", "minimal follow up",
  "converted", "unsure", "not interested", "in progress",
]);

function parseCallLog(raw: string[][]): CallLogRow[] {
  const rows: CallLogRow[] = [];
  let currentDate = "";

  for (const cols of raw) {
    const cells = cols.map(c => (c ?? "").toString().trim());
    if (cells.every(c => c === "")) continue;

    const firstIdx = cells.findIndex(c => c.length > 0);
    const firstCell = cells[firstIdx];

    let dataOffset = 0;
    if (DATE_RE.test(firstCell)) {
      currentDate = firstCell;
      dataOffset = firstIdx + 1;
    }

    const dataCells = cells.slice(dataOffset);
    if (dataCells.every(c => c === "")) continue;

    let statusIdx = -1;
    let status = "";

    for (let i = 0; i < dataCells.length; i++) {
      const low = dataCells[i].toLowerCase();
      if (KNOWN_STATUSES.has(low) || [...KNOWN_STATUSES].some(s => low.startsWith(s))) {
        statusIdx = i; status = dataCells[i]; break;
      }
    }

    if (statusIdx === -1) {
      for (let i = 0; i < dataCells.length; i++) {
        if (dataCells[i].length > 0) {
          const hasMore = dataCells.slice(i + 1).some(c => c.length > 0);
          if (hasMore) { statusIdx = i; status = dataCells[i]; break; }
        }
      }
    }

    if (statusIdx === -1) continue;

    const rest = dataCells.slice(statusIdx + 1);
    const yearsRaw = rest[4] ?? "";
    const yearsNum = parseFloat(yearsRaw);

    rows.push({
      call_date:        currentDate,
      status:           status.trim(),
      doctor_name:      rest[0] ?? "",
      specialty:        rest[1] ?? "",
      country_training: rest[2] ?? "",
      country_origin:   rest[3] ?? "",
      years_experience: isNaN(yearsNum) ? null : yearsNum,
      notes:            rest[5] ?? "",
    });
  }

  return rows;
}

const SALES_SUB_TYPES = ["full sales call", "good call", "sales"];

function parseWeeklySales(raw: string[][]): WeeklySalesRow[] {
  const result: WeeklySalesRow[] = [];
  let dateColumns: { index: number; label: string }[] = [];
  let headerFound = false;
  let currentMember = "";

  // Buffer 3 sub-rows per member
  const subBuffer: Record<string, number[]> = {};

  const flushMember = (member: string) => {
    if (!member || !dateColumns.length) return;
    const full = subBuffer["full sales call"] ?? [];
    const good = subBuffer["good call"]       ?? [];
    const sale = subBuffer["sales"]           ?? [];

    dateColumns.forEach((dc, idx) => {
      const f = full[idx] ?? 0;
      const g = good[idx] ?? 0;
      const s = sale[idx] ?? 0;
      if (f || g || s) {
        result.push({ member_name: member, date_col: dc.label, full_sales_calls: f, good_calls: g, sales_count: s });
      }
    });
  };

  for (const cols of raw) {
    const cells = cols.map(c => (c ?? "").toString().trim());
    if (cells.every(c => c === "")) continue;

    // Detect header row — look for multiple date-like strings in the row.
    // Supports: dd/mm/yyyy  |  dd-Mon  |  Mon-dd
    const isDateLike = (c: string) =>
      /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(c) ||      // 04/01/2025
      /^\d{4}-\d{2}-\d{2}$/.test(c) ||             // 2025-01-04
      /^\d{1,2}[\-][A-Za-z]{3}/.test(c) ||         // 04-Jan
      /^[A-Za-z]{3}[\-\/]\d{1,2}/.test(c);         // Jan-04

    if (!headerFound) {
      const dateCells = cells.filter(c => isDateLike(c));
      if (dateCells.length >= 2) {
        headerFound = true;
        // Map column indices of date cells; skip TOTAL columns
        cells.forEach((c, i) => {
          if (isDateLike(c)) dateColumns.push({ index: i, label: c });
        });
      }
      continue; // skip header row itself
    }

    // First non-empty cell: if col0 non-empty and not a sub-type → new member
    const col0 = cells[0];
    const col1 = cells[1] ?? "";
    const subTypeLabel = [col0, col1]
      .map(c => c.toLowerCase())
      .find(c => SALES_SUB_TYPES.some(s => c === s || c.startsWith(s)));

    if (!subTypeLabel) {
      // New member row — find the first substantial non-numeric string
      const memberCell = cells.find(c => c.length > 1 && isNaN(Number(c)) && c.toLowerCase() !== "total");
      if (memberCell) {
        if (currentMember) flushMember(currentMember);
        currentMember = memberCell;
        Object.keys(subBuffer).forEach(k => delete subBuffer[k]);
      }
      continue;
    }

    // Extract numeric values for each date column
    const counts = dateColumns.map(dc => {
      const raw = cells[dc.index] ?? "";
      const n = parseInt(raw, 10);
      return isNaN(n) ? 0 : n;
    });

    // Normalise the sub-type key
    const key = SALES_SUB_TYPES.find(s => subTypeLabel.startsWith(s)) ?? subTypeLabel;
    subBuffer[key] = counts;
  }

  // Flush the last member
  if (currentMember) flushMember(currentMember);

  return result;
}

function parseMetaLeads(raw: string[][]): MetaLeadRow[] {
  if (raw.length < 2) return [];

  const headerRowIdx = raw.findIndex(row =>
    row.some(c => /first.?name/i.test(c ?? "")) &&
    row.some(c => /email|phone|mobile/i.test(c ?? ""))
  );
  if (headerRowIdx === -1) return [];

  // Clean headers: strip {{field:...}} template vars, emoji, asterisks, normalize spaces
  const clean = (h: string) =>
    (h ?? "").toString()
      .replace(/\{\{[^}]+\}\}/g, "")              // strip {{field:e02ed2d6-...}}
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")     // strip emoji
      .replace(/[*]/g, "")
      .replace(/\s+/g, " ")
      .toLowerCase()
      .trim();

  const headers = raw[headerRowIdx].map(clean);

  // Find column index by keywords (first match wins)
  const col = (...keywords: string[]): number => {
    for (const kw of keywords) {
      const idx = headers.findIndex(h => h.includes(kw));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  // Find Nth occurrence of a keyword (for duplicate headers)
  const colNth = (n: number, ...keywords: string[]): number => {
    let count = 0;
    for (let i = 0; i < headers.length; i++) {
      if (keywords.some(kw => headers[i].includes(kw))) {
        if (count === n) return i;
        count++;
      }
    }
    return -1;
  };

  const idxFirst       = col("first name", "first_name");
  const idxLast        = col("last name", "last_name");
  const idxEmail       = col("email");
  const idxPhone       = col("phone", "mobile");
  const idxCountry     = col("living in", "country");
  const idxEmployed    = col("currently employed", "employed");
  const idxProfession  = colNth(0, "profession");   // first "profession" col
  const idxSpeciality  = col("speciality", "specialty"); // "what is your speciality"
  const idxAge         = col("what is your age", "age");
  const idxSalary      = col("salary");
  const idxYearsExp    = col("years of experience", "post specialty");
  const idxNotes       = col("anything else", "would like us to know");
  const idxFamilyMed   = col("family medicine");
  const idxTraining    = col("training in your speciality", "uk, eu, usa", "uk,");
  const idxSubmittedAt = col("submitted at");
  const idxChannel     = col("channel");
  const idxUtmSrc      = col("utm_source");
  const idxUtmMed      = col("utm_medium");
  const idxUtmCamp     = col("utm_campaign");
  const idxUtmCont     = col("utm_content");

  const get = (row: string[], idx: number) => (idx === -1 ? "" : (row[idx] ?? "").trim());

  return raw.slice(headerRowIdx + 1).flatMap(row => {
    const cells = row.map(c => (c ?? "").toString());
    if (cells.every(c => c.trim() === "")) return [];
    if (get(cells, idxFirst).toLowerCase().startsWith("first")) return [];
    return [{
      first_name:         get(cells, idxFirst),
      last_name:          get(cells, idxLast),
      email:              get(cells, idxEmail),
      phone:              get(cells, idxPhone),
      country:            get(cells, idxCountry),
      age:                get(cells, idxAge),
      employed:           get(cells, idxEmployed),
      profession:         get(cells, idxProfession),
      speciality:         get(cells, idxSpeciality),
      monthly_salary:     get(cells, idxSalary),
      years_experience:   get(cells, idxYearsExp),
      additional_notes:   get(cells, idxNotes),
      family_medicine:    get(cells, idxFamilyMed),
      training_countries: get(cells, idxTraining),
      submitted_at:       get(cells, idxSubmittedAt),
      channel:            get(cells, idxChannel),
      utm_source:         get(cells, idxUtmSrc),
      utm_medium:         get(cells, idxUtmMed),
      utm_campaign:       get(cells, idxUtmCamp),
      utm_content:        get(cells, idxUtmCont),
    }];
  });
}

// Numeric-only date like "11/2" or "13/02"
const NUMERIC_DATE_RE = /^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/;

function parseDoctorSessions(raw: string[][]): DoctorSessionRow[] {
  if (raw.length < 2) return [];

  // Find the header row: must have "date" AND "status" AND "name" columns
  const headerRowIdx = raw.findIndex(row => {
    const lc = row.map(c => (c ?? "").toString().toLowerCase().trim());
    return lc.some(c => c === "date") &&
           lc.some(c => c === "status" || c === "stage") &&
           lc.some(c => c === "name");
  });

  if (headerRowIdx === -1) {
    // Fallback: treat as positional — Date | Status | Name | Specialty | Qualifications | State | Meeting | Country | Notes
    return parseDoctorSessionsPositional(raw);
  }

  const headers = raw[headerRowIdx].map(h => (h ?? "").toString().toLowerCase().trim());

  const col = (...keys: string[]): number => {
    for (const k of keys) {
      const idx = headers.findIndex(h => h === k || h.startsWith(k));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const idxDate    = col("date");
  const idxStatus  = col("status", "stage");
  const idxName    = col("name");
  const idxSpec    = col("speciality", "specialty", "specialisation");
  const idxQual    = col("qualification");
  const idxState   = col("state");
  const idxMeeting = col("meeting");
  const idxCountry = col("country");
  const idxNotes   = col("notes", "note");

  const get = (row: string[], idx: number) => (idx === -1 ? "" : (row[idx] ?? "").trim());

  const rows: DoctorSessionRow[] = [];
  let lastDate = "";

  for (const rawRow of raw.slice(headerRowIdx + 1)) {
    const cells = rawRow.map(c => (c ?? "").toString());
    if (cells.every(c => c.trim() === "")) continue;

    const dateCell = get(cells, idxDate);
    if (dateCell) lastDate = dateCell;

    const name = get(cells, idxName);
    if (!name) continue; // skip rows with no doctor name

    rows.push({
      session_date:     lastDate,
      status:           get(cells, idxStatus),
      doctor_name:      name,
      specialty:        get(cells, idxSpec),
      qualifications:   get(cells, idxQual),
      call_state:       get(cells, idxState),
      meeting_type:     get(cells, idxMeeting),
      country_training: get(cells, idxCountry),
      notes:            get(cells, idxNotes),
    });
  }

  return rows;
}

// Positional fallback: col0=Date, col1=Status, col2=Name, col3=Specialty,
// col4=Qualifications, col5=State, col6=Meeting, col7=Country, col8=Notes
function parseDoctorSessionsPositional(raw: string[][]): DoctorSessionRow[] {
  const rows: DoctorSessionRow[] = [];
  let lastDate = "";

  for (const rawRow of raw) {
    const cells = rawRow.map(c => (c ?? "").toString().trim());
    if (cells.every(c => c === "")) continue;

    const col0 = cells[0] ?? "";

    // Skip header-like rows
    if (/^date$/i.test(col0)) continue;

    if (col0 && (DATE_RE.test(col0) || NUMERIC_DATE_RE.test(col0))) lastDate = col0;

    const name = cells[2] ?? "";
    if (!name) continue;

    rows.push({
      session_date:     lastDate,
      status:           cells[1] ?? "",
      doctor_name:      name,
      specialty:        cells[3] ?? "",
      qualifications:   cells[4] ?? "",
      call_state:       cells[5] ?? "",
      meeting_type:     cells[6] ?? "",
      country_training: cells[7] ?? "",
      notes:            cells[8] ?? "",
    });
  }

  return rows;
}

// ─── Generic importer hook ───────────────────────────────────────────────────

function useImporter<T extends object>(
  parser: (data: string[][]) => T[],
  tableName: string,
  conflictColumn?: string,
) {
  const [rows, setRows]           = useState<T[]>([]);
  const [fileName, setFileName]   = useState("");
  const [importing, setImporting] = useState(false);
  const [done, setDone]           = useState(0);
  const [error, setError]         = useState("");

  const handleFile = useCallback((file: File) => {
    setFileName(file.name);
    setRows([]);
    setDone(0);
    setError("");
    Papa.parse<string[]>(file, {
      header: false,
      skipEmptyLines: false,
      complete: (result) => {
        try {
          const parsed = parser(result.data as string[][]);
          setRows(parsed);
        } catch (e) {
          setError(String(e));
        }
      },
      error: (err) => setError(err.message),
    });
  }, [parser]); // eslint-disable-line react-hooks/exhaustive-deps

  const doImport = async () => {
    setImporting(true);
    setError("");
    let inserted = 0;
    try {
      const BATCH = 200;
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const { error: err } = conflictColumn
          ? await supabase.from(tableName).upsert(batch as object[], { onConflict: conflictColumn, ignoreDuplicates: true })
          : await supabase.from(tableName).upsert(batch as object[], { ignoreDuplicates: true });
        if (err) throw new Error(err.message);
        inserted += batch.length;
        setDone(inserted);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setImporting(false);
    }
  };

  const clear = () => { setRows([]); setFileName(""); setDone(0); setError(""); };
  const isComplete = done === rows.length && rows.length > 0 && !importing;

  return { rows, fileName, importing, done, error, handleFile, doImport, clear, isComplete };
}

// ─── Drop-zone + preview component ───────────────────────────────────────────

interface ColDef<T> {
  label: string;
  key: keyof T;
  className?: string;
}

interface ImportSectionProps<T extends object> {
  importer: ReturnType<typeof useImporter<T>>;
  previewCols: ColDef<T>[];
  inputId: string;
  emptyHint: string;
  tableName: string;
}

function ImportSection<T extends object>({
  importer, previewCols, inputId, emptyHint, tableName,
}: ImportSectionProps<T>) {
  const { rows, fileName, importing, done, error, handleFile, doImport, clear, isComplete } = importer;

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const onInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = ""; // reset so same file can be re-picked
  };

  if (isComplete) {
    return (
      <Card className="shadow-sm border-success/30 bg-success/5">
        <CardContent className="flex items-center gap-4 py-8">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-success/10">
            <CheckCircle className="h-6 w-6 text-success" />
          </div>
          <div>
            <p className="text-[14px] font-semibold text-foreground">
              {done.toLocaleString()} rows imported successfully
            </p>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Saved to <code className="text-[11px] bg-muted px-1 rounded">{tableName}</code> in Supabase.
            </p>
          </div>
          <Button variant="outline" onClick={clear} className="ml-auto text-[12px] h-8 shrink-0">
            Import another file
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card
        className="border-2 border-dashed border-border/60 hover:border-primary/40 transition-colors cursor-pointer"
        onDragOver={e => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => document.getElementById(inputId)?.click()}
      >
        <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Upload className="h-6 w-6 text-primary" />
          </div>
          <p className="text-[14px] font-medium text-foreground">Drop your CSV file here</p>
          <p className="text-[12px] text-muted-foreground text-center max-w-sm">{emptyHint}</p>
          <Button variant="outline" size="sm" className="mt-2 text-[12px]">
            <FileText className="h-3.5 w-3.5 mr-1.5" /> Browse file
          </Button>
          <input id={inputId} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={onInput} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm border-border/50">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-[13px] font-semibold">
            {fileName} — {rows.length.toLocaleString()} rows detected
          </CardTitle>
          <button onClick={clear} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-4">
        <div className="overflow-x-auto rounded-lg border border-border/50">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b bg-muted/40">
                {previewCols.map(c => (
                  <th key={String(c.key)} className="text-left px-2 py-1.5 font-medium text-muted-foreground whitespace-nowrap">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 8).map((r, i) => (
                <tr key={i} className="border-b border-border/30 last:border-0 hover:bg-muted/20">
                  {previewCols.map(c => (
                    <td key={String(c.key)} className={`px-2 py-1.5 ${c.className ?? "text-muted-foreground"} max-w-[160px] truncate`}>
                      {String((r as Record<string, unknown>)[c.key as string] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {rows.length > 8 && (
          <p className="text-[11px] text-muted-foreground">…and {(rows.length - 8).toLocaleString()} more rows</p>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-[11px] text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {importing && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Importing…</span>
              <span>{done.toLocaleString()} / {rows.length.toLocaleString()}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${(done / rows.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={doImport} disabled={importing} className="text-[12px] h-8">
            {importing
              ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Importing…</>
              : <><Upload className="h-3.5 w-3.5 mr-1.5" />Import {rows.length.toLocaleString()} rows</>
            }
          </Button>
          <Button variant="outline" onClick={clear} disabled={importing} className="text-[12px] h-8">Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CallLogImport() {
  const callLogImporter    = useImporter<CallLogRow>(parseCallLog, "call_log");
  const weeklySalesImporter = useImporter<WeeklySalesRow>(parseWeeklySales, "weekly_sales");
  const metaLeadsImporter  = useImporter<MetaLeadRow>(parseMetaLeads, "meta_leads", "phone");
  const doctorSessionImporter = useImporter<DoctorSessionRow>(parseDoctorSessions, "doctor_sessions");

  return (
    <DashboardLayout title="Import Data" subtitle="Upload CSV files to sync data into the dashboard">
      <div className="max-w-4xl space-y-6">

        <Tabs defaultValue="call-log">
          <TabsList className="h-9 text-[12px]">
            <TabsTrigger value="call-log" className="text-[12px] gap-1.5">
              <Phone className="h-3.5 w-3.5" /> Call Log
            </TabsTrigger>
            <TabsTrigger value="doctor-sessions" className="text-[12px] gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Doctor Sessions
            </TabsTrigger>
            <TabsTrigger value="weekly-sales" className="text-[12px] gap-1.5">
              <BarChart2 className="h-3.5 w-3.5" /> Weekly Sales
            </TabsTrigger>
            <TabsTrigger value="meta-leads" className="text-[12px] gap-1.5">
              <Users className="h-3.5 w-3.5" /> Meta Leads
            </TabsTrigger>
          </TabsList>

          {/* ── Call Log ──────────────────────────────────────────────── */}
          <TabsContent value="call-log" className="mt-4 space-y-4">
            <div className="rounded-lg bg-muted/30 border border-border/40 px-3 py-2.5 text-[11px] text-muted-foreground">
              <strong className="text-foreground">Expected columns:</strong>{" "}
              Date · Status · Doctor Name · Specialty · Country (Training) · Country (Origin) · Years Exp · Notes
            </div>
            <ImportSection
              importer={callLogImporter}
              tableName="call_log"
              inputId="input-call-log"
              emptyHint='Export your call log sheet as CSV (File → Download → CSV). Dates, statuses, and notes are parsed automatically.'
              previewCols={[
                { label: "Date",      key: "call_date" },
                { label: "Status",    key: "status",      className: "font-medium" },
                { label: "Doctor",    key: "doctor_name", className: "font-medium" },
                { label: "Specialty", key: "specialty" },
                { label: "Training",  key: "country_training" },
                { label: "Yrs",       key: "years_experience" },
                { label: "Notes",     key: "notes" },
              ]}
            />
          </TabsContent>

          {/* ── Doctor Sessions ────────────────────────────────────────── */}
          <TabsContent value="doctor-sessions" className="mt-4 space-y-4">
            <div className="rounded-lg bg-muted/30 border border-border/40 px-3 py-2.5 text-[11px] text-muted-foreground">
              <strong className="text-foreground">Expected columns:</strong>{" "}
              Date · Status · Name · Speciality · Qualifications · State (full/phone/zoom) · Meeting Type · Country (Training) · Notes
            </div>
            <ImportSection
              importer={doctorSessionImporter}
              tableName="doctor_sessions"
              inputId="input-doctor-sessions"
              emptyHint='Export your Doctor Pipeline / Call Notes sheet as CSV. Columns: Date, Status, Name, Speciality, Qualifications, State, Meeting Type, Country of Training, Notes.'
              previewCols={[
                { label: "Date",           key: "session_date" },
                { label: "Status",         key: "status",        className: "font-medium" },
                { label: "Doctor",         key: "doctor_name",   className: "font-medium" },
                { label: "Specialty",      key: "specialty" },
                { label: "Qualifications", key: "qualifications" },
                { label: "State",          key: "call_state" },
                { label: "Country",        key: "country_training" },
                { label: "Notes",          key: "notes" },
              ]}
            />
          </TabsContent>

          {/* ── Weekly Sales ──────────────────────────────────────────── */}
          <TabsContent value="weekly-sales" className="mt-4 space-y-4">
            <div className="rounded-lg bg-muted/30 border border-border/40 px-3 py-2.5 text-[11px] text-muted-foreground">
              <strong className="text-foreground">Expected format:</strong>{" "}
              Pivot table with Sales Team Member rows (3 sub-rows each: Full Sales Call · Good Call · Sales) and date columns.
              The parser flattens each member × date into one record.
            </div>
            <ImportSection
              importer={weeklySalesImporter}
              tableName="weekly_sales"
              inputId="input-weekly-sales"
              emptyHint='Export your Weekly Sales tracker as CSV. The grid should have members as row groups and dates as columns.'
              previewCols={[
                { label: "Member",          key: "member_name",      className: "font-medium" },
                { label: "Date",            key: "date_col" },
                { label: "Full Sales Calls", key: "full_sales_calls" },
                { label: "Good Calls",      key: "good_calls" },
                { label: "Sales",           key: "sales_count" },
              ]}
            />
          </TabsContent>

          {/* ── Meta Leads ────────────────────────────────────────────── */}
          <TabsContent value="meta-leads" className="mt-4 space-y-4">
            <div className="rounded-lg bg-muted/30 border border-border/40 px-3 py-2.5 text-[11px] text-muted-foreground">
              <strong className="text-foreground">Expected columns (Typeform export):</strong>{" "}
              First Name · Last Name · Age · Email · Phone · Country · Employed · Profession · Salary (USD) · UTM Source · UTM Medium · UTM Campaign · UTM Content
              <span className="block mt-1 text-[10px]">Column headers are matched by keyword — emoji and long descriptions in the header are handled automatically.</span>
            </div>
            <ImportSection
              importer={metaLeadsImporter}
              tableName="meta_leads"
              inputId="input-meta-leads"
              emptyHint='Export your Meta Leads sheet as CSV. The first row must be column headers (First Name, Last Name, Email, Phone, Zoho ID, …).'
              previewCols={[
                { label: "First",      key: "first_name",  className: "font-medium" },
                { label: "Last",       key: "last_name",   className: "font-medium" },
                { label: "Email",      key: "email" },
                { label: "Phone",      key: "phone" },
                { label: "Country",    key: "country" },
                { label: "Profession", key: "profession" },
                { label: "Speciality", key: "speciality" },
                { label: "Submitted",  key: "submitted_at" },
              ]}
            />
          </TabsContent>
        </Tabs>

        {/* Instructions */}
        <Card className="shadow-sm border-border/50 bg-muted/20">
          <CardContent className="px-4 py-4">
            <p className="text-[12px] font-semibold text-foreground mb-2">How to export your sheet as CSV</p>
            <ol className="text-[11px] text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Open the sheet in Google Sheets or Excel</li>
              <li>Google Sheets: <strong>File → Download → Comma Separated Values (.csv)</strong></li>
              <li>Excel: <strong>File → Save As → CSV (Comma delimited)</strong></li>
              <li>Select the correct tab above, then drop or browse the downloaded file</li>
            </ol>
          </CardContent>
        </Card>

        {/* Supabase table setup note */}
        <Card className="shadow-sm border-border/50 bg-amber-500/5 border-amber-500/20">
          <CardContent className="px-4 py-4">
            <p className="text-[12px] font-semibold text-foreground mb-2">Required Supabase tables</p>
            <p className="text-[11px] text-muted-foreground mb-2">
              Make sure these tables exist in your Supabase project before importing:
            </p>
            <ul className="text-[11px] text-muted-foreground space-y-1 list-disc list-inside">
              <li><code className="bg-muted px-1 rounded">call_log</code> — existing call log records</li>
              <li><code className="bg-muted px-1 rounded">doctor_sessions</code> — detailed pipeline session notes (date, status, name, specialty, qualifications, call_state, meeting_type, country_training, notes)</li>
              <li><code className="bg-muted px-1 rounded">weekly_sales</code> — recruiter daily activity (member_name, date_col, full_sales_calls, good_calls, sales_count)</li>
              <li><code className="bg-muted px-1 rounded">meta_leads</code> — Meta/Typeform lead acquisition (first_name, last_name, email, phone, country, specialty, age, employed, salary_usd, utm_source, utm_medium, utm_campaign, utm_content)</li>
            </ul>
          </CardContent>
        </Card>

      </div>
    </DashboardLayout>
  );
}
