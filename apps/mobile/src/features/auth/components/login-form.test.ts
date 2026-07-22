import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const componentDirectory = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(componentDirectory, "login-form.tsx"), "utf8");
const configSource = readFileSync(resolve(componentDirectory, "../auth.config.ts"), "utf8");
const authApiSource = readFileSync(resolve(componentDirectory, "../../../lib/auth-api.ts"), "utf8");

describe("Mobile LoginForm social login contract", () => {
  it("gates social buttons on EXPO_PUBLIC_AUTH_SOCIAL_PROVIDERS", () => {
    expect(configSource).toContain("EXPO_PUBLIC_AUTH_SOCIAL_PROVIDERS");
    expect(configSource).toContain("parseSocialProviders");
    expect(source).toContain("AUTH_CONFIG.socialProviders.map");
  });

  it("starts social sign-in through the shared transport", () => {
    expect(source).toContain("signInWithSocialRequest(provider)");
    expect(authApiSource).toContain("expoClient");
    expect(authApiSource).toContain("signInWithSocial");
  });
});
