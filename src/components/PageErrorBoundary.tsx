/**
 * Page-level error boundary. Wraps the routed Outlet so any render-time
 * crash on a page (a chart with bad data, an undefined deref deep in a
 * card, anything) shows a friendly recovery card instead of an empty
 * white screen + console error.
 *
 * Resets automatically when the user navigates to a different path (the
 * `resetKey` prop changes, remounting the boundary).
 */
import React from "react";
import { AlertTriangle, RefreshCw, Home, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  resetKey: string;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  message:  string;
  stack:    string;
}

export class PageErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "", stack: "" };
  }

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err.message || "Unknown error", stack: err.stack || "" };
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, message: "", stack: "" });
    }
  }

  componentDidCatch(err: Error, info: React.ErrorInfo) {
    // Console + telemetry hook. Production builds minify these names so
    // the message is what we'll mostly have.
    console.error("[PageErrorBoundary]", err, info);
  }

  copyError = () => {
    const text = `${this.state.message}\n\n${this.state.stack}`.trim();
    navigator.clipboard?.writeText(text).catch(() => {/* ignore */});
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center p-6">
          <div className="max-w-md rounded-2xl border border-amber-200 bg-amber-50/40 p-6 text-center">
            <div className="mx-auto h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center mb-3">
              <AlertTriangle className="h-5 w-5 text-amber-700" />
            </div>
            <h2 className="text-[15px] font-semibold mb-1.5">Something broke on this page</h2>
            <p className="text-[12px] text-muted-foreground mb-4">
              The error has been logged. Refreshing usually fixes it. If it keeps happening, ask the AI assistant about it — it can see the same data.
            </p>
            {this.state.message && (
              <pre className="text-[10px] text-left text-muted-foreground/90 font-mono bg-white/70 rounded-md px-2 py-2 mb-4 max-h-48 overflow-auto whitespace-pre-wrap break-words">
                {this.state.message}
                {this.state.stack ? `\n\n${this.state.stack}` : ""}
              </pre>
            )}
            <div className="flex items-center justify-center gap-2">
              <Button size="sm" variant="outline" onClick={this.copyError}>
                <Copy className="h-3 w-3 mr-1.5" /> Copy error
              </Button>
              <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
                <RefreshCw className="h-3 w-3 mr-1.5" /> Reload
              </Button>
              <Button size="sm" onClick={() => { window.location.href = "/"; }}>
                <Home className="h-3 w-3 mr-1.5" /> Dashboard
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
