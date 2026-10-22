import {
  REVIEW_SECTIONS,
  buildFlowModel,
  reviewerOutputSchema,
  type HistoryEvent,
  type IssueState,
  type LessonReport,
  type RunRecord,
  type Stage
} from "@repo/desk/contracts";

/**
 * Issues, artifacts, and history that the fixture server serves. The data is real
 * engine shapes: the server validates them when it reads them, so a drift in a
 * contract fails the browser test instead of hiding behind a mock.
 */

export const DIFF_HASH = "a".repeat(64);
const BASE_SHA = "b".repeat(40);
const OWNER_REPOSITORY = "https://github.com/owner/kaine-forge";

const START = Date.now() - 45 * 60_000;
const at = (): string => new Date(START).toISOString();

/** Minutes since the last change, for each seed issue. */
const MINUTES_AGO: Readonly<Record<number, number>> = { 101: 12, 102: 3, 103: 25, 104: 1, 105: 95 };

/** Spread the events evenly so that the last one is `minutesAgo` minutes old. */
const retime = (history: readonly HistoryEvent[], minutesAgo: number): HistoryEvent[] => {
  const end = Date.now() - minutesAgo * 60_000;
  return history.map((entry, index) => ({
    ...entry,
    at: new Date(end - (history.length - 1 - index) * 40_000).toISOString()
  }));
};

export const event = (stage: Stage, name: string, note?: string): HistoryEvent => ({
  at: at(),
  stage,
  event: name,
  ...(note === undefined ? {} : { note })
});

const toPlan = (): HistoryEvent[] => [
  event("intake", "intake-started"),
  event("setup", "intake-complete", "contract 6/6; ready for setup"),
  event("setup", "stage-started"),
  event("plan", "stage-started"),
  event("plan", "plan-ready")
];

const toReview = (): HistoryEvent[] => [
  ...toPlan(),
  event("plan-gate", "plan-approved"),
  event("build", "stage-started"),
  event("check", "stage-started"),
  event("check", "check-failed", "1 step failed"),
  event("build", "stage-started"),
  event("check", "stage-started"),
  event("check", "check-passed"),
  event("review", "stage-started"),
  event("review", "review-approved", "0 blocking")
];

export interface SeedIssue {
  readonly state: IssueState;
  readonly title: string;
  readonly labels: readonly string[];
  readonly artifacts: Readonly<Record<string, string>>;
}

const base = (
  issueNumber: number,
  rawHistory: HistoryEvent[],
  patch: Partial<IssueState>
): IssueState => {
  const history = retime(rawHistory, MINUTES_AGO[issueNumber] ?? 5);
  return {
    schemaVersion: 1,
    issueNumber,
    stage: "plan-gate",
    status: "waiting",
    resumeStage: null,
    branch: `KAINE-${String(issueNumber)}-feat-agent-desk`,
    worktreePath: null,
    sessions: {},
    loops: { check: 0, review: 0 },
    lastCheckFingerprint: null,
    history,
    authorization: null,
    baseSha: BASE_SHA,
    createdAt: history[0]?.at ?? new Date(START).toISOString(),
    updatedAt: history.at(-1)?.at ?? new Date(START).toISOString(),
    ...patch
  };
};

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

export const ticketText = (title: string, found = 6): string =>
  [
    `# ${title}`,
    "",
    `Readiness: contract ${String(found)}/6${found < 6 ? ", missing: Out of scope" : ""}`,
    "",
    "## Problem",
    "The board shows <b>nothing</b> when the list is empty. <script>window.injected = true</script>",
    "",
    "## Acceptance criteria",
    "- An empty board explains how to start an issue.",
    "- The text is escaped."
  ].join("\n");

/** A plan that the planner graded `risk`, or an ungraded one (written before the grade existed). */
export const planArtifact = (risk: "low" | "medium" | "high" | null = null): string =>
  json({
    summary: "Add an empty state to the board and cover it with a test.",
    files: [
      { path: "apps/web/src/board.tsx", action: "modify", purpose: "Show the empty state" },
      {
        path: "apps/web/src/board.empty.tsx",
        action: "create",
        purpose: "The empty state component"
      }
    ],
    tests: [
      { path: "apps/web/src/board.test.tsx", action: "modify", reason: "Cover the empty state" }
    ],
    acceptanceCriteria: [
      { criterion: "An empty board explains how to start an issue", change: "board.empty.tsx" }
    ],
    risks: ["The copy needs a translation in three languages"],
    ...(risk === null ? {} : { risk, riskReasons: ["Two files, one of them new, and a test"] }),
    openQuestions: ["Should the empty state link to the docs?"],
    changeset: { required: true, packages: ["@repo/web"], bump: "patch" },
    pr: { type: "feat", slug: "board-empty-state" },
    plainLanguage: "The board will say what to do when it has no issues."
  });

