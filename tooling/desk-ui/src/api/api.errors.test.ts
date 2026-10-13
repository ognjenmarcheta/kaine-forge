import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ALL_FAILURE_CODES, FAILURE_MESSAGE_KEYS, isSessionLost } from "./api.errors";

const en: Record<string, string> = JSON.parse(
  readFileSync(
    path.resolve(import.meta.dirname, "../../../../packages/translation/src/locales/en/desk.json"),
    "utf8"
  )
);

describe("failure messages", () => {
  it.each(ALL_FAILURE_CODES)("has an English message for %s", (code) => {
    const key = FAILURE_MESSAGE_KEYS[code];
    expect(en[key], key).toBeTruthy();
  });

  it("treats only 401 as a lost session", () => {
    expect(ALL_FAILURE_CODES.filter(isSessionLost)).toEqual(["unauthorized"]);
  });
});
