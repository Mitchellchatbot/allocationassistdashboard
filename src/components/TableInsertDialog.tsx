import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table2, Plus, Minus, ClipboardPaste, Upload, Grid3x3 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  gridToHtmlTable, parseDelimited, normaliseGrid,
  type TableStyleOptions, type CellAlign, type TablePreset, AA_TEAL,
} from "@/lib/email-table";

/**
 * TableInsertDialog — Amir #4. Build a table and drop it into the email editor.
 * Three ways in: hand-build a grid, paste straight from Excel/Sheets (TSV/CSV),
 * or upload an .xlsx and pick a sheet. A full style panel (presets, header,
 * stripes, borders, alignment, accent colour, caption) drives a LIVE preview of
 * the exact email-safe HTML that gets inserted. No backend — pure frontend.
 */
export function TableInsertDialog({
  open, onOpenChange, onInsert, contentClassName, overlayClassName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onInsert: (html: string) => void;
  /** Raise the dialog's z-index when opened from inside another full-screen
   *  overlay (e.g. the full-screen editor), so it isn't hidden behind it. */
  contentClassName?: string;
  overlayClassName?: string;
}) {
  const [mode, setMode]   = useState<"build" | "paste" | "upload">("build");
  const [grid, setGrid]   = useState<string[][]>(() => seedGrid(3, 3));
  const [pasteText, setPasteText] = useState("");
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [workbook, setWorkbook] = useState<unknown>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Style options.
  const [preset, setPreset]       = useState<TablePreset>("aa");
  const [headerRow, setHeaderRow] = useState(true);
  const [striped, setStriped]     = useState(true);
  const [bordered, setBordered]   = useState(true);
  const [align, setAlign]         = useState<CellAlign>("left");
  const [accent, setAccent]       = useState(AA_TEAL);
  const [caption, setCaption]     = useState("");

  // Reset the data each time the dialog opens so a second insert doesn't reuse
  // the previous table's grid/paste/caption. Style preset + accent stay sticky.
  useEffect(() => {
    if (open) {
      setMode("build"); setGrid(seedGrid(3, 3)); setPasteText(""); setCaption("");
      setSheetNames([]); setWorkbook(null);
    }
  }, [open]);

  const opts: Partial<TableStyleOptions> = { preset, headerRow, striped, bordered, align, accent, caption };

  // The active grid depends on the mode.
  const activeGrid: string[][] = useMemo(() => {
    if (mode === "paste") return parseDelimited(pasteText);
    return grid;
  }, [mode, pasteText, grid]);

  const previewHtml = useMemo(() => gridToHtmlTable(activeGrid, opts), [activeGrid, preset, headerRow, striped, bordered, align, accent, caption]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;

  const setCell = (r: number, c: number, v: string) =>
    setGrid(g => g.map((row, ri) => ri === r ? row.map((cell, ci) => ci === c ? v : cell) : row));
  const addRow    = () => setGrid(g => [...g, Array(cols || 1).fill("")]);
  const removeRow = () => setGrid(g => g.length > 1 ? g.slice(0, -1) : g);
  const addCol    = () => setGrid(g => g.map(row => [...row, ""]));
  const removeCol = () => setGrid(g => cols > 1 ? g.map(row => row.slice(0, -1)) : g);

  const loadXlsx = async (file: File) => {
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      setWorkbook(wb);
      setSheetNames(wb.SheetNames);
      if (wb.SheetNames[0]) selectSheet(wb, wb.SheetNames[0]);
      toast.success(`Loaded ${file.name} · ${wb.SheetNames.length} sheet${wb.SheetNames.length === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read that .xlsx");
    }
  };

  const selectSheet = async (wb: unknown, name: string) => {
    const XLSX = await import("xlsx");
    const sheet = (wb as { Sheets: Record<string, unknown> }).Sheets[name];
    const rowsArr = XLSX.utils.sheet_to_json(sheet as never, { header: 1, blankrows: false, defval: "" }) as unknown[][];
    const g = normaliseGrid(rowsArr.map(r => r.map(c => String(c ?? ""))));
    setGrid(g.length ? g : seedGrid(2, 2));
    setMode("build");  // drop into the grid editor so they can tweak before inserting
  };

  const insert = () => {
    const html = gridToHtmlTable(activeGrid, opts);
    if (!html) { toast.error("Add at least one row of data first."); return; }
    onInsert(html);
    onOpenChange(false);
    toast.success("Table inserted into the email");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-[860px] max-h-[90vh] overflow-y-auto", contentClassName)} overlayClassName={overlayClassName}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Table2 className="h-4 w-4 text-teal-600" /> Insert a table</DialogTitle>
          <DialogDescription className="text-[12px]">
            Build a table, paste it from Excel, or upload a spreadsheet — then drop it straight into the email. Great for the Top 15 and Specialty lists.
          </DialogDescription>
        </DialogHeader>

        {/* Mode tabs */}
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 text-[12px] w-fit">
          <ModeTab active={mode === "build"}  onClick={() => setMode("build")}  icon={Grid3x3}        label="Build" />
          <ModeTab active={mode === "paste"}  onClick={() => setMode("paste")}  icon={ClipboardPaste} label="Paste from Excel" />
          <ModeTab active={mode === "upload"} onClick={() => setMode("upload")} icon={Upload}         label="Upload .xlsx" />
        </div>

        {mode === "build" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>{rows} × {cols}</span>
              <span className="mx-1">·</span>
              <Stepper label="Rows" onAdd={addRow} onRemove={removeRow} />
              <Stepper label="Cols" onAdd={addCol} onRemove={removeCol} />
              <span className="ml-auto">First row = header (toggle in style panel)</span>
            </div>
            <div className="overflow-auto rounded-md border max-h-[220px]">
              <table className="border-collapse w-full">
                <tbody>
                  {grid.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci} className="border border-slate-200 p-0">
                          <input
                            value={cell}
                            onChange={e => setCell(ri, ci, e.target.value)}
                            placeholder={ri === 0 && headerRow ? `Header ${ci + 1}` : ""}
                            className={`w-full min-w-[90px] px-2 py-1.5 text-[12px] outline-none focus:bg-teal-50 ${ri === 0 && headerRow ? "font-semibold bg-slate-50" : ""}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {mode === "paste" && (
          <div className="space-y-1.5">
            <Label className="text-[11px]">Paste cells copied from Excel / Google Sheets (tabs or commas)</Label>
            <Textarea
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              rows={6}
              className="text-[12px] font-mono"
              placeholder={`Name\tSpecialty\tYears\nDr. Mónica Costeira\tPaediatrics\t12\nDr. Rayan Al Jurdi\tPsychiatry\t20`}
            />
            <p className="text-[10px] text-muted-foreground">{parseDelimited(pasteText).length} row(s) detected.</p>
          </div>
        )}

        {mode === "upload" && (
          <div className="space-y-2">
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="text-[12px]">
              <Upload className="h-3.5 w-3.5 mr-1.5" /> Choose .xlsx / .csv file
            </Button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={e => { const f = e.target.files?.[0]; if (f) loadXlsx(f); e.target.value = ""; }} />
            {sheetNames.length > 0 && (
              <div className="flex items-center gap-2">
                <Label className="text-[11px]">Sheet</Label>
                <Select onValueChange={(v) => workbook && selectSheet(workbook, v)} defaultValue={sheetNames[0]}>
                  <SelectTrigger className="h-8 text-[12px] w-[220px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{sheetNames.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
                </Select>
                <span className="text-[10px] text-muted-foreground">Loads into the Build grid so you can tweak it.</span>
              </div>
            )}
          </div>
        )}

        {/* Style panel */}
        <div className="rounded-md border bg-slate-50/50 p-3 space-y-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Style</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-[10px]">Preset</Label>
              <Select value={preset} onValueChange={(v) => setPreset(v as TablePreset)}>
                <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aa">AA branded</SelectItem>
                  <SelectItem value="striped">Striped</SelectItem>
                  <SelectItem value="bordered">Bordered</SelectItem>
                  <SelectItem value="minimal">Minimal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Alignment</Label>
              <Select value={align} onValueChange={(v) => setAlign(v as CellAlign)}>
                <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="center">Center</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Accent</Label>
              <div className="flex items-center gap-1.5">
                <input type="color" value={accent} onChange={e => setAccent(e.target.value)} className="h-8 w-9 rounded border cursor-pointer" />
                <Input value={accent} onChange={e => setAccent(e.target.value)} className="h-8 text-[11px] font-mono" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Caption (optional)</Label>
              <Input value={caption} onChange={e => setCaption(e.target.value)} placeholder="e.g. Top 15 — Cardiology" className="h-8 text-[12px]" />
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <Toggle label="Header row" checked={headerRow} onChange={setHeaderRow} />
            <Toggle label="Striped" checked={striped} onChange={setStriped} />
            <Toggle label="Borders" checked={bordered} onChange={setBordered} />
          </div>
        </div>

        {/* Live preview */}
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Live preview</div>
          <div className="rounded-md border bg-white p-3 overflow-auto max-h-[240px]">
            {previewHtml
              ? <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
              : <p className="text-[12px] text-muted-foreground italic">Add data to preview the table.</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={insert} disabled={!previewHtml}><Table2 className="h-3.5 w-3.5 mr-1.5" /> Insert table</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function seedGrid(rows: number, cols: number): string[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""));
}

function ModeTab({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ElementType; label: string }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors ${active ? "bg-white shadow-sm text-teal-700" : "text-slate-500 hover:text-slate-700"}`}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function Stepper({ label, onAdd, onRemove }: { label: string; onAdd: () => void; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span>{label}</span>
      <button onClick={onRemove} className="h-5 w-5 inline-flex items-center justify-center rounded border bg-white hover:bg-slate-50"><Minus className="h-3 w-3" /></button>
      <button onClick={onAdd} className="h-5 w-5 inline-flex items-center justify-center rounded border bg-white hover:bg-slate-50"><Plus className="h-3 w-3" /></button>
    </span>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(!!v)} /> {label}
    </label>
  );
}
