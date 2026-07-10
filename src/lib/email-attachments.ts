import { supabase } from "@/lib/supabase";

/**
 * A file the team attaches to an outgoing email (CV, logbook, …).
 *
 * `path` is the PUBLIC URL of the uploaded file. send-flow-email / send-batch
 * FETCH this URL server-side and base64-inline the bytes into Resend's
 * `attachments[].content` (a bad/oversized file is skipped, never failing the
 * whole send). The bucket is public so that server-side fetch doesn't 401.
 */
export interface EmailAttachment {
  filename: string;
  /** Public URL Resend fetches. */
  path:     string;
  /** Storage object path (bucket-relative) — kept so we can delete on remove. */
  storage_path: string;
  /** Bytes — for the UI chip only; not sent to Resend. */
  size?:    number;
}

const BUCKET = "email-attachments";
const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_EXT = ["pdf", "doc", "docx", "png", "jpg", "jpeg"];

// Content-type by extension. Some browsers/OSes hand us a File with an empty
// `type` (e.g. files dragged from certain apps, or renamed downloads); storing
// those without a content-type makes the object serve as octet-stream/text, so
// the recipient "can't open" the PDF/Word doc. Fall back to the extension.
const EXT_MIME: Record<string, string> = {
  pdf:  "application/pdf",
  doc:  "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  png:  "image/png",
  jpg:  "image/jpeg",
  jpeg: "image/jpeg",
};

/**
 * Upload one file to the public email-attachments bucket and return the
 * attachment descriptor. Throws on oversize / disallowed type / upload error
 * so the caller can surface a toast.
 */
export async function uploadEmailAttachment(file: File): Promise<EmailAttachment> {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) {
    throw new Error(`"${file.name}" — unsupported type. Use PDF, DOC, DOCX, PNG or JPG.`);
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)}MB — max is 25MB.`);
  }
  // Random folder keeps the public URL unguessable; original filename is kept
  // as the last segment so Resend names the attachment sensibly.
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${crypto.randomUUID()}/${safeName}`;
  // Prefer the extension-derived MIME over file.type. Browsers frequently hand
  // us `application/octet-stream` (or empty) for .doc/.docx — and the bucket's
  // allowed_mime_types don't include octet-stream, so that upload gets REJECTED
  // and the attachment silently never attaches. `ext` is already validated
  // against ALLOWED_EXT, so EXT_MIME[ext] is always a valid allowed type.
  const contentType = EXT_MIME[ext] || file.type || "application/octet-stream";
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    contentType,
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return { filename: file.name, path: data.publicUrl, storage_path: storagePath, size: file.size };
}

/** Best-effort removal of an attachment file the user deselected before send. */
export async function removeEmailAttachment(storagePath: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
}
