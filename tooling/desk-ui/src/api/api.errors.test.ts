import { describe, expect, it } from "vitest";

import { ALL_FAILURE_CODES, isSessionLost } from "./api.errors";

describe("failure messages", () => {
  it("treats only 401 as a lost session", () => {
    expect(ALL_FAILURE_CODES.filter(isSessionLost)).toEqual(["unauthorized"]);
  });
});
