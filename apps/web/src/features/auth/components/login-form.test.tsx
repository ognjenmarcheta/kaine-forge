// @vitest-environment jsdom
import { AuthRequestError, TWO_FACTOR_REQUIRED } from "@repo/auth/transport";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "./login-form";

const { login, signInWithSocial } = vi.hoisted(() => ({
  login: vi.fn<(input: { email: string; password: string }) => Promise<void>>(),
  signInWithSocial: vi.fn<(provider: string) => Promise<void>>()
}));
// Only GitHub is enabled, so the Google button must not render.
vi.mock("../auth.config", () => ({
  AUTH_CONFIG: { baseUrl: "", socialProviders: ["github"] }
}));
vi.mock("../../../hooks/use-auth", () => ({ useAuth: () => ({ login }) }));
vi.mock("../../../hooks/use-translation", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));
vi.mock("../../../lib/auth-api", () => ({ signInWithSocialRequest: signInWithSocial }));

const onDone = vi.fn();
const onTwoFactorRequired = vi.fn();
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

const socialButtons = (): HTMLButtonElement[] =>
  Array.from(container.querySelectorAll("button")).filter((button) => button.type === "button");

const form = (): HTMLFormElement => {
  const element = container.querySelector("form");
  if (!element) throw new Error("Missing login form");
  return element;
};

const submit = async (): Promise<void> => {
  await act(async () => {
    form().requestSubmit();
  });
  // The form library validates and calls onSubmit on a later microtask.
  await act(async () => {
    await Promise.resolve();
  });
};

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  login.mockReset();
  login.mockResolvedValue(undefined);
  signInWithSocial.mockReset();
  signInWithSocial.mockResolvedValue(undefined);
  onDone.mockClear();
  onTwoFactorRequired.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(<LoginForm onDone={onDone} onTwoFactorRequired={onTwoFactorRequired} />)
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("LoginForm", () => {
  it("renders a social button for each enabled provider only", () => {
    expect(socialButtons().map((button) => button.textContent)).toEqual(["auth.social.github"]);
  });

  it("starts social sign-in through the auth transport for the clicked provider", async () => {
    const [github] = socialButtons();
    if (!github) throw new Error("Missing GitHub button");

    await act(async () => github.click());

    expect(signInWithSocial).toHaveBeenCalledWith("github");
  });

  it("logs in with the form values and reports completion", async () => {
    await submit();

    expect(login).toHaveBeenCalledWith({ email: "test@test.test", password: "ChangeMe123!" });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("hands off to the two-factor step instead of failing when a second factor is required", async () => {
    login.mockRejectedValue(
      new AuthRequestError({ code: TWO_FACTOR_REQUIRED, status: 200, twoFactorMethods: ["totp"] })
    );

    await submit();

    expect(onTwoFactorRequired).toHaveBeenCalledWith(["totp"]);
    expect(onDone).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("error.generic");
  });

  it("shows the message for the server error code", async () => {
    login.mockRejectedValue(
      new AuthRequestError({ code: "INVALID_EMAIL_OR_PASSWORD", status: 401 })
    );

    await submit();

    expect(container.textContent).toContain("auth.error.invalidCredentials");
  });

  it("shows the generic error and stays open when login fails", async () => {
    login.mockRejectedValue(new Error("invalid credentials"));

    await submit();

    expect(container.textContent).toContain("error.generic");
    expect(onDone).not.toHaveBeenCalled();
  });
});
