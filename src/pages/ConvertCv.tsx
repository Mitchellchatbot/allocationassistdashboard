import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { FileUp, Image as ImageIcon, Wand2, Download, Loader2, FileText, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { uploadEmailAttachment } from "@/lib/email-attachments";
import { downloadBlob } from "@/lib/card-screenshot";
import { htmlToPdfFile } from "@/lib/generate-cv-pdf";
import { buildAaCvHtml, type AaCvData } from "@/lib/aa-cv-template";

/**
 * Convert CV — take any incoming doctor CV (PDF / .docx / pasted text) and
 * reformat it into Allocation Assist's branded house template, then download the
 * PDF. The cv-reformat edge function parses the CV with Claude into AaCvData;
 * buildAaCvHtml renders it; html2pdf produces the PDF. (Old CVs stay as-is —
 * this only makes NEW branded ones.)
 */
const GARAMOND_LINK =
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600;1,700&display=swap">';

export default function ConvertCv() {
  const [cvFile, setCvFile]   = useState<File | null>(null);
  const [photo, setPhoto]     = useState<File | null>(null);
  const [text, setText]       = useState("");
  const [busy, setBusy]       = useState<"" | "convert" | "download">("");
  const [data, setData]       = useState<AaCvData | null>(null);
  const cvInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  const previewDoc = useMemo(
    () => data ? `<!doctype html><html><head><meta charset="utf-8">${GARAMOND_LINK}</head><body style="margin:0;background:#fff;padding:20px;">${buildAaCvHtml(data)}</body></html>` : "",
    [data],
  );

  const convert = async () => {
    if (!cvFile && !text.trim()) { toast.error("Upload a CV file or paste the CV text first."); return; }
    setBusy("convert");
    try {
      let cv_url: string | undefined, photo_url: string | undefined;
      if (cvFile) cv_url = (await uploadEmailAttachment(cvFile)).path;
      if (photo)  photo_url = (await uploadEmailAttachment(photo)).path;
      const { data: resp, error } = await supabase.functions.invoke("cv-reformat", {
        body: { cv_url, text: text.trim() || undefined, photo_url },
      });
      if (error) throw error;
      const r = resp as { ok?: boolean; data?: AaCvData; error?: string };
      if (!r?.ok || !r.data) throw new Error(r?.error ?? "Conversion failed");
      setData({ ...r.data, photo_url: photo_url ?? r.data.photo_url });
      toast.success("CV converted — review the preview, then download.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't convert the CV.");
    } finally { setBusy(""); }
  };

  const download = async () => {
    if (!data) return;
    setBusy("download");
    try {
      const name = (data.name || "Doctor").replace(/[^a-zA-Z0-9 ._-]/g, "").trim();
      const file = await htmlToPdfFile(buildAaCvHtml(data), `Dr ${name} - CV.pdf`, 780);
      downloadBlob(file, file.name);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't build the PDF.");
    } finally { setBusy(""); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 items-start">
      {/* Controls */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
        <div>
          <h2 className="text-[14px] font-semibold text-slate-800">Convert a CV</h2>
          <p className="text-[11.5px] text-muted-foreground mt-0.5">Upload any doctor's CV (PDF or Word) or paste its text — it's reformatted into the Allocation Assist branded template.</p>
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
        </div>

        <Button onClick={convert} disabled={!!busy} className="w-full h-9 text-[12.5px] gap-1.5">
          {busy === "convert" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          {busy === "convert" ? "Converting…" : "Convert CV"}
        </Button>
        {data && (
          <Button onClick={download} variant="outline" disabled={!!busy} className="w-full h-9 text-[12.5px] gap-1.5">
            {busy === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download PDF
          </Button>
        )}
      </div>

      {/* Preview */}
      <div className="rounded-xl border border-slate-200 bg-slate-100 overflow-hidden min-h-[70vh]">
        {data ? (
          <iframe title="CV preview" sandbox="allow-same-origin" srcDoc={previewDoc} className="w-full h-[80vh] border-0 bg-white" />
        ) : (
          <div className="h-[70vh] flex flex-col items-center justify-center text-center p-10 text-muted-foreground">
            <FileText className="h-9 w-9 mb-2 text-slate-300" />
            <p className="text-[13px] max-w-xs">Upload a CV and hit <span className="font-medium text-slate-600">Convert CV</span> — the branded version previews here, then download it as a PDF.</p>
          </div>
        )}
      </div>
    </div>
  );
}
