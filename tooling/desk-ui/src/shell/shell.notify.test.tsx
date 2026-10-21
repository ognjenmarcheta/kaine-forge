import type { IssueSummary } from "@repo/desk/contracts";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RouterProvider } from "./shell.router";
import type { EventSourceLike } from "../api/api.stream";
import { DeskApp } from "../desk.app";
import { LanguageProvider } from "../i18n/i18n.t";
import { DeskProvider } from "../state/desk.provider";
import { fakeApi, makeState, makeSummary } from "../test/test.render";

class Source implements EventSourceLike {
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readonly listeners = new Map<string, (event: MessageEvent<string>) => void>();
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    this.listeners.set(type, listener);
  }
  close(): void {}
  update(summary: IssueSummary): void {
    this.listeners.get("issue-updated")?.(
      new MessageEvent("issue-updated", {
        data: JSON.stringify({ type: "issue-updated", summary })
      })
    );
  }
}

/** The browser's Notification, granted, recording what the page shows. */
const shown: { title: string; body: string | undefined }[] = [];
class FakeNotification {
  static permission: NotificationPermission = "granted";
  static requestPermission = (): Promise<NotificationPermission> => Promise.resolve("granted");
  onclick: (() => void) | null = null;
  constructor(title: string, options?: NotificationOptions) {
    shown.push({ title, body: options?.body });
  }
}

const issue = (
  issueNumber: number,
  stage: "plan-gate" | "build" | "needs-you",
  updatedAt = "2026-03-01T10:00:00.000Z"
): IssueSummary => ({
  ...makeSummary(
    makeState({
      issueNumber,
      stage,
      status: stage === "build" ? "running" : "waiting",
      updatedAt
    })
  ),
  title: `Issue ${String(issueNumber)}`
});

const show = (source: Source) =>
  render(
    <LanguageProvider>
      <RouterProvider>
        <DeskProvider
          api={fakeApi({
            issues: () => Promise.resolve([issue(42, "plan-gate"), issue(44, "build")])
          })}
          createSource={() => source}
        >
          <DeskApp />
        </DeskProvider>
      </RouterProvider>
    </LanguageProvider>
  );

beforeEach(() => {
  shown.length = 0;
  vi.stubGlobal("Notification", FakeNotification);
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("turn notifications and the tab title", () => {
  it("counts your turn in the title and notifies only when an issue newly needs you", async () => {
    window.localStorage.setItem("kaine-desk-notify", "on");
    const source = new Source();
    show(source);
    await screen.findByRole("link", { name: /#42/ });
    await waitFor(() => expect(document.title).toBe("(1) Agent Desk"));
    // Opening the page sets the baseline: the issue that already waits does not notify.
    expect(shown).toEqual([]);

    await waitFor(() => expect(source.listeners.has("issue-updated")).toBe(true));
    act(() => source.update(issue(44, "needs-you", "2026-03-01T11:00:00.000Z")));
    await waitFor(() => expect(document.title).toBe("(2) Agent Desk"));
    expect(shown).toEqual([{ title: "#44 Issue 44", body: "Needs you" }]);

    // A change that keeps the issue in the same place does not notify again.
    act(() => source.update(issue(44, "needs-you", "2026-03-01T12:00:00.000Z")));
    expect(shown).toHaveLength(1);
  });

  it("shows nothing while notifications are off, and drops the count at zero", async () => {
    const source = new Source();
    show(source);
    await screen.findByRole("link", { name: /#42/ });
    await waitFor(() => expect(source.listeners.has("issue-updated")).toBe(true));
    act(() => source.update(issue(44, "needs-you", "2026-03-01T11:00:00.000Z")));
    await waitFor(() => expect(document.title).toBe("(2) Agent Desk"));
    expect(shown).toEqual([]);

    act(() => {
      source.update(issue(42, "build", "2026-03-01T11:00:00.000Z"));
      source.update(issue(44, "build", "2026-03-01T12:00:00.000Z"));
    });
    await waitFor(() => expect(document.title).toBe("Agent Desk"));
  });
});