export const buildArtifact = (): string =>
  json({
    summary: "Added the empty state and a test.",
    filesChanged: ["apps/web/src/board.tsx", "apps/web/src/board.empty.tsx"],
    notes: ["Used the existing Card primitive"],
    blockers: [],
    claimedChecks: [
      { command: "pnpm --filter @repo/web test", result: "pass" },
      { command: "pnpm --filter @repo/web lint", result: "not-run" }
    ],
    plainLanguage: "The empty state is in place and its test passes."
  });

export const checkReportArtifact = (passed: boolean): string =>
  json({
    passed,
    kind: "loop",
    steps: [
      { argv: ["pnpm", "generate"], code: 0, timedOut: false, tail: "", durationMs: 4200 },
      {
        argv: ["pnpm", "check:affected"],
        code: passed ? 0 : 1,
        timedOut: false,
        tail: passed
          ? "Tasks: 6 successful, 6 total"
          : "FAIL apps/web/src/board.test.tsx\n  AssertionError: expected 'Empty' to be 'No issues yet'\n<img src=x onerror=alert(1)>",
        durationMs: 61_000
      }
    ],
    fingerprint: passed ? null : "board-test-assertion",
    diffHash: DIFF_HASH,
    generatedDrift: false,
    startedAt: new Date(START).toISOString(),
    finishedAt: new Date(START + 65_000).toISOString()
  });

export const reviewArtifact = (): string => {
  const review = reviewerOutputSchema.parse({
    verdict: "approve",
    findings: [
      {
        severity: "Consider",
        blocking: false,
        file: "apps/web/src/board.empty.tsx",
        line: 14,
        section: "UI & i18n",
        summary: "The heading level jumps from h1 to h3.",
        fix: "Use h2 for the empty state heading."
      },
      {
        severity: "Nit",
        blocking: false,
        file: "apps/web/src/board.tsx",
        line: 3,
        section: "Quality Gates",
        summary: "Import order differs from the rest of the file.",
        fix: ""
      }
    ],
    acceptanceStatus: [
      { criterion: "Empty board explains how to start", status: "met", evidence: "board.empty.tsx" }
    ],
    reviewSections: REVIEW_SECTIONS.map((heading) => ({ heading, verdict: "pass", notes: "" })),
    prDraft: { title: "feat(web): add a board empty state", body: "Adds an empty state." },
    plainLanguage: "The change is small and safe. Two small notes remain."
  });
  return json({ review, rejected: [], diffHash: DIFF_HASH });
};

export const DIFF_PATCH = [
  "diff --git a/apps/web/src/board.tsx b/apps/web/src/board.tsx",
  "index 111..222 100644",
  "--- a/apps/web/src/board.tsx",
  "+++ b/apps/web/src/board.tsx",
  "@@ -1,3 +1,5 @@",
  " import { Card } from '@repo/ui';",
  "+import { BoardEmpty } from './board.empty';",
  "-const x = 1;",
  "+const y = 2;",
  "diff --git a/apps/web/src/board.empty.tsx b/apps/web/src/board.empty.tsx",
  "new file mode 100644",
  "--- /dev/null",
  "+++ b/apps/web/src/board.empty.tsx",
  "@@ -0,0 +1,2 @@",
  "+export const BoardEmpty = () => null;",
  "+export default BoardEmpty;",
  ""
].join("\n");

export const prReviewIssue = (issueNumber: number, title: string): SeedIssue => ({
  title,
  labels: ["ready-for-agent", "agent:working"],
  state: base(issueNumber, toReview(), {
    stage: "pr-review",
    status: "waiting",
    loops: { check: 1, review: 0 },
    worktreePath: `/tmp/fixture/KAINE-${String(issueNumber)}`
  }),
  artifacts: {
    "ticket.md": ticketText(title),
    "plan.json": planArtifact(),
    "build.json": buildArtifact(),
    "check-report.json": checkReportArtifact(true),
    "review.json": reviewArtifact(),
    "diff.patch": DIFF_PATCH
  }
});

