import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { FileUp, Image as ImageIcon, Wand2, Download, Loader2, FileText, X, Search, Link2, RotateCcw, Pencil } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { uploadEmailAttachment } from "@/lib/email-attachments";
import { downloadBlob } from "@/lib/card-screenshot";
import { htmlToPdfFile } from "@/lib/generate-cv-pdf";
import { buildAaCvHtml, type AaCvData } from "@/lib/aa-cv-template";
import { useWpCandidates, useUploadWpCv, type WpCandidate } from "@/hooks/use-wp-candidates";

/**
 * Convert CV — take any incoming doctor CV (PDF / .docx / pasted text) and
 * reformat it into Allocation Assist's branded house template.
 *
 * Beyond the raw reformat:
 *   - Pick the doctor (from the WordPress roster) to auto-pull their headshot
 *     and become the "link" target.
 *   - Backfill any field the incoming CV is missing (title, email, phone, DOB,
 *     nationality, languages, photo) from the doctor's canonical record — the
 *     CV's own content always wins; we only fill the gaps.
 *   - The rendered CV is directly editable (contentEditable) — the team can
 *     tweak wording before download/link. "Reset edits" restores the generated
 *     version.
 *   - "Link CV to doctor" uploads the PDF to their WP cv_resume (useUploadWpCv),
 *     so "View Resume" points at the branded doc.
 *
 * cv-reformat parses the CV with Claude into AaCvData; buildAaCvHtml renders it;
 * html2pdf produces the PDF. (Old CVs stay as-is — this only makes NEW ones.)
 */
const drOff = (s: string | null | undefined) => (s ?? "").replace(/^\s*dr\.?\s+/i, "").trim();

const initials = (n?: string | null) =>
  drOff(n).split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join("") || "Dr";

