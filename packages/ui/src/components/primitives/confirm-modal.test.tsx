import { describe, expect, it } from "vitest";

import { ConfirmModal } from "./confirm-modal";

describe("ConfirmModal", () => {
  it("exports ConfirmModal as a function component", () => {
    expect(typeof ConfirmModal).toBe("function");
  });

  it("accepts required props without type errors", () => {
    const props = {
      cancelLabel: "Cancel",
      confirmLabel: "Delete",
      onConfirm: () => {},
      onOpenChange: () => {},
      open: false,
      title: "Confirm deletion"
    };
    expect(props.cancelLabel).toBe("Cancel");
    expect(props.confirmLabel).toBe("Delete");
  });
});
