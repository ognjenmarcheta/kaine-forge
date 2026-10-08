import type { ActionName, ActionOutcome, ActionRequest, RefusalCode, Stage } from "../contracts";
import type { RemoveResult, PipelineRunner } from "../engine/pipeline.runner";
import type { ShipActionResult } from "../engine/pipeline.types";

/** The part of the pipeline runner the server drives. A real `PipelineRunner` fits it. */
export interface ServerRunner {
  readonly start: PipelineRunner["start"];
  readonly approvePlan: PipelineRunner["approvePlan"];
  readonly feedback: PipelineRunner["feedback"];
  readonly continueFrom: PipelineRunner["continueFrom"];
  readonly cancel: PipelineRunner["cancel"];
  readonly remove: PipelineRunner["remove"];
  readonly ship: PipelineRunner["ship"];
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

const settle = (result: ShipActionResult | RemoveResult): Settled => {
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
  if (result.outcome === "removed") {
    return { kind: "done", outcome: { stop: "removed", stage: null, message: null } };
  }
  const stage: Stage = result.state.stage;
  return { kind: "done", outcome: { stop: result.stop, stage, message: result.message } };
};

/** `cancel` and `remove` exist to stop a running action, so they never wait behind one. */
const isStopAction = (request: ActionRequest): boolean =>
  request.action === "cancel" || request.action === "remove";

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

  const run = (
    issueNumber: number,
    request: ActionRequest
  ): Promise<ShipActionResult | RemoveResult> => {
    switch (request.action) {
      case "start":
        return runner.start(issueNumber, { override: request.override });
      case "approve":
        return runner.approvePlan(issueNumber);
      case "feedback":
        return runner.feedback(issueNumber, request.to, request.text);
      case "continue":
        return runner.continueFrom(issueNumber, request.from);
      case "cancel":
        return runner.cancel(issueNumber);
      case "remove":
        return runner.remove(issueNumber, { force: request.force });
      case "ship":
        return runner.ship(issueNumber, { confirm: request.confirm, dryRun: request.dryRun });
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
