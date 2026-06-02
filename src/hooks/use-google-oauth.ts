import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";

const KEY = ["google-oauth-status"] as const;

export interface GoogleOAuthStatus {
  connected:           boolean;
  account_email:       string | null;
  scopes:              string | null;
  connected_by:        string | null;
  connected_at:        string | null;
  access_token_valid:  boolean;
}

export function useGoogleOAuthStatus() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<GoogleOAuthStatus> => {
      const { data, error } = await supabase
        .from("google_oauth_status")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return data
        ? data as GoogleOAuthStatus
        : { connected: false, account_email: null, scopes: null, connected_by: null, connected_at: null, access_token_valid: false };
    },
    staleTime: 60_000,
  });
}

// The frontend's view of the OAuth client id. Public — Google's protocol
// shows it in the consent screen URL anyway.
const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID ?? "") as string;
// Where Google sends the user back after consent. Must match the URI you
// added to the OAuth client in GCP. Computed from the Supabase project URL.
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? "") as string;
const CALLBACK_URL = SUPABASE_URL
  ? `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/google-oauth-callback`
  : "";

/** Returns true if the frontend has enough env vars to start an OAuth flow.
 *  When false, the UI tells the user how to finish the GCP setup. */
export function googleOAuthEnabledOnClient(): boolean {
  return !!GOOGLE_CLIENT_ID && !!CALLBACK_URL;
}

/** Build the consent URL and redirect the browser to it.
 *
 *  Scopes:
 *    spreadsheets.readonly — read native Google Sheets (Sheets API)
 *    drive.readonly        — download xlsx/xls/ods files (Drive API)
 *  Listing both explicitly tells Google to show two separate scope items on
 *  the consent screen ("See your Sheets" + "See and download your Drive
 *  files"), instead of one ambiguous Drive line.
 *
 *  We pass a JSON state through OAuth so the callback can redirect the
 *  browser back to wherever the user started (localhost OR Railway), instead
 *  of hard-coding APP_ORIGIN. */
export function useStartGoogleOAuth() {
  const { user } = useAuth();
  return useCallback(() => {
    if (!googleOAuthEnabledOnClient()) {
      throw new Error("VITE_GOOGLE_OAUTH_CLIENT_ID isn't set on the dashboard. Add it to your env to enable OAuth.");
    }
    // Encode current origin so the callback can redirect back to wherever
    // the user clicked Connect — localhost during dev, Railway in prod.
    const stateObj = {
      email:     user?.email ?? "",
      returnTo:  window.location.origin,
    };
    const state = btoa(JSON.stringify(stateObj));

    const params = new URLSearchParams({
      client_id:               GOOGLE_CLIENT_ID,
      redirect_uri:            CALLBACK_URL,
      response_type:           "code",
      scope:                   [
        "https://www.googleapis.com/auth/spreadsheets.readonly",
        "https://www.googleapis.com/auth/drive.readonly",
        "openid",
        "email",
      ].join(" "),
      access_type:             "offline",  // required to get a refresh token
      prompt:                  "consent",  // forces refresh-token to be returned even on re-auth
      include_granted_scopes:  "true",
      state,
    });
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }, [user?.email]);
}

export function useDisconnectGoogle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("google_oauth_tokens").delete().eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
