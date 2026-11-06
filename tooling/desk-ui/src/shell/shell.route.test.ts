import { describe, expect, it } from "vitest";

import { parseRoute, routeHref } from "./shell.route";

describe("parseRoute", () => {
  it.each([
    ["", { view: "inbox" }],
    ["?issue=457", { view: "issue", issueNumber: 457 }],
    ["?view=setup", { view: "setup" }],
    ["?view=work", { view: "work" }],
    ["?view=insights", { view: "insights" }],
    // The old addresses are gone: they show the Inbox.
    ["?view=health", { view: "inbox" }],
    ["?view=stats", { view: "inbox" }],
    ["?view=scorecard", { view: "scorecard" }],
    ["?view=lab", { view: "lab" }],
    ["?job=3", { view: "job", jobId: 3 }],
    ["?view=scorecard&job=3", { view: "scorecard", jobId: 3 }],
    ["?issue=457&view=setup", { view: "issue", issueNumber: 457 }],
    ["?issue=0", { view: "inbox" }],
    ["?issue=-3", { view: "inbox" }],
    ["?issue=1.5", { view: "inbox" }],
    ["?issue=abc", { view: "inbox" }],
    ["?issue=99999999999", { view: "inbox" }],
    ["?view=nope", { view: "inbox" }],
    ["?view=flows", { view: "flows" }],
    ["?view=flows&flow=quick-fix", { view: "flow", flowId: "quick-fix" }],
    ["?view=flows&flow=..%2Fsecrets", { view: "flows" }],
    ["?view=agents", { view: "agents" }],
    ["?view=agents&agent=ui-builder", { view: "agent", agentId: "ui-builder" }],
    ["?view=agents&new=1", { view: "agent", agentId: null }],
    ["?view=agents&agent=Not%20an%20id", { view: "agents" }],
    ["?view=agents&agent=..%2Fsecrets", { view: "agents" }]
  ])("reads %j", (search, route) => {
    expect(parseRoute(search)).toEqual(route);
  });

  it("round-trips through routeHref", () => {
    for (const route of [
      { view: "inbox" } as const,
      { view: "work" } as const,
      { view: "setup" } as const,
      { view: "insights" } as const,
      { view: "scorecard" } as const,
      { view: "lab" } as const,
      { view: "job", jobId: 3 } as const,
      { view: "scorecard", jobId: 3 } as const,
      { view: "flows" } as const,
      { view: "flow", flowId: "quick-fix" } as const,
      { view: "agents" } as const,
      { view: "agent", agentId: "ui-builder" } as const,
      { view: "agent", agentId: null } as const,
      { view: "issue", issueNumber: 12 } as const
    ]) {
      expect(parseRoute(routeHref(route))).toEqual(route);
    }
  });
});
