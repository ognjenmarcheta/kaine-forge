import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useReducedMotion } from "./use-reduced-motion";

const native = vi.hoisted(() => ({
  read: vi.fn<() => Promise<boolean>>(),
  subscribe: vi.fn<(event: string, listener: (value: boolean) => void) => { remove: () => void }>(),
  remove: vi.fn()
}));
vi.mock("react-native", () => ({
  AccessibilityInfo: {
    isReduceMotionEnabled: native.read,
    addEventListener: native.subscribe
  }
}));

beforeEach(() => {
  native.read.mockReset();
  native.subscribe.mockReset();
  native.remove.mockReset();
  native.subscribe.mockReturnValue({ remove: native.remove });
});

describe("native reduced motion", () => {
  it("does not overwrite a live change with a late initial read", async () => {
    let resolvePreference: (value: boolean) => void = () => {};
    native.read.mockReturnValue(
      new Promise((resolve) => {
        resolvePreference = resolve;
      })
    );
    const { result } = renderHook(useReducedMotion);
    act(() => native.subscribe.mock.calls[0]?.[1](true));
    await act(async () => resolvePreference(false));
    expect(result.current).toBe(true);
  });
  it("starts without motion, reads the preference, follows updates, and unsubscribes", async () => {
    native.read.mockResolvedValue(false);
    const { result, unmount } = renderHook(useReducedMotion);
    expect(result.current).toBe(true);
    await waitFor(() => expect(result.current).toBe(false));
    act(() => native.subscribe.mock.calls[0]?.[1](true));
    expect(result.current).toBe(true);
    unmount();
    expect(native.remove).toHaveBeenCalledOnce();
  });

  it("keeps motion disabled if the platform cannot read the preference", async () => {
    native.read.mockRejectedValue(new Error("Unavailable"));
    const { result } = renderHook(useReducedMotion);
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBe(true);
  });
});
