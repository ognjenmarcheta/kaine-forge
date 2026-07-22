import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Checkbox } from "./checkbox";

describe("Checkbox", () => {
  it("exposes its checked state through the checkbox role", () => {
    render(<Checkbox checked onCheckedChange={() => undefined} />);

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox.getAttribute("aria-checked")).toBe("true");
    expect(checkbox.className).toContain("bg-ds-bg-brand-bold");
  });

  it("reports the inverted state when pressed", () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox checked={false} onCheckedChange={onCheckedChange} />);

    fireEvent.click(screen.getByRole("checkbox"));

    expect(onCheckedChange).toHaveBeenCalledTimes(1);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("reports unchecking from a checked state", () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox checked onCheckedChange={onCheckedChange} />);

    fireEvent.click(screen.getByRole("checkbox"));

    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });

  it("renders the check indicator only while checked", () => {
    const { rerender } = render(<Checkbox checked={false} onCheckedChange={() => undefined} />);
    expect(screen.getByRole("checkbox").children).toHaveLength(0);

    rerender(<Checkbox checked onCheckedChange={() => undefined} />);
    expect(screen.getByRole("checkbox").children).toHaveLength(1);
  });
});
