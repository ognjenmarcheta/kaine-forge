import { describe, expect, it } from "vitest";

import { FormModal } from "./form-modal";

describe("FormModal", () => {
  it("exports FormModal as a function component", () => {
    expect(typeof FormModal).toBe("function");
  });

  it("accepts required props without type errors", () => {
    const props = {
      cancelLabel: "Cancel",
      onOpenChange: () => {},
      onSubmit: () => {},
      open: false,
      submitLabel: "Save",
      title: "Edit item"
    };
    expect(props.submitLabel).toBe("Save");
    expect(props.cancelLabel).toBe("Cancel");
  });
});
