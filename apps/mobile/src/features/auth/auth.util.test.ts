import { describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(),
    removeItem: vi.fn(),
    setItem: vi.fn()
  }
}));

import { authHeaders, setActiveSessionToken } from "./auth.util";

describe("mobile auth.util", () => {
  it("uses bearer Session transport when a token is active", () => {
    setActiveSessionToken("session-token");

    expect(authHeaders(null)).toEqual({
      authorization: "Bearer session-token"
    });
  });

  it("omits auth headers when no Session token is active", () => {
    setActiveSessionToken(null);

    expect(authHeaders(null)).toEqual({});
  });
});
