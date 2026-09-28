import { expect, test, type Page } from "@playwright/test";

import { actionRequestSchema, detailSchema, stateSchema } from "../src/factory.contract";

const id = "00000000-0000-4000-8000-000000000023";
const worktreeId = "a".repeat(24);
const artifact = "00000000-0000-4000-8000-000000000024";
const screenshotId = "00000000-0000-4000-8000-000000000025";
const summary = {
  worktreeId,
  worktree: "KAINE-test · fixture checkout",
  id,
  issue: 23,
  stage: "implement",
  provider: "codex",
  model: "gpt-6-astra",
  status: "failed",
  detail: "Acceptance check failed. <script>window.injected=true</script>",
  startedAt: "2026-09-28T01:00:00Z",
  finishedAt: "2026-09-28T01:05:00Z",
  lastActivity: "2026-09-28T01:05:00Z",
  phase: "validation",
  pilot: false,
  retryOf: null,
  pr: null,
  revision: "a".repeat(40),
  candidate: null,
  validation: "failed",
  acceptance: null,
  reviewMinutes: null,
  merge: "unavailable"
};
const initial = () =>
  stateSchema.parse({
    worktrees: [
      {
        id: worktreeId,
        path: "fixture checkout",
        branch: "KAINE-test",
        available: true,
        configured: true
      }
    ],
    selectedWorktree: worktreeId,
    repository: "owner/kaine-forge",
    enabled: true,
    watchEnabled: false,
    watcher: "stopped",
    stages: Object.fromEntries(
      ["intake", "spec", "implement", "review", "learn"].map((stage) => [
        stage,
        {
          provider: stage === "review" ? "claude" : "codex",
          model: stage === "review" ? "claude-opus-5-5" : "gpt-6-astra"
        }
      ])
    ),
    models: { codex: "gpt-6-astra", claude: "claude-opus-5-5" },
    at: new Date().toISOString(),
    active: null,
    warnings: [],
    runs: [summary],
    total: 1,
    page: 0,
    actions: [],
    github: {
      at: new Date().toISOString(),
      error: null,
      issues: [
        {
          number: 23,
          title: "Fix the acceptance check",
          group: "ready",
          reason: "Owner readiness verified"
        }
      ],
      pulls: {},
      failures: []
    },
    health: {
      at: new Date().toISOString(),
      docker: true,
      rollout: "Real issue-to-PR trial required",
      workers: [
        { provider: "codex", authenticated: true, isolation: true, version: "fixture CLI" }
      ],
      pilots: [{ provider: "codex", tier: "docs", current: true, at: new Date().toISOString() }]
    }
  });
