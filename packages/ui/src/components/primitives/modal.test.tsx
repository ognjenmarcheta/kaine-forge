import { describe, expect, it } from "vitest";

import { resolveModalSizeClass } from "./modal";

describe("resolveModalSizeClass", () => {
  it("returns expected class for configured sizes", () => {
    expect(resolveModalSizeClass("sm")).toBe("ui-modal__content--sm");
    expect(resolveModalSizeClass("md")).toBe("ui-modal__content--md");
    expect(resolveModalSizeClass("lg")).toBe("ui-modal__content--lg");
    expect(resolveModalSizeClass("xl")).toBe("ui-modal__content--xl");
    expect(resolveModalSizeClass("full")).toBe("ui-modal__content--full");
  });

  it("falls back to md when size is omitted", () => {
    expect(resolveModalSizeClass()).toBe("ui-modal__content--md");
  });
});
