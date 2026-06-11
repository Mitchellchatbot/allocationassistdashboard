/**
 * typeform-file-proxy — fetch a Typeform file-upload with the form's personal
 * access token and stream the bytes back. Typeform file URLs
 * (api.typeform.com/forms/.../files/...) require `Authorization: Bearer <token>`,
 * which a browser <img>/<a> can't supply — so the photo/CV would 401. We keep
 * the token server-side and proxy, inferring the right content-type so images
 * render inline.
 *
 * Usage:
 *   GET /typeform-file-proxy?form_id=<forms.id uuid>&url=<api.typeform.com file URL>
 *
 * The url is allow-listed to api.typeform.com so this can't fetch arbitrary URLs.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const sb = createClient(
  Deno.env.get("SUPABASE_URL")              ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const reqUrl  = new URL(req.url);
  const formId  = reqUrl.searchParams.get("form_id");
  const fileUrl = reqUrl.searchParams.get("url");
  if (!formId || !fileUrl) {
    return new Response("missing form_id or url", { status: 400, headers: corsHeaders });
  }
  // Allowlist: only Typeform file URLs.
  if (!/^https:\/\/api\.typeform\.com\//i.test(fileUrl)) {
    return new Response("url not allowed", { status: 400, headers: corsHeaders });
  }

  const { data: form } = await sb
    .from("forms")
    .select("api_token")
    .eq("id", formId)
    .single();
  const token = (form as { api_token?: string } | null)?.api_token;
  if (!token) return new Response("form has no api_token", { status: 404, headers: corsHeaders });

  const res = await fetch(fileUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    return new Response(`upstream ${res.status}`, { status: res.status, headers: corsHeaders });
  }

  // Infer image/pdf type from the path extension so browsers render an <img>
  // (Typeform serves a generic content-type for downloads).
  const ext = (() => { try { return new URL(fileUrl).pathname.split(".").pop()?.toLowerCase() ?? ""; } catch { return ""; } })();
  const mime =
    ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
    ext === "png"                   ? "image/png"  :
    ext === "gif"                   ? "image/gif"  :
    ext === "webp"                  ? "image/webp" :
    ext === "pdf"                   ? "application/pdf" :
    res.headers.get("content-type") ?? "application/octet-stream";

  return new Response(res.body, {
    headers: {
      ...corsHeaders,
      "Content-Type":  mime,
      "Cache-Control": "public, max-age=86400",
    },
  });
});
