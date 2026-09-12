import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Dialog, DialogContent, DialogOverlay } from "./dialog";
import { motionTest } from "../../test/reanimated.stub";

const preference = vi.hoisted(() => ({ reduced: false }));
vi.mock("../../hooks/use-reduced-motion", () => ({ useReducedMotion: () => preference.reduced }));
beforeEach(() => {
  preference.reduced = false;
  motionTest.calls.length = 0;
});

describe("native Dialog motion", () => {
  it("keeps content through exit and reopening, then removes it after the current exit", () => {
    const close = vi.fn();
    function fixture(open: boolean) {
      return (
        <Dialog isOpen={open} onClose={close}>
          <DialogOverlay>
            <DialogContent>
              <input aria-label="Draft" defaultValue="Draft" />
            </DialogContent>
          </DialogOverlay>
        </Dialog>
      );
    }
    const { rerender } = render(fixture(true));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Retained" } });
    rerender(fixture(false));
    const previousExit = motionTest.calls.at(-1)?.finish;
    expect(screen.getByDisplayValue("Retained")).toBeTruthy();
    rerender(fixture(true));
    act(() => previousExit?.(true));
    expect(screen.getByDisplayValue("Retained")).toBeTruthy();
    expect(close).not.toHaveBeenCalled();
    rerender(fixture(false));
    act(() => motionTest.calls.at(-1)?.finish?.(true));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("honors animationType none and a live reduced-motion change", () => {
    const { rerender } = render(
      <Dialog isOpen animationType="none" onClose={() => {}}>
        Content
      </Dialog>
    );
    expect(motionTest.calls).toHaveLength(0);
    rerender(
      <Dialog isOpen animationType="slide" onClose={() => {}}>
        Content
      </Dialog>
    );
    expect(motionTest.calls.at(-1)?.target).toBe(1);
    preference.reduced = true;
    rerender(
      <Dialog isOpen={false} animationType="slide" onClose={() => {}}>
        Content
      </Dialog>
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