function fmtDob(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(/T/.test(iso) ? iso : `${iso}T00:00:00`);
  return isNaN(d.valueOf()) ? iso : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/** Fill any EMPTY AaCvData field from the doctor's canonical record. The CV's
 *  own content always wins; this only backfills gaps ("data points from other
 *  sources"). An explicit headshot upload (photoOverride) beats the doctor photo. */
function mergeDoctorData(cv: AaCvData, c: WpCandidate | null, photoOverride?: string): AaCvData {
  const personal: Record<string, string> = { ...(cv.personal ?? {}) };
  if (c) {
    const put = (k: string, val: string | null | undefined) => {
      const t = (val ?? "").trim();
      if (t && !(personal[k] ?? "").trim()) personal[k] = t;
    };
    put("Name", drOff(c.full_name));
    put("Date of Birth", fmtDob(c.date_of_birth));
    put("Nationality", c.nationality);
    put("Languages Spoken", c.languages);
    put("Current Location", c.current_location);
  }
  return {
    ...cv,
    name:      (cv.name ?? "").trim() || drOff(c?.full_name),
    title:     (cv.title ?? "").trim() || c?.job_title || c?.specialty || "",
    email:     (cv.email ?? "").trim() || c?.email || undefined,
    phone:     (cv.phone ?? "").trim() || c?.phone || undefined,
    photo_url: photoOverride || cv.photo_url || c?.photo_url || undefined,
    personal:  Object.keys(personal).length ? personal : cv.personal,
  };
}

export default function ConvertCv() {
  const { data: candidates = [] } = useWpCandidates();
  const uploadCv = useUploadWpCv();

  const [doctor, setDoctor]       = useState<WpCandidate | null>(null);
  const [docQuery, setDocQuery]   = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const [cvFile, setCvFile] = useState<File | null>(null);
  const [photo, setPhoto]   = useState<File | null>(null);
  const [text, setText]     = useState("");
  const [busy, setBusy]     = useState<"" | "convert" | "download" | "link">("");
  const [data, setData]     = useState<AaCvData | null>(null);
  const [ver, setVer]       = useState(0); // bumps to remount (reset) the editable DOM

  const cvInput    = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  /** Replace the CV data and reset the editable surface to the fresh render. */
  const setCv = (d: AaCvData) => { setData(d); setVer(v => v + 1); };

  const docMatches = useMemo(() => {
    const q = docQuery.trim().toLowerCase();
    const base = candidates.filter(c => c.full_name || c.title);
    if (!q) return base.slice(0, 8);
    return base
      .filter(c =>
        (c.full_name ?? "").toLowerCase().includes(q) ||
        (c.specialty ?? "").toLowerCase().includes(q) ||
        (c.job_title ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q))
      .slice(0, 12);
  }, [candidates, docQuery]);

  // Split the generated HTML so the <style> stays OUT of the editable region
  // (users can't accidentally delete it) while the visible CV is editable.
  const [styleBlock, bodyBlock] = useMemo(() => {
    if (!data) return ["", ""];
    const html = buildAaCvHtml(data);
    const i = html.indexOf("</style>");
    return i >= 0 ? [html.slice(0, i + 8), html.slice(i + 8)] : ["", html];
  }, [data]);

  /** The CV HTML as it stands now — the user's inline edits if present. */
  const currentHtml = () => styleBlock + (previewRef.current?.innerHTML || bodyBlock);

  const pick = (c: WpCandidate) => {
    setDoctor(c);
    setDocQuery("");
    setPickerOpen(false);
    // Already converted? Re-backfill so their photo + details appear now.
    if (data) setCv(mergeDoctorData(data, c, photo ? data.photo_url ?? undefined : c.photo_url ?? undefined));
  };

  const convert = async () => {
    if (!cvFile && !text.trim()) { toast.error("Upload a CV file or paste the CV text first."); return; }
    setBusy("convert");
    try {
      let cv_url: string | undefined, photoUrl: string | undefined;
      if (cvFile) cv_url  = (await uploadEmailAttachment(cvFile)).path;
      if (photo)  photoUrl = (await uploadEmailAttachment(photo)).path;
      const { data: resp, error } = await supabase.functions.invoke("cv-reformat", {
        body: { cv_url, text: text.trim() || undefined, photo_url: photoUrl },
      });
      if (error) throw error;
      const r = resp as { ok?: boolean; data?: AaCvData; error?: string };
      if (!r?.ok || !r.data) throw new Error(r?.error ?? "Conversion failed");
      setCv(mergeDoctorData(r.data, doctor, photoUrl ?? doctor?.photo_url ?? undefined));
      toast.success("CV converted — edit inline, then download or link it to the doctor.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't convert the CV.");
    } finally { setBusy(""); }
  };

  const buildPdf = async () => {
    const safe = (drOff(data?.name) || drOff(doctor?.full_name) || "Doctor").replace(/[^a-zA-Z0-9 ._-]/g, "").trim();
    return htmlToPdfFile(currentHtml(), `Dr ${safe} - CV.pdf`, 780);
  };

  const download = async () => {
    if (!data) return;
    setBusy("download");
    try { const f = await buildPdf(); downloadBlob(f, f.name); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't build the PDF."); }
    finally { setBusy(""); }
  };

  const link = async () => {
    if (!data || !doctor) return;
    setBusy("link");
    try {
      const f = await buildPdf();
      await uploadCv.mutateAsync({ file: f, candidateId: doctor.id });
      toast.success(`CV linked to ${drOff(doctor.full_name) || "the doctor"}'s profile.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't link the CV to the doctor.");
    } finally { setBusy(""); }
  };

  const firstName = drOff(doctor?.full_name).split(/\s+/)[0];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 items-start">
      {/* Controls */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
        <div>
          <h2 className="text-[14px] font-semibold text-slate-800">Convert a CV</h2>
          <p className="text-[11.5px] text-muted-foreground mt-0.5">Upload any doctor's CV (PDF or Word) or paste its text — it's reformatted into the Allocation Assist branded template.</p>
        </div>

        {/* Doctor selector */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Doctor</div>
          {doctor ? (
            <div className="flex items-center gap-2 rounded-md border border-teal-200 bg-teal-50/50 px-2.5 py-1.5">
              {doctor.photo_url
                ? <img src={doctor.photo_url} alt="" className="h-7 w-7 rounded-full object-cover shrink-0" />
                : <div className="h-7 w-7 rounded-full bg-teal-100 flex items-center justify-center text-[10px] font-semibold text-teal-700 shrink-0">{initials(doctor.full_name)}</div>}
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-medium text-slate-800 truncate">{drOff(doctor.full_name) || doctor.title}</div>
                <div className="text-[10.5px] text-muted-foreground truncate">{[doctor.job_title, doctor.specialty].filter(Boolean).join(" · ") || "—"}</div>
              </div>
              <button onClick={() => setDoctor(null)} className="text-slate-400 hover:text-slate-600 shrink-0" title="Clear"><X className="h-3.5 w-3.5" /></button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={docQuery}
                onChange={e => { setDocQuery(e.target.value); setPickerOpen(true); }}
                onFocus={() => setPickerOpen(true)}
                onBlur={() => setTimeout(() => setPickerOpen(false), 150)}
                placeholder="Search a doctor to pull photo + details…"
                className="pl-8 h-9 text-[12px]"
              />
              {pickerOpen && docMatches.length > 0 && (
                <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-md border bg-white shadow-lg">
                  {docMatches.map(c => (
                    <button
                      key={c.id}
                      onMouseDown={e => e.preventDefault() /* keep focus so onBlur doesn't fire first */}
                      onClick={() => pick(c)}
                      className="w-full text-left px-2.5 py-1.5 hover:bg-slate-50 flex items-center gap-2"
                    >
                      {c.photo_url
                        ? <img src={c.photo_url} alt="" className="h-6 w-6 rounded-full object-cover shrink-0" />
                        : <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center text-[9px] text-slate-500 shrink-0">{initials(c.full_name)}</div>}
                      <span className="min-w-0">
                        <span className="block text-[12px] text-slate-800 truncate">{drOff(c.full_name) || c.title}</span>
                        <span className="block text-[10px] text-muted-foreground truncate">{[c.job_title, c.specialty].filter(Boolean).join(" · ") || "—"}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <p className="text-[10.5px] text-muted-foreground">Optional — links the CV to this doctor and fills any gaps (photo, DOB, nationality…) the CV is missing.</p>
        </div>

        {/* CV file */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">CV file</div>
          <input ref={cvInput} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={e => setCvFile(e.target.files?.[0] ?? null)} />
          {cvFile ? (
            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12px]">
              <FileText className="h-3.5 w-3.5 text-teal-600 shrink-0" />
              <span className="truncate flex-1">{cvFile.name}</span>
              <button onClick={() => setCvFile(null)} className="text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => cvInput.current?.click()} className="w-full h-9 text-[12px] gap-1.5">
              <FileUp className="h-3.5 w-3.5" /> Choose PDF / Word CV
            </Button>
          )}
          <div className="text-[10.5px] text-muted-foreground text-center">— or —</div>
          <Textarea value={text} onChange={e => setText(e.target.value)} rows={4} placeholder="…paste the CV text here" className="text-[12px]" />
        </div>

        {/* Photo (optional) */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Photo (optional)</div>
          <input ref={photoInput} type="file" accept=".png,.jpg,.jpeg" className="hidden" onChange={e => setPhoto(e.target.files?.[0] ?? null)} />
          {photo ? (
            <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12px]">
              <ImageIcon className="h-3.5 w-3.5 text-teal-600 shrink-0" />
              <span className="truncate flex-1">{photo.name}</span>
              <button onClick={() => setPhoto(null)} className="text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => photoInput.current?.click()} className="w-full h-9 text-[12px] gap-1.5">
              <ImageIcon className="h-3.5 w-3.5" /> Add headshot
            </Button>
          )}
          <p className="text-[10.5px] text-muted-foreground">{doctor?.photo_url && !photo ? "Using the selected doctor's photo — upload to override." : "Overrides the doctor's photo if set."}</p>
        </div>

        <Button onClick={convert} disabled={!!busy} className="w-full h-9 text-[12.5px] gap-1.5">
          {busy === "convert" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          {busy === "convert" ? "Converting…" : "Convert CV"}
        </Button>
        {data && (
          <div className="space-y-2">
            <Button onClick={download} variant="outline" disabled={!!busy} className="w-full h-9 text-[12.5px] gap-1.5">
              {busy === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download PDF
            </Button>
            <Button onClick={link} variant="outline" disabled={!!busy || !doctor} className="w-full h-9 text-[12.5px] gap-1.5" title={!doctor ? "Select a doctor first" : undefined}>
              {busy === "link" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              {doctor ? `Link CV to ${firstName || "doctor"}` : "Link CV to doctor"}
            </Button>
            {!doctor && <p className="text-[10.5px] text-muted-foreground text-center">Select a doctor above to enable linking.</p>}
          </div>
        )}
      </div>

      {/* Preview (editable) */}
      <div className="rounded-xl border border-slate-200 bg-slate-100 overflow-hidden min-h-[70vh]">
        {data ? (
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-200 bg-white/70">
              <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><Pencil className="h-3 w-3" /> Click any text to edit it</span>
              <Button variant="ghost" size="sm" onClick={() => setVer(v => v + 1)} className="h-7 text-[11px] gap-1 text-slate-500">
                <RotateCcw className="h-3 w-3" /> Reset edits
              </Button>
            </div>
            <div className="overflow-auto p-4">
              {/* styles applied once, kept outside the editable node */}
              <div dangerouslySetInnerHTML={{ __html: styleBlock }} />
              <div className="mx-auto bg-white shadow-sm" style={{ width: 760 }}>
                <div
                  key={ver}
                  ref={previewRef}
                  contentEditable
                  suppressContentEditableWarning
                  className="outline-none"
                  dangerouslySetInnerHTML={{ __html: bodyBlock }}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="h-[70vh] flex flex-col items-center justify-center text-center p-10 text-muted-foreground">
            <FileText className="h-9 w-9 mb-2 text-slate-300" />
            <p className="text-[13px] max-w-xs">Pick a doctor (optional), upload a CV and hit <span className="font-medium text-slate-600">Convert CV</span> — the branded version previews here, editable, then download it or link it to the doctor.</p>
          </div>
        )}
      </div>
    </div>
  );
}
