import { describe, expect, it } from "vitest";

import { createGhClient } from "./github.gh";
import { fetchIssueSnapshot } from "./github.issue";
import { fakeExec, ok } from "../testing/exec.fake";

const VIEW = {
  number: 7,
  title: "Export reports",
  body: "### Outcome\nx",
  url: "https://github.com/o/r/issues/7",
  state: "OPEN",
  author: { login: "octo-owner" },
  labels: [{ name: "ready-for-agent" }],
  comments: [
    {
      url: "https://github.com/o/r/issues/7#issuecomment-1",
      body: "note",
      createdAt: "2026-10-07T08:30:00Z",
      author: { login: "helper" },
      authorAssociation: "COLLABORATOR"
    }
  ]
};

const EVENTS = [
  {
    id: 1,
    event: "labeled",
    created_at: "2026-10-07T08:00:00Z",
    actor: { login: "octo-owner" },
    label: { name: "ready-for-agent" }
  },
  {
    id: 2,
    event: "labeled",
    created_at: "2026-10-07T08:01:00Z",
    actor: { login: "triager" },
    label: { name: "bug" }
  },
  { id: 3, event: "assigned", created_at: "2026-10-07T08:02:00Z", actor: { login: "octo-owner" } },
  {
    id: 4,
    event: "unlabeled",
    created_at: "2026-10-07T08:03:00Z",
    actor: null,
    label: { name: "ready-for-agent" }
  }
];

describe("fetchIssueSnapshot", () => {
  it("combines gh issue view with REST label events", async () => {
    const fake = fakeExec([
      { argv: ["gh", "issue", "view"], reply: ok(JSON.stringify(VIEW)) },
      { argv: ["gh", "api"], reply: ok(JSON.stringify(EVENTS)) }
    ]);
    const snapshot = await fetchIssueSnapshot(createGhClient({ exec: fake.exec }), "o/r", 7);

    expect(fake.calls[0]?.argv).toEqual([
      "gh",
      "issue",
      "view",
      "7",
      "--json",
      "title,body,labels,comments,url,state,author,number"
    ]);
    expect(fake.calls[1]?.argv[2]).toBe("repos/o/r/issues/7/events?per_page=100&page=1");
    expect(snapshot).toMatchObject({
      number: 7,
      open: true,
      author: "octo-owner",
      labels: ["ready-for-agent"],
      comments: [{ author: "helper", authorAssociation: "COLLABORATOR" }]
    });
    // Only label events survive, with the actor kept (or null).
    expect(
      snapshot.labelEvents.map((event) => [event.id, event.action, event.label, event.actor])
    ).toEqual([
      [1, "labeled", "ready-for-agent", "octo-owner"],
      [2, "labeled", "bug", "triager"],
      [4, "unlabeled", "ready-for-agent", null]
    ]);
  });

  it("treats a closed issue and a null body", async () => {
    const fake = fakeExec([
      {
        argv: ["gh", "issue", "view"],
        reply: ok(JSON.stringify({ ...VIEW, state: "CLOSED", body: null, author: null }))
      },
      { argv: ["gh", "api"], reply: ok("[]") }
    ]);
    const snapshot = await fetchIssueSnapshot(createGhClient({ exec: fake.exec }), "o/r", 7);
    expect(snapshot).toMatchObject({ open: false, body: "", author: null });
  });

  it("rejects an issue view with a missing field", async () => {
    const incomplete = { ...VIEW, title: undefined };
    const fake = fakeExec([
      { argv: ["gh", "issue", "view"], reply: ok(JSON.stringify(incomplete)) }
    ]);
    await expect(
      fetchIssueSnapshot(createGhClient({ exec: fake.exec }), "o/r", 7)
    ).rejects.toMatchObject({ kind: "parse" });
  });
});
