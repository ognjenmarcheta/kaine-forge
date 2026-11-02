import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import type { AgentProcess, AgentProcessRequest } from "./agent.process";
import type { AgentRunRequest } from "./agent.runner";
import { buildOpencodeArgs, createOpencodeRunner } from "./opencode.runner";
import { baseRequest, fixtureLines, requestFor } from "../testing/agent.testing";

const MODEL = "anthropic/claude-haiku-4-5";
const opencodeRequest = (overrides: Partial<AgentRunRequest<never>> = {}) =>
  baseRequest({ provider: "opencode", model: MODEL, ...overrides });

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

interface Seen {
  request?: AgentProcessRequest;
  config?: unknown;
}

/** Replays a fixture and keeps what the runner passed, including the rules file it wrote. */
const fakeProcess =
  (fixture: string | null, code: number, seen: Seen, lines?: readonly string[]): AgentProcess =>
  async (request) => {
    seen.request = request;
    const configDir = request.env?.OPENCODE_CONFIG_DIR ?? "";
    seen.config = JSON.parse(await readFile(path.join(configDir, "opencode.json"), "utf8"));
    for (const line of lines ?? (fixture === null ? [] : fixtureLines(fixture))) {
      request.onLine(line);
    }
    return { code, timedOut: false, aborted: false, stderrTail: "" };
  };

const runner = (process: AgentProcess) =>
  createOpencodeRunner({
    process,
    makeTempDir: async () => {
      const dir = await mkdtemp(path.join(tmpdir(), "opencode-runner-test-"));
      dirs.push(dir);
      return dir;
    }
  });

const answerSchema = z.object({ answer: z.string() }).strict();

describe("buildOpencodeArgs", () => {
  it("runs standalone with JSON output, the model and the role title, and never auto-approves", () => {
    const args = buildOpencodeArgs(opencodeRequest({ role: "reviewer" }));
    expect(args.slice(0, -1)).toEqual([
      "run",
      "--standalone",
      "--format",
      "json",
      "-m",
      MODEL,
      "--title",
      "desk-reviewer"
    ]);
    expect(args).not.toContain("--auto");
  });

  it("resumes the earlier session", () => {
    const args = buildOpencodeArgs(opencodeRequest({ resumeSessionId: "ses_abc" }));
    expect(args.slice(6, 8)).toEqual(["--session", "ses_abc"]);
  });

  it("puts the desk rules before the prompt and asks for JSON that matches the schema", () => {
    const prompt = buildOpencodeArgs(opencodeRequest({ systemAppend: "RULES" })).at(-1) ?? "";
    expect(prompt.startsWith("RULES\n\nDo the task.\n\nReply with only one JSON object")).toBe(
      true
    );
    expect(prompt).toContain('"overrideSeen"');
  });

  it.each([
    ["no model", undefined],
    ["a model without a provider", "claude-haiku"],
    ["a model that starts with a flag", "--auto/x"]
  ])("refuses %s", (_name, model) => {
    expect(() => buildOpencodeArgs(opencodeRequest({ model }))).toThrow(/model/);
  });
});

describe("createOpencodeRunner", () => {
  it("returns the parsed answer with usage, cost and turns of a real run", async () => {
    const seen: Seen = {};
    const outcome = await runner(fakeProcess("opencode-structured.jsonl", 0, seen)).run(
      requestFor(answerSchema, { provider: "opencode", model: MODEL })
    );
    expect(outcome).toMatchObject({
      ok: true,
      result: {
        structured: { answer: "blue" },
        sessionId: "ses_e63b684ddffePNdw45blGk0y6Y",
        usage: { inputTokens: 7901, cachedInputTokens: 0, outputTokens: 7 },
        costUsd: 0,
        turns: 1
      }
    });
  });

  it("hides user and project config and gives the run only the desk's rules", async () => {
    const seen: Seen = {};
    await runner(fakeProcess("opencode-structured.jsonl", 0, seen)).run(
      requestFor(answerSchema, {
        provider: "opencode",
        model: MODEL,
        cwd: "/work/repo",
        permissions: { allow: ["Read"], disallow: ["WebFetch"] }
      })
    );
    expect(seen.request?.env).toMatchObject({
      PWD: "/work/repo",
      OPENCODE_DISABLE_PROJECT_CONFIG: "1",
      OPENCODE_DISABLE_AUTOUPDATE: "1"
    });
    expect(seen.config).toEqual({
      permissions: [
        { action: "*", resource: "*", effect: "deny" },
        { action: "read", resource: "*", effect: "allow" },
        { action: "webfetch", resource: "*", effect: "deny" }
      ]
    });
  });

  it("keeps the denials of a run whose call a rule refused", async () => {
    const outcome = await runner(fakeProcess("opencode-denied.jsonl", 0, {})).run(
      requestFor(z.object({ committed: z.boolean() }), { provider: "opencode", model: MODEL })
    );
    expect(outcome.ok && outcome.result.denials.map((denial) => denial.command)).toEqual([
      "git commit --allow-empty -m probe ."
    ]);
  });

  it("fails with the error line of a run that exits 1", async () => {
    const outcome = await runner(fakeProcess("opencode-error.jsonl", 1, {})).run(opencodeRequest());
    expect(outcome).toMatchObject({
      ok: false,
      failure: {
        kind: "process-error",
        message: "Model unavailable: opencode/no-such-model-xyz",
        exitCode: 1
      },
      partial: { sessionId: "ses_e63b60de9ffeGwKTW08E6z6jKy" }
    });
  });

  it("reports no result when the stream stops before the last step", async () => {
    const lines = fixtureLines("opencode-tools.jsonl").slice(0, -1);
    const outcome = await runner(fakeProcess(null, 0, {}, lines)).run(opencodeRequest());
    expect(outcome).toMatchObject({ ok: false, failure: { kind: "no-result" } });
  });

  it("reports a schema mismatch for an answer of the wrong shape", async () => {
    const outcome = await runner(fakeProcess("opencode-structured.jsonl", 0, {})).run(
      opencodeRequest()
    );
    expect(outcome).toMatchObject({ ok: false, failure: { kind: "schema-mismatch" } });
  });

  it.each([
    ["a request for another provider", { provider: "codex" as const }, /cannot run a codex/],
    ["a prompt over the size limit", { prompt: "x".repeat(100_001) }, /larger than/],
    ["a request without a model", { model: undefined }, /needs a model/]
  ])("refuses %s before it starts a process", async (_name, overrides, message) => {
    let started = false;
    const outcome = await createOpencodeRunner({
      process: async () => {
        started = true;
        return { code: 0, timedOut: false, aborted: false, stderrTail: "" };
      }
    }).run(opencodeRequest(overrides));
    expect(started).toBe(false);
    expect(
      outcome.ok === false && outcome.failure.kind === "process-error" && outcome.failure.message
    ).toMatch(message);
  });
});
