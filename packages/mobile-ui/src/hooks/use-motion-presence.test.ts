import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useMotionPresence } from "./use-motion-presence";
import { motionTest } from "../test/reanimated.stub";

beforeEach(() => {
  motionTest.calls.length = 0;
  motionTest.cancelled = 0;
});

describe("native motion presence", () => {
  it("waits for exit, ignores stale completion after reopening, and exits on the next close", () => {
    const { result, rerender } = renderHook(({ open }) => useMotionPresence(open, false), {
      initialProps: { open: true }
    });
    rerender({ open: false });
    expect(result.current.visible).toBe(true);
    const stale = motionTest.calls.at(-1)?.finish;
    rerender({ open: true });
    act(() => stale?.(true));
    expect(result.current.visible).toBe(true);
    rerender({ open: false });
    act(() => motionTest.calls.at(-1)?.finish?.(true));
    expect(result.current.visible).toBe(false);
    expect(motionTest.cancelled).toBeGreaterThan(0);
  });

  it("settles a running exit immediately when reduced motion becomes enabled", () => {
    const { result, rerender } = renderHook(
      ({ open, immediate }) => useMotionPresence(open, immediate),
      { initialProps: { open: true, immediate: false } }
    );
    rerender({ open: false, immediate: false });
    expect(result.current.visible).toBe(true);
    rerender({ open: false, immediate: true });
    expect(result.current.visible).toBe(false);
    expect(result.current.progress.value).toBe(0);
  });
});
