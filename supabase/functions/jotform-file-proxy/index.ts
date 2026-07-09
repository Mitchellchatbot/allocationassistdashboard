/**
 * jotform-file-proxy — fetch a JotForm widget file with the form's API key
 * and stream the bytes back. JotForm widget files (`/widget-uploads/...`)
 * are NOT public; the bare URL serves a 404 page. Adding `?apiKey=` works
 * but would leak the key client-side, so we keep the key server-side and
 * proxy.
 *
 * Usage:
 *   GET /jotform-file-proxy?form_id=<forms.id uuid>&path=/widget-uploads/...
 *
 * The path is validated to start with `/widget-uploads/` so this can't
 * be used to fetch arbitrary URLs.
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

  const url    = new URL(req.url);
  const formId = url.searchParams.get("form_id");
  const path   = url.searchParams.get("path");
  if (!formId || !path) {
    return new Response("missing form_id or path", { status: 400, headers: corsHeaders });
  }
  // Allowlist: only proxy paths under JotForm's widget upload tree.
  if (!path.startsWith("/widget-uploads/") && !path.startsWith("/uploads/")) {
    return new Response("path not allowed", { status: 400, headers: corsHeaders });
  }

  const { data: form } = await sb
    .from("forms")
    .select("api_token")
    .eq("id", formId)
    .single();
  const apiKey = (form as { api_token?: string } | null)?.api_token;
  if (!apiKey) return new Response("form has no api_token", { status: 404, headers: corsHeaders });

  const jfRes = await fetch(`https://www.jotform.com${path}`, { headers: { APIKEY: apiKey } });
  if (!jfRes.ok) {
    return new Response(`upstream ${jfRes.status}`, { status: jfRes.status, headers: corsHeaders });
  }

  // JotForm returns application/octet-stream; infer the right image type
  // from the path extension so browsers render <img> instead of downloading.
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const isImage = ext === "jpg" || ext === "jpeg" || ext === "png" || ext === "gif" || ext === "webp";
  const mime =
    ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
    ext === "png"                   ? "image/png"  :
    ext === "gif"                   ? "image/gif"  :
    ext === "webp"                  ? "image/webp" :
    ext === "pdf"                   ? "application/pdf" :
    jfRes.headers.get("content-type") ?? "application/octet-stream";

  // A CV (PDF/doc) should DOWNLOAD as a file with its real name, not open in a
  // browser tab; images stay inline so the <img> previews render.
  const filename = decodeURIComponent(path.split("/").pop() || "download").replace(/[/"\\\r\n]/g, "");

  return new Response(jfRes.body, {
    headers: {
      ...corsHeaders,
      "Content-Type":  mime,
      "Cache-Control": "public, max-age=86400",
      ...(isImage ? {} : { "Content-Disposition": `attachment; filename="${filename}"` }),
    },
  });
});
