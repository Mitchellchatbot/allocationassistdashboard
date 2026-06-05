import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// ── Chunk-load recovery ──────────────────────────────────────────────────
// When a new build ships, the old index.html cached in the user's browser
// still points at /assets/Foo-OLDHASH.js files that no longer exist on
// the server. serve -s falls back to index.html (HTML), the browser
// strict-MIME-checks the import as JS, and the page silently breaks.
//
// Detect the failure and do one hard reload to fetch the fresh
// index.html. The sessionStorage flag stops an infinite reload loop on
// genuinely broken builds.
const RELOADED_KEY = "aa-chunk-reload-attempted";

function isChunkLoadError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return /Failed to fetch dynamically imported module/i.test(msg)
      || /Importing a module script failed/i.test(msg)
      || /Loading chunk \S+ failed/i.test(msg)
      || /ChunkLoadError/.test(msg);
}

function maybeReload(e: unknown) {
  if (!isChunkLoadError(e)) return;
  if (sessionStorage.getItem(RELOADED_KEY)) return;  // already tried; don't loop
  sessionStorage.setItem(RELOADED_KEY, "1");
  // Tiny delay so the failure surfaces in the console before the reload.
  setTimeout(() => window.location.reload(), 100);
}

window.addEventListener("error", (event) => {
  maybeReload(event.error ?? event.message);
  // Surface the actual error message in the console with FULL stack so
  // even minified prod builds give us something to act on. Without this
  // a recharts crash just dumps a wall of single-letter function names.
  const err = event.error;
  if (err instanceof Error) {
    console.error("[GlobalError]", err.message);
    if (err.stack) console.error("[GlobalError.stack]", err.stack);
  }
});
window.addEventListener("unhandledrejection", (event) => {
  maybeReload(event.reason);
  const r = event.reason;
  const msg = r instanceof Error ? r.message : String(r ?? "");
  // Supabase's GoTrue uses the browser's WebLocks API to serialise auth
  // token refreshes across tabs/iframes. When two tabs or a fresh
  // realtime channel attempt to grab the lock simultaneously, one
  // "steals" it from the other and the loser rejects with this message.
  // It's harmless — auth keeps working — but it dirties the console and
  // tricks Sentry-style watchers into thinking the app is broken. Filter
  // out the noise; preventDefault stops the browser's default warning
  // chrome too.
  if (/Lock\s+"[^"]*sb-[^"]*auth-token[^"]*"\s+was released because another request stole it/i.test(msg)) {
    event.preventDefault();
    return;
  }
  if (r instanceof Error) {
    console.error("[UnhandledRejection]", r.message);
    if (r.stack) console.error("[UnhandledRejection.stack]", r.stack);
  } else {
    console.error("[UnhandledRejection]", r);
  }
});

// Clear the reload flag on a successful first paint so the next deploy
// gets its own one-shot recovery attempt.
window.addEventListener("load", () => {
  setTimeout(() => sessionStorage.removeItem(RELOADED_KEY), 5000);
});

createRoot(document.getElementById("root")!).render(<App />);
