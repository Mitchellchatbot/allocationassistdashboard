/**
 * Import Ammar's monthly placement sheets into the Processing list.
 *
 * Differs from the Reports importer (CsvImportDialog) in two ways that matter
 * here: several files can be dropped at once, and nothing it writes can send
 * an email — these sheets are months of history, so a backfilled join date
 * must not trigger the Second Payment flow.
 *
 * Rows are merged, not blindly inserted: the monthly sheets repeat the same
 * (doctor, hospital) week after week as it moves through the stages, and a
 * date already in the database always wins over one arriving from a sheet.
 */
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, CheckCircle2, AlertCircle, X } from "lucide-react";
import { parseHammadCsv, doctorSlug } from "@/lib/parse-hammad-csv";
import { readTabularFile } from "@/lib/read-tabular-file";
import {
  planPlacementImport, useApplyPlacementImport,
  type PlacementAttempt, type UpsertAttemptInput,
} from "@/hooks/use-placement-attempts";
import { useZohoData } from "@/hooks/use-zoho-data";
import { useHospitals } from "@/hooks/use-hospitals";
import { toast } from "sonner";

interface Props {
  open:      boolean;
  existing:  PlacementAttempt[];
  onClose:   () => void;
}

interface LoadedFile { name: string; text: string; rows: number }

const normName = (s: string) => s.replace(/^\s*dr\.?\s+/i, "").toLowerCase().replace(/\s+/g, " ").trim();

