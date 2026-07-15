import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { FileUp, Image as ImageIcon, Wand2, Download, Loader2, FileText, X, Link2, RotateCcw, Pencil, Paperclip } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { uploadEmailAttachment, type EmailAttachment } from "@/lib/email-attachments";
import { downloadBlob } from "@/lib/card-screenshot";
import { htmlToPdfFile } from "@/lib/generate-cv-pdf";
import { buildAaCvHtml, type AaCvData } from "@/lib/aa-cv-template";
import { EditableCvSurface, type EditableCvHandle } from "@/components/cv/EditableCvSurface";
import { useUploadWpCv, type WpCandidate } from "@/hooks/use-wp-candidates";
import { mergeDoctorData, drOff, cvSafeName } from "@/lib/aa-cv-data";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The doctor — supplies photo, gap-fill data, and the link target. */
  doctor?: WpCandidate | null;
  /** The CV on file (their form-response / WP CV) — auto-converted on open. */
  cvSourceUrl?: string | null;
  /** Provided by the send flow — attach the built PDF to the outgoing email. */
  onAttach?: (att: EmailAttachment) => void;
  title?: string;
}

/**
 * CvStudioDialog — generate a doctor's Allocation-Assist-branded CV from the CV
 * on file (their form-response upload), preview + EDIT it inline, then download,
 * attach it to the email being sent, or link it to their profile. Falls back to
 * manual upload / paste when there's no CV on file or the auto-fetch fails.
 *
 * Shares the render + backfill logic with the Convert CV tab via aa-cv-data +
 * EditableCvSurface, so both behave identically.
 */
