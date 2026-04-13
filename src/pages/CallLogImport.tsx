import { useState, useCallback } from "react";
import Papa from "papaparse";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileText, CheckCircle, AlertTriangle, Loader2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

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

// Date patterns like "19-Jan", "20-Jan", "26-Jan 25", "19 Jan" etc.
const DATE_RE = /^\d{1,2}[\s\-\/][A-Za-z]{3}/;

const KNOWN_STATUSES = new Set([
  "high potential", "follow up in the future", "declined", "minimal follow up",
  "converted", "unsure", "not interested", "in progress",
]);

function parseRows(raw: string[][]): CallLogRow[] {
  const rows: CallLogRow[] = [];
  let currentDate = "";

  for (const cols of raw) {
    // Normalise: trim all cells
    const cells = cols.map(c => (c ?? "").toString().trim());

    // Skip completely empty rows
    if (cells.every(c => c === "")) continue;

    // Find the first non-empty cell
    const firstIdx = cells.findIndex(c => c.length > 0);
    const firstCell = cells[firstIdx];

    // If the first non-empty cell is a date, capture it and then continue
    // parsing the REST of that same row as a data row (don't skip the whole row).
    // Many sheets embed the date inline: "14-Aug | High Potential | Dr. X | ..."
    let dataOffset = 0;
    if (DATE_RE.test(firstCell)) {
      currentDate = firstCell;
      dataOffset = firstIdx + 1; // data columns start after the date cell
    }

    const dataCells = cells.slice(dataOffset);

    // Skip if nothing left after the date
    if (dataCells.every(c => c === "")) continue;

    // Find status: prefer a KNOWN_STATUSES match, otherwise accept the
    // first non-empty cell (handles "No Answer", "Callback", etc.)
    let statusIdx = -1;
    let status = "";

    for (let i = 0; i < dataCells.length; i++) {
      const low = dataCells[i].toLowerCase();
      if (KNOWN_STATUSES.has(low) || [...KNOWN_STATUSES].some(s => low.startsWith(s))) {
        statusIdx = i;
        status = dataCells[i];
        break;
      }
    }

    // No known status found — fall back to first non-empty cell.
    // But only do this when a date was present on this row (avoids treating
    // spreadsheet header/title rows as data rows).
    // Fallback: accept any first non-empty cell as status, as long as there
    // is at least one more non-empty cell after it (i.e., a doctor name exists).
    // This handles statuses not in KNOWN_STATUSES ("No answer", "Placed", etc.)
    if (statusIdx === -1) {
      for (let i = 0; i < dataCells.length; i++) {
        if (dataCells[i].length > 0) {
          const hasMore = dataCells.slice(i + 1).some(c => c.length > 0);
          if (hasMore) {
            statusIdx = i;
            status = dataCells[i];
            break;
          }
        }
      }
    }

    if (statusIdx === -1) continue;

    // Everything after the status column maps positionally:
    // +1 name, +2 specialty, +3 country_training, +4 country_origin, +5 years_exp, +6 notes
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

const BATCH = 200;

export default function CallLogImport() {
  const [rows, setRows]           = useState<CallLogRow[]>([]);
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
      header:         false,
      skipEmptyLines: false,
      complete: (result) => {
        const parsed = parseRows(result.data as string[][]);
        setRows(parsed);
      },
      error: (err) => setError(err.message),
    });
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const doImport = async () => {
    setImporting(true);
    setError("");
    let inserted = 0;
    try {
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const { error: err } = await supabase.from("call_log").insert(batch);
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

  return (
    <DashboardLayout title="Import Call Log" subtitle="Upload your call log spreadsheet as a CSV file">
      <div className="max-w-4xl space-y-4">

        {/* Drop zone */}
        {rows.length === 0 && (
          <Card
            className="border-2 border-dashed border-border/60 hover:border-primary/40 transition-colors cursor-pointer"
            onDragOver={e => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => document.getElementById("csv-input")?.click()}
          >
            <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Upload className="h-6 w-6 text-primary" />
              </div>
              <p className="text-[14px] font-medium text-foreground">Drop your CSV file here</p>
              <p className="text-[12px] text-muted-foreground text-center max-w-sm">
                Export your call log sheet as <strong>CSV</strong> (File → Download → CSV), then drop it here.
                Dates, statuses, and notes are parsed automatically.
              </p>
              <Button variant="outline" size="sm" className="mt-2 text-[12px]">
                <FileText className="h-3.5 w-3.5 mr-1.5" /> Browse file
              </Button>
              <input id="csv-input" type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={onInput} />
            </CardContent>
          </Card>
        )}

        {/* Preview */}
        {rows.length > 0 && !isComplete && (
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
              {/* Sample preview */}
              <div className="overflow-x-auto rounded-lg border border-border/50">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      {["Date","Status","Doctor","Specialty","Training","Origin","Yrs","Notes"].map(h => (
                        <th key={h} className="text-left px-2 py-1.5 font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 8).map((r, i) => (
                      <tr key={i} className="border-b border-border/30 last:border-0 hover:bg-muted/20">
                        <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">{r.call_date}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">
                          <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                            r.status.toLowerCase().includes("high") ? "bg-success/10 text-success" :
                            r.status.toLowerCase().includes("declined") ? "bg-destructive/10 text-destructive" :
                            "bg-muted text-muted-foreground"
                          }`}>{r.status}</span>
                        </td>
                        <td className="px-2 py-1.5 font-medium whitespace-nowrap">{r.doctor_name}</td>
                        <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">{r.specialty}</td>
                        <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">{r.country_training}</td>
                        <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">{r.country_origin}</td>
                        <td className="px-2 py-1.5 text-muted-foreground text-right">{r.years_experience ?? "—"}</td>
                        <td className="px-2 py-1.5 text-muted-foreground max-w-[200px] truncate">{r.notes}</td>
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
                <Button variant="outline" onClick={clear} disabled={importing} className="text-[12px] h-8">
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Success */}
        {isComplete && (
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
                  All records are now in the <code className="text-[11px] bg-muted px-1 rounded">call_log</code> table in Supabase.
                </p>
              </div>
              <Button variant="outline" onClick={clear} className="ml-auto text-[12px] h-8 shrink-0">
                Import another file
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Instructions */}
        <Card className="shadow-sm border-border/50 bg-muted/20">
          <CardContent className="px-4 py-4">
            <p className="text-[12px] font-semibold text-foreground mb-2">How to export your sheet as CSV</p>
            <ol className="text-[11px] text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Open the sheet in Google Sheets or Excel</li>
              <li>Google Sheets: <strong>File → Download → Comma Separated Values (.csv)</strong></li>
              <li>Excel: <strong>File → Save As → CSV (Comma delimited)</strong></li>
              <li>Drop the downloaded file above — dates, statuses, and notes are parsed automatically</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
