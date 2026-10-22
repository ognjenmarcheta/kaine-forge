import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  agentListSchema,
  agentViewSchema,
  deskConfigSchema,
  flowListSchema,
  flowViewSchema
} from "../contracts";
import { readDefinitionViews } from "./server.definitions";
import { authenticated, createHarness, type Api, type Harness } from "./server.testing";
import { INSTALLED_FILES, writeFiles } from "../testing/flow.testing";
import { REPO_FILES } from "../testing/pipeline.testing";

let harness: Harness;
let api: Api;
let repoRoot: string;

const SCOUT = [
  "---",
  "id: scout",
  "name: Scout",
  "description: Reports what it sees.",
  "provider: codex",
  "output: report",
  "capabilities:",
  "  preset: read-only",
  "  mcp: [serena, jira]",
  "---",
  "",
  "Look around.",
  ""
].join("\n");

beforeEach(async () => {
  repoRoot = await mkdtemp(path.join(tmpdir(), "desk-definitions-"));
  await writeFiles(repoRoot, {
    ...REPO_FILES,
    ...INSTALLED_FILES,
    ".desk/agents/scout.md": SCOUT,
    // A broken override: the built-in planner keeps its id.
    ".ai.local/desk/agents/planner.md": "---\nid: planner\n---\nNo frontmatter fields.\n"
  });
  const config = deskConfigSchema.parse({ isolation: "docker" });
  harness = await createHarness({
    readDefinitions: () => readDefinitionViews({ repoRoot, config })
  });
  api = await authenticated(harness);
});
afterEach(async () => {
  await harness.cleanup();
  await rm(repoRoot, { recursive: true, force: true });
});

describe("GET /api/agents", () => {
  it("lists every agent with its source, its broken overrides and what a run gets now", async () => {
    const reply = await api.get("/api/agents");
    expect(reply.status).toBe(200);
    const { agents, problems } = agentListSchema.parse(reply.json());

    expect(agents.map((agent) => [agent.definition.id, agent.source, agent.readOnly])).toEqual([
      ["builder", "builtin", true],
      ["intake", "builtin", true],
      ["planner", "builtin", true],
      ["reviewer", "builtin", true],
      ["scout", "repo", false]
    ]);
    const byId = new Map(agents.map((agent) => [agent.definition.id, agent]));
    expect(byId.get("planner")?.problems).toEqual([
      expect.objectContaining({ source: "local", path: expect.stringContaining("planner.md") })
    ]);
    expect(problems).toEqual(byId.get("planner")?.problems);
    // The configured isolation is Docker: only the edit-code builder goes there.
    expect(byId.get("builder")?.resolved).toMatchObject({ sandbox: "docker", mcp: [] });
    expect(byId.get("planner")?.resolved).toMatchObject({ sandbox: "host" });
    expect(byId.get("scout")?.resolved).toMatchObject({
      provider: "codex",
      sandbox: "codex-read-only",
      removed: expect.arrayContaining([{ kind: "mcp", name: "jira", reason: "not installed" }])
    });
  });

  it("serves one agent by id and answers 404 for an id it does not have", async () => {
    const scout = agentViewSchema.parse((await api.get("/api/agents/scout")).json());
    expect(scout.definition.prompt).toBe("Look around.");
    expect((await api.get("/api/agents/nobody")).status).toBe(404);
  });
});

describe("GET /api/flows", () => {
  it("lists the flows read-only and serves one by id", async () => {
    const reply = await api.get("/api/flows");
    expect(reply.status).toBe(200);
    const { flows, problems } = flowListSchema.parse(reply.json());
    expect(flows.map((flow) => [flow.definition.id, flow.source, flow.readOnly])).toEqual([
      ["kaine-default", "builtin", true]
    ]);
    expect(problems).toEqual([]);

    const flow = flowViewSchema.parse((await api.get("/api/flows/kaine-default")).json());
    expect(flow.hash).toBe(flows[0]?.hash);
    expect((await api.get("/api/flows/nothing")).status).toBe(404);
  });
});
