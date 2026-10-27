// @vitest-environment jsdom
import { t } from "@repo/translation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { NotificationBell } from "./components/notification-bell";
import { NotificationPreferences } from "./components/notification-preferences";

const api = vi.hoisted(() => ({
  calls: vi.fn<(operation: string, variables: unknown) => void>(),
  // How the Notifications query answers: a page, an empty `data` object (an
  // API without the field), or a failed request.
  inbox: "page" as "page" | "empty" | "failed"
}));

const INVITATION_PAGE = "invitation page";
const SHELL_CONTENT = "shell content";

const UNREAD_INVITATION = {
  createdAt: "2026-10-27T10:00:00.000Z",
  id: "notification-2",
  organizationId: "org-2",
  payload: {
    __typename: "InvitationReceivedNotification",
    invitationId: "invitation-1",
    inviterName: "Ada",
    organizationName: "Acme",
    role: "admin"
  },
  readAt: null,
  type: "invitation_received"
};
const READ_ROLE_CHANGE = {
  createdAt: "2026-10-26T10:00:00.000Z",
  id: "notification-1",
  organizationId: "org-1",
  payload: { __typename: "RoleChangedNotification", organizationName: "Beta", role: "editor" },
  readAt: "2026-10-26T11:00:00.000Z",
  type: "role_changed"
};

function operationName(document: { toString(): string }): string {
  return /(?:query|mutation) (\w+)/.exec(document.toString())?.[1] ?? "unknown";
}

vi.mock("../../lib/graphql-codegen-fetcher", () => ({
  useGraphqlFetcher: (document: { toString(): string }) => (variables: unknown) => {
    const operation = operationName(document);
    api.calls(operation, variables);

    switch (operation) {
      case "Notifications":
        if (api.inbox === "empty") return Promise.resolve({});
        if (api.inbox === "failed") return Promise.reject(new Error("Unavailable"));
        return Promise.resolve({
          notifications: {
            items: [UNREAD_INVITATION, READ_ROLE_CHANGE],
            pageInfo: { endCursor: "cursor-1", hasNextPage: false },
            unreadCount: 1
          }
        });
      case "NotificationPreferences":
        return Promise.resolve({
          notificationPreferences: [
            { email: false, emailAvailable: false, inApp: true, type: "invitation_received" },
            { email: true, emailAvailable: true, inApp: true, type: "role_changed" }
          ]
        });
      case "MarkNotificationRead":
        return Promise.resolve({ markNotificationRead: { ...UNREAD_INVITATION, readAt: "now" } });
      case "MarkAllNotificationsRead":
        return Promise.resolve({ markAllNotificationsRead: 1 });
      default:
        return Promise.resolve({ updateNotificationPreference: variables });
    }
  }
}));
vi.mock("../../hooks/use-subscription", () => ({ useSubscription: () => undefined }));
vi.mock("../../hooks/use-translation", () => ({
  useTranslation: () => ({ language: "en", t })
}));

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
  api.calls.mockClear();
  api.inbox = "page";
  vi.unstubAllGlobals();
});

async function settleUntil(done: () => boolean) {
  for (let attempt = 0; attempt < 100 && !done(); attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

async function render(element: React.ReactNode) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Routes>
            <Route path="/dashboard" element={element} />
            <Route path="/invitations/:id" element={<p>{INVITATION_PAGE}</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
  );
}

function bell(): HTMLButtonElement | null {
  return container.querySelector("button[aria-haspopup='menu']");
}

// Radix opens a menu from the keyboard; jsdom has no pointer capture.
async function openInbox() {
  await act(async () => {
    bell()?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
  });
  await settleUntil(() => document.querySelector("[role='menu']") !== null);
}

function menuItems(): string[] {
  return Array.from(
    document.querySelectorAll("[role='menuitem']"),
    (item) => item.textContent ?? ""
  );
}

it("names the bell with the unread count and lists translated Notifications", async () => {
  await render(<NotificationBell />);
  await settleUntil(() => bell()?.getAttribute("aria-label") !== "Notifications");

  expect(bell()?.getAttribute("aria-label")).toBe("Notifications, 1 unread");

  await openInbox();

  expect(menuItems()).toEqual([
    expect.stringMatching(/^Ada invited you to join Acme as admin\.Unread/),
    expect.stringMatching(/^Your role in Beta is now “editor”\.Oct 26, 2026/)
  ]);
});

it.each(["empty", "failed"] as const)(
  "keeps the shell rendering when the inbox query answers %s",
  async (inbox) => {
    api.inbox = inbox;
    await render(
      <>
        <NotificationBell />
        <p>{SHELL_CONTENT}</p>
      </>
    );
    await settleUntil(() =>
      api.calls.mock.calls.some(([operation]) => operation === "Notifications")
    );
    await openInbox();

    expect(container.textContent).toContain(SHELL_CONTENT);
    expect(bell()?.getAttribute("aria-label")).toBe("Notifications");
    expect(document.querySelector("[role='alert']")?.textContent).toBe(
      "Notifications could not be loaded."
    );
  }
);

it("marks an Invitation Notification read and opens the Invitation", async () => {
  await render(<NotificationBell />);
  await settleUntil(() => bell()?.getAttribute("aria-label") !== "Notifications");
  await openInbox();

  const invitation = document.querySelector<HTMLElement>("[role='menuitem']");
  await act(async () => invitation?.click());
  await settleUntil(() => container.textContent === INVITATION_PAGE);

  expect(api.calls).toHaveBeenCalledWith("MarkNotificationRead", { id: "notification-2" });
  expect(container.textContent).toBe(INVITATION_PAGE);
});

it("marks every Notification read from the inbox", async () => {
  await render(<NotificationBell />);
  await settleUntil(() => bell()?.getAttribute("aria-label") !== "Notifications");
  await openInbox();

  const markAll = Array.from(document.querySelectorAll("button")).find(
    (button) => button.textContent === "Mark all as read"
  );
  await act(async () => markAll?.click());
  await settleUntil(() =>
    api.calls.mock.calls.some(([operation]) => operation === "MarkAllNotificationsRead")
  );

  expect(api.calls).toHaveBeenCalledWith("MarkAllNotificationsRead", {});
});

it("saves one channel of one type from the preferences", async () => {
  await render(<NotificationPreferences />);
  await settleUntil(() => container.querySelector("#notification-role_changed-email") !== null);

  const email = container.querySelector<HTMLButtonElement>("#notification-role_changed-email");
  await act(async () => email?.click());
  await settleUntil(() =>
    api.calls.mock.calls.some(([operation]) => operation === "UpdateNotificationPreference")
  );

  expect(container.textContent).toContain("Changes to your role");
  // The invitation email always goes out, so that type offers in-app only.
  expect(container.querySelector("#notification-invitation_received-email")).toBeNull();
  expect(container.textContent).toContain("The invitation email always goes to your address.");
  expect(api.calls).toHaveBeenCalledWith("UpdateNotificationPreference", {
    input: { email: false, inApp: true, type: "role_changed" }
  });
});
