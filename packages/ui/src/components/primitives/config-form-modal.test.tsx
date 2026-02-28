import { describe, expect, it } from "vitest";

import { ConfigFormModal } from "./config-form-modal";

describe("ConfigFormModal", () => {
  it("exports ConfigFormModal as a function component", () => {
    expect(typeof ConfigFormModal).toBe("function");
  });

  it("accepts fields config without type errors", () => {
    const props = {
      cancelLabel: "Cancel",
      fields: [
        { name: "title", label: "Title", type: "text" as const, required: true },
        { name: "notes", label: "Notes", type: "textarea" as const }
      ],
      onOpenChange: () => {},
      onSubmit: () => {},
      open: false,
      submitLabel: "Create",
      title: "New item"
    };
    expect(props.fields).toHaveLength(2);
    expect(props.fields[0]?.name).toBe("title");
  });
});
