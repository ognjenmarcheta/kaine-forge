import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { issueStateSchema, type IssueState } from "../contracts";
import { acquireLease } from "../store/store.lease";
import { createCliEnv, type CliEnv, type CliEnvOptions } from "../testing/cli.testing";
import { fail, ok } from "../testing/exec.fake";
import { snapshotOf } from "../testing/github.fake";
import {
  ISSUE,
  builderOutput,
  planOutput,
  reviewOutput,
  skillCalls,
  writeFeature,
  type ScriptedStep
} from "../testing/pipeline.testing";

vi.setConfig({ testTimeout: 30_000 });

let env: CliEnv | null = null;
afterEach(async () => {
  await env?.cleanup();
  env = null;
});
const open = async (options: CliEnvOptions = {}): Promise<CliEnv> => {
  env = await createCliEnv(options);
  return env;
};

const planStep = (over: Partial<ScriptedStep> = {}): ScriptedStep => ({
  role: "planner",
  output: planOutput(),
  ...over
});
const buildStep = (over: Partial<ScriptedStep> = {}): ScriptedStep => ({
  role: "builder",
  output: builderOutput(),
  effect: (run) => writeFeature(run),
  ...over
});
const reviewStep = (): ScriptedStep => ({ role: "reviewer", output: reviewOutput() });
const BELL = "\u0007";

const stateOf = async (e: CliEnv): Promise<IssueState> =>
  issueStateSchema.parse(JSON.parse(await readFile(path.join(e.issueDir(), "state.json"), "utf8")));

const TIMEOUT = { kind: "timeout", timeoutMs: 1_000 } as const;

describe("start", () => {
  it("drives to the plan gate, shows progress, rings the bell, and exits 0", async () => {
    const e = await open({ steps: [planStep()] });
    const result = await e.run("start", String(ISSUE));

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`${BELL}#7: waiting for you (stage plan-gate, waiting)`);
    expect(result.stdout).toContain("Plan ready: Add a CSV export for reports");
    expect(result.stdout).toContain("approve with: pnpm desk approve 7");
    expect(result.stdout).toContain('or send feedback: pnpm desk feedback 7 --to plan "<text>"');
    // Stage moves on stdout, agent activity on stderr.
    expect(result.stdout).toContain("09:00:00 plan: stage-started");
    expect(result.stdout).not.toContain("[planner]");
    expect(result.stderr).toContain("[planner] Skill kaine-write-plan");
    expect((await stateOf(e)).stage).toBe("plan-gate");
  });

  it("prints one JSON document and nothing else with --json", async () => {
    const e = await open({ steps: [planStep()] });
    const result = await e.run("start", "7", "--json");

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain(BELL);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      issue: 7,
      outcome: "stopped",
      stop: "gate",
      prUrl: null,
      stage: "plan-gate",
      status: "waiting",
      message: expect.stringContaining("Plan ready"),
      next: [
        "approve with: pnpm desk approve 7",
        'or send feedback: pnpm desk feedback 7 --to plan "<text>"'
      ]
    });
  });

  it("exits 1, rings the bell, and shows the reason and the exact continue command on needs-you", async () => {
    const e = await open({ steps: [] }); // no planner step: the planner run fails
    const result = await e.run("start", "7");

    expect(result.code).toBe(1);
    expect(result.stdout).toContain(`${BELL}#7: needs you (stage needs-you, waiting)`);
    expect(result.stdout).toContain("continue with: pnpm desk continue 7 (retries 'plan')");
    expect(result.stdout).toContain("or send feedback: pnpm desk feedback 7 --to build");
  });

  it("prints needs-you as JSON with ok false", async () => {
    const e = await open({ steps: [] });
    const result = await e.run("start", "7", "--json");
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      outcome: "stopped",
      stop: "needs-you",
      stage: "needs-you"
    });
  });

  it("exits 1 when the issue needs the owner, and says why", async () => {
    const e = await open({
      github: {
        snapshot: snapshotOf({
          labelEvents: [
            {
              id: 1,
              action: "labeled",
              label: "ready-for-agent",
              actor: "stranger",
              createdAt: "2026-10-07T08:00:00Z"
            }
          ]
        })
      }
    });
    const result = await e.run("start", "7");
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("needs you");
    expect(result.stdout).toContain("stranger");
    expect(result.stdout).toContain("fix the issue, then run: pnpm desk start 7");
  });

  it("--override lets the owner run an issue without the label, and logs it", async () => {
    const e = await open({
      steps: [planStep()],
      github: { snapshot: snapshotOf({ labelEvents: [], labels: [] }) }
    });
    const result = await e.run("start", "7", "--override");
    expect(result.code).toBe(0);
    expect(result.stderr).toContain("override:");
  });

  it("exits 1 and writes nothing when gh is signed in as someone else", async () => {
    const e = await open({ github: { viewer: "stranger" } });
    const result = await e.run("start", "7", "--override");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("refused (intake-refused)");
    await expect(stat(path.join(e.issueDir(), "state.json"))).rejects.toThrow();
  });

  it("refuses an issue that another desk process drives, and releases its own lease", async () => {
    const e = await open({ steps: [planStep()] });
    await mkdir(e.issueDir(), { recursive: true });
    const held = await acquireLease(path.join(e.issueDir(), "lease.json"));
    expect(held.status).toBe("acquired");
    const blocked = await e.run("start", "7");
    expect(blocked.code).toBe(1);
    expect(blocked.stderr).toContain("refused (leased)");
    if (held.status === "acquired") await held.lease.release();

    expect((await e.run("start", "7")).code).toBe(0);
    await expect(stat(path.join(e.issueDir(), "lease.json"))).rejects.toThrow();
  });

  it("reports an invalid config file", async () => {
    const e = await open();
    await e.writeConfig({ maxTestLoops: -1 });
    const result = await e.run("start", "7");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Config error (invalid-config)");
  });

  it("refuses a second start of an issue that is past intake", async () => {
    const e = await open({ steps: [planStep()] });
    expect((await e.run("start", "7")).code).toBe(0);
    const again = await e.run("start", "7");
    expect(again.code).toBe(1);
    expect(again.stderr).toContain("refused (already-started)");
  });
});

