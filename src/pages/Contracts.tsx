import { useState, useMemo, useRef } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useZohoData, type ZohoLead } from "@/hooks/use-zoho-data";
import { Printer, Search, FileText, Send, Loader2 } from "lucide-react";
import html2pdf from "html2pdf.js";
import logoSrc from "@/assets/logo.png";
import signatureSrc from "@/assets/signature-emilie.png";
import stampSrc from "@/assets/stamp-allocation.png";

function today() {
  return new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function clientName(lead: ZohoLead | null) {
  if (!lead) return "___________________________";
  return lead.Full_Name || `${lead.First_Name ?? ""} ${lead.Last_Name ?? ""}`.trim() || "—";
}

export interface ContractFields {
  agreementDate:   string;
  totalFee:        string;
  stage1Pct:       string;
  stage1Amount:    string;
  stage2Pct:       string;
  stage2Amount:    string;
  stage2Days:      string;
  changeOfMindFee: string;
  changeOfMindVat: string;
}

export const DEFAULT_FIELDS: ContractFields = {
  agreementDate:   today(),
  totalFee:        "42,000",
  stage1Pct:       "50",
  stage1Amount:    "21,000",
  stage2Pct:       "50",
  stage2Amount:    "21,000",
  stage2Days:      "45",
  changeOfMindFee: "10,000",
  changeOfMindVat: "5",
};

// ── Rendered contract (matches the PDF exactly) ───────────────────────────────
function ContractBody({ lead, f }: { lead: ZohoLead | null; f: ContractFields }) {
  const name = clientName(lead);
  const date = f.agreementDate || today();

  return (
    <div className="contract-body" style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "11pt", lineHeight: 1.75, color: "#111" }}>

      {/* ── Letterhead ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px", borderBottom: "2px solid #1abc9c", paddingBottom: "16px" }}>
        <img src={logoSrc} alt="Allocation Assist" style={{ height: "72px", width: "auto" }} />
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "22pt", fontWeight: "bold", color: "#1abc9c", letterSpacing: "-0.3px" }}>Allocation Assist DMCC</div>
          <div style={{ fontSize: "13pt", color: "#555", marginBottom: "6px" }}>ألوكيشن أسيست د.م.س.س</div>
          <div style={{ fontSize: "8.5pt", color: "#777", lineHeight: 1.6 }}>
            Business License: &nbsp;<span style={{ color: "#1abc9c" }}>DMCC-859956</span><br />
            Address: &nbsp;2604, Reef Tower, Cluster O,<br />
            Jumeirah Lakes Towers, Dubai,<br />
            United Arab Emirates
          </div>
        </div>
      </div>

      {/* ── Title ── */}
      <h1 style={{ textAlign: "center", fontSize: "16pt", fontWeight: "bold", textDecoration: "underline", margin: "24px 0 20px" }}>
        SERVICE AGREEMENT
      </h1>

      {/* ── Opening ── */}
      <p style={{ marginBottom: "16px", textAlign: "justify" }}>
        <strong>Allocation Assist DMCC</strong>, a limited liability company incorporated and registered in Dubai Multi Commodities Centre (DMCC), United Arab Emirates, under commercial license number DMCC-859956 and registered office is at Unit No: 2604, Reef Tower, Plot No: JLT-PH2-O1A, Jumeirah Lakes Towers, Dubai, United Arab Emirates (the "Consultant");
      </p>

      {/* ── Background ── */}
      <h2 style={{ fontWeight: "bold", fontSize: "11pt", margin: "20px 0 10px" }}>BACKGROUND</h2>
      <ol type="A" style={{ paddingLeft: "24px", marginBottom: "16px" }}>
        <li style={{ marginBottom: "8px" }}>The Client wishes to engage the services of the Consultant to provide the services as listed in Schedule 1 (the "Services").</li>
        <li style={{ marginBottom: "8px" }}>The Client agrees to pay the Consultant based on the fees and terms as listed in Schedule 2 for the Services provided.</li>
        <li style={{ marginBottom: "8px" }}>This Agreement sets out the terms and conditions upon which the Consultant will provide the Services to the Client.</li>
      </ol>

      {/* ── Agreed Terms ── */}
      <h2 style={{ fontWeight: "bold", fontSize: "13pt", textDecoration: "underline", margin: "24px 0 12px" }}>AGREED TERMS</h2>

      <h3 style={{ fontWeight: "bold", fontSize: "11pt", margin: "16px 0 6px" }}>1. APPOINTMENT</h3>
      <p style={{ marginBottom: "14px", textAlign: "justify" }}>The Client hereby appoints the Consultant, and Consultant agrees to act as a consultant to the Client, to provide the Services set out in Schedule 1 on the terms and conditions contained in this Agreement.</p>

      <h3 style={{ fontWeight: "bold", fontSize: "11pt", margin: "16px 0 6px" }}>2. COMMENCEMENT AND DURATION</h3>
      <p style={{ marginBottom: "8px", textAlign: "justify" }}>2.1. This agreement shall commence on the date when it has been signed by the Parties and shall continue, unless terminated, OR until completion of the Services.</p>
      <p style={{ marginBottom: "14px", textAlign: "justify" }}>2.2. The Consultant shall provide the Services to the Client in accordance with this agreement from the date upon which this agreement has been signed by both of the Parties.</p>

      <h3 style={{ fontWeight: "bold", fontSize: "11pt", margin: "16px 0 6px" }}>3. RELATIONSHIP BETWEEN PARTIES</h3>
      <p style={{ marginBottom: "8px", textAlign: "justify" }}>3.1. The Parties agree and acknowledge that this agreement does not create any other relationship between the Parties. Each party confirms it is acting on its own behalf and not for the benefit of any other person.</p>
      <p style={{ marginBottom: "8px", textAlign: "justify" }}>3.2. The Parties agree and acknowledge that the Consultant is an independent contractor and provides the Services as an independent contractor.</p>
      <p style={{ marginBottom: "14px", textAlign: "justify" }}>3.3. This agreement is not based on exclusivity and the Parties acknowledge that they are entitled to enter into other agreements with third Parties in the ordinary course of their respective business.</p>

      <h3 style={{ fontWeight: "bold", fontSize: "11pt", margin: "16px 0 6px" }}>4. CONSULTANT'S OBLIGATIONS</h3>
      <p style={{ marginBottom: "6px", fontWeight: "bold" }}>4.1 Service Delivery</p>
      <p style={{ marginBottom: "10px", paddingLeft: "16px", textAlign: "justify" }}>The Consultant shall render and perform the Services in Schedule 1 faithfully, competently and to the best of its skill and ability.</p>
      <p style={{ marginBottom: "6px", fontWeight: "bold" }}>4.2 Client Data</p>
      <p style={{ marginBottom: "6px", paddingLeft: "16px" }}>The Consultant shall:</p>
      <ol type="a" style={{ paddingLeft: "40px", marginBottom: "14px" }}>
        <li style={{ marginBottom: "6px", textAlign: "justify" }}>Collect Client data solely for the purpose of delivering the Services, managing internal risk and compliance, and improving the Consultant's service offering;</li>
        <li style={{ marginBottom: "6px", textAlign: "justify" }}>Take utmost care when sharing the relevant Client data with the hospitals in the normal course of delivering the Service for the Client. The Consultant will not sell or make profit from sharing Client's data with other external parties;</li>
        <li style={{ marginBottom: "6px", textAlign: "justify" }}>Take reasonable measures including necessary infrastructure and processes to protect Client data from unauthorised access, disclosure, alteration, or destruction.</li>
      </ol>

      <h3 style={{ fontWeight: "bold", fontSize: "11pt", margin: "16px 0 6px" }}>5. CLIENT'S OBLIGATIONS</h3>
      <p style={{ marginBottom: "6px" }}>The Client shall:</p>
      <ol type="a" style={{ paddingLeft: "40px", marginBottom: "14px" }}>
        <li style={{ marginBottom: "6px", textAlign: "justify" }}>Co-operate with the Consultant in all matters relating to the Services and maintain professional conduct when working with the Consultant;</li>
        <li style={{ marginBottom: "6px", textAlign: "justify" }}>provide to the Consultant in a timely manner all documents, information, items and materials in any form (whether owned by the Client or third party) required under Schedule 1 or otherwise reasonably required by the Consultant in connection with the Services and ensure that they are truthful, accurate and complete in all material respects;</li>
        <li style={{ marginBottom: "6px", textAlign: "justify" }}>obtain and maintain all necessary licences and consents and comply with all relevant legislation as required to enable the Consultant to provide the Services.</li>
      </ol>

      <h3 style={{ fontWeight: "bold", fontSize: "11pt", margin: "16px 0 6px" }}>6. CONFIDENTIALITY</h3>
      <p style={{ marginBottom: "8px", textAlign: "justify" }}>6.1 Both Parties acknowledges that in the ordinary course of providing and being provided the Services pursuant to this agreement they may be exposed to information about the other Party which is confidential and which may not be available to the general public.</p>
      <p style={{ marginBottom: "14px", textAlign: "justify" }}>6.2 Both Parties shall keep secret and shall not at any time either during this agreement or after its termination, for whatever reason, use, communicate or disclose to any person any secret or confidential information concerning the either Party and shall use its best endeavours to prevent the publication or disclosure of such information.</p>

      <h3 style={{ fontWeight: "bold", fontSize: "11pt", margin: "16px 0 6px" }}>7. TERMINATION</h3>
      <p style={{ marginBottom: "14px", textAlign: "justify" }}>7.1 This Agreement will terminate upon completion of the Services and payments of all Consultant fees and invoices. Completion of the Services is upon Client signing of employment contract with prospective hospital.</p>

      <h3 style={{ fontWeight: "bold", fontSize: "11pt", margin: "16px 0 6px" }}>8. WAIVER</h3>
      <p style={{ marginBottom: "14px", textAlign: "justify" }}>The failure of either Party to enforce at any time any of the provisions hereof or any right with respect thereto shall not be construed to be a waiver of such provisions of a waiver of the right of such Party thereafter to enforce any such provision or right.</p>

      <h3 style={{ fontWeight: "bold", fontSize: "11pt", margin: "16px 0 6px" }}>9. ENTIRE AGREEMENT AND AMENDMENTS</h3>
      <p style={{ marginBottom: "14px", textAlign: "justify" }}>This Agreement constitutes the entire agreement between the Parties relating to the subject matter of this Agreement and supersedes all previous verbal or written agreements and negotiations between the Parties and this Agreement, including this clause, may only be modified or amended if mutually agreed in writing and signed by the duly authorised representatives of the Parties.</p>

      <h3 style={{ fontWeight: "bold", fontSize: "11pt", margin: "16px 0 6px" }}>10. REPRESENTATION</h3>
      <p style={{ marginBottom: "14px", textAlign: "justify" }}>The Parties represent that they are legally entitled and empowered to perform all aspects of this Agreement and that they will take steps necessary to comply with the law and the diligent performance of all aspects of this Agreement the performance of their obligations hereunder to the other Party. The failure of any Party to comply with any legal requirements for any cause shall not discharge it from any of its obligation under the terms of this Agreement.</p>

      <h3 style={{ fontWeight: "bold", fontSize: "11pt", margin: "16px 0 6px" }}>12. GOVERNING LAW AND DISPUTE RESOLUTION</h3>
      <p style={{ marginBottom: "8px", textAlign: "justify" }}>12.1. This agreement shall be governed and construed in accordance with the laws of the United Arab Emirates.</p>
      <p style={{ marginBottom: "8px", textAlign: "justify" }}>12.2. The Parties shall endeavour to resolve all disputes or differences in relation to this agreement through good faith negotiations.</p>
      <p style={{ marginBottom: "24px", textAlign: "justify" }}>The Parties hereby agree to the terms and conditions set forth in this Agreement.</p>

      {/* ── Schedule 1 ── */}
      <div style={{ pageBreakBefore: "always" }}>
        <h2 style={{ fontWeight: "bold", fontSize: "13pt", textDecoration: "underline", margin: "24px 0 12px" }}>SCHEDULE 1: THE SERVICES</h2>
        <p style={{ marginBottom: "12px" }}>The following Services will be provided by the Consultant under this agreement:</p>
        <ol style={{ paddingLeft: "24px" }}>
          <li style={{ marginBottom: "10px", textAlign: "justify" }}>Provision of public and proprietary know-how and advice with respect to:
            <ol type="a" style={{ paddingLeft: "24px", marginTop: "6px" }}>
              <li style={{ marginBottom: "4px" }}>the different types of hospitals and institutions operating in the UAE, Saudi Arabia and Qatar;</li>
              <li style={{ marginBottom: "4px" }}>appropriate hospitals and/or institutions that are best suited to the skills, expertise and qualifications of the Client; and</li>
              <li style={{ marginBottom: "4px" }}>guidance on working conditions, customary practices and expectations in the medical field in the UAE, Saudi Arabia and Qatar.</li>
            </ol>
          </li>
          <li style={{ marginBottom: "10px", textAlign: "justify" }}>General support with comprehending terms and conditions of employment as relevant to the Client.</li>
          <li style={{ marginBottom: "10px", textAlign: "justify" }}>Assistance with updating and refining the Client's curriculum vitae (CV) and profile, including having a presence on the Consultant's website.</li>
          <li style={{ marginBottom: "10px", textAlign: "justify" }}>Introduction (where appropriate) to professionals and/or businesses that can assist the Client with ancillary support or related services beyond this Service (i.e., for recruitment/human resources purposes).</li>
          <li style={{ marginBottom: "10px", textAlign: "justify" }}>Exclusive access to the Consultant's network of professionals and contact personnel across the UAE, Saudi Arabia and Qatar.</li>
          <li style={{ marginBottom: "10px", textAlign: "justify" }}>General advice on relocation including relocation options suitable to Client's budget and needs, and education, schools and childcare as required.</li>
          <li style={{ marginBottom: "10px", textAlign: "justify" }}>Support and guidance for medical licensing application and registration with licensing authorities of the UAE, Saudi Arabia and Qatar.
            <ol type="a" style={{ paddingLeft: "24px", marginTop: "6px" }}>
              <li style={{ marginBottom: "4px" }}>Submission of application;</li>
              <li style={{ marginBottom: "4px" }}>Close monitoring of applications.</li>
              <li style={{ marginBottom: "4px" }}>Payment of standard application and verification fees as required. Any charges for additional exams required by the licensing authorities in the event of failing the first attempt will be borne by the Client.</li>
              <li style={{ marginBottom: "4px" }}>Full case management assistance, including handling any challenges and complications that may arise.</li>
            </ol>
          </li>
          <li style={{ marginBottom: "10px", textAlign: "justify" }}>For the avoidance of doubt the Consultant does not and will not provide recruitment, human resources services and/or negotiating salary and employment terms on behalf of the Client.</li>
        </ol>
      </div>

      {/* ── Schedule 2 ── */}
      <div style={{ pageBreakBefore: "always", marginTop: "32px" }}>
        <h2 style={{ fontWeight: "bold", fontSize: "13pt", textDecoration: "underline", margin: "0 0 12px" }}>SCHEDULE 2: FEES AND PAYMENT TERMS</h2>

        <h3 style={{ fontWeight: "bold", marginBottom: "6px" }}>1. Fees</h3>
        <p style={{ marginBottom: "14px" }}>Total charges for the Service: <strong>AED {f.totalFee} (VAT included)</strong></p>

        <h3 style={{ fontWeight: "bold", marginBottom: "8px" }}>2. Payment Terms</h3>
        <p style={{ marginBottom: "8px" }}>2.1 The Client shall be invoiced for the Services in 2 stages:</p>
        <ol type="a" style={{ paddingLeft: "32px", marginBottom: "14px" }}>
          <li style={{ marginBottom: "8px", textAlign: "justify" }}>First {f.stage1Pct}% payable upon the date of this Agreement. The Client is expected to remit <strong>AED {f.stage1Amount} (VAT included)</strong>. This is non-refundable as it is for immediate utilisation for the Consultant's internal costs and Client's registration and licensing process with the licensing authorities.</li>
          <li style={{ marginBottom: "8px", textAlign: "justify" }}>Remaining {f.stage2Pct}% payable {f.stage2Days} days upon receipt of invoice once the Client sign an employment contract with the prospective hospital. The Client is expected to remit <strong>AED {f.stage2Amount} (VAT included)</strong>.</li>
        </ol>

        <h3 style={{ fontWeight: "bold", marginBottom: "8px" }}>3. Payment Method</h3>
        <p style={{ marginBottom: "6px" }}>The Client may make payment via:</p>
        <ol type="a" style={{ paddingLeft: "32px", marginBottom: "10px" }}>
          <li style={{ marginBottom: "4px" }}>online payment gateway (by credit or debit card)</li>
          <li style={{ marginBottom: "4px" }}>bank transfer/ cheque to the Consultant's bank account (details provided below)</li>
        </ol>
        <div style={{ paddingLeft: "32px", marginBottom: "16px", lineHeight: 1.9 }}>
          <div>Name: ALLOCATION ASSIST DMCC</div>
          <div>Account Number: 019101098278</div>
          <div>IBAN Number: AE520330000019101098278</div>
          <div>Branch: ABU DHABI MAIN</div>
          <div>SWIFT Code / BIC: BOMLAEAD</div>
          <div>POP Code: PMS</div>
        </div>

        <h3 style={{ fontWeight: "bold", marginBottom: "8px" }}>4. Change of Mind</h3>
        <p style={{ marginBottom: "24px", textAlign: "justify" }}>If you change your mind about relocating but do not inform us beforehand, and we have already arranged secured a job offer for you, you will be responsible for paying Allocation Assist 50% of the remaining fee which is {f.changeOfMindFee} AED plus {f.changeOfMindVat}% VAT.</p>

        {/* ── Signatures ── */}
        <p style={{ marginBottom: "14px", fontWeight: "bold" }}>Signed by:</p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "40px" }}>
          {/* Consultant */}
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: "bold", marginBottom: "8px" }}>THE CONSULTANT</p>
            <div style={{ position: "relative", height: "72px", marginBottom: "6px" }}>
              <img src={signatureSrc} alt="Signature" style={{ position: "absolute", bottom: "4px", left: "0", height: "56px", objectFit: "contain" }} />
              <img src={stampSrc} alt="Company Stamp" style={{ position: "absolute", bottom: "0", right: "0", height: "68px", objectFit: "contain", opacity: 0.85 }} />
              <div style={{ position: "absolute", bottom: "0", left: "0", right: "0", borderBottom: "1px solid #333" }} />
            </div>
            <p style={{ fontWeight: "bold", marginBottom: "2px" }}>Emilie Davies</p>
            <p style={{ color: "#555" }}>Allocation Assist DMCC CEO</p>
          </div>
          {/* Client */}
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: "bold", marginBottom: "8px" }}>THE CLIENT</p>
            <div style={{ borderBottom: "1px solid #333", marginBottom: "6px", height: "48px" }} />
            <p style={{ color: "#555" }}>{name}</p>
            <p style={{ color: "#888", fontSize: "9pt", marginTop: "4px" }}>Date: {date}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
