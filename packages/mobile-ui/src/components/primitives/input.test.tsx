import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Input } from "./input";

describe("Input", () => {
  it("renders with base field classes and placeholder", () => {
    render(<Input placeholder="Email" onChangeText={() => undefined} />);

    const input = screen.getByPlaceholderText("Email");
    expect(input.className).toContain("rounded-md");
    expect(input.className).toContain("border-ds-border");
  });

  it("forwards typed text through onChangeText", () => {
    const onChangeText = vi.fn();
    render(<Input placeholder="Email" value="" onChangeText={onChangeText} />);

    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "user@test.test" }
    });

    expect(onChangeText).toHaveBeenCalledWith("user@test.test");
  });

  it("lets a custom className win conflicting base classes via cn", () => {
    render(<Input className="px-5" placeholder="Email" onChangeText={() => undefined} />);

    const input = screen.getByPlaceholderText("Email");
    expect(input.className).toContain("px-5");
    expect(input.className).not.toContain("px-3");
  });
});
