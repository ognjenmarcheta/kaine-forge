import { describe, expect, it } from "vitest";

import { formatApiError } from "./error.middleware";

describe("error.middleware", () => {
  it("exposes error details when requested", () => {
    const error = new Error("database failed");

    expect(formatApiError(error, { exposeDetails: true })).toEqual({ message: "database failed" });
  });

  it("masks error details when exposeDetails is false", () => {
    const error = new Error("secret internal detail");

    expect(formatApiError(error, { exposeDetails: false })).toEqual({
      message: "internal server error"
    });
  });

  it("always normalizes unknown thrown values", () => {
    expect(formatApiError("boom", { exposeDetails: true })).toEqual({
      message: "internal server error"
    });
  });
});
