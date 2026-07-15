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
import { EditableCvSurface, type EditableCvHandle } from "@/components/cv/EditableCvSurface";
import { useWpCandidates, useUploadWpCv, type WpCandidate } from "@/hooks/use-wp-candidates";
import { drOff, cvInitials, mergeDoctorData, cvSafeName } from "@/lib/aa-cv-data";

/**
 * Convert CV — take any incoming doctor CV (PDF / .docx / pasted text) and
 * reformat it into Allocation Assist's branded house template.
 *
 *   - Pick the doctor (WordPress roster) → auto-pull their headshot + link target.
 *   - Backfill gaps (title, email, phone, DOB, nationality, photo) from their
 *     canonical record; the CV's own content always wins.
 *   - The rendered CV is directly editable (EditableCvSurface).
 *   - Download the PDF or link it to the doctor's WP cv_resume.
 *
 * The in-send version of this lives in components/cv/CvStudioDialog — both share
 * aa-cv-data + EditableCvSurface so they behave identically.
 */
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

  const cvInput    = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const surfaceRef = useRef<EditableCvHandle>(null);

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

  const pick = (c: WpCandidate) => {
    setDoctor(c);
    setDocQuery("");
    setPickerOpen(false);
    // Already converted? Re-backfill so their photo + details appear now.
    if (data) setData(mergeDoctorData(data, c, photo ? data.photo_url ?? undefined : c.photo_url ?? undefined));
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
      setData(mergeDoctorData(r.data, doctor, photoUrl ?? doctor?.photo_url ?? undefined));
      toast.success("CV converted — edit inline, then download or link it to the doctor.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't convert the CV.");
    } finally { setBusy(""); }
  };

  const buildPdf = async () => {
    const html = surfaceRef.current?.getHtml() ?? (data ? buildAaCvHtml(data) : "");
    return htmlToPdfFile(html, `Dr ${cvSafeName(data?.name || doctor?.full_name)} - CV.pdf`, 780);
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
      await uploadCv.mutateAsync({ file: await buildPdf(), candidateId: doctor.id });
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
                : <div className="h-7 w-7 rounded-full bg-teal-100 flex items-center justify-center text-[10px] font-semibold text-teal-700 shrink-0">{cvInitials(doctor.full_name)}</div>}
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
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => pick(c)}
                      className="w-full text-left px-2.5 py-1.5 hover:bg-slate-50 flex items-center gap-2"
                    >
                      {c.photo_url
                        ? <img src={c.photo_url} alt="" className="h-6 w-6 rounded-full object-cover shrink-0" />
                        : <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center text-[9px] text-slate-500 shrink-0">{cvInitials(c.full_name)}</div>}
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
              <Button variant="ghost" size="sm" onClick={() => surfaceRef.current?.reset()} className="h-7 text-[11px] gap-1 text-slate-500">
                <RotateCcw className="h-3 w-3" /> Reset edits
              </Button>
            </div>
            <div className="overflow-auto p-4">
              <div className="mx-auto bg-white shadow-sm" style={{ width: 760 }}>
                <EditableCvSurface ref={surfaceRef} data={data} />
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
