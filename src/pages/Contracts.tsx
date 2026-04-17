import { useState, useMemo, useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useZohoData, type ZohoLead } from "@/hooks/use-zoho-data";
import {
  Printer, Plus, Trash2, Search, FileText, Save, RotateCcw, Copy, Check,
} from "lucide-react";

// ── Available Zoho fields for mapping ────────────────────────────────────────

const ZOHO_FIELD_OPTIONS = [
  { value: "_today",                           label: "Today's Date" },
  { value: "Full_Name",                        label: "Full Name" },
  { value: "First_Name",                       label: "First Name" },
  { value: "Last_Name",                        label: "Last Name" },
  { value: "Specialty",                        label: "Specialty" },
  { value: "Country_of_Specialty_training",    label: "Country of Training" },
  { value: "Has_DHA",                          label: "DHA License" },
  { value: "Has_DOH",                          label: "DOH License" },
  { value: "Has_MOH",                          label: "MOH License" },
  { value: "License",                          label: "License" },
  { value: "Recruiter",                        label: "Recruiter" },
  { value: "Owner.name",                       label: "Owner / Assigned Recruiter" },
  { value: "Lead_Status",                      label: "Lead Status" },
  { value: "Lead_Source",                      label: "Lead Source" },
  { value: "Prime_Classification",             label: "Classification" },
  { value: "Age",                              label: "Age" },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface FieldMapping {
  id:          string;
  placeholder: string;  // e.g. {{doctor_name}}
  zohoField:   string;  // e.g. Full_Name
  staticValue: string;  // used only when zohoField === "_static"
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_TEMPLATE = `EMPLOYMENT AGREEMENT

This Employment Agreement ("Agreement") is entered into on {{date}} between Allocation Assist ("Company") and {{doctor_name}} ("Doctor").

────────────────────────────────────────
POSITION DETAILS
────────────────────────────────────────
Specialty:              {{specialty}}
Classification:         {{classification}}
Country of Training:    {{training_country}}

────────────────────────────────────────
LICENSING
────────────────────────────────────────
DHA License:   {{dha_status}}
DOH License:   {{doh_status}}
MOH License:   {{moh_status}}

────────────────────────────────────────
ASSIGNED RECRUITER
────────────────────────────────────────
{{recruiter}}

────────────────────────────────────────
TERMS
────────────────────────────────────────
This agreement is subject to all applicable laws and regulations governing employment in the UAE. Both parties agree to the terms and conditions outlined herein.

────────────────────────────────────────
SIGNATURES
────────────────────────────────────────

Doctor:                                    Date: ___________
{{doctor_name}}

Company Representative:                    Date: ___________
Allocation Assist`;

const DEFAULT_MAPPINGS: FieldMapping[] = [
  { id: "1", placeholder: "{{date}}",            zohoField: "_today",                        staticValue: "" },
  { id: "2", placeholder: "{{doctor_name}}",     zohoField: "Full_Name",                     staticValue: "" },
  { id: "3", placeholder: "{{specialty}}",       zohoField: "Specialty",                     staticValue: "" },
  { id: "4", placeholder: "{{classification}}", zohoField: "Prime_Classification",           staticValue: "" },
  { id: "5", placeholder: "{{training_country}}",zohoField: "Country_of_Specialty_training", staticValue: "" },
  { id: "6", placeholder: "{{dha_status}}",      zohoField: "Has_DHA",                       staticValue: "" },
  { id: "7", placeholder: "{{doh_status}}",      zohoField: "Has_DOH",                       staticValue: "" },
  { id: "8", placeholder: "{{moh_status}}",      zohoField: "Has_MOH",                       staticValue: "" },
  { id: "9", placeholder: "{{recruiter}}",       zohoField: "Recruiter",                     staticValue: "" },
];

const STORAGE_KEY = "contract-builder-v1";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getLeadField(lead: ZohoLead, fieldPath: string, staticValue: string): string {
  if (fieldPath === "_today") {
    return new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  }
  if (fieldPath === "_static") return staticValue || "—";

  // Nested path support: "Owner.name"
  const parts = fieldPath.split(".");
  let val: unknown = lead;
  for (const part of parts) {
    if (val == null || typeof val !== "object") return "—";
    val = (val as Record<string, unknown>)[part];
  }
  if (val == null || val === "" || val === "No") return "—";
  return String(val);
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fillTemplate(template: string, mappings: FieldMapping[], lead: ZohoLead | null): string {
  if (!lead) return template;
  let out = template;
  for (const m of mappings) {
    if (!m.placeholder.trim()) continue;
    const value = getLeadField(lead, m.zohoField, m.staticValue);
    out = out.replace(new RegExp(escapeRegex(m.placeholder), "g"), value);
  }
  return out;
}

// Detect all {{...}} placeholders in the template
function detectPlaceholders(template: string): string[] {
  const matches = template.match(/\{\{[^}]+\}\}/g) ?? [];
  return [...new Set(matches)];
}

// ── Page ──────────────────────────────────────────────────────────────────────

const Contracts = () => {
  const { data: zoho } = useZohoData();

  // Persist template + mappings in localStorage
  const [template, setTemplate] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved).template ?? DEFAULT_TEMPLATE;
    } catch {}
    return DEFAULT_TEMPLATE;
  });

  const [mappings, setMappings] = useState<FieldMapping[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved).mappings ?? DEFAULT_MAPPINGS;
    } catch {}
    return DEFAULT_MAPPINGS;
  });

  const [search, setSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState<ZohoLead | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // ── Doctor search ─────────────────────────────────────────────────────────
  const doctorOptions = useMemo(() => {
    if (!zoho?.rawLeads || search.trim().length < 2) return [];
    const q = search.toLowerCase();
    return zoho.rawLeads
      .filter(l => {
        const name = (l.Full_Name || `${l.First_Name ?? ""} ${l.Last_Name ?? ""}`.trim()).toLowerCase();
        return name.includes(q);
      })
      .slice(0, 10);
  }, [zoho?.rawLeads, search]);

  // ── Unmapped placeholders warning ─────────────────────────────────────────
  const detected    = useMemo(() => detectPlaceholders(template), [template]);
  const mappedSet   = new Set(mappings.map(m => m.placeholder.trim()));
  const unmapped    = detected.filter(p => !mappedSet.has(p));

  // ── Filled preview ────────────────────────────────────────────────────────
  const preview = useMemo(
    () => fillTemplate(template, mappings, selectedLead),
    [template, mappings, selectedLead]
  );

  // ── Save to localStorage ──────────────────────────────────────────────────
  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ template, mappings }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setTemplate(DEFAULT_TEMPLATE);
    setMappings(DEFAULT_MAPPINGS);
    localStorage.removeItem(STORAGE_KEY);
  };

  // ── Mapping CRUD ──────────────────────────────────────────────────────────
  const addMapping = () => {
    setMappings(prev => [
      ...prev,
      { id: Date.now().toString(), placeholder: "{{new_field}}", zohoField: "Full_Name", staticValue: "" },
    ]);
  };

  const removeMapping = (id: string) => setMappings(prev => prev.filter(m => m.id !== id));

  const updateMapping = (id: string, field: Partial<FieldMapping>) =>
    setMappings(prev => prev.map(m => m.id === id ? { ...m, ...field } : m));

  // ── Print ─────────────────────────────────────────────────────────────────
  const handlePrint = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Contract — ${selectedLead?.Full_Name ?? "Preview"}</title>
        <style>
          body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.7;
                 margin: 2.5cm 3cm; color: #000; white-space: pre-wrap; word-wrap: break-word; }
          @page { margin: 2.5cm 3cm; }
        </style>
      </head>
      <body>${preview.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
  };

  // ── Copy to clipboard ─────────────────────────────────────────────────────
  const handleCopy = async () => {
    await navigator.clipboard.writeText(preview);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Auto-add mapping when a new placeholder is detected in the template
  useEffect(() => {
    const newOnes = detected.filter(p => !mappedSet.has(p));
    if (newOnes.length === 0) return;
    setMappings(prev => [
      ...prev,
      ...newOnes.map(p => ({
        id:          Date.now().toString() + p,
        placeholder: p,
        zohoField:   "Full_Name",
        staticValue: "",
      })),
    ]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detected.join(",")]);

  return (
    <DashboardLayout title="Contract Builder" subtitle="Map Zoho fields to contract placeholders and auto-fill for any doctor">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

        {/* ── LEFT: Template + Mappings ────────────────────────────────── */}
        <div className="space-y-4">

          {/* Template editor */}
          <Card className="shadow-sm border-border/50">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
                  Contract Template
                </CardTitle>
                <div className="flex gap-1.5">
                  <Button variant="ghost" size="sm" onClick={handleReset} className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1">
                    <RotateCcw className="h-3 w-3" /> Reset
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleSave} className="h-7 px-2 text-[11px] gap-1 text-primary">
                    {saved ? <><Check className="h-3 w-3" /> Saved</> : <><Save className="h-3 w-3" /> Save</>}
                  </Button>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Use <code className="bg-muted px-1 rounded text-[9px]">{"{{placeholder}}"}</code> syntax — any new placeholder is auto-added to the mapping table below.
              </p>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <textarea
                value={template}
                onChange={e => setTemplate(e.target.value)}
                className="w-full h-64 text-[11px] font-mono bg-muted/30 border border-border/40 rounded-lg p-3 resize-y focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed"
                spellCheck={false}
              />
              {unmapped.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="text-[10px] text-warning font-medium">Unmapped:</span>
                  {unmapped.map(p => (
                    <span key={p} className="text-[10px] bg-warning/10 text-warning px-1.5 py-0.5 rounded font-mono">{p}</span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Field mappings */}
          <Card className="shadow-sm border-border/50">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
                  Field Mapping
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={addMapping} className="h-7 px-2 text-[11px] gap-1 text-primary">
                  <Plus className="h-3 w-3" /> Add row
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-2">
                {/* Header */}
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2 px-1">
                  <span className="text-[9px] uppercase tracking-wide text-muted-foreground font-medium">Placeholder</span>
                  <span className="text-[9px] uppercase tracking-wide text-muted-foreground font-medium">Maps to</span>
                  <span className="w-6" />
                </div>

                {mappings.map(m => (
                  <div key={m.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                    {/* Placeholder input */}
                    <input
                      value={m.placeholder}
                      onChange={e => updateMapping(m.id, { placeholder: e.target.value })}
                      className="h-7 text-[11px] font-mono bg-muted/40 border border-border/40 rounded px-2 focus:outline-none focus:ring-1 focus:ring-primary w-full"
                      placeholder="{{field}}"
                    />

                    {/* Zoho field select */}
                    {m.zohoField === "_static" ? (
                      <input
                        value={m.staticValue}
                        onChange={e => updateMapping(m.id, { staticValue: e.target.value })}
                        className="h-7 text-[11px] bg-muted/40 border border-border/40 rounded px-2 focus:outline-none focus:ring-1 focus:ring-primary w-full"
                        placeholder="Static text..."
                      />
                    ) : (
                      <select
                        value={m.zohoField}
                        onChange={e => updateMapping(m.id, { zohoField: e.target.value })}
                        className="h-7 text-[11px] bg-muted/40 border border-border/40 rounded px-2 focus:outline-none focus:ring-1 focus:ring-primary w-full"
                      >
                        {ZOHO_FIELD_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                        <option value="_static">— Static value —</option>
                      </select>
                    )}

                    {/* Remove */}
                    <button
                      onClick={() => removeMapping(m.id)}
                      className="h-6 w-6 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors rounded"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}

                {mappings.length === 0 && (
                  <p className="text-[11px] text-muted-foreground text-center py-4">No mappings — click "Add row" to start</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── RIGHT: Doctor selector + Preview ────────────────────────────── */}
        <div className="space-y-4">

          {/* Doctor search */}
          <Card className="shadow-sm border-border/50">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
                Select Doctor
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <Popover
                open={showDropdown && doctorOptions.length > 0}
                onOpenChange={open => { if (!open) setShowDropdown(false); }}
              >
                <PopoverTrigger asChild>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                      value={search}
                      onChange={e => { setSearch(e.target.value); setShowDropdown(true); }}
                      onFocus={() => setShowDropdown(true)}
                      placeholder="Search doctor by name…"
                      className="pl-8 h-8 text-[12px]"
                    />
                  </div>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  sideOffset={4}
                  className="p-0 w-[var(--radix-popover-trigger-width)] max-h-60 overflow-y-auto"
                  onOpenAutoFocus={e => e.preventDefault()}
                >
                    {doctorOptions.map(lead => {
                      const name = lead.Full_Name || `${lead.First_Name ?? ""} ${lead.Last_Name ?? ""}`.trim() || "—";
                      return (
                        <button
                          key={lead.id}
                          className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors border-b border-border/30 last:border-0"
                          onMouseDown={() => {
                            setSelectedLead(lead);
                            setSearch(name);
                            setShowDropdown(false);
                          }}
                        >
                          <p className="text-[12px] font-medium">{name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {lead.Specialty ?? lead.Specialty_New ?? "—"} · {lead.Lead_Status ?? "—"}
                          </p>
                        </button>
                      );
                    })}
                </PopoverContent>
              </Popover>

              {/* Selected doctor summary */}
              {selectedLead && (
                <div className="mt-3 p-3 rounded-lg bg-primary/5 border border-primary/20 text-[11px] space-y-0.5">
                  <p className="font-semibold text-foreground">
                    {selectedLead.Full_Name || `${selectedLead.First_Name ?? ""} ${selectedLead.Last_Name ?? ""}`.trim()}
                  </p>
                  <p className="text-muted-foreground">{selectedLead.Specialty ?? selectedLead.Specialty_New ?? "—"} · {selectedLead.Lead_Status}</p>
                  <p className="text-muted-foreground">{selectedLead.Country_of_Specialty_training ?? "—"}</p>
                  {(selectedLead.Has_DHA && selectedLead.Has_DHA !== "No") && <span className="inline-block bg-success/10 text-success text-[9px] font-medium rounded px-1.5 py-0.5 mr-1">DHA</span>}
                  {(selectedLead.Has_DOH && selectedLead.Has_DOH !== "No") && <span className="inline-block bg-success/10 text-success text-[9px] font-medium rounded px-1.5 py-0.5 mr-1">DOH</span>}
                  {(selectedLead.Has_MOH && selectedLead.Has_MOH !== "No") && <span className="inline-block bg-success/10 text-success text-[9px] font-medium rounded px-1.5 py-0.5">MOH</span>}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Preview */}
          <Card className="shadow-sm border-border/50">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5" />
                  {selectedLead
                    ? `Contract — ${selectedLead.Full_Name || `${selectedLead.First_Name ?? ""} ${selectedLead.Last_Name ?? ""}`.trim()}`
                    : "Preview (select a doctor)"}
                </CardTitle>
                <div className="flex gap-1.5">
                  <Button
                    variant="ghost" size="sm"
                    onClick={handleCopy}
                    disabled={!selectedLead}
                    className="h-7 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                  >
                    {copied ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
                  </Button>
                  <Button
                    variant="ghost" size="sm"
                    onClick={handlePrint}
                    disabled={!selectedLead}
                    className="h-7 px-2 text-[11px] gap-1 text-primary"
                  >
                    <Printer className="h-3 w-3" /> Print
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div
                ref={previewRef}
                className={`rounded-lg border border-border/30 p-5 bg-white min-h-[400px] ${!selectedLead ? "opacity-40" : ""}`}
              >
                <pre
                  className="text-[11.5px] font-mono leading-relaxed whitespace-pre-wrap text-gray-800 break-words"
                  style={{ fontFamily: "'Times New Roman', Georgia, serif", fontSize: "11.5px" }}
                >
                  {preview}
                </pre>
              </div>
              {!selectedLead && (
                <p className="text-center text-[11px] text-muted-foreground mt-3">
                  Search for a doctor above to see the filled contract
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Contracts;
