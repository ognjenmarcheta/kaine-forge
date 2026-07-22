import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const componentDirectory = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(componentDirectory, "login-form.tsx"), "utf8");
const configSource = readFileSync(resolve(componentDirectory, "../auth.config.ts"), "utf8");

describe("LoginForm social login contract", () => {
  it("renders social buttons only for env-enabled providers", () => {
    expect(source).toContain("AUTH_CONFIG.socialProviders.map");
    expect(configSource).toContain(
      "parseSocialProviders(import.meta.env.VITE_AUTH_SOCIAL_PROVIDERS)"
    );
  });

  it("delegates social sign-in through the shared auth transport", () => {
    expect(source).toContain("signInWithSocialRequest(provider)");
  });

  it("labels social buttons through the auth translation namespace", () => {
    expect(source).toContain('"auth.social.github"');
    expect(source).toContain('"auth.social.google"');
  });

  it("uses shared auth form validators from @repo/auth/form", () => {
    expect(source).toContain('from "@repo/auth/form"');
    expect(source).toContain("validateAuthEmail");
    expect(source).toContain("validateAuthPasswordRequired");
  });
});
