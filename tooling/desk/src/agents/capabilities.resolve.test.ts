import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";

import type {
  AgentCapabilities,
  AgentDefinition,
  InstalledCapabilities,
  Isolation,
  Provider
} from "../contracts";
import type { AgentPermissions } from "./agent.runner";
import { loadCapabilities } from "./capabilities.load";
import { resolveCapabilities, toAgentPermissions } from "./capabilities.resolve";
import { parseAgentFile } from "../registry/registry.parse";
import { readInstalledCapabilities } from "../registry/registry.snapshot";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const BUILTIN_AGENTS = fileURLToPath(new URL("../../defaults/agents/", import.meta.url));

/**
 * `permissionsFor` output captured before the capability resolver replaced the role
 * branching, for the checkout `parityCheckout` builds. Never regenerate it from the resolver.
 */
const PARITY = z.record(
  z.string(),
  z.object({
    allow: z.array(z.string()),
    disallow: z.array(z.string()),
    sandbox: z.enum(["read-only", "workspace-write"]).optional()
  })
);

const dirs: string[] = [];
afterAll(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

/** The checkout the parity fixture was captured in. */
const parityCheckout = async (): Promise<string> => {
  const dir = await mkdtemp(path.join(tmpdir(), "desk-parity-"));
  dirs.push(dir);
  await mkdir(path.join(dir, ".ai", "skills"), { recursive: true });
  await writeFile(
    path.join(dir, ".ai", "permissions.json"),
    JSON.stringify({
      rules: [
        { id: "db-push", decision: "deny", command: "pnpm db:push" },
        { id: "no-verify", decision: "deny", command: "git", flag: "--no-verify" },
        { id: "db-migrate", decision: "ask", command: "pnpm db:migrate" },
        { id: "fine", decision: "allow", command: "pnpm fine" }
      ]
    })
  );
  await writeFile(
    path.join(dir, ".ai", "mcp.json"),
    JSON.stringify({ mcpServers: { serena: {}, context7: {}, playwright: {} } })
  );
  for (const skill of [
    "kaine-intake",
    "kaine-write-issue",
    "kaine-write-plan",
    "kaine-test",
    "kaine-review",
    "kaine-create-feature",
    "kaine-simplify",
    "kaine-explain",
    "acme-extra"
  ]) {
    await writeFile(path.join(dir, ".ai", "skills", `${skill}.md`), "# skill");
  }
  return dir;
};

const builtinAgents = async (): Promise<AgentDefinition[]> =>
  Promise.all(
    (await readdir(BUILTIN_AGENTS))
      .filter((name) => name.endsWith(".md"))
      .map(async (name) => {
        const parsed = parseAgentFile(await readFile(path.join(BUILTIN_AGENTS, name), "utf8"));
        if (!parsed.ok) throw new Error(parsed.errors.join("\n"));
        return parsed.definition;
      })
  );

const INSTALLED: InstalledCapabilities = {
  mcp: ["serena", "context7"],
  skills: ["kaine-write-plan", "kaine-test", "kaine-review", "kaine-open-pr"]
};

const resolve = (
  capabilities: AgentCapabilities,
  options: {
    readonly provider?: Provider;
    readonly isolation?: Isolation;
    readonly workspaces?: readonly string[];
  } = {}
) =>
  resolveCapabilities({
    agent: { capabilities },
    provider: options.provider ?? "claude",
    model: null,
    policy: { denies: ["Bash(pnpm db:push)"] },
    installed: INSTALLED,
    isolation: options.isolation ?? "host",
    workspaces: options.workspaces
  });

describe("resolveCapabilities", () => {
  it("removes what the policy floor denies, says why, and still denies it", () => {
    const profile = resolve({
      preset: "read-only",
      mcp: [],
      skills: ["kaine-write-plan", "kaine-open-pr"]
    });

    expect(profile.skills).toEqual(["kaine-write-plan"]);
    expect(profile.removed).toEqual([
      { kind: "skill", name: "kaine-open-pr", reason: expect.stringMatching(/^policy floor: /) }
    ]);
    expect(profile.tools.allow).not.toContain("Skill(skill:kaine-open-pr)");
    expect(profile.tools.deny).toEqual(
      expect.arrayContaining([
        "Skill(skill:kaine-open-pr)",
        "Bash(pnpm db:push)",
        "Bash(git push:*)",
        "WebFetch",
        "Edit(.ai/permissions.json)"
      ])
    );
  });

  it("removes MCP servers and skills the checkout has not installed", () => {
    const profile = resolve({
      preset: "read-only",
      mcp: ["serena", "jira"],
      skills: ["kaine-review", "kaine-nope"]
    });

    expect(profile.mcp).toEqual(["serena"]);
    expect(profile.skills).toEqual(["kaine-review"]);
    expect(profile.removed).toEqual([
      { kind: "skill", name: "kaine-nope", reason: "not installed" },
      { kind: "mcp", name: "jira", reason: "not installed" }
    ]);
    expect(profile.tools.allow.some((rule) => rule.startsWith("mcp__jira"))).toBe(false);
  });

  it("puts an edit-code agent in Docker when the isolation is Docker, and only that preset", () => {
    const editCode = resolve(
      { preset: "edit-code", mcp: ["serena"], skills: ["kaine-test"] },
      { isolation: "docker" }
    );
    expect(editCode.sandbox).toBe("docker");
    expect(editCode.mcp).toEqual([]);
    expect(editCode.removed).toEqual([
      { kind: "mcp", name: "serena", reason: "no MCP inside the container" }
    ]);

    for (const preset of ["read-only", "run-checks"] as const) {
      const host = resolve({ preset, mcp: ["serena"], skills: [] }, { isolation: "docker" });
      expect(host.sandbox, preset).toBe("host");
      expect(host.mcp, preset).toEqual(["serena"]);
    }
  });

  it("gives run-checks the exact check commands of its workspaces and no way to edit", () => {
    const profile = resolve(
      { preset: "run-checks", mcp: ["serena"], skills: [] },
      { workspaces: ["@repo/api"] }
    );

    expect(profile.tools.allow).toEqual(
      expect.arrayContaining([
        "Bash(pnpm --filter @repo/api test:*)",
        "Bash(pnpm turbo run lint --filter=@repo/api:*)",
        "Bash(pnpm --filter @repo/api exec vitest run:*)"
      ])
    );
    for (const edit of ["Edit", "Write", "Bash(pnpm generate:*)", "mcp__serena__replace_content"]) {
      expect(profile.tools.allow).not.toContain(edit);
    }
  });

  it("holds Codex to its sandbox: no rule lists, no MCP, and a note that says so", () => {
    const reviewer = resolve(
      { preset: "read-only", mcp: ["serena", "context7"], skills: ["kaine-review"] },
      { provider: "codex" }
    );
    expect(reviewer).toMatchObject({
      sandbox: "codex-read-only",
      tools: { allow: [], deny: [] },
      mcp: [],
      skills: ["kaine-review"],
      notes: expect.arrayContaining(["Codex: sandbox only, no MCP"])
    });
    expect(reviewer.removed.map((entry) => [entry.kind, entry.name])).toEqual([
      ["mcp", "serena"],
      ["mcp", "context7"]
    ]);
    expect(
      resolve({ preset: "edit-code", mcp: [], skills: [] }, { provider: "codex" }).sandbox
    ).toBe("codex-workspace-write");
  });
});

describe("the built-in agents", () => {
  it("resolve to exactly the rules permissionsFor gave each role before agents were data", async () => {
    const parity = PARITY.parse(
      JSON.parse(
        await readFile(new URL("./__fixtures__/permissions.parity.json", import.meta.url), "utf8")
      )
    );
    const checkout = await parityCheckout();
    const permissions = async (
      agent: Pick<AgentDefinition, "capabilities">,
      provider: Provider,
      isolation: Isolation,
      workspaces?: readonly string[]
    ): Promise<AgentPermissions> =>
      toAgentPermissions(
        await loadCapabilities({ agent, provider, model: null, checkout, isolation, workspaces })
      );

    const agents = await builtinAgents();
    expect(agents.map((agent) => agent.id).sort()).toEqual([
      "builder",
      "intake",
      "planner",
      "reviewer"
    ]);
    for (const isolation of ["host", "docker"] as const) {
      for (const provider of ["claude", "codex"] as const) {
        for (const agent of agents) {
          expect(await permissions(agent, provider, isolation), `${agent.id}/${provider}`).toEqual(
            parity[`${agent.id}/${provider}`]
          );
        }
      }
      const builder = agents.find((agent) => agent.id === "builder");
      if (builder === undefined) throw new Error("No built-in builder");
      expect(await permissions(builder, "claude", isolation, ["@repo/api", "@repo/desk"])).toEqual(
        parity["builder/claude/workspaces"]
      );
      const crud = {
        capabilities: { ...builder.capabilities, skills: ["kaine-test", "kaine-create-feature"] }
      };
      expect(await permissions(crud, "claude", isolation)).toEqual(
        parity["builder/claude/create-feature"]
      );
    }
  });

  it("lose nothing against what this repository installs", async () => {
    const installed = await readInstalledCapabilities(REPO_ROOT);
    for (const agent of await builtinAgents()) {
      const profile = resolveCapabilities({
        agent,
        provider: "claude",
        model: null,
        policy: { denies: [] },
        installed,
        isolation: "host"
      });
      expect(profile.removed, agent.id).toEqual([]);
    }
  });
});