const Contracts = () => {
  const { data: zoho } = useZohoData();
  const [search, setSearch]             = useState("");
  const [selectedLead, setSelectedLead] = useState<ZohoLead | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [fields, setFields]             = useState<ContractFields>(DEFAULT_FIELDS);
  const previewRef = useRef<HTMLDivElement>(null);

  function setF(key: keyof ContractFields, val: string) {
    setFields(f => ({ ...f, [key]: val }));
  }

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

  const handlePrint = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    const html = previewRef.current?.innerHTML ?? "";
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Service Agreement${selectedLead ? ` — ${clientName(selectedLead)}` : ""}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Georgia, 'Times New Roman', serif; font-size: 11pt; line-height: 1.75;
           color: #111; padding: 2.2cm 2.8cm; }
    h1 { text-align: center; font-size: 16pt; text-decoration: underline; margin: 24px 0 20px; }
    h2 { font-size: 13pt; font-weight: bold; text-decoration: underline; margin: 24px 0 12px; }
    h3 { font-size: 11pt; font-weight: bold; margin: 16px 0 6px; }
    p  { margin-bottom: 10px; text-align: justify; }
    ol { padding-left: 28px; }
    li { margin-bottom: 6px; }
    @page { margin: 2.2cm 2.8cm; }
    @media print { .no-print { display: none !important; } }
  </style>
</head>
<body>${html}</body>
</html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  };

  // ── PDF generation: captures the rendered contract preview into a real
  // PDF Blob using html2pdf.js (html2canvas + jsPDF under the hood). Used
  // by the BoldSign send flow — we need an actual file to attach to the
  // signing request, not a print dialog.
  const generateContractPdf = async (): Promise<Blob | null> => {
    if (!previewRef.current || !selectedLead) return null;
    // Clone the preview into an offscreen container so html2canvas can
    // measure it at full size without being affected by the screen
    // viewport / scroll position.
    const filename = `Service Agreement — ${clientName(selectedLead)}.pdf`;
    const opts = {
      margin:       [22, 28, 22, 28],   // mm — matches @page margin in print
      filename,
      image:        { type: "jpeg", quality: 0.95 },
      html2canvas:  { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
      jsPDF:        { unit: "mm", format: "a4", orientation: "portrait" as const },
      pagebreak:    { mode: ["avoid-all", "css", "legacy"] as ("avoid-all" | "css" | "legacy")[] },
    };
    return html2pdf().from(previewRef.current).set(opts).outputPdf("blob") as Promise<Blob>;
  };

  // ── Send for Signature: stub — wires up to the BoldSign Edge Function
  // in the next step. For now generates the PDF + downloads it locally
  // so we can verify the rendering before plugging into the API.
  const [sending, setSending] = useState(false);
  const handleSendForSignature = async () => {
    if (!selectedLead) return;
    setSending(true);
    try {
      const pdfBlob = await generateContractPdf();
      if (!pdfBlob) {
        alert("Could not generate the contract PDF. Try selecting a doctor first.");
        return;
      }
      // Step 1 placeholder: download the PDF locally so we can verify the
      // generated file looks right before wiring up the BoldSign Edge
      // Function. Replaced in Step 2.
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Service Agreement — ${clientName(selectedLead)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      alert(`PDF generated (${(pdfBlob.size / 1024).toFixed(0)} KB). Once the BoldSign sender identity is verified, this same PDF will be sent to ${selectedLead.Email ?? "the doctor's email"} for signature instead of downloading.`);
    } catch (err) {
      console.error("[Contracts] PDF generation failed:", err);
      alert(`PDF generation failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <DashboardLayout title="Contract Builder" subtitle="Search a doctor, edit fees and dates, then print">

      {/* ── Editable fields strip ── */}
      <div className="rounded-xl border border-border/50 bg-muted/30 px-4 py-3 mb-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-3">
        {[
          { label: "Agreement Date",      key: "agreementDate"   as const, type: "text" },
          { label: "Total Fee (AED)",      key: "totalFee"        as const, type: "text" },
          { label: "Stage 1 %",           key: "stage1Pct"       as const, type: "text" },
          { label: "Stage 1 Amount (AED)", key: "stage1Amount"    as const, type: "text" },
          { label: "Stage 2 %",           key: "stage2Pct"       as const, type: "text" },
          { label: "Stage 2 Amount (AED)", key: "stage2Amount"    as const, type: "text" },
          { label: "Stage 2 Days",        key: "stage2Days"      as const, type: "text" },
          { label: "Change of Mind (AED)", key: "changeOfMindFee" as const, type: "text" },
          { label: "Change of Mind VAT %", key: "changeOfMindVat" as const, type: "text" },
        ].map(({ label, key, type }) => (
          <div key={key}>
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground font-medium mb-1">{label}</p>
            <input
              type={type}
              value={fields[key]}
              onChange={e => setF(key, e.target.value)}
              className="w-full h-7 text-[11px] bg-background border border-border/50 rounded px-2 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        ))}
      </div>

      {/* ── Top bar: search + print ── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center mb-5">
        <div className="flex-1 max-w-sm">
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
                  className="pl-8 h-9 text-[12px]"
                />
              </div>
            </PopoverTrigger>
            <PopoverContent
              align="start" sideOffset={4}
              className="p-0 w-[var(--radix-popover-trigger-width)] max-h-60 overflow-y-auto"
              onOpenAutoFocus={e => e.preventDefault()}
            >
              {doctorOptions.map(lead => {
                const name = lead.Full_Name || `${lead.First_Name ?? ""} ${lead.Last_Name ?? ""}`.trim() || "—";
                return (
                  <button
                    key={lead.id}
                    className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors border-b border-border/30 last:border-0"
                    onMouseDown={() => { setSelectedLead(lead); setSearch(name); setShowDropdown(false); }}
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
        </div>

        {selectedLead && (
          <div className="flex items-center gap-2 text-[11px] bg-primary/5 border border-primary/20 rounded-lg px-3 py-1.5">
            <FileText className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium">{clientName(selectedLead)}</span>
            <span className="text-muted-foreground">· {selectedLead.Specialty ?? selectedLead.Specialty_New ?? "—"}</span>
          </div>
        )}

        <Button
          onClick={handlePrint}
          variant="outline"
          className="h-9 gap-1.5 text-[12px] shrink-0"
          disabled={!selectedLead}
        >
          <Printer className="h-3.5 w-3.5" />
          Print / Save PDF
        </Button>
        <Button
          onClick={handleSendForSignature}
          className="h-9 gap-1.5 text-[12px] shrink-0"
          disabled={!selectedLead || sending}
        >
          {sending
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Send className="h-3.5 w-3.5" />}
          {sending ? "Generating PDF…" : "Send for Signature"}
        </Button>
      </div>

      {/* ── Contract preview ── */}
      <div
        className={`rounded-xl border border-border/40 bg-white shadow-sm p-10 transition-opacity ${!selectedLead ? "opacity-50" : ""}`}
        style={{ maxWidth: "860px", margin: "0 auto" }}
      >
        <div ref={previewRef}>
          <ContractBody lead={selectedLead} f={fields} />
        </div>
      </div>

      {!selectedLead && (
        <p className="text-center text-[11px] text-muted-foreground mt-4">
          Search for a doctor above — their name will appear in the client signature section
        </p>
      )}
    </DashboardLayout>
  );
};

export default Contracts;
