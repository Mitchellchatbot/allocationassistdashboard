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

  // JotForm /uploads/ + /widget-uploads/ file downloads authenticate via the
  // ?apiKey= QUERY PARAM. The APIKEY *header* is only for api.jotform.com REST
  // endpoints — on the www.jotform.com file host, sending it makes JotForm route
  // the request as an API call and 404 the file path. So the primary request is
  // query-param-only (redirects followed for JotForm's CDN hand-off); we only
  // fall back to the header form if the clean request fails. Key stays
  // server-side (never sent to the browser).
  const sep = path.includes("?") ? "&" : "?";
  const fileUrl = `https://www.jotform.com${path}${sep}apiKey=${encodeURIComponent(apiKey)}`;
  const isHtml = (r: Response) => /text\/html/i.test(r.headers.get("content-type") ?? "");

  let jfRes = await fetch(fileUrl, { redirect: "follow" });
  if (!jfRes.ok || isHtml(jfRes)) {
    // Some accounts/files only serve with the APIKEY header present — retry.
    const retry = await fetch(fileUrl, { headers: { APIKEY: apiKey }, redirect: "follow" }).catch(() => null);
    if (retry && retry.ok && !isHtml(retry)) {
      jfRes = retry;
    } else {
      // Surface JotForm's actual response so a failure is diagnosable (the
      // upstream URL is logged WITHOUT the apiKey; the body snippet often names
      // the real cause — expired file, wrong key scope, moved upload).
      const snippet = (await jfRes.text().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 300);
      return new Response(
        `upstream ${jfRes.status} for https://www.jotform.com${path} — ${snippet || "(empty body)"}`,
        { status: 502, headers: corsHeaders },
      );
    }
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
