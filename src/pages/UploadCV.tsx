import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, AlertCircle, Loader2, FileUp, Sparkles } from "lucide-react";
import logo from "@/assets/logo.png";

/** Public CV upload page — no auth. Token in the URL identifies which doctor
 *  the upload belongs to. The page never touches Supabase directly; it POSTs
 *  to the cv-upload-public edge function which validates the token, stores
 *  the file, and queues Claude extraction. */
export default function UploadCV() {
  const { token } = useParams<{ token: string }>();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file,       setFile]       = useState<File | null>(null);
  const [uploading,  setUploading]  = useState(false);
  const [status,     setStatus]     = useState<"idle" | "uploaded" | "error">("idle");
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null);

  // Validate token presence client-side so we don't even render the form
  // when the URL was mangled.
  useEffect(() => {
    if (!token) setStatus("error");
  }, [token]);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;

  const handleSubmit = async () => {
    if (!file || !token || uploading) return;
    setUploading(true);
    setErrorMsg(null);
    try {
      const fd = new FormData();
      fd.append("token", token);
      fd.append("file",  file);
      const res = await fetch(`${supabaseUrl}/functions/v1/cv-upload-public`, {
        method: "POST",
        body:   fd,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        throw new Error(body.error || `Upload failed (HTTP ${res.status})`);
      }
      setStatus("uploaded");
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <img src={logo} alt="Allocation Assist" className="h-16 w-16 mb-3" />
          <h1 className="text-xl font-semibold text-slate-900">Allocation Assist</h1>
          <p className="text-[12px] text-slate-500 mt-0.5">Doctor placement specialists</p>
        </div>

        {!token && (
          <Card>
            <ErrorBlock title="Invalid link" message="This upload link is malformed. Please use the link from your email exactly as received." />
          </Card>
        )}

        {token && status === "idle" && (
          <Card>
            <h2 className="text-lg font-semibold text-slate-900 mb-1.5">Upload your CV</h2>
            <p className="text-[13px] text-slate-600 leading-relaxed mb-5">
              We'll use this to fast-track your introduction to hospitals. PDF or Word docs work best. Max 10MB.
            </p>

            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed border-slate-300 hover:border-teal-400 rounded-lg p-6 text-center transition-colors group"
            >
              <FileUp className="h-8 w-8 text-slate-400 group-hover:text-teal-500 mx-auto mb-2 transition-colors" />
              {file ? (
                <>
                  <div className="text-[13px] font-medium text-slate-900 break-all">{file.name}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{(file.size / 1024).toFixed(0)} KB · click to choose a different file</div>
                </>
              ) : (
                <>
                  <div className="text-[13px] font-medium text-slate-700">Click to choose a file</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">PDF, DOC, or DOCX</div>
                </>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />

            {errorMsg && (
              <div className="mt-3 rounded-md bg-rose-50 border border-rose-200 p-2.5 text-[12px] text-rose-800">
                {errorMsg}
              </div>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!file || uploading}
              className="mt-5 w-full bg-teal-500 hover:bg-teal-600 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-medium rounded-md py-2.5 text-[14px] transition-colors flex items-center justify-center gap-2"
            >
              {uploading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading...</>
                : "Upload CV"}
            </button>
          </Card>
        )}

        {status === "uploaded" && (
          <Card>
            <div className="flex flex-col items-center text-center py-2">
              <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
                <CheckCircle2 className="h-7 w-7 text-emerald-600" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900 mb-1.5">CV received</h2>
              <p className="text-[13px] text-slate-600 leading-relaxed mb-3">
                Thanks! We're processing your CV now. The Allocation Assist team will be in touch shortly.
              </p>
              <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" />
                You can close this page.
              </p>
            </div>
          </Card>
        )}

        {status === "error" && token && (
          <Card>
            <ErrorBlock
              title="Something went wrong"
              message={errorMsg ?? "Please try again, or reply to the email you received with your CV attached."}
            />
            <button
              type="button"
              onClick={() => { setStatus("idle"); setErrorMsg(null); }}
              className="mt-4 w-full border border-slate-200 hover:bg-slate-50 rounded-md py-2 text-[13px] font-medium transition-colors"
            >
              Try again
            </button>
          </Card>
        )}

        <div className="text-center text-[10px] text-slate-400 mt-6">
          allocationassist.com · This link is unique to you
        </div>
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      {children}
    </div>
  );
}

function ErrorBlock({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-col items-center text-center py-2">
      <div className="h-12 w-12 rounded-full bg-rose-100 flex items-center justify-center mb-3">
        <AlertCircle className="h-7 w-7 text-rose-600" />
      </div>
      <h2 className="text-lg font-semibold text-slate-900 mb-1.5">{title}</h2>
      <p className="text-[13px] text-slate-600 leading-relaxed">{message}</p>
    </div>
  );
}
