import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  agentListSchema,
  agentViewSchema,
  apiErrorSchema,
  definitionWriteResultSchema,
  deskConfigSchema,
  flowListSchema,
  flowViewSchema,
  type AgentDefinition,
  type FlowDefinition
} from "../contracts";
import { readDefinitionViews } from "./server.definitions";
import {
  SAME_ORIGIN,
  WRITE_HEADERS,
  authenticated,
  createHarness,
  raw,
  type Api,
  type Harness,
  type Reply
} from "./server.testing";
import { createDefinitionWrites } from "../registry/registry.write";
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
    readDefinitions: () => readDefinitionViews({ repoRoot, config }),
    definitionWrites: createDefinitionWrites({ repoRoot })
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

// --- writes -------------------------------------------------------------------

const NOTES: AgentDefinition = {
  id: "notes",
  name: "Notes",
  description: "Writes release notes.",
  provider: "claude",
  output: "report",
  capabilities: { preset: "read-only", mcp: [], skills: [] },
  prompt: "# Notes\n\nWrite the release notes."
};

const send = (
  method: "PUT" | "POST" | "DELETE",
  urlPath: string,
  body?: unknown,
  headers: Record<string, string> = { ...WRITE_HEADERS(harness.desk), Cookie: api.cookie }
): Promise<Reply> =>
  raw(harness.desk, {
    method,
    path: urlPath,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });

const written = (reply: Reply) => {
  expect(reply.status, reply.text).toBeLessThan(300);
  return definitionWriteResultSchema.parse(reply.json());
};
const refusal = (reply: Reply) => apiErrorSchema.parse(reply.json()).error;

const exists = (file: string): Promise<boolean> =>
  stat(file).then(
    () => true,
    () => false
  );
const localFile = (kind: "agents" | "flows", name: string): string =>
  path.join(repoRoot, ".ai.local", "desk", kind, name);
const repoFile = (kind: "agents" | "flows", name: string): string =>
  path.join(repoRoot, ".desk", kind, name);

const defaultFlow = async (): Promise<FlowDefinition> =>
  flowViewSchema.parse((await api.get("/api/flows/kaine-default")).json()).definition;

describe("PUT /api/agents/:id and /api/flows/:id", () => {
  it("saves an agent locally, and the registry reads it back", async () => {
    const result = written(await send("PUT", "/api/agents/notes", { definition: NOTES }));

    expect(result).toEqual({
      kind: "agent",
      id: "notes",
      path: localFile("agents", "notes.md"),
      source: "local",
      shadows: null,
      uncommitted: false
    });
    const view = agentViewSchema.parse((await api.get("/api/agents/notes")).json());
    expect(view).toMatchObject({ definition: NOTES, source: "local" });
  });

  it("saves a local override of a built-in id and says that it shadows it", async () => {
    const planner = agentViewSchema.parse((await api.get("/api/agents/planner")).json());
    const mine = { ...planner.definition, description: "My planner." };

    const result = written(await send("PUT", "/api/agents/planner", { definition: mine }));

    expect(result).toMatchObject({ source: "local", shadows: "builtin" });
    const view = agentViewSchema.parse((await api.get("/api/agents/planner")).json());
    expect(view.definition.description).toBe("My planner.");
  });

  it.each([
    {
      name: "a flow that names a missing agent and ships unchecked",
      path: "/api/flows/broken",
      file: ["flows", "broken.yaml"] as const,
      body: {
        definition: {
          id: "broken",
          name: "Broken",
          description: "Two problems.",
          steps: [
            { id: "write", kind: "agent", label: "Write", agent: "ghost" },
            { id: "ship", kind: "ship", label: "Ship", auto: true }
          ]
        }
      },
      problems: ["Agent 'ghost' does not exist", "must come after a check step"]
    },
    {
      name: "a change agent without the edit-code preset",
      path: "/api/agents/notes",
      file: ["agents", "notes.md"] as const,
      body: { definition: { ...NOTES, output: "change" } },
      problems: ["A change agent needs the edit-code preset"]
    }
  ])(
    "refuses $name with every problem, and writes nothing",
    async ({ path: url, file, body, problems }) => {
      const reply = await send("PUT", url, body);

      expect(reply.status).toBe(422);
      const error = refusal(reply);
      expect(error.code).toBe("invalid-definition");
      for (const problem of problems) expect(error.detail).toContain(problem);
      expect(await exists(localFile(file[0], file[1]))).toBe(false);
    }
  );
});

describe("POST /api/{agents,flows}/:id/clone", () => {
  it("copies a built-in flow to a new local id, and refuses an id that exists", async () => {
    const result = written(
      await send("POST", "/api/flows/kaine-default/clone", { id: "kaine-copy" })
    );

    expect(result).toMatchObject({ id: "kaine-copy", source: "local", shadows: null });
    const copy = flowViewSchema.parse((await api.get("/api/flows/kaine-copy")).json());
    expect(copy.definition).toEqual({
      ...(await defaultFlow()),
      id: "kaine-copy",
      name: "Kaine default (copy)"
    });

    // `scout` is a repo agent: a clone may not take its id.
    const taken = await send("POST", "/api/agents/planner/clone", { id: "scout" });
    expect(taken.status).toBe(409);
    expect(refusal(taken).code).toBe("definition-refused");
    expect(await exists(localFile("agents", "scout.md"))).toBe(false);
  });
});

