import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { buildEmailPreviewDoc } from "@/lib/email-preview";

/**
 * Sandboxed email renderer. Drops the rendered body into an <iframe> whose base
 * CSS is the exact send shell (Garamond 17px #1a2332 / line-height 1.55, mail-
 * client link/image/table defaults) — see src/lib/email-preview.ts. Isolation
 * is the whole point: the dashboard's Tailwind can't leak in and repaint the
 * email, so what shows here matches what the recipient gets in Gmail.
 *
 * Auto-sizes to its content by default (re-measures on load + on any reflow via
 * a ResizeObserver on the iframe document), so it behaves like an inline block
 * of email rather than a fixed scroll box. Pass a fixed `height` to opt out.
 */
export function EmailFrame({
  html,
  showImages = true,
  minHeight = 120,
  maxHeight,
  height,
  className,
  style,
  title = "Email preview",
}: {
  /** Rendered email body HTML (tokens already substituted). */
  html: string;
  /** Strip <img> to preview the images-off view. */
  showImages?: boolean;
  /** Floor for the auto-measured height. */
  minHeight?: number;
  /** Cap the auto-measured height; the email scrolls inside the frame past it. */
  maxHeight?: number;
  /** Fixed height (px) — disables auto-sizing when set. */
  height?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
}) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const [measured, setMeasured] = useState(minHeight);
  const srcDoc = useMemo(() => buildEmailPreviewDoc(html, { showImages }), [html, showImages]);
  const auto = height === undefined;

  useEffect(() => {
    if (!auto) return;
    const iframe = ref.current;
    if (!iframe) return;
    const measure = () => {
      const doc = iframe.contentDocument;
      if (!doc?.body) return;
      // scrollHeight of the html element captures margins the body's doesn't.
      let h = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight);
      h = Math.max(minHeight, h);
      if (maxHeight != null) h = Math.min(h, maxHeight);
      setMeasured(prev => (Math.abs(prev - h) > 1 ? h : prev));
    };
    let ro: ResizeObserver | null = null;
    const onLoad = () => {
      measure();
      const doc = iframe.contentDocument;
      if (doc?.body && "ResizeObserver" in window) {
        ro = new ResizeObserver(measure);
        ro.observe(doc.documentElement);
        ro.observe(doc.body);
      }
    };
    iframe.addEventListener("load", onLoad);
    // srcDoc may already be parsed by the time the effect runs.
    if (iframe.contentDocument?.readyState === "complete") onLoad();
    return () => { iframe.removeEventListener("load", onLoad); ro?.disconnect(); };
  }, [srcDoc, auto, minHeight, maxHeight]);

  return (
    <iframe
      ref={ref}
      title={title}
      // Same-origin (so we can measure) but scripts disabled — emails never
      // need JS, and the source is admin-authored. Defense in depth.
      sandbox="allow-same-origin"
      srcDoc={srcDoc}
      className={className}
      style={{ width: "100%", border: 0, background: "#ffffff", height: auto ? measured : height, ...style }}
    />
  );
}
