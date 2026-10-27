import { AuthRequestError } from "@repo/auth/transport";
import { describe, expect, it } from "vitest";

import { getAccountErrorMessage } from "./account.util";

const MESSAGES: Readonly<Record<string, string>> = {
  "auth.account.error.soleOwner": "You are the only owner of {organization}.",
  "auth.account.error.invalidPassword": "The current password is not correct.",
  "error.generic": "Something went wrong."
};

const t = (key: string) => MESSAGES[key] ?? key;

describe("getAccountErrorMessage", () => {
  it.each([
    [
      new AuthRequestError({
        code: "SOLE_OWNER_OF_SHARED_ORGANIZATION",
        organizationName: "Acme",
        status: 400
      }),
      "You are the only owner of Acme."
    ],
    [
      new AuthRequestError({ code: "INVALID_PASSWORD", status: 400 }),
      "The current password is not correct."
    ],
    [new Error("network down"), "Something went wrong."]
  ])("translates %o", (error, expected) => {
    expect(getAccountErrorMessage(t, error)).toBe(expected);
  });
});
