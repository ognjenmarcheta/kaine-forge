import { act, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useState } from "react";
import { describe, expect, it } from "vitest";

import { DeskApiError } from "./api/api.client";
import type { EventSourceLike } from "./api/api.stream";
import { DeskApp } from "./desk.app";
import { LanguageProvider } from "./i18n/i18n.t";
import { RouterProvider } from "./shell/shell.router";
import { DeskProvider, useDesk, type ActionSettled } from "./state/desk.provider";
import { fakeApi, makeState, makeSummary, renderDesk } from "./test/test.render";

describe("DeskApp session states", () => {
  it("tells the engineer to reload the page when the server answers 401", async () => {
    renderDesk(
      <DeskApp />,
      fakeApi({ issues: () => Promise.reject(new DeskApiError("unauthorized", 401, null)) })
    );
    expect(await screen.findByRole("heading", { name: "Session missing or expired" })).toBeTruthy();
    expect(screen.getByText("Reload this page to start a new local session.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Issues" })).toBeNull();
  });

  it("offers a retry when the server cannot be reached", async () => {
    renderDesk(
      <DeskApp />,
      fakeApi({ issues: () => Promise.reject(new DeskApiError("network", 0, null)) })
    );
    expect(await screen.findByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("shows the board once the issues load", async () => {
    renderDesk(
      <DeskApp />,
      fakeApi({
        issues: () =>
          Promise.resolve([makeSummary(makeState({ issueNumber: 42, stage: "plan-gate" }))])
      })
    );
    expect(await screen.findByRole("heading", { name: "Issues" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: /^Waiting for you/, level: 2 })).toBeTruthy();
    expect(screen.getByRole("link", { name: /#42/ })).toBeTruthy();
  });
});

class Source implements EventSourceLike {
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readonly listeners = new Map<string, (event: MessageEvent<string>) => void>();
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    this.listeners.set(type, listener);
  }
  close(): void {}
}

describe("DeskProvider actions", () => {
  it("settles an accepted action when its result event arrives", async () => {
    const source = new Source();
    let settled: ActionSettled | null = null;
    function Probe() {
      const { act: send, state } = useDesk();
      const [started, setStarted] = useState(false);
      useEffect(() => {
        if (state.session === "ready" && !started) {
          setStarted(true);
          void send(7, { action: "approve" }).then((value) => {
            settled = value;
          });
        }
      }, [send, started, state.session]);
      return null;
    }
    render(
      <LanguageProvider>
        <RouterProvider>
          <DeskProvider
            api={fakeApi({
              act: () => Promise.resolve({ status: "accepted", action: "approve", issueNumber: 7 })
            })}
            createSource={() => source}
          >
            <Probe />
          </DeskProvider>
        </RouterProvider>
      </LanguageProvider>
    );
    await waitFor(() => expect(source.listeners.has("action-result")).toBe(true));
    await Promise.resolve();
    expect(settled).toBeNull();

    act(() => {
      source.listeners.get("action-result")?.(
        new MessageEvent("action-result", {
          data: JSON.stringify({
            type: "action-result",
            issueNumber: 7,
            action: "approve",
            outcome: { stop: "gate", stage: "pr-review", message: null },
            error: null
          })
        })
      );
    });
    await waitFor(() =>
      expect(settled).toEqual({
        kind: "done",
        outcome: { stop: "gate", stage: "pr-review", message: null }
      })
    );
  });
});
