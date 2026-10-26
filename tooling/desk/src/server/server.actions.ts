import type { ActionName, ActionOutcome, ActionRequest, RefusalCode, StageId } from "../contracts";
import type { RemoveResult, PipelineRunner } from "../engine/pipeline.runner";
import type { DraftActionResult, ShipActionResult } from "../engine/pipeline.types";

/** The part of the pipeline runner the server drives. A real `PipelineRunner` fits it. */
export interface ServerRunner {
  readonly start: PipelineRunner["start"];
  readonly approvePlan: PipelineRunner["approvePlan"];
  readonly feedback: PipelineRunner["feedback"];
  readonly continueFrom: PipelineRunner["continueFrom"];
  readonly cancel: PipelineRunner["cancel"];
  readonly remove: PipelineRunner["remove"];
  readonly ship: PipelineRunner["ship"];
  readonly refreshPr: PipelineRunner["refreshPr"];
  readonly feedbackFromPr: PipelineRunner["feedbackFromPr"];
  readonly draft: PipelineRunner["draft"];
  readonly applyDraft: PipelineRunner["applyDraft"];
  readonly pause: PipelineRunner["pause"];
  readonly resume: PipelineRunner["resume"];
}

/** How a runner call ended, in the terms of the wire contract. */
export type Settled =
  | { readonly kind: "done"; readonly outcome: ActionOutcome }
  | { readonly kind: "refused"; readonly code: RefusalCode; readonly detail: string }
  | { readonly kind: "failed" };

export type Dispatched =
  /** Another action of this issue still runs. */
  | { readonly kind: "busy" }
  /** The runner is still working. The result follows as an `action-result` event. */
  | { readonly kind: "accepted" }
  | Settled;

export interface ActionDispatcherOptions {
  readonly runner: ServerRunner;
  /** How long a call may take before the server answers `accepted`. */
  readonly settleMs: number;
  readonly log: (issueNumber: number, text: string) => void;
  /** An issue started or stopped an action. */
  readonly onBusyChange: (issueNumber: number) => void;
  /** An `accepted` action ended. */
  readonly onLate: (issueNumber: number, action: ActionName, settled: Settled) => void;
}

export interface ActionDispatcher {
  readonly dispatch: (issueNumber: number, request: ActionRequest) => Promise<Dispatched>;
  readonly isBusy: (issueNumber: number) => boolean;
}

type RunnerResult = ShipActionResult | DraftActionResult | RemoveResult;

const settle = (result: RunnerResult): Settled => {
  if (result.outcome === "refused") {
    return { kind: "refused", code: result.refusal, detail: result.reason };
  }
  if (result.outcome === "dry-run") {
    // A dry run changes no state: the issue still waits at its gate. The plan says what would block.
    const blockers = result.plan.gate.failures.map(
      (failure) => `${failure.kind}: ${failure.message}`
    );
    return {
      kind: "done",
      outcome: {
        stop: "gate",
        stage: result.state.stage,
        message: blockers.length === 0 ? null : blockers.join("\n")
      }
    };
  }
  if (result.outcome === "drafted") {
    // The issue still waits at intake. The page reads the draft from its artifact.
    const { draft } = result;
    return {
      kind: "done",
      outcome: {
        stop: "needs-you",
        stage: result.state.stage,
        message: `Draft ready: contract ${draft.contract.found}/${draft.contract.total}, ${draft.recommendation}.`
      }
    };
  }
  if (result.outcome === "removed") {
    return { kind: "done", outcome: { stop: "removed", stage: null, message: null } };
  }
  const stage: StageId = result.state.stage;
  return { kind: "done", outcome: { stop: result.stop, stage, message: result.message } };
};

/**
 * `cancel` and `remove` exist to stop a running action, and `pause` to hold the issue after it,
 * so they never wait behind one.
 */
const isStopAction = (request: ActionRequest): boolean =>
  request.action === "cancel" || request.action === "remove" || request.action === "pause";

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : "unknown error";

/**
 * Run engine actions for the HTTP layer. One issue runs one action at a time
 * (a second answers `busy`). An action that takes longer than `settleMs`
 * keeps running in the background: the caller gets `accepted` and the result
 * arrives through `onLate`.
 */
export const createActionDispatcher = (options: ActionDispatcherOptions): ActionDispatcher => {
  const { runner } = options;
  const busy = new Set<number>();

  const run = (issueNumber: number, request: ActionRequest): Promise<RunnerResult> => {
    switch (request.action) {
      case "start":
        return runner.start(issueNumber, {
          override: request.override,
          ...(request.flowId === undefined ? {} : { flowId: request.flowId })
        });
      case "approve":
        return runner.approvePlan(
          issueNumber,
          request.note === undefined ? {} : { note: request.note }
        );
      case "feedback":
        return runner.feedback(issueNumber, request.to, request.text);
      case "continue":
        return runner.continueFrom(issueNumber, request.from);
      case "cancel":
        return runner.cancel(issueNumber);
      case "remove":
        return runner.remove(issueNumber, { force: request.force });
      case "ship":
        // The contract refuses a real ship without `confirm: true`.
        return runner.ship(issueNumber, { dryRun: request.dryRun });
      case "refresh-pr":
        return runner.refreshPr(issueNumber);
      case "pr-feedback":
        return runner.feedbackFromPr(
          issueNumber,
          request.text === undefined ? {} : { text: request.text }
        );
      case "draft":
        return runner.draft(issueNumber);
      case "apply-draft":
        return runner.applyDraft(issueNumber, { confirm: request.confirm });
      case "pause":
        return runner.pause(issueNumber);
      case "resume":
        return runner.resume(issueNumber);
    }
  };

  const dispatch: ActionDispatcher["dispatch"] = async (issueNumber, request) => {
    const exclusive = !isStopAction(request);
    if (exclusive && busy.has(issueNumber)) return { kind: "busy" };
    if (exclusive) {
      busy.add(issueNumber);
      options.onBusyChange(issueNumber);
    }

    const work: Promise<Settled> = run(issueNumber, request)
      .then(settle, (error: unknown): Settled => {
        options.log(issueNumber, `${request.action} failed: ${errorText(error)}`);
        return { kind: "failed" };
      })
      .finally(() => {
        if (!exclusive) return;
        busy.delete(issueNumber);
        options.onBusyChange(issueNumber);
      });

    let timer: NodeJS.Timeout | undefined;
    const later = new Promise<"later">((resolve) => {
      timer = setTimeout(() => resolve("later"), options.settleMs);
    });
    try {
      const first = await Promise.race([work, later]);
      if (first !== "later") return first;
    } finally {
      clearTimeout(timer);
    }
    void work.then((settled) => options.onLate(issueNumber, request.action, settled));
    return { kind: "accepted" };
  };

  return { dispatch, isBusy: (issueNumber) => busy.has(issueNumber) };
};
