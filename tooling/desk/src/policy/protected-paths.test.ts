import { describe, expect, it } from "vitest";

import {
  isGeneratedOutput,
  isProtectedPath,
  normalizeRepoPath,
  protectedPathReason,
  scopeViolations
} from "./protected-paths";

describe("normalizeRepoPath", () => {
  it.each([
    ["apps/api/src/a.ts", "apps/api/src/a.ts"],
    ["README.md", "README.md"],
    [".changeset/agent.md", ".changeset/agent.md"]
  ])("keeps the safe path %s", (input, expected) => {
    expect(normalizeRepoPath(input)).toBe(expected);
  });

  it.each([
    "",
    "/etc/passwd",
    "../outside.ts",
    "a/../../b.ts",
    "a/./b.ts",
    "a//b.ts",
    "a\\b.ts",
    "C:/windows/x.ts",
    "a/b.ts\u0000",
    "a/b/",
    "./a.ts"
  ])("rejects the unsafe path %j", (input) => {
    expect(normalizeRepoPath(input)).toBeNull();
  });
});

describe("isProtectedPath", () => {
  it.each([
    ".git/config",
    ".git/hooks/pre-commit",
    ".claude/settings.json",
    ".claude/skills/kaine-test/SKILL.md",
    ".agents/skills/x/SKILL.md",
    ".codex/config.toml",
    ".cursor/rules/a.mdc",
    ".husky/pre-commit",
    ".ai/hooks/pre-tool-use.mjs",
    ".ai/permissions.json",
    ".ai.local/desk/config.json",
    ".mcp.json",
    ".serena/memories/project.md",
    ".env",
    ".env.local",
    "apps/web/.env",
    "node_modules/pkg/index.js",
    "packages/a/node_modules/x.js",
    ".github/workflows/ci.yml",
    ".GIT/config"
  ])("protects %s", (file) => {
    expect(isProtectedPath(file)).toBe(true);
    expect(protectedPathReason(file)).not.toBeNull();
  });

  it.each([
    "apps/api/src/notes/notes.resolver.ts",
    ".ai/skills/kaine-test.md",
    ".ai/guide.md",
    ".github/pull_request_template.md",
    ".github/ISSUE_TEMPLATE/bug.yml",
    ".changeset/desk.md",
    ".env.example",
    ".serena/project.yml",
    "docs/agents/agent-desk.md",
    "tooling/desk/src/policy/protected-paths.ts",
    "gitignore-notes.md",
    "src/.gitkeep"
  ])("allows %s", (file) => {
    expect(isProtectedPath(file)).toBe(false);
  });

  it("treats an unsafe path as protected", () => {
    expect(isProtectedPath("../x")).toBe(true);
    expect(protectedPathReason("/abs")).toMatch(/unsafe/);
  });
});

describe("isGeneratedOutput", () => {
  it("recognises generated GraphQL outputs and the schema file", () => {
    expect(isGeneratedOutput("apps/web/src/graphql/generated/graphql.ts")).toBe(true);
    expect(isGeneratedOutput("apps/mobile/src/graphql/generated/gql.ts")).toBe(true);
    expect(isGeneratedOutput("apps/api/schema.graphql")).toBe(true);
    expect(isGeneratedOutput("apps/web/src/graphql/queries.ts")).toBe(false);
  });
});

describe("scopeViolations", () => {
  const allowed = ["apps/api/src/notes/notes.resolver.ts", "apps/api/src/notes/"];

  it("returns nothing when every change is in scope", () => {
    expect(
      scopeViolations(
        ["apps/api/src/notes/notes.resolver.ts", "apps/api/src/notes/deep/x.ts"],
        allowed
      )
    ).toEqual([]);
  });

  it("returns the paths outside the allowed files and directories", () => {
    expect(scopeViolations(["apps/api/src/other.ts", "apps/api/src/notes.ts"], allowed)).toEqual([
      "apps/api/src/other.ts",
      "apps/api/src/notes.ts"
    ]);
  });

  it("does not treat a file entry as a prefix", () => {
    expect(
      scopeViolations(["apps/api/src/notes/notes.resolver.ts.bak"], [allowed[0] ?? ""])
    ).toEqual(["apps/api/src/notes/notes.resolver.ts.bak"]);
  });

  it("flags unsafe paths even when an allowed entry would cover them", () => {
    expect(
      scopeViolations(["apps/../../etc/x", "/abs/x.ts", "a\\b.ts"], ["apps/", "/abs/"])
    ).toEqual(["apps/../../etc/x", "/abs/x.ts", "a\\b.ts"]);
  });

  it("accepts generated GraphQL outputs without a plan entry", () => {
    expect(scopeViolations(["apps/web/src/graphql/generated/graphql.ts"], [])).toEqual([]);
  });
});
