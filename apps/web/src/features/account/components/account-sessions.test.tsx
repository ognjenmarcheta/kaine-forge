// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { AccountSessions } from "./account-sessions";

const api = vi.hoisted(() => ({
  listSessions: vi.fn(() =>
    Promise.resolve([
      {
        createdAt: "2026-10-01T10:00:00Z",
        current: true,
        id: "s-1",
        ipAddress: null,
        userAgent: "This"
      },
      {
        createdAt: "2026-10-02T10:00:00Z",
        current: false,
        id: "s-2",
        ipAddress: null,
        userAgent: "Other"
      }
    ])
  ),
  revokeOtherSessions: vi.fn(() => Promise.resolve()),
  revokeSession: vi.fn(() => Promise.resolve())
}));

vi.mock("../../../lib/auth-api", () => ({ accountApi: api }));
vi.mock("../../../hooks/use-translation", () => ({
  useTranslation: () => ({ language: "en", t: (key: string) => key })
}));

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <AccountSessions />
      </QueryClientProvider>
    )
  );
  // Let the session list resolve.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function button(scope: ParentNode, label: string) {
  return Array.from(scope.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent === label
  );
}

it.each([
  { action: "auth.account.sessions.revoke", call: api.revokeSession, args: ["s-2"] },
  { action: "auth.account.sessions.revokeOthers", call: api.revokeOtherSessions, args: [] }
])("signs out with $action only after the confirm", async ({ action, args, call }) => {
  await act(async () => button(container, action)?.click());

  const dialog = document.querySelector("[role='dialog']");
  expect(dialog).not.toBeNull();
  expect(call).not.toHaveBeenCalled();

  await act(async () => (dialog ? button(dialog, action)?.click() : undefined));

  expect(call).toHaveBeenCalledWith(...args);
});

it("signs out no device when the confirm is cancelled", async () => {
  await act(async () => button(container, "auth.account.sessions.revoke")?.click());
  const dialog = document.querySelector("[role='dialog']");
  expect(dialog).not.toBeNull();
  await act(async () => (dialog ? button(dialog, "button.cancel")?.click() : undefined));

  expect(document.querySelector("[role='dialog']")).toBeNull();
  expect(api.revokeSession).not.toHaveBeenCalled();
});
