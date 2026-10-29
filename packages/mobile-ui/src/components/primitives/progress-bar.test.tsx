import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProgressBar } from "./progress-bar";

describe("ProgressBar", () => {
  it("tells screen readers its name and how far it is", () => {
    render(<ProgressBar accessibilityLabel="Schedule progress" max={10} value={8} />);

    const bar = screen.getByRole("progressbar", { name: "Schedule progress" });
    expect(bar.getAttribute("aria-valuenow")).toBe("8");
    expect(bar.getAttribute("aria-valuemax")).toBe("10");
  });
});
