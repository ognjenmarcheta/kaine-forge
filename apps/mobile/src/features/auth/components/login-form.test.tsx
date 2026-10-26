// @vitest-environment jsdom
/* eslint-disable no-restricted-syntax -- DOM stand-ins exercise native props without requiring a device runtime. */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "./login-form";

interface ContainerProps {
  children?: ReactNode;
}

const signInWithSocial = vi.hoisted(() => vi.fn<(provider: string) => Promise<void>>());

vi.mock("react-native", () => {
  const Container = ({ children }: ContainerProps) => <div>{children}</div>;
  return {
    KeyboardAvoidingView: Container,
    Platform: { OS: "ios" },
    Pressable: Container,
    ScrollView: Container,
    View: Container
  };
});
vi.mock("expo-router", () => ({
  Link: ({ children }: ContainerProps) => <div>{children}</div>,
  useRouter: () => ({ replace: vi.fn() })
}));
vi.mock("@repo/mobile-ui", () => {
  const Container = ({ children }: ContainerProps) => <div>{children}</div>;
  return {
    Button: ({
      children,
      disabled,
      onPress
    }: ContainerProps & { disabled?: boolean; onPress: () => void }) => (
      <button disabled={disabled} onClick={onPress}>
        {children}
      </button>
    ),
    Card: Container,
    CardContent: Container,
    CardDescription: Container,
    CardHeader: Container,
    CardTitle: Container,
    Input: () => <input readOnly />,
    Text: Container
  };
});
vi.mock("../../../components/screen-container", () => ({
  ScreenContainer: ({ children }: ContainerProps) => <div>{children}</div>
}));
vi.mock("../../../components/theme-options", () => ({ ThemeOptions: () => null }));
vi.mock("../../../hooks/use-auth", () => ({ useAuth: () => ({ login: vi.fn() }) }));
vi.mock("../../../hooks/use-translation", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));
vi.mock("../../../lib/auth-api", () => ({ signInWithSocialRequest: signInWithSocial }));
vi.mock("../auth.config", () => ({ AUTH_CONFIG: { socialProviders: ["github"] } }));

let container: HTMLDivElement;
let root: Root;

const socialButtons = (): HTMLButtonElement[] =>
  Array.from(container.querySelectorAll("button")).filter((button) =>
    button.textContent?.startsWith("auth.social.")
  );

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  signInWithSocial.mockReset();
  signInWithSocial.mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<LoginForm />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("Mobile LoginForm social login", () => {
  it("renders a social button for each enabled provider only", () => {
    expect(socialButtons().map((button) => button.textContent)).toEqual(["auth.social.github"]);
  });

  it("starts social sign-in through the shared transport for the pressed provider", async () => {
    const [github] = socialButtons();
    if (!github) throw new Error("Missing GitHub button");

    await act(async () => github.click());

    expect(signInWithSocial).toHaveBeenCalledWith("github");
  });
});
