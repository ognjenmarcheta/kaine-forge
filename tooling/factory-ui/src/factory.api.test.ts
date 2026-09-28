import { afterEach, describe, expect, it, vi } from "vitest";

import { artifactRequestUrl, dashboardLocation, runRequestUrl } from "./factory.api";

const worktree = "0123456789abcdef01234567";
const run = "00000000-0000-4000-8000-000000000023";
const artifact = "00000000-0000-4000-8000-000000000024";
const unsafeSegments = [
  "../state",
  "../../../../api/actions",
  "%2e%2e%2fstate",
  "%252e%252e%252fstate",
  "..\\state",
  "x?worktree=other",
  "x#fragment",
  "https://example.com",
  "//example.com",
  "",
  "not-an-id"
];
afterEach(() => vi.unstubAllGlobals());
it("shares an exchange attempt, retains the fragment on failure, and retries successfully", async () => {
  vi.resetModules();
  const { bootstrap } = await import("./factory.api");
  const replaceState = vi.fn();
  vi.stubGlobal("location", {
    hash: "#session=fixture-token",
    pathname: "/",
    search: "?view=health"
  });
  vi.stubGlobal("history", { replaceState });
  const fetch = vi.fn().mockRejectedValue(new Error("Temporary network failure"));
  vi.stubGlobal("fetch", fetch);
  const first = bootstrap();
  expect(bootstrap()).toBe(first);
  await expect(first).rejects.toThrow("Temporary network failure");
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(replaceState).not.toHaveBeenCalled();
  fetch.mockResolvedValue(new Response(JSON.stringify({ ok: true })));
  await bootstrap();
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(replaceState).toHaveBeenCalledWith(null, "", "/?view=health");
});

describe("dashboard request paths", () => {
  it("constructs fixed run and artifact routes from valid identifiers", () => {
    expect(runRequestUrl(worktree, run)).toBe(`/api/worktrees/${worktree}/runs/${run}`);
    expect(artifactRequestUrl(worktree, run, artifact)).toBe(
      `/api/worktrees/${worktree}/artifacts/${run}/${artifact}`
    );
  });

  it.each(unsafeSegments)("rejects unsafe identifier %j in every path position", (value) => {
    expect(() => runRequestUrl(value, run)).toThrow();
    expect(() => runRequestUrl(worktree, value)).toThrow();
    expect(() => artifactRequestUrl(value, run, artifact)).toThrow();
    expect(() => artifactRequestUrl(worktree, value, artifact)).toThrow();
    expect(() => artifactRequestUrl(worktree, run, value)).toThrow();
  });

  it.each([undefined, worktree.toUpperCase(), worktree.slice(1), worktree + "0"])(
    "rejects missing or noncanonical worktree ID %j",
    (value) => {
      expect(() => runRequestUrl(value, run)).toThrow();
      expect(() => artifactRequestUrl(value, run, artifact)).toThrow();
    }
  );
});

describe("dashboard location input", () => {
  it.each(["", "?view=board", "?view=runs&worktree="])(
    "allows the All worktrees view: %s",
    (search) => {
      expect(dashboardLocation(search)).toMatchObject({
        success: true,
        data: { runId: null, worktree: "" }
      });
    }
  );

  it("allows a selected worktree and a scoped run", () => {
    expect(dashboardLocation(`?worktree=${worktree}`)).toMatchObject({ success: true });
    expect(dashboardLocation(`?worktree=${worktree}&run=${run}`)).toMatchObject({
      success: true,
      data: { worktree, runId: run }
    });
  });

  it.each(unsafeSegments)("rejects malformed run or worktree query input %j", (value) => {
    const runQuery = new URLSearchParams({ worktree, run: value });
    const worktreeQuery = new URLSearchParams({ worktree: value, run });
    expect(dashboardLocation(runQuery.toString()).success).toBe(false);
    expect(dashboardLocation(worktreeQuery.toString()).success).toBe(false);
  });

  it.each([`?run=${run}`, `?run=${run}&worktree=`, "?run=", "?worktree=../state"])(
    "rejects an incomplete or malformed link: %s",
    (search) => {
      expect(dashboardLocation(search).success).toBe(false);
    }
  );
});
