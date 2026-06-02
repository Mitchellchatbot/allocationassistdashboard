/**
 * google-oauth-callback — completes the OAuth flow.
 *
 * Flow:
 *   1. User clicks "Connect Google" on /connections
 *   2. Frontend builds a Google consent URL and redirects there with
 *      redirect_uri = THIS function's URL.
 *   3. Google asks the user to log in + grant scopes.
 *   4. Google redirects browser back here with ?code=...&state=... .
 *   5. This function exchanges the code for refresh + access tokens, stores
 *      them in google_oauth_tokens, and redirects back to /connections with
 *      a success/failure status.
 *
 * Required env (supabase secrets set ...):
 *   GOOGLE_OAUTH_CLIENT_ID
 *   GOOGLE_OAUTH_CLIENT_SECRET
 *   APP_ORIGIN  ← e.g. https://care-assist.io (the URL we redirect back to
 *                 after the callback completes; defaults to https://care-assist.io)
 *
 * The redirect_uri Google needs to know about is THIS function's public URL:
 *   https://<project-ref>.functions.supabase.co/google-oauth-callback
 * Add that to the OAuth client's "Authorized redirect URIs" in the GCP console.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GOOGLE_CLIENT_ID          = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")     ?? "";
const GOOGLE_CLIENT_SECRET      = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") ?? "";
const APP_ORIGIN                = Deno.env.get("APP_ORIGIN") ?? "https://care-assist.io";

// Compute our own URL — that's what we tell Google as the redirect URI.
// IMPORTANT: this MUST exactly match the redirect_uri the frontend sent
// during the consent step, or Google rejects the token exchange with
// redirect_uri_mismatch. The frontend builds it as
// `${SUPABASE_URL}/functions/v1/google-oauth-callback`, so we do the same
// here — never derive from `req.url`, because Supabase's internal routing
// can rewrite the host to `.functions.supabase.co` which won't match.
function redirectUri(_req: Request): string {
  return `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/google-oauth-callback`;
}

console.log("[google-oauth-callback] booted.", "Client ID set:", !!GOOGLE_CLIENT_ID);

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return text("Method not allowed", 405);
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return text(
      "Google OAuth isn't configured yet. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET on this Edge Function:\n\n  supabase secrets set GOOGLE_OAUTH_CLIENT_ID=... GOOGLE_OAUTH_CLIENT_SECRET=...\n",
      500,
    );
  }

  const u = new URL(req.url);
  const code  = u.searchParams.get("code");
  const error = u.searchParams.get("error");
  // Decode state early so error redirects honour the originating origin too.
  const rawStateForError = u.searchParams.get("state") ?? "";
  let returnToForError: string | null = null;
  try {
    const decoded = JSON.parse(atob(rawStateForError));
    if (decoded?.returnTo) returnToForError = decoded.returnTo;
  } catch { /* ignore */ }

  if (error) return redirectToApp("error", `Google denied access: ${error}`, returnToForError);
  if (!code)  return redirectToApp("error", "No authorization code returned from Google.", returnToForError);

  // Exchange code for tokens.
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id:     GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri:  redirectUri(req),
        grant_type:    "authorization_code",
      }),
    });
    if (!tokenRes.ok) {
      const detail = await tokenRes.text();
      console.error("[google-oauth-callback] token exchange failed:", tokenRes.status, detail);
      // Try to extract Google's "error" + "error_description" so the user sees
      // the real reason (redirect_uri_mismatch, invalid_grant, etc.) instead
      // of a generic HTTP code.
      let friendly = `Token exchange failed (HTTP ${tokenRes.status})`;
      try {
        const j = JSON.parse(detail);
        if (j.error) friendly = `${j.error}${j.error_description ? `: ${j.error_description}` : ""}`;
      } catch { /* not JSON — keep generic */ }
      return redirectToApp("error", friendly, returnToForError);
    }
    const tokens = await tokenRes.json() as {
      access_token:   string;
      refresh_token?: string;
      expires_in:     number;
      scope:          string;
      token_type:     string;
      id_token?:      string;
    };

    if (!tokens.refresh_token) {
      // Google only returns refresh_token on first consent. If we get here
      // it usually means the user previously authorized and Google reused
      // a session — tell them to remove access in their Google Account
      // settings and try again so we get a fresh refresh_token.
      return redirectToApp(
        "error",
        "Google didn't return a refresh token. Go to myaccount.google.com/permissions, remove this app, then click Connect again.",
      );
    }

    // Pull the account email from the id_token (no extra API call needed).
    let accountEmail: string | null = null;
    if (tokens.id_token) {
      try {
        const payload = tokens.id_token.split(".")[1];
        const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
        accountEmail = json.email ?? null;
      } catch (_) { /* ignore */ }
    }

    const expiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Decode the state to recover the dashboard-user email + return URL.
    // The frontend encodes state as base64(JSON({ email, returnTo })).
    // Falls back to plain text for backward compat (older flows passed just
    // an email here) and to APP_ORIGIN as the redirect target.
    const rawState = u.searchParams.get("state") ?? "";
    let connectedBy = rawState;
    let returnTo:    string | null = null;
    try {
      const decoded = JSON.parse(atob(rawState));
      if (decoded && typeof decoded === "object") {
        connectedBy = decoded.email    ?? rawState;
        returnTo    = decoded.returnTo ?? null;
      }
    } catch { /* old-style plain-text state — keep as-is */ }

    const { error: upErr } = await supabase
      .from("google_oauth_tokens")
      .upsert({
        id:            1,
        account_email: accountEmail,
        refresh_token: tokens.refresh_token,
        access_token:  tokens.access_token,
        expires_at:    expiresAt,
        scopes:        tokens.scope,
        connected_by:  connectedBy,
        connected_at:  new Date().toISOString(),
        updated_at:    new Date().toISOString(),
      }, { onConflict: "id" });
    if (upErr) {
      console.error("[google-oauth-callback] upsert failed:", upErr.message);
      return redirectToApp("error", `Failed to save tokens: ${upErr.message}`, returnTo);
    }

    return redirectToApp("ok", accountEmail ?? "connected", returnTo);
  } catch (e) {
    console.error("[google-oauth-callback] threw:", e);
    return redirectToApp("error", String(e), returnToForError);
  }
});

/** Build the redirect URL. Honours the `returnTo` baked into state by the
 *  frontend (so localhost dev redirects back to localhost, prod to prod),
 *  falling back to APP_ORIGIN when state is missing or unparseable. Only
 *  accepts http(s) URLs — defends against open-redirect attacks. */
function redirectToApp(status: "ok" | "error", message: string, returnTo: string | null = null): Response {
  let base = APP_ORIGIN;
  if (returnTo && /^https?:\/\//i.test(returnTo)) base = returnTo;
  const u = new URL(`${base.replace(/\/$/, "")}/connections`);
  u.searchParams.set("oauth", status);
  u.searchParams.set("message", message);
  return new Response(null, { status: 302, headers: { Location: u.toString() } });
}

function text(body: string, status: number): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/plain" } });
}
