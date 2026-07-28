import { useState } from "react";
import { Camera, Image as ImageIcon, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { captureAndUploadCard } from "@/lib/card-screenshot";
import { CvStudioDialog } from "@/components/cv/CvStudioDialog";
import { type EmailAttachment } from "@/lib/email-attachments";
import { type WpCandidate } from "@/hooks/use-wp-candidates";

/**
 * Shared profile-card + branded-CV controls for any send preview.
 *
 * Extracted out of SendProfileDialog so the batch preview (and any future send
 * surface) get the SAME card-capture and CV-attach controls — a core part of the
 * "every preview shows the same thing" parity goal. No behaviour change from the
 * original in-dialog versions.
 */

/**
 * "Use profile card image" — rasterises the candidate profile card (the
 * View-full-profile look, empty fields dropped) to a flat PNG via html2canvas,
 * uploads it to the public email-card-images bucket, and reports the URL up so
 * the hospital email renders that image ABOVE the data table (both are shown)
 * ({{#doctor_card_image_url}} section). Once captured, shows a thumbnail with
 * Re-capture / Undo. No auto-download (the Save-As dialog was unwanted).
 */
export function CardScreenshotControl({
  cardHtml, cardImageUrl, onSetCardImage, autoBusy = false, captureWidth,
}: {
  cardHtml: string;
  cardImageUrl: string | null;
  onSetCardImage: (url: string | null) => void;
  /** The parent is auto-attaching the card (single-doctor sends) — show a
   *  quiet "attaching…" state instead of the manual button. */
  autoBusy?: boolean;
  /** Capture width — the 3:2 profile card is wider than the legacy card. */
  captureWidth?: number;
}) {
  const [busy, setBusy] = useState(false);
  const capture = async () => {
    setBusy(true);
    try {
      const url = await captureAndUploadCard(cardHtml, { width: captureWidth });
      onSetCardImage(url);
      toast.success("Profile card attached — it'll appear above the data table in the email.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't build the profile image. Try again.");
    } finally {
      setBusy(false);
    }
  };

  // Auto-attaching (single-doctor send) — quiet status, no button to press.
  if (autoBusy && !cardImageUrl) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-md border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-[11px] font-medium text-teal-700">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        <span>Attaching the profile card image…</span>
      </div>
    );
  }

  if (cardImageUrl) {
    return (
      // Left-aligned + width-capped so it never stretches to the full dialog
      // (where the right edge could be clipped by overflow-x-hidden). min-w-0
      // children truncate instead of pushing the row wide.
      <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 max-w-[520px] min-w-0">
        <img
          src={cardImageUrl}
          alt="Doctor card screenshot"
          className="h-9 w-16 shrink-0 rounded border border-emerald-200 object-cover object-top"
        />
        <div className="min-w-0 flex-1 text-[11px] leading-tight">
          <div className="flex items-center gap-1 font-medium text-emerald-800">
            <ImageIcon className="h-3 w-3 shrink-0" /> <span className="truncate">Profile card shown above the table</span>
          </div>
          <div className="truncate text-emerald-700/80">Clean card, empty fields dropped · pixel-perfect in any client.</div>
        </div>
        <button type="button" onClick={capture} disabled={busy} className="shrink-0 text-[10px] font-medium text-emerald-700 hover:underline disabled:opacity-50">
          {busy ? "…" : "Re-capture"}
        </button>
        <button type="button" onClick={() => { onSetCardImage(null); toast.message("Reverted — the card will send as HTML."); }} className="shrink-0 text-[10px] text-slate-500 hover:underline">
          Undo
        </button>
      </div>
    );
  }

  return (
    // Auto-width, left-aligned button (NOT w-full): a full-width bar's centered
    // label ran off into the dialog's clipped right edge. inline-flex keeps it
    // compact and tidy under the "Hospital intro email" label.
    <button
      type="button"
      onClick={capture}
      disabled={busy}
      className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-[11px] font-medium text-teal-700 transition-colors hover:bg-teal-100 disabled:opacity-60"
      title="Render the candidate profile card as a clean image (empty fields dropped) and show it above the data table"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <Camera className="h-3.5 w-3.5 shrink-0" />}
      <span className="truncate">{busy ? "Building image…" : "Use profile card as image"}</span>
    </button>
  );
}

/**
 * "Generate branded CV" — build the doctor's Allocation-Assist-branded CV from
 * their CV on file (form-response upload), view + edit it, and attach the PDF to
 * this email. Falls back to manual upload inside the dialog when there's no CV
 * on file. Reuses the same studio as the Doctors → Convert CV tab.
 */
export function CvStudioControl({ doctor, onAttach }: { doctor: WpCandidate | null; onAttach: (att: EmailAttachment) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-[11px] font-medium text-teal-700 transition-colors hover:bg-teal-100"
        title="Build the doctor's branded CV from their CV on file, edit it, and attach it to this email"
      >
        <FileText className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Generate &amp; attach branded CV</span>
      </button>
      <CvStudioDialog
        open={open}
        onOpenChange={setOpen}
        doctor={doctor}
        cvSourceUrl={doctor?.cv_url}
        onAttach={onAttach}
      />
    </>
  );
}
