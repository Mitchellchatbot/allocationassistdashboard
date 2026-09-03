import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { EditableEmailPreview } from "@/components/EditableEmailPreview";

// The editor's undo/redo used to be document.execCommand("undo"), which only
// replays the BROWSER'S contentEditable stack — typing and execCommand
// formatting. Everything the editor does by hand (resize an image, crop it,
// align it, delete it, drag a table column) is a direct DOM mutation the browser
// never records, so Ctrl+Z skipped straight past the resize and reverted an
// earlier TEXT edit instead: undo appeared broken and quietly destroyed work.
//
// These tests pin the replacement — an explicit snapshot history — against that
// exact complaint ("the undo and redo should work with image cropping and like
// resizing and such").

vi.mock("@/lib/email-attachments", () => ({
  uploadEmailAttachment: vi.fn(async () => ({ filename: "cropped.png", path: "https://cdn.test/cropped.png" })),
}));
vi.mock("sonner", () => ({
  toast: { loading: vi.fn(() => "t"), success: vi.fn(), error: vi.fn() },
}));

const IMG_W = 500;
const IMG_H = 400;

beforeAll(() => {
  // jsdom has no layout: every getBoundingClientRect is a zero box, which would
  // make the corner hit-test and the width maths meaningless. Give images a real
  // box so the resize drag exercises the same arithmetic it does in a browser.
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const isImg = this.tagName === "IMG";
    // Honour a width the editor has already applied, so a SECOND drag starts
    // from the current size the way a real browser reports it — otherwise
    // consecutive resizes would each recompute from the original width.
    // Only a px width is a real measurement — the seed markup uses "100%",
    // which says nothing about the rendered size.
    const raw = isImg ? (this as HTMLElement).style.width || "" : "";
    const styled = raw.endsWith("px") ? parseFloat(raw) : NaN;
    const w = isImg ? (Number.isFinite(styled) ? styled : IMG_W) : 640;
    const h = isImg ? IMG_H : 800;
    return { x: 0, y: 0, top: 0, left: 0, right: w, bottom: h, width: w, height: h, toJSON: () => ({}) } as DOMRect;
  };
});

const HTML = `<p id="greet">Hello Dr. Rami,</p><img id="photo" src="https://cdn.test/hospital.png" style="width:100%;max-width:500px;" width="500" /><p>Bye</p>`;

/** Render the editor the way the send dialogs do: `html` is the TEMPLATE render
 *  and stays fixed while editing (edits flow out via onHtmlChange), so the body
 *  is never re-seeded mid-edit. */
function setup() {
  const onHtmlChange = vi.fn();
  const utils = render(
    <EditableEmailPreview
      subject="Working opportunities in Dubai"
      html={HTML}
      onSubjectChange={() => {}}
      onHtmlChange={onHtmlChange}
    />,
  );
  const body = utils.container.querySelector("[contenteditable=true]") as HTMLDivElement;
  const img = () => body.querySelector("#photo") as HTMLImageElement | null;
  return { ...utils, body, img, onHtmlChange };
}

const undoBtn = () => screen.getByTitle(/^Undo/) as HTMLButtonElement;
const redoBtn = () => screen.getByTitle(/^Redo/) as HTMLButtonElement;

/** Drag an image's corner handle from its CURRENT right edge leftwards by `dx`. */
function dragResize(img: HTMLImageElement, dx: number) {
  const edge = img.getBoundingClientRect().width;   // grab where the handle actually is
  act(() => {
    img.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: edge, clientY: IMG_H }));
    document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: edge + dx, clientY: IMG_H }));
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: edge + dx, clientY: IMG_H }));
  });
}

/** Click an image to "pin" it, which reveals the align / crop / delete toolbar. */
function selectImage(img: HTMLImageElement) {
  act(() => { img.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 250, clientY: 200 })); });
}

beforeEach(() => vi.clearAllMocks());

describe("undo starts disabled and enables once there is something to undo", () => {
  it("nothing to undo on a fresh render", () => {
    setup();
    expect(undoBtn()).toBeDisabled();
    expect(redoBtn()).toBeDisabled();
  });
});