async function fixture(page: Page) {
  const state = initial();
  const output = { text: "Test failed\ntoken=[redacted]", truncated: true };
  const requests: ReturnType<typeof actionRequestSchema.parse>[] = [];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/session")
      return route.fulfill({ status: 403, json: { error: "Token already exchanged" } });
    if (url.pathname === "/api/state") {
      const matching = !url.searchParams.get("search") || url.searchParams.get("search") === "23";
      const visible = matching && url.searchParams.get("pilots") !== "true";
      return route.fulfill({
        json: { ...state, runs: visible ? state.runs : [], total: visible ? 1 : 0 }
      });
    }
    if (url.pathname === "/api/actions") {
      const request = actionRequestSchema.parse(route.request().postDataJSON());
      requests.push(request);
      if (request.kind === "cancel") {
        state.active = null;
        state.activeRuns = state.activeRuns.filter((run) => run.id !== request.run);
        const run = state.runs[0];
        if (run) run.status = "cancelled";
      }
      return route.fulfill({
        status: 202,
        json: {
          id: request.key,
          request,
          state: "completed",
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          runId: id,
          detail: "Action recorded"
        }
      });
    }
    if (url.pathname.includes("/runs/"))
      return route.fulfill({
        json: detailSchema.parse({
          ...state.runs[0],
          events: [
            {
              version: 1,
              at: summary.startedAt,
              phase: "validation",
              state: "failed",
              detail: "Test failed",
              artifactId: artifact
            }
          ],
          warnings: [],
          artifacts: [
            { id: artifact, name: "acceptance.log", kind: "log", size: 123 },
            { id: screenshotId, name: "screen.png", kind: "image", size: 68 }
          ],
          checks: [{ command: "pnpm test", passed: false, artifactId: artifact }],
          evidence: [
            {
              criterion: "Owner sees the expected result",
              status: "failed",
              detail: "Result is missing"
            }
          ],
          findings: [
            {
              path: "src/feature.ts",
              line: 3,
              body: "<img src=x onerror=alert(1)>",
              blocking: true
            }
          ],
          invocations: [
            {
              provider: "claude",
              model: "claude-opus-5-5",
              cliVersion: "fixture",
              durationMs: 100,
              exitCode: 0,
              cleanup: true,
              usage: {}
            }
          ]
        })
      });
    if (url.pathname.endsWith(screenshotId))
      return route.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jv1sAAAAASUVORK5CYII=",
          "base64"
        )
      });
    if (url.pathname.includes("/artifacts/")) return route.fulfill({ json: output });
    return route.fulfill({ status: 404, json: { error: "Unavailable" } });
  });
  return { state, requests, output };
}
test("board exposes blockers, keyboard navigation and both themes", async ({ page }) => {
  await fixture(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Needs attention" })).toBeVisible();
  await expect(page.getByText("Acceptance check failed.", { exact: false })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.getByRole("combobox", { name: "Theme" }).click();
  await page.getByRole("option", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: "test-results/factory-board-dark.png", fullPage: true });
  await page.getByRole("combobox", { name: "Theme" }).click();
  await page.getByRole("option", { name: "Light", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.screenshot({ path: "test-results/factory-board-light.png", fullPage: true });
});
test("filters preserve focus and fixture pilots are separate", async ({ page }) => {
  await fixture(page);
  await page.goto("/?view=runs");
  const search = page.getByLabel("Search issue or result");
  await search.fill("999");
  await expect(page.getByText("0 results")).toBeVisible();
  await expect(search).toBeFocused();
  await search.fill("23");
  await expect(page.getByRole("link", { name: "#23", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show fixture pilots" }).click();
  await expect(page.getByText("0 results")).toBeVisible();
});

test("invalid dashboard links make no API requests or polling retries", async ({ page }) => {
  await fixture(page);
  await page.clock.install();
  const requests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) requests.push(request.url());
  });
  for (const search of [
    `run=${encodeURIComponent("../../../../api/unintended")}&worktree=${worktreeId}`,
    `run=${id}&worktree=${encodeURIComponent("../state")}`,
    `run=${id}`,
    `run=&worktree=${worktreeId}`
  ]) {
    await page.goto(`/?${search}`);
    await expect(page.getByRole("alert")).toHaveText("Invalid dashboard link");
    await expect(page.getByText("Loading…", { exact: false })).toHaveCount(0);
    await page.clock.fastForward(30000);
    expect(requests).toEqual([]);
  }
  await page.screenshot({ path: "test-results/factory-invalid-link.png" });
  await page.getByRole("link", { name: "Board", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Needs attention" })).toBeVisible();
});
test("run details map acceptance evidence to checks and redacted logs", async ({ page }) => {
  await fixture(page);
  await page.goto(`/?run=${id}&worktree=${worktreeId}`);
  await page.getByRole("button", { name: "Evidence", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Owner sees the expected result" })).toBeVisible();
  await expect(page.getByRole("img", { name: "screen.png" })).toBeVisible();
  await expect(page.getByRole("link", { name: "screen.png" })).toHaveAttribute("download", "");
  await page.getByRole("button", { name: "Checks", exact: true }).click();
  await page.getByRole("button", { name: "Logs", exact: true }).last().click();
  await expect(page.locator("pre")).toContainText("token=[redacted]");
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.getByText("<img src=x onerror=alert(1)>", { exact: true })).toBeVisible();
  await expect(page.locator("img")).toHaveCount(0);
});

test("worktree selection and action links retain the run's worktree", async ({ page }) => {
  const { state } = await fixture(page);
  state.actions.push({
    id: "00000000-0000-4000-8000-000000000047",
    request: {
      key: "00000000-0000-4000-8000-000000000047",
      kind: "retry",
      run: id,
      worktreeId
    },
    state: "completed",
    startedAt: summary.startedAt,
    finishedAt: summary.finishedAt,
    runId: id,
    detail: "Retry finished"
  });
  await page.goto("/?view=runs");
  const response = page.waitForResponse((value) => {
    const url = new URL(value.url());
    return url.pathname === "/api/state" && url.searchParams.get("worktree") === worktreeId;
  });
  await page.getByRole("combobox", { name: "Worktree", exact: true }).click();
  await page.getByRole("option", { name: "KAINE-test · fixture checkout", exact: true }).click();
  await response;
  await page.getByRole("link", { name: "View run", exact: true }).click();
  await expect(page).toHaveURL(`http://127.0.0.1:4178/?run=${id}&worktree=${worktreeId}`);
  await expect(page.getByRole("heading", { name: "#23 · Implementation" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
test("start shows the model and GitHub writes before sending one action", async ({ page }) => {
  const { requests } = await fixture(page);
  await page.goto(`/?worktree=${worktreeId}`);
  await page.getByLabel("Issue", { exact: true }).fill("23");
  await page.getByRole("button", { name: "Start stage", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("gpt-6-astra");
  await expect(page.getByRole("dialog")).toContainText("draft PR");
  expect(requests).toHaveLength(0);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(requests).toHaveLength(1);
  expect(requests[0]?.kind).toBe("start");
});
test("progress updates retain input focus and cancellation is explicit", async ({ page }) => {
  const { state, requests } = await fixture(page);
  state.active = id;
  const run = state.runs[0];
  if (run) {
    run.status = "running";
    run.finishedAt = null;
    state.activeRuns = [run];
  }
  await page.goto(`/?worktree=${worktreeId}`);
  await page.getByLabel("Issue", { exact: true }).fill("23");
  if (run) {
    run.phase = "review";
    run.lastActivity = new Date().toISOString();
  }
  await expect(page.getByText("Independent review", { exact: false }).first()).toBeVisible({
    timeout: 5000
  });
  await expect(page.getByLabel("Issue", { exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Cancel run", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(requests[0]?.kind).toBe("cancel");
});
test("health distinguishes detected credentials from a live request and blocks polling", async ({
  page
}) => {
  await fixture(page);
  await page.goto("/?view=health");
  await expect(page.getByText("Detected; live request not implied")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start watcher" })).toBeDisabled();
  await expect(page.getByText("Real issue-to-PR trial required")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Environment" })).toBeVisible();
});

test("another tab can reopen the launch URL with an existing session cookie", async ({ page }) => {
  await fixture(page);
  await page.goto("/#session=already-used-token");
  await expect(page.getByRole("heading", { name: "Needs attention" })).toBeVisible();
  await expect(page).toHaveURL("http://127.0.0.1:4178/");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("live command output arrives before completion and follow output is optional", async ({
  page
}) => {
  const { state, output } = await fixture(page);
  const run = state.runs[0];
  if (!run) throw new Error("Missing fixture run");
  run.status = "running";
  run.finishedAt = null;
  run.currentCommand = {
    command: "pnpm install --offline",
    startedAt: new Date().toISOString(),
    lastOutputAt: null,
    artifactId: artifact
  };
  state.activeRuns = [run];
  state.active = run.id;
  await page.goto(`/?run=${id}&worktree=${worktreeId}`);
  await page.getByRole("button", { name: "Logs", exact: true }).first().click();
  await expect(page.locator("pre")).toContainText("token=[redacted]");
  const follow = page.getByRole("checkbox", { name: "Follow output" });
  await follow.uncheck();
  output.text = "Installed 300 packages; validation still running";
  await expect(page.locator("pre")).toContainText("Installed 300 packages", { timeout: 5000 });
  await expect(follow).not.toBeChecked();
  await expect(follow).toBeFocused();
  expect(run.finishedAt).toBeNull();
});

test("all worktrees shows two active runs and cancellation targets only the selected run", async ({
  page
}) => {
  const { state, requests } = await fixture(page);
  const first = state.runs[0];
  if (!first) throw new Error("Missing fixture run");
  first.status = "running";
  const second = {
    ...first,
    id: "00000000-0000-4000-8000-000000000046",
    issue: 46,
    worktreeId: "b".repeat(24),
    worktree: "KAINE-other · second checkout"
  };
  state.worktrees.push({
    id: second.worktreeId,
    path: "second checkout",
    branch: "KAINE-other",
    available: true,
    configured: true
  });
  state.activeRuns = [first, second];
  state.active = first.id;
  state.runs.push(second);
  await page.goto("/");
  await expect(page.getByText(second.worktree, { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Cancel run", exact: true }).nth(1).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(requests[0]).toMatchObject({
    kind: "cancel",
    run: second.id,
    worktreeId: second.worktreeId
  });
  expect(state.activeRuns.map((run) => run.id)).toEqual([first.id]);
});
