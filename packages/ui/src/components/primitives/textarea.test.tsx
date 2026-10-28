// @vitest-environment jsdom
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { Textarea } from "./textarea";

describe("Textarea", () => {
  it("renders with ui-textarea class", () => {
    const markup = renderToStaticMarkup(<Textarea placeholder="Enter text" />);
    expect(markup).toContain("<textarea");
    expect(markup).toContain("ui-textarea");
    expect(markup).toContain('placeholder="Enter text"');
  });

  it("hands its ref to the textarea, so a caller can move focus to it", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const ref = createRef<HTMLTextAreaElement>();
    const root = createRoot(document.createElement("div"));

    await act(async () => root.render(<Textarea ref={ref} />));

    expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  });
});
