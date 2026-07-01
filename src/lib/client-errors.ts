/**
 * A tiny ring buffer of recent client-side errors, fed by the global
 * error / unhandledrejection handlers in main.tsx. The FeedbackWidget reads it
 * so a bug report can auto-attach the "likely bugs" that just happened on the
 * page — no console-copying by the user.
 *
 * Deliberately dependency-free and side-effect-light so it can be imported from
 * main.tsx before React mounts.
 */

export interface ClientError {
  kind:    "error" | "rejection";
  message: string;
  source?: string;   // file:line if the browser gives us one
  stack?:  string;
  route:   string;   // location.pathname at the time
  time:    number;   // epoch ms
}

const MAX = 15;
const buffer: ClientError[] = [];

/** Record an error. Never throws — a broken logger must not break the app. */
export function recordClientError(e: Omit<ClientError, "time" | "route">): void {
  try {
    buffer.push({
      ...e,
      route: typeof location !== "undefined" ? location.pathname : "",
      time:  Date.now(),
    });
    if (buffer.length > MAX) buffer.splice(0, buffer.length - MAX);
  } catch { /* ignore */ }
}

/**
 * Recent errors, newest last. Defaults to the last 5 minutes and current route
 * so a report only surfaces errors relevant to what the user just did.
 */
export function getRecentErrors(opts: { withinMs?: number; route?: string; limit?: number } = {}): ClientError[] {
  const { withinMs = 5 * 60_000, route, limit = 6 } = opts;
  const cutoff = Date.now() - withinMs;
  return buffer
    .filter(e => e.time >= cutoff && (!route || e.route === route))
    .slice(-limit);
}

/** Total buffered (for a quick "we noticed N errors" hint). */
export function recentErrorCount(opts?: { withinMs?: number; route?: string }): number {
  return getRecentErrors({ ...opts, limit: MAX }).length;
}
