import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loadRegistry, type Registry } from "./registry.load";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const makeRepo = async (files: Readonly<Record<string, string>> = {}): Promise<string> => {
  const root = await mkdtemp(path.join(tmpdir(), "desk-registry-"));
  dirs.push(root);
  for (const [file, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), text);
  }
  return root;
};

const agentFile = (id: string, prompt: string, output = "plan"): string =>
  [
    "---",
    `id: ${id}`,
    `name: ${id}`,
    "description: A test agent.",
    "provider: claude",
    `output: ${output}`,
    "capabilities:",
    `  preset: ${output === "change" ? "edit-code" : "read-only"}`,
    "---",
    "",
    prompt,
    ""
  ].join("\n");

const load = async (files: Readonly<Record<string, string>> = {}): Promise<Registry> =>
  loadRegistry({ repoRoot: await makeRepo(files) });

const agentById = (registry: Registry, id: string) =>
  registry.agents.find((entry) => entry.definition.id === id);

describe("loadRegistry", () => {
  it("loads the built-in agents and flow as read-only when the repo adds nothing", async () => {
    const registry = await load();
    expect(registry.problems).toEqual([]);
    expect(
      registry.agents.map((entry) => [
        entry.definition.id,
        entry.source,
        entry.readOnly,
        entry.shadows
      ])
    ).toEqual([
      ["builder", "builtin", true, null],
      ["intake", "builtin", true, null],
      ["planner", "builtin", true, null],
      ["reviewer", "builtin", true, null]
    ]);
    expect(
      registry.flows.map((entry) => [entry.definition.id, entry.source, entry.readOnly])
    ).toEqual([["kaine-default", "builtin", true]]);
  });

  it("lets local override repo, and repo override built-in, by id", async () => {
    const registry = await load({
      ".desk/agents/planner.md": agentFile("planner", "REPO PLANNER"),
      ".ai.local/desk/agents/planner.md": agentFile("planner", "LOCAL PLANNER"),
      ".desk/agents/builder.md": agentFile("builder", "REPO BUILDER", "change")
    });
    expect(registry.problems).toEqual([]);
    const planner = agentById(registry, "planner");
    expect(planner).toMatchObject({ source: "local", shadows: "repo", readOnly: false });
    expect(planner?.definition.prompt).toBe("LOCAL PLANNER");
    expect(agentById(registry, "builder")).toMatchObject({
      source: "repo",
      shadows: "builtin",
      readOnly: false
    });
    expect(agentById(registry, "reviewer")).toMatchObject({ source: "builtin", shadows: null });
  });

  it("reports invalid files with their path and errors, and keeps the definition they would replace", async () => {
    const repoRoot = await makeRepo({
      ".desk/agents/reviewer.md": "---\nid: reviewer\nprovider: [unclosed\n---\nbody\n",
      ".desk/agents/planner.md": agentFile("planner", "Body").replace(
        "output: plan",
        "output: change"
      ),
      ".desk/agents/scout.md": agentFile("other", "Body"),
      ".desk/flows/broken.yaml": [
        "id: broken",
        "name: Broken",
        "description: Loops forward.",
        "steps:",
        "  - { id: build, kind: agent, label: Build, agent: builder }",
        "  - { id: check, kind: check, label: Check, commands: loop, loopBack: { to: later, limit: 1 } }",
        "  - { id: later, kind: agent, label: Later, agent: reviewer }",
        ""
      ].join("\n"),
      ".desk/agents/README.md": "Not an agent.",
      ".desk/flows/notes.txt": "Not a flow."
    });
    const registry = await loadRegistry({ repoRoot });

    const at = (file: string) => path.join(repoRoot, ".desk", file);
    expect(registry.problems).toEqual(
      expect.arrayContaining([
        {
          path: at("agents/reviewer.md"),
          source: "repo",
          errors: [expect.stringContaining("Invalid YAML")]
        },
        {
          path: at("agents/planner.md"),
          source: "repo",
          errors: ["capabilities.preset: A change agent needs the edit-code preset"]
        },
        {
          path: at("agents/scout.md"),
          source: "repo",
          errors: ["The id 'other' must match the file name 'scout.md'"]
        },
        {
          path: at("flows/broken.yaml"),
          source: "repo",
          errors: ["step 'check': loopBack.to 'later' must name an earlier step"]
        }
      ])
    );
    expect(registry.problems).toHaveLength(4);
    expect(agentById(registry, "reviewer")?.source).toBe("builtin");
    expect(agentById(registry, "planner")?.source).toBe("builtin");
    expect(registry.flows.map((entry) => entry.definition.id)).toEqual(["kaine-default"]);
  });

  it("hashes the definition, not the file layout", async () => {
    const hashOf = async (text: string) =>
      agentById(await load({ ".desk/agents/scout.md": text }), "scout")?.hash;
    const plain = agentFile("scout", "Look around.");
    const reordered = [
      "---",
      "capabilities:",
      "  preset: read-only",
      "output: plan",
      "provider: claude",
      "description: A test agent.",
      "name: scout",
      "id: scout",
      "---",
      "",
      "",
      "Look around.",
      "",
      ""
    ].join("\r\n");

    expect(await hashOf(reordered)).toBe(await hashOf(plain));
    expect(await hashOf(agentFile("scout", "Look further."))).not.toBe(await hashOf(plain));
  });
});
