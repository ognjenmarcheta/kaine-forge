import { describe, expect, it } from "vitest";

import { createGitHubPort } from "./github.port";
import { fail, fakeExec, ok } from "../testing/exec.fake";

const REPO = '{"full_name":"o/r","owner":{"login":"o","type":"User"}}';

const portWith = (extra: Parameters<typeof fakeExec>[0] = []) => {
  const fake = fakeExec([
    ...extra,
    { argv: ["gh", "api", "repos/{owner}/{repo}"], reply: ok(REPO) },
    { argv: ["gh", "api", "user"], reply: ok('{"login":"o"}') },
    { argv: ["gh"], reply: ok("") }
  ]);
  return { fake, port: createGitHubPort({ exec: fake.exec, cwd: "/repo" }) };
};

describe("createGitHubPort", () => {
  it("fetches the repository and the viewer once", async () => {
    const { fake, port } = portWith();
    await port.repository();
    await port.repository();
    await port.viewer();
    await port.viewer();
    expect(fake.calls.map((call) => call.argv[2])).toEqual(["repos/{owner}/{repo}", "user"]);
  });

  it("does not cache a failed lookup", async () => {
    let attempts = 0;
    const { port } = portWith([
      {
        argv: ["gh", "api", "user"],
        reply: () => (attempts++ === 0 ? fail("HTTP 502") : ok('{"login":"o"}'))
      }
    ]);
    await expect(port.viewer()).rejects.toThrow("HTTP 502");
    await expect(port.viewer()).resolves.toBe("o");
  });

  it("edits labels with one gh issue edit call", async () => {
    const { fake, port } = portWith();
    await port.editLabels(7, {
      add: ["agent:needs-you"],
      remove: ["agent:working", "agent:pr-open"]
    });
    expect(fake.calls.at(-1)?.argv).toEqual([
      "gh",
      "issue",
      "edit",
      "7",
      "--add-label",
      "agent:needs-you",
      "--remove-label",
      "agent:working",
      "--remove-label",
      "agent:pr-open"
    ]);
  });

  it("creates a label with gh label create", async () => {
    const { fake, port } = portWith();
    await port.createLabel({ name: "agent:working", color: "1d76db", description: "d" });
    expect(fake.calls.at(-1)?.argv.slice(0, 4)).toEqual(["gh", "label", "create", "agent:working"]);
  });

  it("posts the status comment to the resolved repository as the signed-in user", async () => {
    const { fake, port } = portWith([
      { argv: ["gh", "api", "repos/o/r/issues/7/comments?per_page=100&page=1"], reply: ok("[]") },
      {
        argv: ["gh", "api", "repos/o/r/issues/7/comments", "--method", "POST"],
        reply: ok('{"id":3,"body":"b","user":{"login":"o"}}')
      }
    ]);
    const body = "<!-- kaine-desk:7 -->\nx";
    await expect(port.upsertStatusComment(7, body)).resolves.toEqual({
      action: "created",
      commentId: 3
    });
    expect(fake.calls.some((call) => call.argv.includes("POST"))).toBe(true);
  });
});
