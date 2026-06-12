import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface EmailTemplate {
  id:         string;
  key:        string;
  name:       string;
  flow_key:   string | null;
  subject:    string;
  body_html:  string;
  body_text:  string;
  variables:  string[];
  updated_at: string;
  updated_by: string | null;
}

const KEY = ["email-templates"] as const;

export function useEmailTemplates() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<EmailTemplate[]> => {
      const { data, error } = await supabase
        .from("email_templates")
        .select("*")
        .order("flow_key", { ascending: true })
        .order("name",     { ascending: true });
      if (error) throw error;
      return (data ?? []) as EmailTemplate[];
    },
    staleTime: 60_000,
  });
}

export function useUpdateEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; subject?: string; body_html?: string; body_text?: string; name?: string }) => {
      const { id, ...patch } = input;
      const { error } = await supabase
        .from("email_templates")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); },
  });
}

export function useCreateEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { key: string; name: string; flow_key?: string; subject: string; body_html?: string; body_text?: string; variables?: string[] }) => {
      const { error } = await supabase.from("email_templates").insert({
        ...input,
        body_html: input.body_html ?? "",
        body_text: input.body_text ?? "",
        variables: input.variables ?? [],
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); },
  });
}

export function useDeleteEmailTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("email_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); },
  });
}

/** Tiny Mustache-ish renderer used in the preview pane and by the sender
 *  edge function (a mirror of this function lives in send-flow-email/index.ts
 *  — keep them in sync).
 *
 *  Two modes:
 *  - Default (plain text / subject lines): substitutes verbatim.
 *  - `{ html: true }`: HTML-escapes every token value before insertion so
 *    Claude-extracted text (or any user input) can never break out of the
 *    template's HTML structure. The template HTML itself is preserved —
 *    only the inserted token VALUES get escaped.
 *
 *  Missing tokens are left as `{{token}}` literals so authors can see what
 *  didn't resolve during testing. */
/** Tokens whose VALUE is already pre-rendered HTML (signature block,
 *  the doctors-batch table, etc.) and must NOT be HTML-escaped during
 *  substitution. Kept in sync with the server-side RAW_HTML_TOKENS in
 *  supabase/functions/send-flow-email/index.ts. */
const RAW_HTML_TOKENS = new Set<string>(["signature", "doctors_table_html", "doctor_card_html", "doctor_row_table_html", "logo_header"]);

export function renderTemplate(
  body: string,
  vars: Record<string, string | number | null | undefined>,
  opts?: { html?: boolean },
): string {
  // Pass 1: handle Mustache-style sections `{{#token}}...{{/token}}` — render
  // the inner block only if the variable is truthy. Lets templates show a
  // CTA button (e.g. Join Interview) only when the link is present.
  body = body.replace(/\{\{#([a-zA-Z0-9_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m, key: string, inner: string) => {
    const v = vars[key];
    if (v === undefined || v === null || v === "") return "";
    return inner;
  });
  // Pass 2: regular variable substitution.
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    const v = vars[key];
    if (v === undefined || v === null) return `{{${key}}}`;
    const s = String(v);
    if (!opts?.html) return s;
    return RAW_HTML_TOKENS.has(key) ? s : escapeHtml(s);
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
