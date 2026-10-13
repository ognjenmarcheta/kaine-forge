import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NOW_TICK_MS, useNow } from "./shell.now";

function Clock({ id }: { readonly id: string }) {
  return <span data-testid={id}>{useNow()}</span>;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useNow", () => {
  it("runs one timer for every reader and stops it when the last one leaves", () => {
    vi.useFakeTimers();
    const start = vi.spyOn(globalThis, "setInterval");
    const stop = vi.spyOn(globalThis, "clearInterval");
    const { unmount } = render(
      <>
        <Clock id="a" />
        <Clock id="b" />
        <Clock id="c" />
      </>
    );
    expect(start).toHaveBeenCalledTimes(1);

    const before = Number(screen.getByTestId("a").textContent);
    act(() => vi.advanceTimersByTime(NOW_TICK_MS));
    const after = Number(screen.getByTestId("a").textContent);
    expect(after - before).toBeGreaterThanOrEqual(NOW_TICK_MS);
    expect(screen.getByTestId("b").textContent).toBe(String(after));
    expect(screen.getByTestId("c").textContent).toBe(String(after));

    unmount();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
