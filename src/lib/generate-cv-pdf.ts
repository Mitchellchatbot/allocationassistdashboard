// Render a doctor's branded CV HTML to a PDF File via html2pdf.js (html2canvas +
// jsPDF). html2pdf is lazily imported so the heavy lib only loads when the team
// actually generates a CV. The CV HTML is injected into an off-screen holder
// (fixed width) so the capture is deterministic regardless of the page layout.
import type { WpCandidate } from "@/hooks/use-wp-candidates";
import { buildDoctorCvHtml, cvFileName } from "@/lib/doctor-cv-template";

export async function generateCvPdfFile(candidate: WpCandidate): Promise<File> {
  const holder = document.createElement("div");
  holder.style.cssText =
    "position:fixed;left:-99999px;top:0;width:760px;background:#ffffff;padding:0;margin:0;" +
    "font-family:'Poppins','Helvetica Neue',Helvetica,Arial,sans-serif;";
  holder.innerHTML = buildDoctorCvHtml(candidate);
  document.body.appendChild(holder);
  try {
    // Web-fonts must be ready so glyph metrics are final before rasterising.
    if (document.fonts?.ready) { try { await document.fonts.ready; } catch { /* non-fatal */ } }
    const html2pdf = (await import("html2pdf.js")).default;
    const filename = cvFileName(candidate);
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
    const blob: Blob = pdf.output("blob");
    return new File([blob], filename, { type: "application/pdf" });
  } finally {
    document.body.removeChild(holder);
  }
}