const needsYouIssue = (issueNumber: number, title: string): SeedIssue => {
  const history = [
    ...toPlan(),
    event("plan-gate", "plan-approved"),
    event("build", "stage-started"),
    event("check", "stage-started"),
    event("check", "check-failed", "1 step failed"),
    event("build", "stage-started"),
    event("check", "stage-started"),
    event("check", "check-failed", "1 step failed"),
    event(
      "needs-you",
      "needs-you",
      "Two consecutive checks failed the same way:\nFAIL apps/web/src/board.test.tsx"
    )
  ];
  return {
    title,
    labels: ["ready-for-agent", "agent:needs-you"],
    state: base(issueNumber, history, {
      stage: "needs-you",
      status: "waiting",
      resumeStage: "build",
      loops: { check: 2, review: 0 },
      lastCheckFingerprint: "board-test-assertion"
    }),
    artifacts: {
      "ticket.md": ticketText(title, 5),
      "plan.json": planArtifact(),
      "build.json": buildArtifact(),
      "check-report.json": checkReportArtifact(false)
    }
  };
};

/** An issue that stopped at intake: its body has no acceptance criteria under a known heading. */
export const intakeStoppedIssue = (issueNumber: number, title: string): SeedIssue => ({
  title,
  labels: [],
  state: base(
    issueNumber,
    [
      event("intake", "intake-started"),
      event(
        "needs-you",
        "needs-you",
        "No acceptance criteria found (contract 0/6, missing: outcome, acceptance-criteria, scope, validation, evidence, out-of-scope)."
      )
    ],
    { stage: "needs-you", status: "waiting", resumeStage: "intake" }
  ),
  artifacts: { "ticket.md": ticketText(title, 0) }
});

/** The intake draft the fixture's agent writes. */
export const draftArtifact = (issueNumber: number): string =>
  `${JSON.stringify({
    schema: 1,
    issue: issueNumber,
    createdAt: at(),
    originalBodyHash: "c".repeat(64),
    body: [
      "## Outcome",
      "",
      "pnpm audit passes without the temporary exception.",
      "",
      "## Acceptance criteria",
      "",
      "- The advisory is gone from auditConfig.ignoreGhsas",
      "",
      "## Scope",
      "",
      "pnpm-workspace.yaml",
      "",
      "## Validation",
      "",
      "pnpm check",
      "",
      "## Evidence",
      "",
      "unknown, investigate first",
      "",
      "## Out of scope",
      "",
      "- The Expo SDK pins",
      "",
      "## Original text",
      "",
      "> ## Exit condition",
      "> <b>Remove</b> the exception when a fix ships.",
      ""
    ].join("\n"),
    contract: { found: 6, total: 6 },
    acceptanceCriteria: 1,
    recommendation: "needs-info",
    reasons: ["It waits for a fixed upstream release."],
    unknowns: [{ section: "evidence", question: "Which release fixes the advisory?" }],
    plainLanguage: "Remove a temporary security exception once a fix exists.",
    provider: "claude",
    model: null
  })}\n`;

export const planGateIssue = (
  issueNumber: number,
  title: string,
  risk: "low" | "medium" | "high" | null = null
): SeedIssue => ({
  title,
  labels: ["ready-for-agent", "agent:working"],
  state: base(issueNumber, toPlan(), { stage: "plan-gate", status: "waiting" }),
  artifacts: { "ticket.md": ticketText(title), "plan.json": planArtifact(risk) }
});

const runningIssue = (issueNumber: number, title: string): SeedIssue => {
  const history = [
    ...toPlan(),
    event("plan-gate", "plan-approved"),
    event("build", "stage-started"),
    event("check", "stage-started"),
    event("check", "check-failed", "1 step failed"),
    event("build", "stage-started")
  ];
  return {
    title,
    labels: ["ready-for-agent", "agent:working"],
    state: base(issueNumber, history, {
      stage: "build",
      status: "running",
      loops: { check: 1, review: 0 }
    }),
    artifacts: {
      "ticket.md": ticketText(title),
      "plan.json": planArtifact(),
      "build.json": buildArtifact(),
      "check-report.json": checkReportArtifact(false)
    }
  };
};

