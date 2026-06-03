/**
 * Hammad-sheet CSV importer.
 *
 * Two-step flow:
 *   1. Paste / pick the CSV → preview parsed rows (count + a sample)
 *   2. Confirm → bulk insert via useBulkInsertPlacementAttempts
 *
 * Names that match a Zoho lead / DoB (case-insensitive exact match)
 * inherit that doctor_id so the placement row links to the real
 * roster entry. Unmatched rows get `csv:<slug>` synthetic ids — they
 * still surface in the Placements table, just not linked to any
 * automation flow until the team manually links them later.
 */
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, AlertCircle, CheckCircle2, FileText } from "lucide-react";
import { parseHammadCsv, doctorSlug } from "@/lib/parse-hammad-csv";
import { readTabularFile, type ReadResult } from "@/lib/read-tabular-file";
import { useBulkInsertPlacementAttempts, type UpsertAttemptInput } from "@/hooks/use-placement-attempts";
import { useZohoData } from "@/hooks/use-zoho-data";
import { useHospitals } from "@/hooks/use-hospitals";
import { toast } from "sonner";

interface Props {
  open:    boolean;
  onClose: () => void;
}

export function CsvImportDialog({ open, onClose }: Props) {
  const [csvText, setCsvText]   = useState("");
  const [readMeta, setReadMeta] = useState<ReadResult | null>(null);
  const [step, setStep]         = useState<"input" | "preview" | "done">("input");
  const [importing, setImporting] = useState(false);
  const [result, setResult]     = useState<{ inserted: number; skipped: number } | null>(null);
  const bulk                    = useBulkInsertPlacementAttempts();
  const { data: zoho }          = useZohoData();
  const { data: hospitals = [] } = useHospitals();

  const parsed = useMemo(() => csvText ? parseHammadCsv(csvText) : null, [csvText]);

  // Build a name → Zoho id lookup so CSV rows that match a lead/DoB
  // by name get linked. Case + whitespace normalised.
  const nameToZohoId = useMemo(() => {
    const m = new Map<string, string>();
    const norm = (s: string) => s.replace(/^\s*dr\.?\s+/i, "").toLowerCase().replace(/\s+/g, " ").trim();
    for (const l of zoho?.rawLeads ?? []) {
      const name = (l.Full_Name || `${l.First_Name ?? ""} ${l.Last_Name ?? ""}`).trim();
      if (name) m.set(norm(name), `lead:${l.id}`);
    }
    for (const d of zoho?.rawDoctorsOnBoard ?? []) {
      const name = (d.Full_Name || `${d.First_Name ?? ""} ${d.Last_Name ?? ""}`).trim();
      // DoB wins over a same-named lead — they're further down the pipeline.
      if (name) m.set(norm(name), `dob:${d.id}`);
    }
    return m;
  }, [zoho?.rawLeads, zoho?.rawDoctorsOnBoard]);

  // hospital_name → hospitals.id lookup, case-insensitive contains
  // (CSV uses abbreviations like "AH" / "STMC" so a strict equality
  // would miss everything — we fuzzy-match if a hospital row's name
  // contains the CSV cell as a token).
  const hospitalLookup = (raw: string): string | null => {
    const q = raw.trim().toLowerCase();
    if (!q) return null;
    // Exact name match wins
    const exact = hospitals.find(h => h.name.toLowerCase() === q);
    if (exact) return exact.id;
    // Substring (hospital name contains the CSV abbreviation)
    const sub = hospitals.find(h => h.name.toLowerCase().includes(q));
    return sub?.id ?? null;
  };

  const decoratedRows = useMemo(() => {
    if (!parsed) return [];
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
    return parsed.rows.map(r => {
      const zohoId = nameToZohoId.get(norm(r.doctor_name));
      return {
        ...r,
        doctor_id:   zohoId ?? doctorSlug(r.doctor_name),
        zoho_linked: !!zohoId,
        hospital_id: hospitalLookup(r.hospital_name),
      };
    });
  }, [parsed, nameToZohoId, hospitals]);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleFile = async (file: File) => {
    try {
      // readTabularFile handles BOTH .csv and .xlsx — for xlsx it
      // concatenates every tab into a single CSV-text representation
      // with blank-line separators, which the parser treats as new
      // sections (same as a multi-section monthly sheet).
      const result = await readTabularFile(file);
      setReadMeta(result);
      setCsvText(result.text);
      setStep("preview");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read file");
    }
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const payload: UpsertAttemptInput[] = decoratedRows.map(r => ({
        doctor_id:        r.doctor_id,
        doctor_name:      r.doctor_name,
        doctor_specialty: r.doctor_specialty,
        hospital_id:      r.hospital_id,
        hospital_name:    r.hospital_name,
        shortlisted_at:   r.shortlisted_at,
        interviewed_at:   r.interviewed_at,
        offered_at:       r.offered_at,
        signed_at:        r.signed_at,
        start_date:       r.start_date,
        joined_at:        r.joined_at,
        notes:            r.notes,
        source:           "csv_import",
      }));
      const { inserted, skipped } = await bulk.mutateAsync(payload);
      setResult({ inserted, skipped });
      setStep("done");
      toast.success(`Imported ${inserted} placement${inserted === 1 ? "" : "s"}${skipped > 0 ? ` (skipped ${skipped} duplicates)` : ""}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setCsvText("");
    setReadMeta(null);
    setStep("input");
    setResult(null);
    onClose();
  };

  const zohoMatched = decoratedRows.filter(r => r.zoho_linked).length;
  const hospitalMatched = decoratedRows.filter(r => r.hospital_id).length;

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[14px]">
            <Upload className="h-4 w-4 text-emerald-600" />
            Import placements (CSV or XLSX)
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground">
            Drop the whole Hammad workbook (.xlsx — every tab gets imported in one shot) or a single-tab CSV. The parser handles Ammar's multi-section weekly format. Doctors are matched to Zoho leads + DoB by name; hospitals are matched to the hospitals table. Unmatched rows still import as free-text references.
          </p>
        </DialogHeader>

        {step === "input" && (
          <div className="space-y-3">
            <div className="rounded-md border-2 border-dashed border-slate-200 px-4 py-6 text-center">
              <FileText className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
              <label htmlFor="csv-file-input" className="cursor-pointer text-[12px] font-medium text-teal-700 hover:underline">
                Pick a .csv or .xlsx file
              </label>
              <input
                id="csv-file-input"
                type="file"
                accept=".csv,.xlsx,.xls,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
              />
              <p className="text-[10px] text-muted-foreground mt-1">.xlsx imports every tab in one shot · or paste CSV text below</p>
            </div>
            <textarea
              value={csvText}
              onChange={e => { setCsvText(e.target.value); if (e.target.value.trim()) setStep("preview"); }}
              placeholder="Paste CSV content here…"
              className="w-full h-[200px] rounded-md border border-slate-300 px-3 py-2 text-[11px] font-mono"
            />
          </div>
        )}

        {step === "preview" && parsed && (
          <div className="space-y-3">
            {/* When source was an xlsx workbook, show which tabs we
                read. Helpful if the user expected N tabs but the parser
                only found M. */}
            {readMeta && readMeta.format === "xlsx" && readMeta.sheets.length > 0 && (
              <div className="rounded-md border bg-sky-50/30 px-3 py-2">
                <div className="text-[11px] font-medium text-sky-900 mb-1">
                  Read {readMeta.sheets.length} sheet{readMeta.sheets.length === 1 ? "" : "s"} from the workbook:
                </div>
                <div className="flex flex-wrap gap-1">
                  {readMeta.sheets.map(s => (
                    <Badge key={s.name} variant="outline" className="text-[9px] bg-white border-sky-200 text-sky-800">
                      {s.name} · {s.rows}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <Stat label="Rows parsed"        value={parsed.rows.length} tone="emerald" />
              <Stat label="Skipped"            value={parsed.skippedRows} tone="slate" />
              <Stat label="Zoho-matched"       value={zohoMatched}        tone="indigo" />
              <Stat label="Hospital-matched"   value={hospitalMatched}    tone="sky" />
            </div>

            {parsed.rows.length === 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50/40 px-3 py-2 text-[11px] text-amber-900">
                <AlertCircle className="h-3.5 w-3.5 inline mr-1" />
                Couldn't parse any rows. Make sure the CSV has the same column shape as Ammar's sheet (Hospital, Doctor, Specialty, Shortlisted, Interview, offered, Signed, Start, Joined).
              </div>
            ) : (
              <>
                <div className="max-h-[280px] overflow-y-auto rounded-md border bg-slate-50/40">
                  <table className="w-full text-[10px]">
                    <thead className="bg-slate-100 text-slate-700 sticky top-0">
                      <tr>
                        <th className="px-2 py-1 text-left">Doctor</th>
                        <th className="px-2 py-1 text-left">Hospital</th>
                        <th className="px-2 py-1 text-left">Specialty</th>
                        <th className="px-2 py-1 text-left">Match</th>
                      </tr>
                    </thead>
                    <tbody>
                      {decoratedRows.slice(0, 50).map((r, i) => (
                        <tr key={i} className="border-t border-slate-200/60">
                          <td className="px-2 py-1">{r.doctor_name}</td>
                          <td className="px-2 py-1">{r.hospital_name}</td>
                          <td className="px-2 py-1 text-muted-foreground truncate max-w-[140px]">{r.doctor_specialty ?? "—"}</td>
                          <td className="px-2 py-1">
                            {r.zoho_linked && <Badge variant="outline" className="text-[9px] bg-indigo-50 text-indigo-700 border-indigo-200 mr-1">Zoho</Badge>}
                            {r.hospital_id && <Badge variant="outline" className="text-[9px] bg-sky-50 text-sky-700 border-sky-200">Hosp</Badge>}
                            {!r.zoho_linked && !r.hospital_id && <span className="text-muted-foreground">free-text</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {decoratedRows.length > 50 && (
                    <div className="px-2 py-1 text-[10px] text-muted-foreground text-center bg-slate-100">
                      + {decoratedRows.length - 50} more rows (all will be imported)
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Re-importing the same CSV is safe — rows that already exist (same doctor + hospital) are skipped.
                </p>
              </>
            )}
          </div>
        )}

        {step === "done" && result && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50/40 px-4 py-6 text-center">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 mx-auto mb-2" />
            <p className="text-[13px] font-medium text-emerald-900">Import complete</p>
            <p className="text-[11px] text-emerald-800 mt-1">
              {result.inserted} new placement{result.inserted === 1 ? "" : "s"} added
              {result.skipped > 0 && <> · {result.skipped} skipped (already existed)</>}.
            </p>
          </div>
        )}

        <DialogFooter className="mt-2">
          {step === "input" && (
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => { setCsvText(""); setStep("input"); }}>Back</Button>
              <Button onClick={handleImport} disabled={importing || decoratedRows.length === 0}>
                {importing ? "Importing…" : `Import ${decoratedRows.length} placement${decoratedRows.length === 1 ? "" : "s"}`}
              </Button>
            </>
          )}
          {step === "done" && (
            <Button onClick={handleClose}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "emerald" | "slate" | "indigo" | "sky" }) {
  const toneCls = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    slate:   "bg-slate-50 text-slate-700 border-slate-200",
    indigo:  "bg-indigo-50 text-indigo-700 border-indigo-200",
    sky:     "bg-sky-50 text-sky-700 border-sky-200",
  }[tone];
  return (
    <div className={`rounded-md border ${toneCls} px-2 py-2`}>
      <div className="text-[18px] font-semibold leading-none">{value}</div>
      <div className="text-[9px] uppercase tracking-wider mt-1">{label}</div>
    </div>
  );
}
