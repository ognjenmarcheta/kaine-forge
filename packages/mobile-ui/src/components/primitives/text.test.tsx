import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Text } from "./text";

describe("Text", () => {
  it("defaults to the body variant", () => {
    render(<Text>Plain copy</Text>);

    const text = screen.getByText("Plain copy");
    expect(text.className).toContain("text-base");
    expect(text.className).toContain("text-ds-text");
  });

  it("applies heading variant classes", () => {
    render(<Text variant="heading">Screen title</Text>);

    const text = screen.getByText("Screen title");
    expect(text.className).toContain("text-2xl");
    expect(text.className).toContain("font-semibold");
  });

  it("lets a custom className win conflicting variant classes via cn", () => {
    render(<Text className="text-lg">Resized copy</Text>);

    const text = screen.getByText("Resized copy");
    expect(text.className).toContain("text-lg");
    expect(text.className).not.toContain("text-base");
  });
});