describe("write-back and snapshot files", () => {
  it("writes labels by default and nothing with --no-writeback, and keeps that for later calls", async () => {
    const e = await open({ steps: [planStep(), buildStep(), reviewStep()] });
    expect((await e.run("start", "7", "--no-writeback")).code).toBe(0);
    expect(e.github.labelEdits).toEqual([]);
    expect(e.github.comments).toEqual([]);

    // Not repeated on the next call: the issue remembers.
    expect((await e.run("approve", "7")).code).toBe(0);
    expect(e.github.labelEdits).toEqual([]);
    expect(e.github.comments).toEqual([]);
  });

  it("writes to GitHub when the flag is absent", async () => {
    const e = await open({ steps: [planStep()] });
    await e.run("start", "7");
    expect(e.github.labelEdits.length).toBeGreaterThan(0);
    expect(e.github.comments.length).toBeGreaterThan(0);
  });

  it("reads an issue from a snapshot file with --override and never writes to GitHub", async () => {
    const e = await open({ steps: [planStep(), buildStep(), reviewStep()] });
    const file = path.join(e.root, "issue.snapshot.json");
    await writeFile(
      file,
      JSON.stringify(snapshotOf({ number: 9001, labelEvents: [], labels: [] }))
    );
    const refused = await e.run("start", "9001", "--snapshot-file", file);
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain("refused (authorization)");

    const started = await e.run("start", "9001", "--override", "--snapshot-file", file);
    expect(started.code).toBe(0);
    expect(started.stdout).toContain("#9001: waiting for you (stage plan-gate");
    const approved = await e.run("approve", "9001");
    expect(approved.code).toBe(0);
    expect(approved.stdout).toContain("stage pr-review");
    expect(e.github.labelEdits).toEqual([]);
    expect(e.github.comments).toEqual([]);
  });

  it("resolves a relative snapshot path against the working directory and reports a bad file", async () => {
    const e = await open();
    const result = await e.run("start", "9001", "--override", "--snapshot-file", "missing.json");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Cannot read the snapshot file");
    expect(result.stderr).toContain(path.join(e.repo, "missing.json"));
  });
});

