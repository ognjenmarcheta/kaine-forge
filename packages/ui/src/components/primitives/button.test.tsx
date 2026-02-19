import { isValidElement } from "react";
import { describe, expect, it } from "vitest";

import { Button } from "./button";

describe("Button", () => {
  it("applies variant classes and forwards props", () => {
    const element = Button({
      children: "Delete",
      className: "custom-class",
      intent: "danger",
      size: "lg",
      type: "button"
    });

    expect(isValidElement(element)).toBe(true);
    expect(element.props.type).toBe("button");
    expect(element.props.className).toContain("ui-button");
    expect(element.props.className).toContain("ui-button--danger");
    expect(element.props.className).toContain("ui-button--lg");
    expect(element.props.className).toContain("custom-class");
  });
});
