import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createGhClient, fetchRepository, fetchViewer, GhError } from "./github.gh";
import { fail, fakeExec, ok } from "../testing/exec.fake";

const clientFor = (routes: Parameters<typeof fakeExec>[0]) => {
  const fake = fakeExec(routes);
  return { gh: createGhClient({ exec: fake.exec, cwd: "/repo" }), calls: fake.calls };
};

describe("gh client", () => {
  it("runs gh unattended in the checkout, with an argv array", async () => {
    const { gh, calls } = clientFor([{ argv: ["gh", "issue"], reply: ok("done") }]);
    await expect(gh.text(["issue", "list"])).resolves.toBe("done");
    expect(calls[0]).toMatchObject({
      argv: ["gh", "issue", "list"],
      cwd: "/repo",
      env: { GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1", NO_COLOR: "1" }
    });
  });

  it("throws GhError with a stderr tail on a non-zero exit, never the stdout", async () => {
    const { gh } = clientFor([
      { argv: ["gh"], reply: { code: 1, stdout: "SECRET-BODY", stderr: "HTTP 404: Not Found" } }
    ]);
    const error = await gh.text(["api", "x"]).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GhError);
    expect((error as GhError).kind).toBe("exit");
    expect((error as GhError).message).toContain("HTTP 404");
    expect((error as GhError).message).not.toContain("SECRET-BODY");
  });

  it("reports a timeout", async () => {
    const { gh } = clientFor([{ argv: ["gh"], reply: { code: null, timedOut: true } }]);
    await expect(gh.text(["api", "x"])).rejects.toMatchObject({ kind: "timeout" });
  });

  it("validates JSON at the boundary", async () => {
    const schema = z.object({ login: z.string() });
    const good = clientFor([{ argv: ["gh"], reply: ok('{"login":"a","extra":1}') }]);
    await expect(good.gh.json(schema, ["api", "user"])).resolves.toEqual({ login: "a" });

    const wrongShape = clientFor([{ argv: ["gh"], reply: ok('{"login":5}') }]);
    await expect(wrongShape.gh.json(schema, ["api", "user"])).rejects.toMatchObject({
      kind: "parse",
      message: expect.stringContaining("login")
    });

    const notJson = clientFor([{ argv: ["gh"], reply: ok("<html>") }]);
    await expect(notJson.gh.json(schema, ["api", "user"])).rejects.toMatchObject({ kind: "parse" });
  });

  it("sends an api body on stdin", async () => {
    const { gh, calls } = clientFor([{ argv: ["gh", "api"], reply: ok('{"ok":true}') }]);
    await gh.api(z.object({ ok: z.boolean() }), "repos/o/r/issues/1/comments", {
      method: "POST",
      body: { body: "hi" }
    });
    expect(calls[0]?.argv).toEqual([
      "gh",
      "api",
      "repos/o/r/issues/1/comments",
      "--method",
      "POST",
      "--input",
      "-"
    ]);
    expect(calls[0]?.input).toBe('{"body":"hi"}');
  });

  it("reads every page until a short page", async () => {
    const page = (count: number) =>
      JSON.stringify(Array.from({ length: count }, (_, i) => ({ n: i })));
    const { gh, calls } = clientFor([
      { argv: ["gh", "api", "list?per_page=100&page=1"], reply: ok(page(100)) },
      { argv: ["gh", "api", "list?per_page=100&page=2"], reply: ok(page(3)) }
    ]);
    const items = await gh.apiPages(z.object({ n: z.number() }), "list");
    expect(items).toHaveLength(103);
    expect(calls).toHaveLength(2);
  });

  it("uses & when the endpoint already has a query", async () => {
    const { gh, calls } = clientFor([{ argv: ["gh"], reply: ok("[]") }]);
    await gh.apiPages(z.unknown(), "list?state=all");
    expect(calls[0]?.argv[2]).toBe("list?state=all&per_page=100&page=1");
  });

  it("rejects a page item that does not match", async () => {
    const { gh } = clientFor([{ argv: ["gh"], reply: ok('[{"n":"x"}]') }]);
    await expect(gh.apiPages(z.object({ n: z.number() }), "list")).rejects.toThrow();
  });

  it("resolves the repository from the checkout and normalizes the owner type", async () => {
    const { gh, calls } = clientFor([
      {
        argv: ["gh", "api", "repos/{owner}/{repo}"],
        reply: ok('{"full_name":"acme/app","owner":{"login":"acme","type":"Organization"}}')
      }
    ]);
    await expect(fetchRepository(gh)).resolves.toEqual({
      fullName: "acme/app",
      ownerLogin: "acme",
      ownerType: "Organization"
    });
    expect(calls[0]?.cwd).toBe("/repo");
  });

  it("reads the signed-in login", async () => {
    const { gh } = clientFor([{ argv: ["gh", "api", "user"], reply: ok('{"login":"me"}') }]);
    await expect(fetchViewer(gh)).resolves.toBe("me");
  });

  it("surfaces an unauthenticated gh as an error", async () => {
    const { gh } = clientFor([
      { argv: ["gh"], reply: fail("To get started with GitHub CLI, run: gh auth login") }
    ]);
    await expect(fetchViewer(gh)).rejects.toThrow("gh auth login");
  });
});
