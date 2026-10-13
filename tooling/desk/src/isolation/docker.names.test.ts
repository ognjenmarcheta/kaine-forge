import { describe, expect, it } from "vitest";

import {
  NAME_PREFIX,
  allFilters,
  authVolume,
  containerName,
  isDeskName,
  issueFilters,
  issueVolume,
  repoKeyFor,
  resourceLabels,
  runFilter,
  socketVolume
} from "./docker.names";

const scope = { repoKey: "kaine-forge-1a2b3c", issue: 123 };
const RUN = "0a1b2c3d";

describe("repoKeyFor", () => {
  it("combines the folder name with a short hash of the full path", () => {
    const key = repoKeyFor("/Users/dev/Documents/Kaine Forge");
    expect(key).toMatch(/^kaine-forge-[0-9a-f]{6}$/);
    expect(repoKeyFor("/other/Kaine Forge")).not.toBe(key);
    expect(repoKeyFor("/Users/dev/Documents/Kaine Forge")).toBe(key);
  });

  it("falls back to a plain name for a path without letters", () => {
    expect(repoKeyFor("/___")).toMatch(/^repo-[0-9a-f]{6}$/);
  });
});

describe("resource names and labels", () => {
  it("uses the kaine-desk- prefix for every volume and container", () => {
    const names = [
      issueVolume(scope, "ws"),
      issueVolume(scope, "state"),
      issueVolume(scope, "store"),
      socketVolume(scope, RUN),
      socketVolume(null, RUN),
      authVolume("claude"),
      containerName(scope, "agent", RUN),
      containerName(null, "login", RUN)
    ];
    for (const name of names) expect(name.startsWith(NAME_PREFIX)).toBe(true);
    expect(issueVolume(scope, "ws")).toBe("kaine-desk-kaine-forge-1a2b3c-123-ws");
    expect(authVolume("codex")).toBe("kaine-desk-auth-codex");
    expect(containerName(null, "login", RUN)).toBe("kaine-desk-machine-login-0a1b2c3d");
  });

  it("labels every resource with kaine-desk=1 and its owner", () => {
    expect(resourceLabels(scope, "agent", RUN)).toEqual({
      "kaine-desk": "1",
      "kaine-desk.repo": "kaine-forge-1a2b3c",
      "kaine-desk.issue": "123",
      "kaine-desk.run": RUN,
      "kaine-desk.kind": "agent"
    });
    expect(resourceLabels(null, "auth")).toEqual({
      "kaine-desk": "1",
      "kaine-desk.kind": "auth"
    });
  });

  it("builds filters that select one issue, or every desk resource", () => {
    expect(issueFilters(scope)).toEqual([
      "label=kaine-desk=1",
      "label=kaine-desk.repo=kaine-forge-1a2b3c",
      "label=kaine-desk.issue=123"
    ]);
    expect(allFilters()).toEqual(["label=kaine-desk=1"]);
    expect(runFilter(RUN)).toBe("label=kaine-desk.run=0a1b2c3d");
  });

  it.each([
    ["an issue of zero", () => issueVolume({ repoKey: "x", issue: 0 }, "ws")],
    ["a fractional issue", () => issueVolume({ repoKey: "x", issue: 1.5 }, "ws")],
    ["a repo key with a slash", () => issueVolume({ repoKey: "a/b", issue: 1 }, "ws")],
    ["a run id with a path", () => socketVolume(scope, "../etc")],
    ["a kind with a space", () => containerName(scope, "a b", RUN)],
    ["a filter for a bad issue", () => issueFilters({ repoKey: "x", issue: -3 })]
  ])("rejects %s", (_name, build) => {
    expect(build).toThrow(RangeError);
  });
});

describe("isDeskName", () => {
  it("accepts only names with the prefix and Docker-safe characters", () => {
    expect(isDeskName("kaine-desk-x-1-ws")).toBe(true);
    expect(isDeskName("postgres")).toBe(false);
    expect(isDeskName("my-kaine-desk-x")).toBe(false);
    expect(isDeskName("kaine-desk-a b")).toBe(false);
    expect(isDeskName("kaine-desk-$(id)")).toBe(false);
  });
});
