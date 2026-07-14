// Render a doctor's branded CV HTML to a PDF File via html2pdf.js (html2canvas +
// jsPDF). html2pdf is lazily imported so the heavy lib only loads when the team
// actually generates a CV. The CV HTML is injected into an off-screen holder
// (fixed width) so the capture is deterministic regardless of the page layout.
import type { WpCandidate } from "@/hooks/use-wp-candidates";
import { buildDoctorCvHtml, cvFileName } from "@/lib/doctor-cv-template";

/** Render an arbitrary self-contained HTML string (a `<style>` + markup) into a
 *  multi-page A4 PDF File. The HTML is injected into a fixed-width off-screen
 *  holder so the capture is deterministic. Fonts it relies on must be loaded in
 *  the document (e.g. via index.html) before calling. */
export async function htmlToPdfFile(html: string, filename: string, holderWidth = 760): Promise<File> {
  const holder = document.createElement("div");
  holder.style.cssText =
    `position:fixed;left:-99999px;top:0;width:${holderWidth}px;background:#ffffff;padding:0;margin:0;`;
  holder.innerHTML = html;
  document.body.appendChild(holder);
  try {
    if (document.fonts?.ready) { try { await document.fonts.ready; } catch { /* non-fatal */ } }
    const html2pdf = (await import("html2pdf.js")).default;
    const opts = {
      margin:      [14, 14, 16, 14],
      filename,
      image:       { type: "jpeg", quality: 0.92 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
      jsPDF:       { unit: "mm", format: "a4", orientation: "portrait" as const, compress: true },
      pagebreak:   { mode: ["css", "legacy"] as ("avoid-all" | "css" | "legacy")[] },
    };
    const worker = html2pdf().from(holder).set(opts).toPdf();
    const pdf = await worker.get("pdf");
    return new File([pdf.output("blob") as Blob], filename, { type: "application/pdf" });
  } finally {
    document.body.removeChild(holder);
  }
}

export async function generateCvPdfFile(candidate: WpCandidate): Promise<File> {
  return htmlToPdfFile(buildDoctorCvHtml(candidate), cvFileName(candidate), 760);
}