export function CvStudioDialog({ open, onOpenChange, doctor, cvSourceUrl, onAttach, title = "Generate branded CV" }: Props) {
  const uploadCv = useUploadWpCv();
  const [data, setData]   = useState<AaCvData | null>(null);
  const [busy, setBusy]   = useState<"" | "convert" | "download" | "attach" | "link">("");
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [photo, setPhoto]   = useState<File | null>(null);
  const [text, setText]     = useState("");

  const surfaceRef = useRef<EditableCvHandle>(null);
  const cvInput    = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const autoTried  = useRef<string | null>(null);

  const runConvert = useCallback(async (fromSource: boolean) => {
    const useSource = fromSource && !!cvSourceUrl;
    if (!useSource && !cvFile && !text.trim()) { toast.error("Upload a CV file or paste its text first."); return; }
    setBusy("convert");
    try {
      let cv_url: string | undefined, photoUrl: string | undefined;
      if (photo) photoUrl = (await uploadEmailAttachment(photo)).path;
      if (useSource) cv_url = cvSourceUrl!;
      else if (cvFile) cv_url = (await uploadEmailAttachment(cvFile)).path;
      const { data: resp, error } = await supabase.functions.invoke("cv-reformat", {
        body: { cv_url, text: !useSource && text.trim() ? text.trim() : undefined, photo_url: photoUrl },
      });
      if (error) throw error;
      const r = resp as { ok?: boolean; data?: AaCvData; error?: string };
      if (!r?.ok || !r.data) throw new Error(r?.error ?? "Conversion failed");
      setData(mergeDoctorData(r.data, doctor, photoUrl ?? doctor?.photo_url ?? undefined));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't convert the CV — try uploading the file manually.");
    } finally { setBusy(""); }
  }, [cvSourceUrl, cvFile, text, photo, doctor]);

  // Auto-convert the CV on file the first time the dialog opens for this source.
  useEffect(() => {
    if (open && cvSourceUrl && !data && autoTried.current !== cvSourceUrl) {
      autoTried.current = cvSourceUrl;
      void runConvert(true);
    }
  }, [open, cvSourceUrl, data, runConvert]);

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

  const attach = async () => {
    if (!data || !onAttach) return;
    setBusy("attach");
    try {
      const att = await uploadEmailAttachment(await buildPdf());
      onAttach(att);
      toast.success("Branded CV attached to the email.");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't attach the CV.");
    } finally { setBusy(""); }
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

  const anyBusy = !!busy;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!anyBusy) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[1000px] max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <Wand2 className="h-4 w-4 text-teal-600" /> {title}
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            Built from {doctor ? <span className="font-medium text-slate-700">Dr. {drOff(doctor.full_name)}</span> : "the doctor"}'s CV on file, reformatted into the Allocation Assist template. Edit it inline, then attach it to the email.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-3 min-h-0 flex-1">
          {/* Controls */}
          <div className="space-y-3 overflow-y-auto pr-1">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[11px] text-slate-600">
              {cvSourceUrl
                ? <>Auto-converting the CV on file. No CV on file, or need a different one? Upload it below.</>
                : <>No CV on file for this doctor — upload their CV (PDF/Word) or paste its text.</>}
            </div>

            {/* Manual CV override */}
            <div className="space-y-1.5">
              <div className="text-[10.5px] font-medium text-slate-500 uppercase tracking-wide">CV file</div>
              <input ref={cvInput} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={e => setCvFile(e.target.files?.[0] ?? null)} />
              {cvFile ? (
                <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[12px]">
                  <FileText className="h-3.5 w-3.5 text-teal-600 shrink-0" />
                  <span className="truncate flex-1">{cvFile.name}</span>
                  <button onClick={() => setCvFile(null)} className="text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => cvInput.current?.click()} className="w-full h-8 text-[12px] gap-1.5">
                  <FileUp className="h-3.5 w-3.5" /> Upload a CV
                </Button>
              )}
              <Textarea value={text} onChange={e => setText(e.target.value)} rows={3} placeholder="…or paste the CV text" className="text-[12px]" />
            </div>

            {/* Photo override */}
            <div className="space-y-1.5">
              <div className="text-[10.5px] font-medium text-slate-500 uppercase tracking-wide">Photo</div>
              <input ref={photoInput} type="file" accept=".png,.jpg,.jpeg" className="hidden" onChange={e => setPhoto(e.target.files?.[0] ?? null)} />
              {photo ? (
                <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[12px]">
                  <ImageIcon className="h-3.5 w-3.5 text-teal-600 shrink-0" />
                  <span className="truncate flex-1">{photo.name}</span>
                  <button onClick={() => setPhoto(null)} className="text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => photoInput.current?.click()} className="w-full h-8 text-[12px] gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5" /> {doctor?.photo_url ? "Override doctor photo" : "Add headshot"}
                </Button>
              )}
            </div>

            <Button onClick={() => runConvert(false)} disabled={anyBusy} className="w-full h-8 text-[12px] gap-1.5">
              {busy === "convert" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              {data ? "Re-convert" : "Convert"}
            </Button>

            {/* Actions */}
            {data && (
              <div className="space-y-2 border-t border-slate-200 pt-3">
                {onAttach && (
                  <Button onClick={attach} disabled={anyBusy} className="w-full h-8 text-[12px] gap-1.5">
                    {busy === "attach" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                    Attach to email
                  </Button>
                )}
                <Button onClick={download} variant="outline" disabled={anyBusy} className="w-full h-8 text-[12px] gap-1.5">
                  {busy === "download" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  Download PDF
                </Button>
                {doctor && (
                  <Button onClick={link} variant="outline" disabled={anyBusy} className="w-full h-8 text-[12px] gap-1.5">
                    {busy === "link" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                    Link to profile
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Editable preview */}
          <div className="rounded-lg border border-slate-200 bg-slate-100 overflow-hidden min-h-0 flex flex-col">
            {data ? (
              <>
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-200 bg-white/70 shrink-0">
                  <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><Pencil className="h-3 w-3" /> Click any text to edit it</span>
                  <Button variant="ghost" size="sm" onClick={() => surfaceRef.current?.reset()} className="h-6 text-[11px] gap-1 text-slate-500">
                    <RotateCcw className="h-3 w-3" /> Reset edits
                  </Button>
                </div>
                <div className="overflow-auto p-4 flex-1">
                  <div className="mx-auto bg-white shadow-sm" style={{ width: 760 }}>
                    <EditableCvSurface ref={surfaceRef} data={data} />
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-10 text-muted-foreground">
                {busy === "convert" ? (
                  <><Loader2 className="h-7 w-7 mb-2 animate-spin text-teal-600" /><p className="text-[13px]">Building the branded CV…</p></>
                ) : (
                  <><FileText className="h-8 w-8 mb-2 text-slate-300" /><p className="text-[13px] max-w-xs">The branded CV will preview here — editable — then attach it to the email.</p></>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
