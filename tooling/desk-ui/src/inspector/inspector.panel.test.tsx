import {
  buildFlowModel,
  type FlowNodeId,
  type IssueDetail,
  type ReviewSummary
} from "@repo/desk/contracts";
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { StageSheet } from "./inspector.panel";
import {
  buildArtifact,
  planArtifact,
  reviewArtifact,
  scenarioBoard
} from "../../tests/fixture.data";
import { FlowGraph } from "../flow/flow.graph";
import { FlowStepper } from "../flow/flow.stepper";
import { fakeApi, makeDetail, renderDesk } from "../test/test.render";

const ARTIFACTS: Readonly<Record<string, string>> = {
  plan: planArtifact(),
  build: buildArtifact(),
  review: reviewArtifact()
};

const api = fakeApi({
  artifactJson: (_issue, id, schema) => {
    const text = ARTIFACTS[id];
    return text === undefined
      ? Promise.reject(new Error(`no artifact ${id}`))
      : Promise.resolve(schema.parse(JSON.parse(text)));
  }
});

const REVIEW: ReviewSummary = {
  verdict: "approve",
  blocking: 0,
  bySeverity: { Critical: 0, Consider: 1, Nit: 1, FYI: 0 },
  findings: [],
  rejected: 0,
  diffHash: "a".repeat(64),
  plainLanguage: "Small."
};

const detailOf = (issueNumber: number, patch: Partial<IssueDetail> = {}) => {
  const issue = scenarioBoard().find((entry) => entry.state.issueNumber === issueNumber);
  if (issue === undefined) throw new Error("missing seed");
  const { detail, summary } = makeDetail(issue.state);
  const reason =
    issue.state.stage === "needs-you" ? (issue.state.history.at(-1)?.note ?? null) : null;
  const readable = { ...summary, needsYouReason: reason };
  return {
    detail: {
      ...detail,
      artifacts: (["plan", "build", "review"] as const).map((id) => ({
        id,
        present: true,
        bytes: 1,
        updatedAt: null
      })),
      summary: readable,
      flow: buildFlowModel(issue.state, Date.now()),
      ...patch
    },
    summary: readable
  };
};

const show = (issueNumber: number, selected: FlowNodeId, patch: Partial<IssueDetail> = {}) => {
  const { detail, summary } = detailOf(issueNumber, patch);
  renderDesk(
    <StageSheet
      detail={detail}
      summary={summary}
      flow={detail.flow}
      nodeId={selected}
      revision="r1"
      onSelect={vi.fn()}
      onClose={vi.fn()}
    />,
    api
  );
};

const region = () => screen.getByRole("dialog");

/** The sheet as the issue page holds it: stepping changes the stage it shows. */
function Sheet({
  issueNumber,
  start,
  onClose
}: {
  readonly issueNumber: number;
  readonly start: FlowNodeId;
  readonly onClose: () => void;
}) {
  const { detail, summary } = detailOf(issueNumber);
  const [node, setNode] = useState<FlowNodeId>(start);
  return (
    <StageSheet
      detail={detail}
      summary={summary}
      flow={detail.flow}
      nodeId={node}
      revision="r1"
      onSelect={setNode}
      onClose={onClose}
    />
  );
}

