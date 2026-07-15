import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { buildAaCvHtml, type AaCvData } from "@/lib/aa-cv-template";
import { splitCvHtml } from "@/lib/aa-cv-data";

export interface EditableCvHandle {
  /** The CV HTML as it stands now — including the user's inline edits. */
  getHtml: () => string;
  /** Discard inline edits and re-render from the current data. */
  reset: () => void;
}

/**
 * A branded AA CV rendered into a directly-editable surface (contentEditable) so
 * the team can tweak wording before download / attach / link. The `<style>` is
 * kept OUTSIDE the editable node so a stray edit can't delete it, while
 * getHtml() ships both style + edited body to html2pdf. Remounts whenever `data`
 * changes (a fresh conversion) so the surface never shows stale edits.
 *
 * `data` MUST be a stable reference between renders (a useState value) — pass a
 * new object only when the CV actually changes.
 */
export const EditableCvSurface = forwardRef<EditableCvHandle, { data: AaCvData; className?: string }>(
  function EditableCvSurface({ data, className }, ref) {
    const [ver, setVer] = useState(0);
    const previewRef = useRef<HTMLDivElement>(null);
    const [styleBlock, bodyBlock] = useMemo(() => splitCvHtml(buildAaCvHtml(data)), [data]);

    // A new render (fresh conversion / doctor change) remounts the editable node
    // so it shows the new content instead of the previously-edited DOM. Skips the
    // very first run so we don't double-mount on initial render.
    const mounted = useRef(false);
    useEffect(() => {
      if (mounted.current) setVer(v => v + 1);
      else mounted.current = true;
    }, [bodyBlock]);

    useImperativeHandle(ref, () => ({
      getHtml: () => styleBlock + (previewRef.current?.innerHTML || bodyBlock),
      reset: () => setVer(v => v + 1),
    }), [styleBlock, bodyBlock]);

    return (
      <>
        {/* styles applied once, kept out of the editable node */}
        <div dangerouslySetInnerHTML={{ __html: styleBlock }} />
        <div
          key={ver}
          ref={previewRef}
          contentEditable
          suppressContentEditableWarning
          className={className ?? "outline-none"}
          dangerouslySetInnerHTML={{ __html: bodyBlock }}
        />
      </>
    );
  },
);