const shippedIssue = (issueNumber: number, title: string): SeedIssue => {
  const history = [
    ...toReview(),
    event("pr-review", "ship-started"),
    event("shipped", "shipped", `${OWNER_REPOSITORY}/pull/321`)
  ];
  return {
    title,
    labels: ["ready-for-agent", "agent:pr-open"],
    state: base(issueNumber, history, {
      stage: "shipped",
      status: "done",
      prUrl: `${OWNER_REPOSITORY}/pull/321`,
      prNumber: 321,
      commitSha: "c".repeat(40)
    }),
    artifacts: {
      "ticket.md": ticketText(title),
      "plan.json": planArtifact(),
      "build.json": buildArtifact(),
      "check-report.json": checkReportArtifact(true),
      "review.json": reviewArtifact(),
      "diff.patch": DIFF_PATCH
    }
  };
};

/** The default board: one issue in every group, and two low-risk plans for the batch. */
export const scenarioBoard = (): SeedIssue[] => [
  planGateIssue(101, "Add an empty state to the board", "low"),
  prReviewIssue(102, "Explain the review verdict in the issue header"),
  needsYouIssue(103, "Fix the check step that fails twice"),
  runningIssue(104, "Show loop counts on the flow graph"),
  shippedIssue(105, "Open the draft pull request from the desk"),
  planGateIssue(106, "Translate the empty state", "low")
];

const run = (over: Partial<RunRecord> & Pick<RunRecord, "issue" | "role">): RunRecord => ({
  schema: 1,
  at: "2026-10-13T09:00:00.000Z",
  provider: "claude",
  model: "opus",
  isolation: "host",
  loops: { check: 0, review: 0 },
  durationMs: 240_000,
  ok: true,
  accepted: true,
  failureKind: null,
  usage: { inputTokens: 18_000, cachedInputTokens: 96_000, outputTokens: 4_200 },
  costUsd: 1.25,
  turns: 34,
  toolCalls: 52,
  editCalls: 6,
  failedToolCalls: 3,
  denials: 0,
  harness: null,
  planRisk: null,
  ...over
});

/** `runs.jsonl` of the board scenario: #102 ran every agent, #103 had a stuck builder, #99 was removed. */
export const scenarioRuns = (): RunRecord[] => [
  run({ issue: 102, role: "planner", durationMs: 90_000, costUsd: 0.4, turns: 12, editCalls: 0 }),
  run({ issue: 102, role: "builder" }),
  run({
    issue: 102,
    role: "reviewer",
    provider: "codex",
    model: null,
    costUsd: null,
    turns: null,
    usage: { inputTokens: 9_000, cachedInputTokens: 30_000, outputTokens: 1_100 },
    editCalls: 0
  }),
  run({
    issue: 103,
    role: "builder",
    ok: false,
    accepted: false,
    failureKind: "stuck",
    usage: null,
    costUsd: null,
    turns: null,
    failedToolCalls: 8
  }),
  run({ issue: 99, role: "builder", model: "sonnet", costUsd: 0.6, turns: 28 })
];

export const issueUrl = (issueNumber: number): string =>
  `${OWNER_REPOSITORY}/issues/${String(issueNumber)}`;

/** `lessons.jsonl` of the board scenario: one problem came back in #102 and #103. */
export const scenarioLessons = (): LessonReport => ({
  candidates: [
    {
      key: "review/Correctness/Consider",
      source: "review",
      issues: [102, 103],
      occurrences: 3,
      currentOccurrences: 1,
      lastSeen: "2026-10-13T09:00:00.000Z",
      samples: [
        { issue: 103, detail: "The export drops the header row", file: "src/export.ts" },
        { issue: 102, detail: "The CSV has no header row", file: "src/export.ts" }
      ]
    }
  ],
  belowThreshold: 2,
  minIssues: 2,
  currentRepo: null,
  promoted: [],
  invalidLines: 0
});

/** Flow model of a seed issue, for a unit test that wants the browser's input. */
export const flowOf = (issue: SeedIssue) => buildFlowModel(issue.state, Date.now());
