import {
  buildFlowModel,
  type IssueDetail,
  type IssueState,
  type IssueSummary
} from "@repo/desk/contracts";
import { render, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";

import type { DeskApi } from "../api/api.client";
import type { EventSourceLike } from "../api/api.stream";
import { LanguageProvider } from "../i18n/i18n.t";
import { RouterProvider } from "../shell/shell.router";
import { DeskProvider } from "../state/desk.provider";

const unexpected = (name: string) => (): Promise<never> =>
  Promise.reject(new Error(`Test used api.${name} without a stub`));

/** A client where every route fails until a test stubs it. */
export const fakeApi = (overrides: Partial<DeskApi> = {}): DeskApi => ({
  exchangeSession: unexpected("exchangeSession"),
  health: unexpected("health"),
  issues: () => Promise.resolve([]),
  issue: unexpected("issue"),
  artifactText: unexpected("artifactText"),
  artifactJson: unexpected("artifactJson"),
  log: () => Promise.resolve({ entries: [], last: 0 }),
  act: unexpected("act"),
  ...overrides
});

export const quietSource = (): EventSourceLike => ({
  onopen: null,
  onerror: null,
  addEventListener: () => undefined,
  close: () => undefined
});

export function renderDesk(ui: ReactElement, api: DeskApi = fakeApi()): RenderResult {
  return render(
    <LanguageProvider>
      <RouterProvider>
        <DeskProvider api={api} createSource={quietSource}>
          {ui}
        </DeskProvider>
      </RouterProvider>
    </LanguageProvider>
  );
}

const AT = "2026-03-01T10:00:00.000Z";

export const makeState = (overrides: Partial<IssueState> = {}): IssueState => ({
  schemaVersion: 1,
  issueNumber: 7,
  stage: "plan-gate",
  status: "waiting",
  resumeStage: null,
  branch: "KAINE-7-feat-thing",
  worktreePath: null,
  sessions: {},
  loops: { check: 0, review: 0 },
  lastCheckFingerprint: null,
  history: [
    { at: AT, stage: "intake", event: "intake-started" },
    { at: AT, stage: "plan", event: "stage-started" },
    { at: AT, stage: "plan", event: "plan-ready" }
  ],
  authorization: null,
  createdAt: AT,
  updatedAt: AT,
  ...overrides
});

export type ReadableSummary = Extract<IssueSummary, { readonly readable: true }>;

export const makeSummary = (state: IssueState, busy = false): ReadableSummary => {
  const flow = buildFlowModel(state, Date.parse(AT));
  return {
    readable: true,
    issueNumber: state.issueNumber,
    title: "Add a thing",
    url: "https://github.com/owner/repo/issues/7",
    labels: [],
    stage: state.stage,
    status: state.status,
    branch: state.branch,
    loops: state.loops,
    needsYouReason: null,
    resumeStage: state.resumeStage,
    prUrl: state.prUrl ?? null,
    contract: { found: 6, total: 6 },
    stageEnteredAt: state.history.at(-1)?.at ?? null,
    progress: flow.nodes.map((node) => node.status),
    currentNode: flow.current,
    busy,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt
  };
};

export const makeDetail = (
  stateOverrides: Partial<IssueState> = {},
  summaryOverrides: Partial<ReadableSummary> = {}
): { detail: IssueDetail; summary: ReadableSummary } => {
  const state = makeState(stateOverrides);
  const summary = { ...makeSummary(state), ...summaryOverrides };
  const atGate = state.stage === "pr-review";
  return {
    summary,
    detail: {
      summary,
      state,
      flow: buildFlowModel(state, Date.parse(AT)),
      artifacts: [],
      contract: { found: 6, total: 6, missing: [] },
      check: null,
      review: null,
      ship: {
        atGate,
        checkPassed: atGate ? true : null,
        reviewApproved: atGate ? true : null,
        reviewedDiffMatches: atGate ? true : null,
        currentDiffMatches: atGate ? true : null,
        ready: atGate
      }
    }
  };
};
