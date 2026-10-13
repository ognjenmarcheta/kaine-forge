import type { IssueDraft } from "@repo/desk/contracts";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { IssueActions } from "./gate.actions";
import { useGatePanel, type GatePanelProps } from "./gate.panel";
import type { DeskApi } from "../api/api.client";
import type { ActionSettled } from "../state/desk.provider";
import { fakeApi, makeDetail, renderDesk } from "../test/test.render";

const DRAFT: IssueDraft = {
  schema: 1,
  issue: 7,
  createdAt: "2026-10-13T09:00:00.000Z",
  originalBodyHash: "a".repeat(64),
  body: "## Outcome\n\nThe audit passes.\n\n## Original text\n\n> <b>old</b> text",
  contract: { found: 6, total: 6 },
  acceptanceCriteria: 1,
  recommendation: "needs-info",
  reasons: ["It waits for an upstream fix."],
  unknowns: [{ section: "evidence", question: "Which release fixes it?" }],
  plainLanguage: "Remove an exception later.",
  provider: "claude",
  model: null
};

const done = (message: string | null): ActionSettled => ({
  kind: "done",
  outcome: { stop: "needs-you", stage: "needs-you", message }
});

function Gate(props: GatePanelProps) {
  const gate = useGatePanel(props);
  return <>{gate.decision}</>;
}

const show = (run: IssueActions["run"], api: Partial<DeskApi>, withDraft = false) => {
  const { detail, summary } = makeDetail({ stage: "needs-you", resumeStage: "intake" });
  const artifacts = withDraft
    ? [{ id: "issue-draft" as const, present: true, bytes: 100, updatedAt: null }]
    : [];
  return renderDesk(
    <Gate
      detail={{ ...detail, artifacts }}
      summary={summary}
      actions={{ busy: false, run }}
      onRemoved={vi.fn()}
      layout="side"
    />,
    fakeApi({
      artifactJson: <T,>() => Promise.resolve(DRAFT as T),
      artifactText: () => Promise.resolve("Ticket text with <script>x</script>"),
      ...api
    })
  );
};

describe("Draft the issue format", () => {
  it("drafts, then opens the review with the proposal as plain text", async () => {
    const run = vi.fn<IssueActions["run"]>(() => Promise.resolve(done("Draft ready")));
    show(run, {});

    await userEvent.click(screen.getByRole("button", { name: "Draft the issue format" }));

    expect(run).toHaveBeenCalledWith({ action: "draft" });
    const dialog = await screen.findByRole("dialog", { name: "Draft of #7" });
    expect(within(dialog).getByText("Contract 6/6")).toBeTruthy();
    expect(within(dialog).getByText("Needs information")).toBeTruthy();
    expect(within(dialog).getByText("Which release fixes it?")).toBeTruthy();
    // Issue text stays text: no element is made from it.
    const proposed = within(dialog)
      .getAllByLabelText("Proposed body")
      .find((element) => element.tagName === "PRE");
    expect(proposed?.textContent).toContain("> <b>old</b> text");
    expect(document.querySelector("b")).toBeNull();
  });

  it("does not open a review when the draft failed and left no file", async () => {
    const run = vi.fn<IssueActions["run"]>(() => Promise.resolve(done("No criteria")));
    show(run, { artifactText: () => Promise.reject(new Error("missing")) });

    await userEvent.click(screen.getByRole("button", { name: "Draft the issue format" }));

    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("applies only after the second yes, and sends confirm: true", async () => {
    const run = vi.fn<IssueActions["run"]>(() => Promise.resolve(done(null)));
    show(run, {}, true);

    await userEvent.click(screen.getByRole("button", { name: "Review the draft" }));
    const dialog = await screen.findByRole("dialog", { name: "Draft of #7" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Apply to GitHub…" }));
    expect(run).not.toHaveBeenCalled();
    expect(within(dialog).getByText(/Replace the body of #7 on GitHub/)).toBeTruthy();

    await userEvent.click(within(dialog).getByRole("button", { name: "Replace the issue body" }));

    expect(run).toHaveBeenCalledWith({ action: "apply-draft", confirm: true });
  });
});