describe("StageSheet", () => {
  it("names the selected stage, who works there, and its status, with four tiles", () => {
    show(104, "build");
    expect(within(region()).getByRole("heading", { name: "Build", level: 2 })).toBeTruthy();
    expect(region().textContent).toContain("Agent · Builder");
    expect(region().textContent).toContain("Running");
    expect(region().querySelectorAll(".desk-kpi")).toHaveLength(4);
    expect(region().textContent).toContain("Came back");
  });

  it("shows the plan's mapped acceptance criteria and open questions", async () => {
    show(101, "plan-gate");
    const list = await screen.findByRole("list", { name: "Acceptance criteria" });
    expect(list.textContent).toContain("Passed: ");
    expect(list.textContent).toContain("An empty board explains how to start an issue");
    // In the stage's own section, not only in the full result below it.
    const questions = screen.getAllByText("Should the empty state link to the docs?");
    expect(questions.some((node) => node.closest(".desk-inspector__section") !== null)).toBe(true);
    expect(region().textContent).toContain("You decide");
  });

  it("shows the builder's claimed checks as claims", async () => {
    show(104, "build");
    const list = await screen.findByRole("list", { name: "Checks the builder says it ran" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(list.textContent).toContain("Not known yet: ");
  });

  it("lists each check step with a failed one tinted", () => {
    show(102, "check", {
      check: {
        passed: false,
        kind: "loop",
        steps: [
          { argv: ["pnpm", "generate"], code: 0, timedOut: false, durationMs: 4200 },
          { argv: ["pnpm", "check:affected"], code: 1, timedOut: false, durationMs: 61_000 }
        ],
        fingerprint: "fp",
        diffHash: "a".repeat(64),
        generatedDrift: false,
        startedAt: "2026-03-01T10:00:00.000Z",
        finishedAt: "2026-03-01T10:01:00.000Z"
      }
    });
    const list = screen.getByRole("list", { name: "Steps" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map((row) => row.getAttribute("data-state"))).toEqual(["pass", "fail"]);
    expect(region().textContent).toContain("Check went back 1×");
  });

  it("shows the review verdict, findings by label, and the acceptance status", async () => {
    show(102, "review", { review: REVIEW });
    expect(region().textContent).toContain("Approved");
    expect(region().textContent).toContain("Consider: 1");
    expect(region().textContent).toContain("Nit: 1");
    const acceptance = await screen.findByRole("list", { name: "Acceptance criteria" });
    expect(acceptance.textContent).toContain("Empty board explains how to start");
  });

  it("shows the ship readiness as a checklist at PR review", () => {
    show(102, "pr-review");
    const list = screen.getByRole("list", { name: "Ship readiness" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((row) => row.dataset.state)
    ).toEqual(["pass", "pass", "pass", "pass"]);
  });

  it("shows the contract of the ticket", () => {
    show(102, "ticket");
    expect(screen.getByRole("list", { name: "Issue contract" }).textContent).toContain(
      "6 of 6 sections"
    );
  });

  it("shows why the desk needs the engineer, without a dangling colon", () => {
    show(103, "build");
    expect(region().textContent).toContain(
      "Needs you: Two consecutive checks failed the same way: FAIL apps/web/src/board.test.tsx"
    );
    expect(region().textContent).toContain("The same check failure came back.");
  });

  it("is a non-modal sheet that steps through the stages, stops at either end, and closes on Esc", async () => {
    const onClose = vi.fn();
    renderDesk(<Sheet issueNumber={102} start="plan" onClose={onClose} />, api);
    const sheet = screen.getByRole("dialog", { name: "Plan" });
    expect(sheet.getAttribute("aria-modal")).toBe("false");
    expect(sheet.textContent).toContain("Stage 2 of 9 · Agent · Planner");
    expect(document.activeElement).toBe(sheet);

    const previous = screen.getByRole("button", { name: "Previous stage" });
    await userEvent.click(previous);
    expect(region().textContent).toContain("Stage 1 of 9");
    expect(previous).toHaveProperty("disabled", true);
    // The button that disabled itself gave focus to the sheet, so the arrows keep working.
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("dialog", { name: "Ticket" })).toBeTruthy();

    for (let step = 0; step < 9; step += 1) await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("dialog", { name: "Open PR" }).textContent).toContain("Stage 9 of 9");
    expect(screen.getByRole("button", { name: "Next stage" })).toHaveProperty("disabled", true);
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

function Selectable({
  issueNumber,
  kind
}: {
  readonly issueNumber: number;
  readonly kind: "graph" | "stepper";
}) {
  const { detail, summary } = detailOf(issueNumber);
  const [selected, setSelected] = useState<FlowNodeId>("pr-review");
  return (
    <>
      <p data-testid="selected">{selected}</p>
      {kind === "graph" ? (
        <FlowGraph
          model={detail.flow}
          selected={selected}
          onSelect={setSelected}
          needsYouReason={summary.needsYouReason}
        />
      ) : (
        <FlowStepper
          model={detail.flow}
          selected={selected}
          onSelect={setSelected}
          needsYouReason={summary.needsYouReason}
        />
      )}
    </>
  );
}

describe("stage selection", () => {
  it("selects a stage from the stepper and marks the current one", async () => {
    renderDesk(<Selectable issueNumber={102} kind="stepper" />);
    const list = screen.getByRole("list", { name: "Stages and their status" });
    expect(within(list).getAllByRole("button")).toHaveLength(9);
    const current = within(list).getByRole("button", { name: /PR review/ });
    expect(current.getAttribute("aria-current")).toBe("step");
    expect(current.getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(within(list).getByRole("button", { name: /^Plan Passed/ }));
    expect(screen.getByTestId("selected").textContent).toBe("plan");
  });

  it("selects a graph node with Enter or Space", () => {
    renderDesk(<Selectable issueNumber={102} kind="graph" />);
    const node = document.querySelector('.react-flow__node[data-id="check"]');
    expect(node).not.toBeNull();
    if (node === null) return;
    fireEvent.keyDown(node, { key: "Enter" });
    expect(screen.getByTestId("selected").textContent).toBe("check");
    const plan = document.querySelector('.react-flow__node[data-id="plan"]');
    if (plan !== null) fireEvent.keyDown(plan, { key: " " });
    expect(screen.getByTestId("selected").textContent).toBe("plan");
    // Other keys do nothing.
    if (plan !== null) fireEvent.keyDown(plan, { key: "a" });
    expect(screen.getByTestId("selected").textContent).toBe("plan");
  });
});
