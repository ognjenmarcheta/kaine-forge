import { describe, expect, it } from "vitest";

import { validateWebEnv } from "./env.config";

describe("validateWebEnv", () => {
  it("defaults VITE_GRAPHQL_URL to the same-origin path", () => {
    expect(validateWebEnv({}).VITE_GRAPHQL_URL).toBe("/graphql");
  });

  it("treats a blank VITE_GRAPHQL_URL as unset and applies the default", () => {
    expect(validateWebEnv({ VITE_GRAPHQL_URL: "" }).VITE_GRAPHQL_URL).toBe("/graphql");
  });

  it("keeps a valid absolute graphql url", () => {
    expect(
      validateWebEnv({ VITE_GRAPHQL_URL: "https://api.example.com/graphql" }).VITE_GRAPHQL_URL
    ).toBe("https://api.example.com/graphql");
  });

  it("rejects a graphql url without a protocol or leading slash", () => {
    expect(() => validateWebEnv({ VITE_GRAPHQL_URL: "localhost:4000/graphql" })).toThrow(
      /VITE_GRAPHQL_URL/
    );
  });

  it("passes social providers through and treats blank as unset", () => {
    expect(
      validateWebEnv({ VITE_AUTH_SOCIAL_PROVIDERS: "github,google" }).VITE_AUTH_SOCIAL_PROVIDERS
    ).toBe("github,google");
    expect(
      validateWebEnv({ VITE_AUTH_SOCIAL_PROVIDERS: "" }).VITE_AUTH_SOCIAL_PROVIDERS
    ).toBeUndefined();
  });

  it("ignores unrelated Vite builtins", () => {
    expect(validateWebEnv({ MODE: "test", DEV: true, PROD: false }).VITE_GRAPHQL_URL).toBe(
      "/graphql"
    );
  });
});