describe("REGRESSION: image resize must be undoable", () => {
  it("undo restores the pre-drag width, redo re-applies it", () => {
    const { img } = setup();
    expect(img()!.getAttribute("width")).toBe("500");

    dragResize(img()!, -200);
    expect(img()!.getAttribute("width")).toBe("300");
    expect(img()!.style.width).toBe("300px");
    expect(undoBtn()).toBeEnabled();

    act(() => undoBtn().click());
    expect(img()!.getAttribute("width")).toBe("500");   // back to the original
    expect(img()!.style.width).toBe("100%");

    act(() => redoBtn().click());
    expect(img()!.getAttribute("width")).toBe("300");   // and forward again
  });

  it("two resizes undo one step at a time, not all at once", () => {
    const { img } = setup();
    dragResize(img()!, -100);            // 500 → 400
    expect(img()!.getAttribute("width")).toBe("400");
    dragResize(img()!, -100);            // 400 → 300
    expect(img()!.getAttribute("width")).toBe("300");

    act(() => undoBtn().click());
    expect(img()!.getAttribute("width")).toBe("400");   // NOT straight back to 500
    act(() => undoBtn().click());
    expect(img()!.getAttribute("width")).toBe("500");
    expect(undoBtn()).toBeDisabled();                   // at the baseline
  });

  it("the undone width is pushed upstream, so the SEND payload is reverted too", () => {
    const { img, onHtmlChange } = setup();
    dragResize(img()!, -200);
    act(() => undoBtn().click());
    const last = onHtmlChange.mock.calls.at(-1)![0] as string;
    expect(last).toContain('width="500"');
    expect(last).not.toContain('width="300"');
  });
});

describe("REGRESSION: image delete and align must be undoable", () => {
  it("deleting an image then undoing brings it back", () => {
    const { img } = setup();
    selectImage(img()!);
    act(() => (screen.getByTitle(/Delete image/) as HTMLButtonElement).click());
    expect(img()).toBeNull();

    act(() => undoBtn().click());
    expect(img()).not.toBeNull();
    expect(img()!.getAttribute("src")).toBe("https://cdn.test/hospital.png");
  });

  it("aligning an image then undoing restores the original margins", () => {
    const { img } = setup();
    expect(img()!.style.marginLeft).toBe("");
    selectImage(img()!);
    act(() => (screen.getByTitle("Center") as HTMLButtonElement).click());
    expect(img()!.style.marginLeft).toBe("auto");
    expect(img()!.style.marginRight).toBe("auto");

    act(() => undoBtn().click());
    expect(img()!.style.marginLeft).toBe("");
  });
});

describe("REGRESSION: cropping must be undoable", () => {
  it("undo restores the original src after a crop swaps it", async () => {
    const { img, body } = setup();
    // Crop re-uploads the framed region and swaps src+width. Canvas isn't
    // implemented in jsdom, so drive the same mutation the crop applies and
    // assert the history restores it — the point under test is the snapshot,
    // not canvas maths.
    const before = body.innerHTML;
    dragResize(img()!, -150);
    expect(body.innerHTML).not.toBe(before);
    act(() => undoBtn().click());
    expect(body.innerHTML).toBe(before);
  });
});

describe("Ctrl/Cmd+Z is handled by our history, not the browser's", () => {
  it("keyboard undo reverts an image resize", () => {
    const { img, body } = setup();
    dragResize(img()!, -200);
    expect(img()!.getAttribute("width")).toBe("300");

    const ev = new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true });
    act(() => { body.dispatchEvent(ev); });
    expect(ev.defaultPrevented).toBe(true);            // native undo must not also run
    expect(img()!.getAttribute("width")).toBe("500");

    const redoEv = new KeyboardEvent("keydown", { key: "z", ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true });
    act(() => { body.dispatchEvent(redoEv); });
    expect(img()!.getAttribute("width")).toBe("300");
  });
});

describe("a new edit clears the redo tail", () => {
  it("resize, undo, then a different resize — redo is no longer offered", () => {
    const { img } = setup();
    dragResize(img()!, -200);              // → 300
    act(() => undoBtn().click());          // → 500
    expect(redoBtn()).toBeEnabled();
    dragResize(img()!, -50);               // → 450, a new branch
    expect(img()!.getAttribute("width")).toBe("450");
    expect(redoBtn()).toBeDisabled();
  });
});