export function PlacementImportDialog({ open, existing, onClose }: Props) {
  const [files, setFiles]   = useState<LoadedFile[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ inserted: number; updated: number; unchanged: number } | null>(null);
  const apply               = useApplyPlacementImport();
  const { data: zoho }      = useZohoData();
  const { data: hospitals = [] } = useHospitals();

  const nameToZohoId = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of zoho?.rawLeads ?? []) {
      const name = (l.Full_Name || `${l.First_Name ?? ""} ${l.Last_Name ?? ""}`).trim();
      if (name) m.set(normName(name), `lead:${l.id}`);
    }
    for (const d of zoho?.rawDoctorsOnBoard ?? []) {
      const name = (d.Full_Name || `${d.First_Name ?? ""} ${d.Last_Name ?? ""}`).trim();
      // A doctor on board outranks a same-named lead — further down the pipeline.
      if (name) m.set(normName(name), `dob:${d.id}`);
    }
    return m;
  }, [zoho?.rawLeads, zoho?.rawDoctorsOnBoard]);

  const hospitalLookup = useMemo(() => {
    const byName = new Map<string, string>();
    for (const h of hospitals) byName.set(h.name.toLowerCase(), h.id);
    return (raw: string): string | null => {
      const q = raw.trim().toLowerCase();
      if (!q) return null;
      return byName.get(q) ?? hospitals.find(h => h.name.toLowerCase().includes(q))?.id ?? null;
    };
  }, [hospitals]);

  const parsed = useMemo(() => {
    const rows: UpsertAttemptInput[] = [];
    let skipped = 0;
    for (const f of files) {
      const r = parseHammadCsv(f.text);
      skipped += r.skippedRows;
      for (const row of r.rows) {
        rows.push({
          doctor_id:        nameToZohoId.get(normName(row.doctor_name)) ?? doctorSlug(row.doctor_name),
          doctor_name:      row.doctor_name,
          doctor_specialty: row.doctor_specialty,
          hospital_id:      hospitalLookup(row.hospital_name),
          hospital_name:    row.hospital_name,
          shortlisted_at:   row.shortlisted_at,
          interviewed_at:   row.interviewed_at,
          offered_at:       row.offered_at,
          signed_at:        row.signed_at,
          start_date:       row.start_date,
          joined_at:        row.joined_at,
          notes:            row.notes,
          source:           "csv_import",
        });
      }
    }
    return { rows, skipped };
  }, [files, nameToZohoId, hospitalLookup]);

  const plan = useMemo(() => planPlacementImport(parsed.rows, existing), [parsed.rows, existing]);

  const zohoLinked = plan.inserts.filter(r => !r.doctor_id.startsWith("csv:")).length;

  const handleFiles = async (picked: FileList) => {
    const next: LoadedFile[] = [];
    for (const file of Array.from(picked)) {
      try {
        const r = await readTabularFile(file);
        next.push({ name: file.name, text: r.text, rows: parseHammadCsv(r.text).rows.length });
      } catch (e) {
        toast.error(`${file.name}: ${e instanceof Error ? e.message : "couldn't read file"}`);
      }
    }
    setFiles(prev => [...prev.filter(p => !next.some(n => n.name === p.name)), ...next]);
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      setResult(await apply.mutateAsync(plan));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => { setFiles([]); setResult(null); onClose(); };

  const nothingToDo = plan.inserts.length === 0 && plan.updates.length === 0;

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[14px]">
            <Upload className="h-4 w-4 text-teal-600" />
            Add placements from a sheet
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground">
            Drop one or more of the monthly platform reports (.csv or .xlsx). Dates already recorded here are kept — a sheet can only fill in stages that are still blank. No emails are sent.
          </p>
        </DialogHeader>

        {result ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50/40 px-4 py-6 text-center">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 mx-auto mb-2" />
            <p className="text-[13px] font-medium text-emerald-900">Import complete</p>
            <p className="text-[11px] text-emerald-800 mt-1">
              {result.inserted} added · {result.updated} updated
              {result.unchanged > 0 && <> · {result.unchanged} already up to date</>}.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border-2 border-dashed border-slate-200 px-4 py-5 text-center">
              <FileText className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
              <label htmlFor="placement-import-input" className="cursor-pointer text-[12px] font-medium text-teal-700 hover:underline">
                Pick .csv or .xlsx files
              </label>
              <input
                id="placement-import-input"
                type="file"
                multiple
                accept=".csv,.xlsx,.xls,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
                onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ""; }}
              />
              <p className="text-[10px] text-muted-foreground mt-1">Several months at once is fine — they get merged.</p>
            </div>

            {files.length > 0 && (
              <div className="space-y-1">
                {files.map(f => (
                  <div key={f.name} className="flex items-center justify-between rounded-md border bg-slate-50/60 px-2 py-1">
                    <span className="text-[11px] truncate">{f.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-[9px] bg-white">{f.rows} rows</Badge>
                      <button type="button" onClick={() => setFiles(p => p.filter(x => x.name !== f.name))}
                        aria-label={`Remove ${f.name}`}
                        className="text-muted-foreground hover:text-slate-900">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {files.length > 0 && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <Stat label="New pairs"    value={plan.inserts.length} tone="emerald" />
                  <Stat label="Filled in"    value={plan.updates.length} tone="sky" />
                  <Stat label="Up to date"   value={plan.unchanged}      tone="slate" />
                  <Stat label="Zoho-matched" value={zohoLinked}          tone="indigo" />
                </div>

                {nothingToDo ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50/40 px-3 py-2 text-[11px] text-amber-900">
                    <AlertCircle className="h-3.5 w-3.5 inline mr-1" />
                    Nothing new in these files — every row is already in the list.
                  </div>
                ) : (
                  <div className="max-h-[240px] overflow-y-auto rounded-md border bg-slate-50/40">
                    <table className="w-full text-[10px]">
                      <thead className="bg-slate-100 text-slate-700 sticky top-0">
                        <tr>
                          <th className="px-2 py-1 text-left">Doctor</th>
                          <th className="px-2 py-1 text-left">Hospital</th>
                          <th className="px-2 py-1 text-left">Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {plan.inserts.slice(0, 40).map(r => (
                          <tr key={`i-${r.doctor_id}-${r.hospital_name}`} className="border-t border-slate-200/60">
                            <td className="px-2 py-1">{r.doctor_name}</td>
                            <td className="px-2 py-1">{r.hospital_name}</td>
                            <td className="px-2 py-1"><Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200">new</Badge></td>
                          </tr>
                        ))}
                        {plan.updates.slice(0, 40).map(u => (
                          <tr key={`u-${u.id}`} className="border-t border-slate-200/60">
                            <td className="px-2 py-1">{u.row.doctor_name}</td>
                            <td className="px-2 py-1">{u.row.hospital_name}</td>
                            <td className="px-2 py-1 text-sky-800">
                              {u.filled.length ? `+ ${u.filled.map(c => c.replace(/_at$|_date$/, "")).join(", ")}` : "notes"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <DialogFooter className="mt-2">
          {result ? (
            <Button onClick={handleClose}>Close</Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleImport} disabled={importing || nothingToDo}>
                {importing ? "Importing…" : `Import ${plan.inserts.length + plan.updates.length} placements`}
              </Button>
            </>
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