describe("approve", () => {
  it("runs build, check, and review and stops at pr-review", async () => {
    const e = await open({ steps: [planStep(), buildStep(), reviewStep()] });
    await e.run("start", "7");
    const result = await e.run("approve", "7");

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`${BELL}#7: waiting for you (stage pr-review, waiting)`);
    expect(result.stdout).toContain("Review approved with 0 finding(s).");
    expect(result.stdout).toContain(
      'send feedback: pnpm desk feedback 7 --to build|review|plan "<text>"'
    );
    expect(result.stdout).toContain("see what ship would do: pnpm desk ship 7 --dry-run");
    expect(result.stdout).toContain("ship as a draft PR: pnpm desk ship 7 --confirm");
    expect(result.stderr).toContain("[builder] Skill kaine-test");
    expect(result.stderr).toContain("[reviewer] Skill kaine-review");
  });

  it.each([
    ["an unknown issue", ["approve", "99"], "refused (unknown-issue)"],
    ["a bad number", ["approve", "abc"], "Expected an issue number"]
  ])("fails for %s", async (_name, argv, text) => {
    const e = await open();
    const result = await e.run(...argv);
    expect(result.code).toBe(argv[1] === "abc" ? 2 : 1);
    expect(result.stderr).toContain(text);
  });

  it("refuses in the wrong stage and changes nothing", async () => {
    const e = await open({ steps: [planStep(), buildStep(), reviewStep()] });
    await e.run("start", "7");
    await e.run("approve", "7");
    const before = await readFile(path.join(e.issueDir(), "state.json"), "utf8");
    const result = await e.run("approve", "7");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("refused (invalid-transition)");
    expect(await readFile(path.join(e.issueDir(), "state.json"), "utf8")).toBe(before);
  });

  it("prints a refusal as JSON with --json", async () => {
    const e = await open();
    const result = await e.run("approve", "99", "--json");
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      outcome: "refused",
      refusal: "unknown-issue",
      stage: null
    });
    expect(result.stderr).toBe("");
  });
});

describe("feedback", () => {
  it("sends words to the planner, runs it again, and stops at the gate", async () => {
    const e = await open({ steps: [planStep(), planStep()] });
    await e.run("start", "7");
    const result = await e.run("feedback", "7", "--to", "plan", "Add", "an", "empty", "state");

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("stage plan-gate");
    const notes = await readFile(path.join(e.issueDir(), "artifacts", "feedback.md"), "utf8");
    expect(notes).toContain("Add an empty state");
    expect(e.runner.requests.at(-1)?.prompt).toContain("Add an empty state");
  });

  it("reads the feedback from a file with --file", async () => {
    const e = await open({ steps: [planStep(), planStep()] });
    await e.run("start", "7");
    const file = path.join(e.root, "notes.txt");
    await writeFile(file, "  Cover the zero rows case.\n");
    const result = await e.run("feedback", "7", "--to=plan", "--file", file);
    expect(result.code).toBe(0);
    expect(e.runner.requests.at(-1)?.prompt).toContain("Cover the zero rows case.");
  });

  it("keeps words that start with a dash after --", async () => {
    const e = await open({ steps: [planStep(), planStep()] });
    await e.run("start", "7");
    const result = await e.run("feedback", "7", "--to", "plan", "--", "--verbose", "output");
    expect(result.code).toBe(0);
    expect(e.runner.requests.at(-1)?.prompt).toContain("--verbose output");
  });

  it.each([
    ["no target", ["feedback", "7", "words"]],
    ["a bad target", ["feedback", "7", "--to", "ship", "words"]],
    ["no text", ["feedback", "7", "--to", "plan"]],
    ["blank text", ["feedback", "7", "--to", "plan", "  "]],
    ["words and a file", ["feedback", "7", "--to", "plan", "--file", "x", "words"]],
    ["no issue", ["feedback", "--to", "plan", "words"]]
  ])("exits 2 for %s", async (_name, argv) => {
    const e = await open();
    const result = await e.run(...argv);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Usage:");
  });

  it("exits 1 when the file cannot be read", async () => {
    const e = await open();
    const result = await e.run("feedback", "7", "--to", "plan", "--file", "nope.txt");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Cannot read nope.txt");
  });

  it("refuses a target the stage does not allow", async () => {
    const e = await open({ steps: [planStep()] });
    await e.run("start", "7");
    const result = await e.run("feedback", "7", "--to", "build", "words");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("refused (invalid-transition)");
  });
});

