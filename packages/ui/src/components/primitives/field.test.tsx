import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Field, FieldDescription, FieldError, FieldLabel } from "./field";

describe("Field", () => {
  it("renders slot attributes and orientation metadata", () => {
    const markup = renderToStaticMarkup(
      <Field orientation="horizontal">
        <FieldLabel htmlFor="title">Title</FieldLabel>
        <input id="title" />
        <FieldDescription>Visible to your team.</FieldDescription>
      </Field>
    );

    expect(markup).toContain('data-slot="field"');
    expect(markup).toContain('data-orientation="horizontal"');
    expect(markup).toContain('data-slot="field-label"');
    expect(markup).toContain('data-slot="field-description"');
    expect(markup).toContain("Visible to your team.");
  });

  it("deduplicates error messages when using errors prop", () => {
    const markup = renderToStaticMarkup(
      <FieldError
        errors={[{ message: "Required" }, { message: "Required" }, { message: "Too short" }]}
      />
    );

    expect(markup).toContain('data-slot="field-error"');
    expect(markup).toContain("Required");
    expect(markup).toContain("Too short");
    expect(markup.match(/Required/g)?.length).toBe(1);
  });
});
