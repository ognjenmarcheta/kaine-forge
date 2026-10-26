// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TwoFactorChallenge } from "./two-factor-challenge";

const { completeSignIn, verify } = vi.hoisted(() => ({
  completeSignIn: vi.fn(async (signIn: () => Promise<unknown>) => {
    await signIn();
  }),
  verify: vi.fn(async () => ({}))
}));
vi.mock("../../../hooks/use-auth", () => ({ useAuth: () => ({ completeSignIn }) }));
vi.mock("../../../hooks/use-translation", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));
vi.mock("../../../lib/auth-api", () => ({
  twoFactorApi: { sendOtp: vi.fn(), verify }
}));

const onDone = vi.fn();
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

function buttonByText(text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (element) => element.textContent === text
  );
  if (!button) throw new Error(`Missing button ${text}`);
  return button;
}

function typeCode(value: string): void {
  const input = container.querySelector<HTMLInputElement>("#two-factor-code");
  if (!input) throw new Error("Missing code input");
  // React tracks the value through the native setter; assigning .value alone is ignored.
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // jsdom has no ResizeObserver; the Radix checkbox measures itself with one.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      disconnect(): void {}
      observe(): void {}
      unobserve(): void {}
    }
  );
  verify.mockClear();
  onDone.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<TwoFactorChallenge methods={["totp"]} onDone={onDone} />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("TwoFactorChallenge", () => {
  it("verifies the code with the selected method and finishes sign-in", async () => {
    await act(async () => buttonByText("auth.twoFactor.method.backup").click());
    await act(async () => typeCode(" abcde-12345 "));
    await act(async () => buttonByText("auth.twoFactor.verify").click());

    expect(verify).toHaveBeenCalledWith({
      code: "abcde-12345",
      method: "backup",
      trustDevice: false
    });
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("asks for a code instead of calling the server with an empty one", async () => {
    await act(async () => buttonByText("auth.twoFactor.verify").click());

    expect(verify).not.toHaveBeenCalled();
    expect(container.textContent).toContain("auth.form.error.codeRequired");
  });
});
