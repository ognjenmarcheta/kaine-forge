import { describe, expect, it } from "vitest";

import {
  buildSimpleFormDefaults,
  validateSimpleField,
  type SimpleFieldConfig
} from "./simple-form-config";

describe("buildSimpleFormDefaults", () => {
  it("builds defaults by field type and merges provided values", () => {
    const fields: SimpleFieldConfig[] = [
      { name: "title", type: "text", label: "Title" },
      { name: "description", type: "textarea", label: "Description" },
      { name: "markCompleted", type: "checkbox", label: "Mark as completed" }
    ];

    expect(
      buildSimpleFormDefaults(fields, {
        title: "Draft title"
      })
    ).toEqual({
      title: "Draft title",
      description: "",
      markCompleted: false
    });
  });
});

describe("validateSimpleField", () => {
  it("enforces required text values", () => {
    const field: SimpleFieldConfig = {
      name: "title",
      type: "text",
      label: "Title",
      required: true
    };

    expect(validateSimpleField(field, "", {})).toBe("Title is required");
    expect(validateSimpleField(field, "Todo", {})).toBeUndefined();
  });

  it("enforces required checkbox values", () => {
    const field: SimpleFieldConfig = {
      name: "agree",
      type: "checkbox",
      label: "Agree",
      required: true
    };

    expect(validateSimpleField(field, false, {})).toBe("Agree is required");
    expect(validateSimpleField(field, true, {})).toBeUndefined();
  });

  it("runs custom validator after required check", () => {
    const field: SimpleFieldConfig = {
      name: "title",
      type: "text",
      label: "Title",
      validate: (value) => {
        if (typeof value === "string" && value.length < 3) {
          return "Title is too short";
        }

        return undefined;
      }
    };

    expect(validateSimpleField(field, "Go", {})).toBe("Title is too short");
    expect(validateSimpleField(field, "Ship it", {})).toBeUndefined();
  });
});
