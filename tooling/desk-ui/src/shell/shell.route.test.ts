import { describe, expect, it } from "vitest";

import { parseRoute, routeHref } from "./shell.route";

describe("parseRoute", () => {
  it.each([
    ["", { view: "board" }],
    ["?issue=457", { view: "issue", issueNumber: 457 }],
    ["?view=health", { view: "health" }],
    ["?issue=457&view=health", { view: "issue", issueNumber: 457 }],
    ["?issue=0", { view: "board" }],
    ["?issue=-3", { view: "board" }],
    ["?issue=1.5", { view: "board" }],
    ["?issue=abc", { view: "board" }],
    ["?issue=99999999999", { view: "board" }],
    ["?view=nope", { view: "board" }]
  ])("reads %j", (search, route) => {
    expect(parseRoute(search)).toEqual(route);
  });

  it("round-trips through routeHref", () => {
    for (const route of [
      { view: "board" } as const,
      { view: "health" } as const,
      { view: "issue", issueNumber: 12 } as const
    ]) {
      expect(parseRoute(routeHref(route))).toEqual(route);
    }
  });
});
