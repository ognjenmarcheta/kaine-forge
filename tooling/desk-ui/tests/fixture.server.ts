import {
  createIssueStore,
  launchDeskServer,
  type IssueStore,
  type LaunchedDesk,
  type PipelineEvent,
  type PipelineResult,
  type ServerRunner,
  type ShipActionResult
} from "@repo/desk";
import type { HistoryEvent, IssueState } from "@repo/desk/contracts";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  DIFF_HASH,
  event,
  planGateIssue,
  prReviewIssue,
  scenarioBoard,
  type SeedIssue
} from "./fixture.data";

/**
 * A desk server for browser tests: the real HTTP layer (cookie, headers, event stream, static
 * files) over a real store in a temporary folder, with a scripted runner instead of agents.
 * A second, control server on the next port resets the data, changes an issue the way a CLI in
 * another terminal would, and reports which actions the page sent.
 */

const appPort = Number(process.env["DESK_FIXTURE_PORT"] ?? "4179");
const controlPort = appPort + 1;
const uiDir = path.resolve(import.meta.dirname, "../dist");

interface Call {
  readonly issue: number;
  readonly action: string;
  readonly payload: unknown;
}

interface ResetOptions {
  readonly scenario?: "board" | "empty";
  /** The ship dry run reports a failing gate rule. */
  readonly failShipGate?: boolean;
}

let desk: LaunchedDesk | null = null;
let root: string | null = null;
let calls: Call[] = [];
let emit: (event: PipelineEvent) => void = () => undefined;

const now = (): string => new Date().toISOString();

const writeSeed = async (store: IssueStore, issue: SeedIssue): Promise<void> => {
  const n = issue.state.issueNumber;
  await mkdir(store.artifactsDir(n), { recursive: true });
  const files: Record<string, string> = {
    ...issue.artifacts,
    "issue.json": `${JSON.stringify({ number: n, title: issue.title, url: `https://github.com/owner/kaine-forge/issues/${String(n)}`, labels: issue.labels })}\n`
  };
  for (const [name, content] of Object.entries(files)) {
    await writeFile(path.join(store.artifactsDir(n), name), content);
  }
  await store.write(issue.state);
};

const readState = async (store: IssueStore, issueNumber: number): Promise<IssueState> => {
  const result = await store.read(issueNumber);
  if (result.status !== "ok") throw new Error(`Fixture: no state for #${String(issueNumber)}`);
  return result.state;
};

const change = async (
  store: IssueStore,
  issueNumber: number,
  patch: Partial<IssueState>,
  ...added: HistoryEvent[]
): Promise<IssueState> => {
  const state = await readState(store, issueNumber);
  const next: IssueState = {
    ...state,
    ...patch,
    // Events added now happen now, so "time in stage" on the board is true.
    history: [...state.history, ...added.map((entry) => ({ ...entry, at: now() }))],
    updatedAt: now()
  };
  await store.write(next);
  return next;
};

const gate = (state: IssueState, message: string | null = null): PipelineResult => ({
  outcome: "stopped",
  stop: "gate",
  state,
  message
});

const buildRunner = (
  store: IssueStore,
  options: ResetOptions,
  log: (issue: number, message: string) => void
): ServerRunner => {
  const record = (issue: number, action: string, payload: unknown): void => {
    calls.push({ issue, action, payload });
    log(issue, `Fixture: ${action}`);
  };
  const reviewReady = async (issue: number): Promise<PipelineResult> => {
    const seed = prReviewIssue(issue, "reviewed");
    for (const [name, content] of Object.entries(seed.artifacts)) {
      if (name === "ticket.md" || name === "plan.json") continue;
      await writeFile(path.join(store.artifactsDir(issue), name), content);
    }
    return gate(
      await change(
        store,
        issue,
        { stage: "pr-review", status: "waiting" },
        event("review", "review-approved", "0 blocking")
      )
    );
  };
  return {
    start: async (issue, startOptions) => {
      record(issue, "start", startOptions ?? {});
      if (issue === 404) {
        return {
          outcome: "refused",
          refusal: "intake-refused",
          reason: "Issue #404 is closed.",
          state: null
        };
      }
      await writeSeed(store, planGateIssue(issue, `Started from the page (#${String(issue)})`));
      return gate(await readState(store, issue));
    },
    approvePlan: async (issue) => {
      record(issue, "approve", {});
      return reviewReady(issue);
    },
    feedback: async (issue, to, text) => {
      record(issue, "feedback", { to, text });
      return gate(
        await change(
          store,
          issue,
          { stage: "plan-gate", status: "waiting" },
          event("plan-gate", "feedback", `to ${to}`)
        )
      );
    },
    continueFrom: async (issue, from) => {
      record(issue, "continue", { from: from ?? null });
      return reviewReady(issue);
    },
    cancel: async (issue) => {
      record(issue, "cancel", {});
      const state = await change(
        store,
        issue,
        { stage: "cancelled", status: "done" },
        event("cancelled", "cancelled")
      );
      return { outcome: "stopped", stop: "cancelled", state, message: null };
    },
    remove: async (issue, removeOptions) => {
      record(issue, "remove", removeOptions ?? {});
      await rm(store.issueDir(issue), { recursive: true, force: true });
      return { outcome: "removed", worktreeRemoved: false, branch: null };
    },
    ship: async (issue, shipOptions): Promise<ShipActionResult> => {
      record(issue, "ship", shipOptions);
      const state = await readState(store, issue);
      if (shipOptions.dryRun === true) {
        const failures =
          options.failShipGate === true
            ? [{ kind: "check-stale", message: "The worktree changed after the checks ran." }]
            : [];
        const plan = {
          version: 1 as const,
          issue,
          dryRun: true,
          generatedAt: now(),
          branch: state.branch,
          baseSha: "b".repeat(40),
          gate: { ok: failures.length === 0, failures },
          changeset: {
            kind: "file" as const,
            reason: "A package changed",
            path: ".changeset/board-empty-state.md",
            packages: ["@repo/web"],
            bump: "patch" as const
          },
          changesetText: '---\n"@repo/web": patch\n---\n\nAdd a board empty state.\n',
          commitHeader: "feat(web): add a board empty state",
          pullRequest: {
            base: "main" as const,
            draft: true as const,
            title: "feat(web): add a board empty state"
          },
          files: [
            "apps/web/src/board.tsx",
            "apps/web/src/board.empty.tsx",
            ".changeset/board-empty-state.md"
          ],
          bodyHeadings: ["Summary", "Validation"],
          unfilledHeadings: [],
          attribution: [],
          commitlint: { ok: true, output: "" },
          gitIdentityProblem: null,
          pushes: "origin/main is not touched"
        };
        const dir = store.artifactsDir(issue);
        await writeFile(path.join(dir, "ship-plan.json"), `${JSON.stringify(plan)}\n`);
        await writeFile(
          path.join(dir, "pr-body.md"),
          "## Summary\nAdds an empty state.\n\nCloses #102\n"
        );
        return {
          outcome: "dry-run",
          state,
          plan,
          files: { plan: "", prBody: "", commitMessage: "" }
        };
      }
      if (!shipOptions.confirm) {
        return {
          outcome: "refused",
          refusal: "ship-refused",
          reason: "Shipping needs your explicit confirmation.",
          state
        };
      }
      // A real ship takes a while (hooks, push), so the page sees `accepted` and then the event.
      await new Promise((resolve) => setTimeout(resolve, 700));
      const shipped = await change(
        store,
        issue,
        {
          stage: "shipped",
          status: "done",
          prUrl: "https://github.com/owner/kaine-forge/pull/321",
          prNumber: 321
        },
        event("pr-review", "ship-started"),
        event("shipped", "shipped")
      );
      return { outcome: "stopped", stop: "shipped", state: shipped, message: null };
    }
  };
};

