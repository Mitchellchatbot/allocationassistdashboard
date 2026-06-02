import { useLocation } from "react-router-dom";
import { useEffect, useMemo } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  // Smart fallbacks when the user landed here via OAuth or from a different
  // origin. Common case: OAuth redirected from localhost → Railway because
  // Railway's build doesn't have the new page yet. Offer a direct link back
  // to whichever origin the user came from.
  const params = new URLSearchParams(location.search);
  const oauthHint = params.get("oauth");

  const referrerOrigin = useMemo(() => {
    try {
      if (!document.referrer) return null;
      const r = new URL(document.referrer);
      if (r.origin === window.location.origin) return null;  // same origin → not useful
      return r.origin;
    } catch { return null; }
  }, []);

  // If we know they came from a different origin (e.g. localhost), suggest
  // jumping back. This handles "OAuth completed on Railway but you were
  // testing on localhost" cleanly.
  const suggestedFallback = referrerOrigin
    ? `${referrerOrigin}${location.pathname}${location.search}`
    : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center max-w-md px-6">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Oops! Page not found</p>

        {oauthHint === "ok" && (
          <p className="mb-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            Google sign-in completed, but this build doesn't have the page <code className="font-mono">{location.pathname}</code> yet.
            {suggestedFallback && <> The build you came from probably does — see below.</>}
          </p>
        )}

        {suggestedFallback ? (
          <div className="flex flex-col gap-3">
            <a href={suggestedFallback} className="text-primary underline hover:text-primary/90 font-medium">
              Continue at {new URL(suggestedFallback).host}
            </a>
            <a href="/" className="text-sm text-muted-foreground hover:text-foreground">
              Or return to {window.location.host} home
            </a>
          </div>
        ) : (
          <a href="/" className="text-primary underline hover:text-primary/90">
            Return to Home
          </a>
        )}
      </div>
    </div>
  );
};

export default NotFound;
