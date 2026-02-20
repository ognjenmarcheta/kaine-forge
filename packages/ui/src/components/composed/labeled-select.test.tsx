import { describe, expect, it, vi } from "vitest";

import {
  ACTION_ITEM_VALUE,
  applyLabeledSelectChange,
  resolveSelectDisplayValue
} from "./labeled-select";

describe("labeled-select", () => {
  it("triggers action and does not propagate selectable value when action item is chosen", () => {
    const onActionSelect = vi.fn();
    const onValueChange = vi.fn();

    applyLabeledSelectChange({
      actionItem: {
        label: "Create organization",
        onSelect: onActionSelect
      },
      nextValue: ACTION_ITEM_VALUE,
      onValueChange
    });

    expect(onActionSelect).toHaveBeenCalledTimes(1);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("propagates selected value for standard options", () => {
    const onActionSelect = vi.fn();
    const onValueChange = vi.fn();

    applyLabeledSelectChange({
      actionItem: {
        label: "Create organization",
        onSelect: onActionSelect
      },
      nextValue: "org-2",
      onValueChange
    });

    expect(onValueChange).toHaveBeenCalledWith("org-2");
    expect(onActionSelect).not.toHaveBeenCalled();
  });

  it("normalizes empty values to undefined for select placeholder support", () => {
    expect(resolveSelectDisplayValue("org-1")).toBe("org-1");
    expect(resolveSelectDisplayValue("")).toBeUndefined();
  });
});
