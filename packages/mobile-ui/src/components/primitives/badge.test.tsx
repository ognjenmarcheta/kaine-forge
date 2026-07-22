import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Badge } from "./badge";

describe("Badge", () => {
  it("renders its children as the badge label", () => {
    render(<Badge>Active</Badge>);

    expect(screen.getByText("Active")).toBeDefined();
  });

  it("applies default appearance classes to container and label", () => {
    render(<Badge>Draft</Badge>);

    const label = screen.getByText("Draft");
    expect(label.className).toContain("text-ds-text-subtle");
    expect(label.parentElement?.className).toContain("bg-ds-bg-neutral");
  });

  it("applies the success appearance to container and label", () => {
    render(<Badge appearance="success">Shipped</Badge>);

    const label = screen.getByText("Shipped");
    expect(label.className).toContain("text-ds-text-success");
    expect(label.parentElement?.className).toContain("bg-ds-bg-success");
  });
});
