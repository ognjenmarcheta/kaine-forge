import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./button";

describe("Button", () => {
  it("renders string children as styled button text", () => {
    render(<Button onPress={() => undefined}>Save</Button>);

    const button = screen.getByRole("button");
    expect(button.textContent).toBe("Save");
    expect(button.className).toContain("bg-ds-bg-brand-bold");
    expect(button.className).toContain("px-4");
  });

  it("fires onPress when pressed", () => {
    const onPress = vi.fn();
    render(<Button onPress={onPress}>Save</Button>);

    fireEvent.click(screen.getByRole("button"));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("ignores presses and applies disabled styling when disabled", () => {
    const onPress = vi.fn();
    render(
      <Button disabled onPress={onPress}>
        Save
      </Button>
    );

    const button = screen.getByRole("button");
    fireEvent.click(button);

    expect(onPress).not.toHaveBeenCalled();
    expect(button.className).toContain("bg-ds-bg-neutral");
  });

  it("applies appearance and spacing variant classes to button and label", () => {
    render(
      <Button appearance="danger" spacing="compact" onPress={() => undefined}>
        Delete
      </Button>
    );

    const button = screen.getByRole("button");
    const label = screen.getByText("Delete");
    expect(button.className).toContain("bg-ds-bg-danger-bold");
    expect(button.className).toContain("px-3");
    expect(label.className).toContain("text-ds-text-inverse");
    expect(label.className).toContain("text-sm");
  });
});