describe("POST /api/{agents,flows}/:id/promote", () => {
  it("moves a local definition to the repo and leaves it uncommitted", async () => {
    written(await send("PUT", "/api/agents/notes", { definition: NOTES }));

    const result = written(await send("POST", "/api/agents/notes/promote", {}));

    expect(result).toEqual({
      kind: "agent",
      id: "notes",
      path: repoFile("agents", "notes.md"),
      source: "repo",
      shadows: null,
      uncommitted: true
    });
    expect(await exists(localFile("agents", "notes.md"))).toBe(false);
    const view = agentViewSchema.parse((await api.get("/api/agents/notes")).json());
    expect(view).toMatchObject({ definition: NOTES, source: "repo" });
  });

  it("overwrites a repo file of the same id only with confirm", async () => {
    const scout = agentViewSchema.parse((await api.get("/api/agents/scout")).json()).definition;
    written(await send("PUT", "/api/agents/scout", { definition: { ...scout, name: "Scout 2" } }));

    const unconfirmed = await send("POST", "/api/agents/scout/promote", {});
    expect(unconfirmed.status).toBe(409);
    expect(refusal(unconfirmed).code).toBe("definition-refused");
    expect(await readFile(repoFile("agents", "scout.md"), "utf8")).toBe(SCOUT);
    expect(await exists(localFile("agents", "scout.md"))).toBe(true);

    written(await send("POST", "/api/agents/scout/promote", { confirm: true }));
    expect(await readFile(repoFile("agents", "scout.md"), "utf8")).toContain("name: Scout 2");
    expect(await exists(localFile("agents", "scout.md"))).toBe(false);
  });
});

describe("DELETE /api/agents/:id and /api/flows/:id", () => {
  it("deletes local definitions only, and keeps an agent that a flow uses", async () => {
    for (const id of ["scout", "builder"]) {
      const reply = await send("DELETE", `/api/agents/${id}`);
      expect(reply.status).toBe(409);
      expect(refusal(reply).code).toBe("definition-refused");
    }
    expect((await send("DELETE", "/api/agents/nobody")).status).toBe(404);

    const base = await defaultFlow();
    const withNotes: FlowDefinition = {
      ...base,
      id: "with-notes",
      steps: base.steps.flatMap((step) =>
        step.id === "review"
          ? [step, { id: "notes", kind: "agent", label: "Notes", agent: "notes" }]
          : [step]
      )
    };
    written(await send("PUT", "/api/agents/notes", { definition: NOTES }));
    written(await send("PUT", "/api/flows/with-notes", { definition: withNotes }));

    const used = await send("DELETE", "/api/agents/notes");
    expect(used.status).toBe(409);
    expect(refusal(used).detail).toContain("'with-notes' (local)");
    expect(await exists(localFile("agents", "notes.md"))).toBe(true);

    expect(written(await send("DELETE", "/api/flows/with-notes"))).toMatchObject({ source: null });
    expect(written(await send("DELETE", "/api/agents/notes"))).toMatchObject({
      path: localFile("agents", "notes.md"),
      source: null
    });
    expect(await exists(localFile("agents", "notes.md"))).toBe(false);
  });
});

describe("agent and flow writes are guarded", () => {
  it("refuses an id that could leave the directory, and an id the path does not name", async () => {
    expect((await send("PUT", "/api/agents/..%2Fescape", { definition: NOTES })).status).toBe(404);
    expect((await send("POST", "/api/agents/planner/clone", { id: "../escape" })).status).toBe(400);
    expect((await send("PUT", "/api/agents/other", { definition: NOTES })).status).toBe(400);
    for (const file of [
      path.join(repoRoot, ".ai.local", "desk", "escape.md"),
      path.join(repoRoot, ".ai.local", "escape.md"),
      localFile("agents", "other.md"),
      localFile("agents", "notes.md")
    ]) {
      expect(await exists(file), file).toBe(false);
    }
  });

  it("needs the session cookie and the write header", async () => {
    const body = { definition: NOTES };
    const noSession = await send("PUT", "/api/agents/notes", body, WRITE_HEADERS(harness.desk));
    expect(noSession.status).toBe(401);
    const noHeader = await send("PUT", "/api/agents/notes", body, {
      ...SAME_ORIGIN(harness.desk),
      "Content-Type": "application/json",
      Cookie: api.cookie
    });
    expect(noHeader.status).toBe(403);
    expect(await exists(localFile("agents", "notes.md"))).toBe(false);
  });
});