describe("continue", () => {
  it("retries the stage that needs you, then stops at the gate", async () => {
    const e = await open({ steps: [planStep({ failure: TIMEOUT }), planStep()] });
    const first = await e.run("start", "7");
    expect(first.code).toBe(1);
    expect(first.stdout).toContain("continue with: pnpm desk continue 7 (retries 'plan')");

    const result = await e.run("continue", "7");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("#7: waiting for you (stage plan-gate");
  });

  it("accepts --from to retry another stage", async () => {
    const e = await open({ steps: [planStep({ failure: TIMEOUT }), planStep()] });
    await e.run("start", "7");
    const result = await e.run("continue", "7", "--from", "plan");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("stage plan-gate");
  });

  it("recovers an interrupted issue first, then continues it", async () => {
    const e = await open({ steps: [planStep(), planStep()] });
    await e.run("start", "7");
    // A desk that was killed during the plan stage leaves `running` behind.
    const file = path.join(e.issueDir(), "state.json");
    await writeFile(
      file,
      JSON.stringify({ ...(await stateOf(e)), stage: "plan", status: "running", resumeStage: null })
    );

    const result = await e.run("continue", "7");
    expect(result.stderr).toContain("#7: Interrupted: the desk stopped while 'plan' was running.");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("stage plan-gate");
    expect((await stateOf(e)).history.map((event) => event.event)).toContain("interrupted");
  });

  it("refuses when the issue does not need you, and exits 2 for a bad stage", async () => {
    const e = await open({ steps: [planStep()] });
    await e.run("start", "7");
    const refused = await e.run("continue", "7");
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain("refused (invalid-transition)");
    const usage = await e.run("continue", "7", "--from", "nowhere");
    expect(usage.code).toBe(2);
    expect(usage.stderr).toContain("'nowhere' is not a stage");
  });
});

describe("cancel and remove", () => {
  it("cancels an issue at a gate and refuses to cancel it again", async () => {
    const e = await open({ steps: [planStep()] });
    await e.run("start", "7");
    const result = await e.run("cancel", "7");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("#7: cancelled (stage cancelled, done)");
    expect(result.stdout).not.toContain(BELL);
    const again = await e.run("cancel", "7");
    expect(again.code).toBe(1);
    expect(again.stderr).toContain("refused (invalid-transition)");
  });

  it("removes the state and the worktree, and keeps the branch", async () => {
    const e = await open({ steps: [planStep()] });
    await e.run("start", "7");
    const result = await e.run("remove", "7");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("#7: removed the desk state. The worktree is removed.");
    expect(result.stdout).toContain("The branch 'KAINE-7-feat-export-reports' stays");
    await expect(stat(e.issueDir())).rejects.toThrow();
  });

  it("keeps the worktree with --keep-worktree", async () => {
    const e = await open({ steps: [planStep()] });
    await e.run("start", "7");
    const result = await e.run("remove", "7", "--keep-worktree", "--json");
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      issue: 7,
      outcome: "removed",
      worktreeRemoved: false,
      branch: "KAINE-7-feat-export-reports"
    });
    expect(e.git.trees()).toContain(e.worktree());
  });

  it("refuses a dirty worktree, and --force removes it", async () => {
    const e = await open({
      steps: [planStep(), buildStep({ output: builderOutput({ blockers: ["stuck"] }) })]
    });
    await e.run("start", "7");
    await e.run("approve", "7");
    const refused = await e.run("remove", "7");
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain("refused (worktree-dirty)");
    expect(refused.stderr).toContain("src/feature.ts");
    expect((await stat(e.issueDir())).isDirectory()).toBe(true);

    const forced = await e.run("remove", "7", "--force");
    expect(forced.code).toBe(0);
    await expect(stat(e.issueDir())).rejects.toThrow();
  });

  it("exits 1 for an issue without state, and 2 without a number", async () => {
    const e = await open();
    const missing = await e.run("remove", "5");
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain("#5 has no desk state. Nothing to remove.");
    expect((await e.run("remove")).code).toBe(2);
  });
});