const reset = async (options: ResetOptions): Promise<{ launchUrl: string; url: string }> => {
  await desk?.close();
  if (root !== null) await rm(root, { recursive: true, force: true });
  root = await mkdtemp(path.join(tmpdir(), "desk-ui-fixture-"));
  calls = [];
  const store = createIssueStore(path.join(root, "state"));
  for (const issue of options.scenario === "empty" ? [] : scenarioBoard()) {
    await writeSeed(store, issue);
  }
  desk = await launchDeskServer({
    port: appPort,
    open: false,
    uiDir,
    print: () => undefined,
    tuning: { pollMs: 40, heartbeatMs: 2000, actionSettleMs: 300 },
    depsFactory: (onEvent: (event: PipelineEvent) => void) => {
      emit = onEvent;
      const log = (issue: number, message: string): void =>
        onEvent({ type: "log", issue, message });
      return Promise.resolve({
        runner: buildRunner(store, options, log),
        store,
        health: () =>
          Promise.resolve({
            ok: false,
            checks: [
              { id: "node", label: "Node.js", status: "ok", detail: "v22.0.0" },
              { id: "gh", label: "GitHub CLI", status: "warn", detail: "not logged in" },
              {
                id: "claude",
                label: "Claude CLI",
                status: "error",
                detail: "claude: command not found"
              }
            ]
          }),
        currentDiffHash: () => Promise.resolve(DIFF_HASH),
        uiDir
      });
    }
  });
  return { launchUrl: desk.launchUrl, url: desk.url };
};

const readBody = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf8");
  const parsed: unknown = text === "" ? {} : JSON.parse(text);
  return parsed;
};

const send = (response: ServerResponse, status: number, body: unknown): void => {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? Object.fromEntries(Object.entries(value)) : {};

createServer((request, response) => {
  void (async () => {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${String(controlPort)}`);
    try {
      if (url.pathname === "/ready") return send(response, 200, { ok: true });
      if (url.pathname === "/calls") return send(response, 200, calls);
      const body = asRecord(await readBody(request));
      if (url.pathname === "/reset") {
        return send(
          response,
          200,
          await reset({
            ...(body["scenario"] === "empty" ? { scenario: "empty" as const } : {}),
            ...(body["failShipGate"] === true ? { failShipGate: true } : {})
          })
        );
      }
      if (url.pathname === "/log") {
        // The server keeps log lines only while a page listens, so a test sends them after it loads.
        emit({ type: "log", issue: Number(body["issue"]), message: String(body["message"] ?? "") });
        return send(response, 200, { ok: true });
      }
      if (url.pathname === "/mutate" && desk !== null) {
        // A change from outside the server, like a CLI run in another terminal.
        const store = desk.runtime.store;
        const issue = Number(body["issue"]);
        await change(
          store,
          issue,
          {
            stage: body["stage"] === "pr-review" ? "pr-review" : "build",
            status: body["status"] === "running" ? "running" : "waiting"
          },
          event("build", "stage-started")
        );
        return send(response, 200, { ok: true });
      }
      return send(response, 404, { error: "unknown fixture route" });
    } catch (error) {
      return send(response, 500, { error: error instanceof Error ? error.message : "failed" });
    }
  })();
}).listen(controlPort, "127.0.0.1");

const stop = (): void => {
  void (async () => {
    await desk?.close();
    if (root !== null) await rm(root, { recursive: true, force: true });
    process.exit(0);
  })();
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
