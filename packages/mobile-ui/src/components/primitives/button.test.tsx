import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import type { View } from "react-native";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./button";
import { motionTest } from "../../test/reanimated.stub";

describe("Button", () => {
  it("preserves refs and press callbacks while animating feedback only for enabled controls", async () => {
    const onPressIn = vi.fn();
    const onPressOut = vi.fn();
    const ref = createRef<View>();
    const { rerender } = render(
      <Button ref={ref} onPressIn={onPressIn} onPressOut={onPressOut}>
        Save
      </Button>
    );
    expect(ref.current).not.toBeNull();
    await waitFor(() => {
      fireEvent.pointerDown(screen.getByRole("button"));
      expect(motionTest.calls.at(-1)?.target).toBe(2);
    });
    fireEvent.pointerUp(screen.getByRole("button"));
    expect(motionTest.calls.at(-1)?.target).toBe(0);
    expect(onPressIn).toHaveBeenCalled();
    expect(onPressOut).toHaveBeenCalledOnce();
    rerender(
      <Button disabled onPressIn={onPressIn}>
        Save
      </Button>
    );
    const calls = motionTest.calls.length;
    fireEvent.pointerDown(screen.getByRole("button"));
    expect(motionTest.calls).toHaveLength(calls);
  });
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
