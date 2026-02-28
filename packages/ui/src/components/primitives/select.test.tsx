import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Select, SelectTrigger, SelectValue } from "./select";

describe("Select", () => {
  it("renders trigger with data-slot and class", () => {
    const markup = renderToStaticMarkup(
      <Select>
        <SelectTrigger className="custom-trigger">
          <SelectValue placeholder="Pick" />
        </SelectTrigger>
      </Select>
    );
    expect(markup).toContain('data-slot="select-trigger"');
    expect(markup).toContain("ui-select__trigger");
    expect(markup).toContain("custom-trigger");
  });
});
