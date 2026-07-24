import { describe, expect, it } from "vitest";

import { validateMobileEnv } from "./env.config";

describe("validateMobileEnv", () => {
  it("defaults the API and GraphQL URLs to localhost", () => {
    const env = validateMobileEnv({});
    expect(env.EXPO_PUBLIC_API_URL).toBe("http://localhost:4000");
    expect(env.EXPO_PUBLIC_GRAPHQL_URL).toBe("http://localhost:4000/graphql");
  });

  it("treats a blank URL as unset and applies the default", () => {
    expect(validateMobileEnv({ EXPO_PUBLIC_GRAPHQL_URL: "" }).EXPO_PUBLIC_GRAPHQL_URL).toBe(
      "http://localhost:4000/graphql"
    );
  });

  it("keeps a valid absolute URL", () => {
    expect(
      validateMobileEnv({ EXPO_PUBLIC_API_URL: "https://api.example.com" }).EXPO_PUBLIC_API_URL
    ).toBe("https://api.example.com");
  });

  it("rejects a URL without an http(s) protocol", () => {
    expect(() => validateMobileEnv({ EXPO_PUBLIC_API_URL: "localhost:4000" })).toThrow(
      /EXPO_PUBLIC_API_URL/
    );
  });

  it("passes social providers through and treats blank as unset", () => {
    expect(
      validateMobileEnv({ EXPO_PUBLIC_AUTH_SOCIAL_PROVIDERS: "github,google" })
        .EXPO_PUBLIC_AUTH_SOCIAL_PROVIDERS
    ).toBe("github,google");
    expect(
      validateMobileEnv({ EXPO_PUBLIC_AUTH_SOCIAL_PROVIDERS: "" }).EXPO_PUBLIC_AUTH_SOCIAL_PROVIDERS
    ).toBeUndefined();
  });
});
