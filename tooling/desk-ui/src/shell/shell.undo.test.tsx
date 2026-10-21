import type { ActionRequestInput } from "@repo/desk/contracts";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Shell } from "./shell.layout";
import { UNDO_WINDOW_MS } from "./shell.undo";
import { createDeskApi, type FetchLike } from "../api/api.client";
import { useIssueActions } from "../gates/gate.actions";
import { renderDesk } from "../test/test.render";

const reply = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });

/** The real client over a fake network: the issue list is empty, every action is accepted. */
const network = () =>
  vi.fn<FetchLike>((url) =>
    Promise.resolve(
      url === "/api/issues"
        ? reply({ issues: [] })
        : reply({ status: "accepted", action: "approve", issueNumber: 7 })
    )
  );

/** Approves issue #7 the way the gate panel does, once it mounts. */
function ApproveOnMount({ request }: { readonly request: ActionRequestInput }) {
  const { run } = useIssueActions(7, false);
  useEffect(() => {
    void run(request);
  }, [run, request]);
  return null;
}

const APPROVE = { action: "approve" } as const;

const startApprove = async (fetchSpy: ReturnType<typeof network>): Promise<void> => {
  renderDesk(
    <Shell>
      <ApproveOnMount request={APPROVE} />
    </Shell>,
    createDeskApi(fetchSpy)
  );
  expect(await screen.findByText("#7 · The plan will be approved.")).toBeTruthy();
};

const actionPosts = (fetchSpy: ReturnType<typeof network>) =>
  fetchSpy.mock.calls.filter(([url]) => url === "/api/issues/7/actions");

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("runUndoable through the issue actions", () => {
  it("sends nothing during the undo window, then sends the action once", async () => {
    const fetchSpy = network();
    await startApprove(fetchSpy);
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS - 100));
    expect(actionPosts(fetchSpy)).toEqual([]);
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(actionPosts(fetchSpy)).toHaveLength(1);
    expect(actionPosts(fetchSpy)[0]?.[1]?.keepalive).toBeUndefined();
  });

  it("drops the action on Undo, says so, and never sends it", async () => {
    const fetchSpy = network();
    await startApprove(fetchSpy);
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByText("Undone. Nothing ran.")).toBeTruthy();
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS * 2));
    expect(actionPosts(fetchSpy)).toEqual([]);
  });

  it("sends a waiting action at once with keepalive when the page closes", async () => {
    const fetchSpy = network();
    await startApprove(fetchSpy);
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    const posts = actionPosts(fetchSpy);
    expect(posts).toHaveLength(1);
    expect(posts[0]?.[1]).toMatchObject({ method: "POST", keepalive: true });
    // The timer of the window is gone: the action is not sent a second time.
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS * 2));
    expect(actionPosts(fetchSpy)).toHaveLength(1);
  });
});
