// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MagicLinkSignInForm } from "./magic-link-sign-in-form";

const { send } = vi.hoisted(() => ({
  send: vi.fn<(input: { email: string; returnPath: string }) => Promise<void>>()
}));
vi.mock("../auth.config", () => ({ AUTH_CONFIG: { baseUrl: "", socialProviders: [] } }));
vi.mock("../../../hooks/use-translation", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));
vi.mock("../../../lib/auth-api", () => ({ magicLinkApi: { send } }));

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

async function render(linkFailed: boolean): Promise<void> {
  await act(async () =>
    root.render(<MagicLinkSignInForm linkFailed={linkFailed} returnPath="/notes" />)
  );
}

async function requestLink(email: string): Promise<void> {
  const input = container.querySelector<HTMLInputElement>("#magic-link-email");
  const form = container.querySelector("form");
  if (!input || !form) throw new Error("Missing magic-link form");

  await act(async () => {
    // React tracks the input value; set it through the native setter.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, email);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    form.requestSubmit();
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  send.mockReset();
  send.mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("MagicLinkSignInForm", () => {
  it("explains a used or expired link when the link sent the user back", async () => {
    await render(true);

    expect(container.textContent).toContain("auth.magicLink.invalid");
  });

  it("sends a link that returns to the requested page and says the same for any address", async () => {
    await render(false);

    await requestLink("someone@example.com");

    expect(send).toHaveBeenCalledWith({ email: "someone@example.com", returnPath: "/notes" });
    expect(container.querySelector('[role="status"]')?.textContent).toBe("auth.magicLink.sent");
  });
});