describe("ship", () => {
  it("refuses outside pr-review and changes nothing", async () => {
    const e = await open({ steps: [planStep()] });
    await e.run("start", "7");
    const result = await e.run("ship", "7");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("refused (invalid-transition)");
    expect(e.github.createdPullRequests).toEqual([]);
  });

  it("refuses a ship without --confirm when there is no terminal, and changes nothing", async () => {
    const e = await open({ steps: [planStep(), buildStep(), reviewStep()] });
    await e.run("start", "7");
    await e.run("approve", "7");
    const before = await readFile(path.join(e.issueDir(), "state.json"), "utf8");

    const result = await e.run("ship", "7");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("refused (ship-refused)");
    expect(result.stderr).toContain("no terminal to ask");
    expect(result.stderr).toContain("pnpm desk ship 7 --confirm");
    expect(await readFile(path.join(e.issueDir(), "state.json"), "utf8")).toBe(before);
    expect(e.github.createdPullRequests).toEqual([]);
  });

  it("asks on a terminal, and a no or an empty answer ships nothing", async () => {
    const questions: string[] = [];
    const answers = [false];
    const e = await open({
      steps: [planStep(), buildStep(), reviewStep()],
      deps: {
        ask: (question) => {
          questions.push(question);
          return Promise.resolve(answers.shift() ?? false);
        }
      }
    });
    await e.run("start", "7");
    await e.run("approve", "7");
    const before = await readFile(path.join(e.issueDir(), "state.json"), "utf8");

    const result = await e.run("ship", "7");
    expect(questions).toEqual(["Ship #7 as a draft PR? [y/N] "]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("You did not confirm. Nothing was changed.");
    expect(await readFile(path.join(e.issueDir(), "state.json"), "utf8")).toBe(before);
  });

  it("does not ask where the ship cannot start, and never combines --confirm with --dry-run", async () => {
    const questions: string[] = [];
    const e = await open({
      steps: [planStep()],
      deps: {
        ask: (question) => {
          questions.push(question);
          return Promise.resolve(true);
        }
      }
    });
    await e.run("start", "7");
    const result = await e.run("ship", "7");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("refused (invalid-transition)");
    expect(questions).toEqual([]);

    const both = await e.run("ship", "7", "--confirm", "--dry-run");
    expect(both.code).toBe(2);
    expect(both.stderr).toContain("not both");
  });

  it("refuses an issue it does not know", async () => {
    const e = await open();
    const result = await e.run("ship", "9");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("refused (unknown-issue)");
  });
});

describe("notifications", () => {
  const notifyRoute = (calls: { argv: readonly string[]; env: Record<string, string> }[]) => ({
    argv: ["say-it"],
    reply: (request: { argv: readonly string[]; env?: Readonly<Record<string, string>> }) => {
      calls.push({ argv: request.argv, env: { ...request.env } });
      return ok();
    }
  });

  it("runs the notify command as an argv with the DESK_* variables at a gate", async () => {
    const calls: { argv: readonly string[]; env: Record<string, string> }[] = [];
    const e = await open({ steps: [planStep()], routes: [notifyRoute(calls)] });
    await e.writeConfig({ notifyCommand: `say-it '{kind} for' #{issue} -- "$HOME; rm -rf /"` });
    const result = await e.run("start", "7");

    expect(result.code).toBe(0);
    expect(calls).toHaveLength(1);
    // No shell: `$HOME; rm -rf /` stays one word.
    expect(calls[0]?.argv).toEqual(["say-it", "gate for", "#7", "--", "$HOME; rm -rf /"]);
    expect(calls[0]?.env).toMatchObject({
      DESK_ISSUE: "7",
      DESK_STAGE: "plan-gate",
      DESK_KIND: "gate"
    });
    expect(calls[0]?.env.DESK_MESSAGE).toContain("Plan ready");
  });

  it("notifies on needs-you, and a failing command only logs a warning", async () => {
    const e = await open({
      routes: [{ argv: ["say-it"], reply: fail("no speaker", 3) }]
    });
    await e.writeConfig({ notifyCommand: ["say-it", "{kind}"] });
    const result = await e.run("start", "7");
    expect(result.code).toBe(1); // needs-you, not a notify failure
    expect(result.stderr).toContain("notify command failed (exit 3): no speaker");
    expect(e.extraCalls.length).toBeGreaterThan(0);
  });
});

describe("agent log file", () => {
  const SECRETS = [
    "sk-ant-api03-ZZZsecretkeyZZZ123",
    "abcdef123456tokenvalue",
    "ghp_1234567890abcdefABCDEF1234567890abcd",
    "github_pat_11ABCDEFG0abcdefghijkl_mnopqrstuvwxyz"
  ];

  it("persists redacted agent, history, and log records, and never a secret", async () => {
    const e = await open({
      steps: [
        planStep({
          trace: [
            ...skillCalls(["kaine-write-plan"]),
            {
              type: "tool_call",
              id: "t1",
              tool: "Bash",
              command: `echo ${SECRETS[0]} Authorization: Bearer ${SECRETS[1]}`,
              paths: []
            },
            { type: "text", text: `my token is ${SECRETS[2]}` },
            { type: "tool_result", id: "t1", isError: false, exitCode: 0, output: SECRETS[3] ?? "" }
          ]
        })
      ]
    });
    const result = await e.run("start", "7", "--override");
    expect(result.code).toBe(0);

    const text = await readFile(path.join(e.issueDir(), "agent.log.jsonl"), "utf8");
    const records = text
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { kind: string; type?: string });
    expect(new Set(records.map((record) => record.kind))).toEqual(
      new Set(["history", "agent", "log"])
    );
    expect(records.some((record) => record.type === "tool_call")).toBe(true);
    expect(records.some((record) => record.type === "text")).toBe(true);
    for (const secret of SECRETS) {
      expect(text).not.toContain(secret);
      expect(result.stdout).not.toContain(secret);
      expect(result.stderr).not.toContain(secret);
    }
    expect(text).toContain("[redacted]");
  });

  it("appends across commands and is not written by remove", async () => {
    const e = await open({ steps: [planStep(), buildStep(), reviewStep()] });
    await e.run("start", "7");
    const first = (await readFile(path.join(e.issueDir(), "agent.log.jsonl"), "utf8")).length;
    await e.run("approve", "7");
    const second = (await readFile(path.join(e.issueDir(), "agent.log.jsonl"), "utf8")).length;
    expect(second).toBeGreaterThan(first);
    await e.run("remove", "7", "--force");
    await expect(stat(e.issueDir())).rejects.toThrow();
  });

  it("keeps working when the log cannot be written", async () => {
    const e = await open({ steps: [planStep()] });
    // A file where the issue directory's log should go: appends fail.
    await mkdir(e.issueDir(), { recursive: true });
    await mkdir(path.join(e.issueDir(), "agent.log.jsonl"));
    const result = await e.run("start", "7");
    expect(result.code).toBe(0);
    expect(result.stderr).toContain("The agent log could not be written");
  });
});
