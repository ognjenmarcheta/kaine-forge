// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PasskeySettings } from "./passkey-settings";

const { auth, passkeyApi } = vi.hoisted(() => ({
  auth: { emailVerified: true },
  passkeyApi: {
    add: vi.fn<(name: string) => Promise<void>>(),
    delete: vi.fn<(passkeyId: string) => Promise<void>>(),
    list: vi.fn<() => Promise<{ createdAt: string; id: string; name: string | null }[]>>()
  }
}));
vi.mock("../../../hooks/use-auth", () => ({
  useAuth: () => ({ session: { user: { emailVerified: auth.emailVerified } } })
}));
vi.mock("../../../hooks/use-translation", () => ({
  useTranslation: () => ({ language: "en", t: (key: string) => key })
}));
vi.mock("../../../lib/auth-api", () => ({ passkeyApi }));
vi.mock("../../auth/auth.util", () => ({ isPasskeySupported: () => true }));

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

async function render(): Promise<void> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <PasskeySettings />
      </QueryClientProvider>
    )
  );
  await act(async () => {
    await Promise.resolve();
  });
}

// The list renders after its query resolves.
function button(text: string): Promise<HTMLButtonElement> {
  return vi.waitFor(() => {
    const found = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === text
    );
    if (!found) throw new Error(`Missing button ${text}`);
    return found;
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  auth.emailVerified = true;
  passkeyApi.delete.mockReset();
  passkeyApi.delete.mockResolvedValue(undefined);
  passkeyApi.list.mockReset();
  passkeyApi.list.mockResolvedValue([
    { id: "passkey-1", name: "Laptop", createdAt: "2026-10-01T10:00:00.000Z" }
  ]);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("PasskeySettings", () => {
  it("deletes a passkey only after the user confirms", async () => {
    await render();

    const deleteButton = await button("auth.passkeys.delete");
    await act(async () => deleteButton.click());

    expect(passkeyApi.delete).not.toHaveBeenCalled();
    expect(container.textContent).toContain("auth.passkeys.deleteConfirm");

    const confirmButton = await button("auth.passkeys.deleteConfirmAction");
    await act(async () => confirmButton.click());

    expect(passkeyApi.delete.mock.calls.map(([passkeyId]) => passkeyId)).toEqual(["passkey-1"]);
  });

  it("offers no new passkey to an account whose email is not confirmed", async () => {
    auth.emailVerified = false;

    await render();

    expect(container.querySelector("#passkey-name")).toBeNull();
    expect(container.textContent).toContain("auth.passkeys.verifyEmail");
  });
});
