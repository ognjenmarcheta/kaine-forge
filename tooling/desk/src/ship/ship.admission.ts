import { stepRoleOf, type IssueState } from "../contracts";

/**
 * Whether a ship may start, from the issue state alone. Pure: the runner asks it before
 * `continue` moves the state, and `prepareShip` asks it before it reads anything.
 *
 * - `confirmed`: the owner confirmed at the ship gate (the gate right before a ship that is not
 *   automatic). A dry run asks with this intent too.
 * - `automatic`: the flow's ship step is automatic and the issue has reached it.
 * - `retry`: the issue is at the ship step again, or at `needs-you` about to continue there,
 *   after a ship the owner confirmed or an automatic one.
 *
 * An issue that writes nothing to GitHub (no write-back, or a snapshot file) never ships: a
 * push and a PR are writes, and a later refresh could never end the issue. A dry run writes
 * nothing to GitHub, so it stays available.
 */

export const SHIP_INTENTS = ["confirmed", "automatic", "retry"] as const;
export type ShipIntent = (typeof SHIP_INTENTS)[number];

export type ShipAdmission =
  | { readonly ok: true }
  | {
      readonly ok: false;
      /** `invalid-transition`: the issue is not where this ship starts. */
      readonly refusal: "invalid-transition" | "ship-refused";
      readonly reason: string;
    };

export interface ShipAdmissionOptions {
  /** The issue may write to GitHub. */
  readonly writeback: boolean;
  readonly dryRun?: boolean | undefined;
}

export const shipAdmission = (
  state: IssueState,
  intent: ShipIntent,
  options: ShipAdmissionOptions
): ShipAdmission => {
  const n = state.issueNumber;
  const snapshot = state.flowSnapshot;
  const ship = snapshot.flow.steps.find((step) => step.kind === "ship");
  const refuse = (
    refusal: "invalid-transition" | "ship-refused",
    reason: string
  ): ShipAdmission => ({ ok: false, refusal, reason });
  if (ship === undefined || ship.kind !== "ship") {
    return refuse("invalid-transition", `The flow of #${n} has no ship step.`);
  }

  const gate = snapshot.flow.steps.find((step) => stepRoleOf(snapshot, step.id) === "ship-gate");
  switch (intent) {
    case "confirmed":
      if (stepRoleOf(snapshot, state.stage) !== "ship-gate") {
        return refuse(
          "invalid-transition",
          `A ship starts at the gate before a ship the owner confirms, and #${n} is at '${state.stage}'.`
        );
      }
      break;
    case "automatic":
      if (!ship.auto || state.stage !== ship.id) {
        return refuse(
          "invalid-transition",
          `#${n} is at '${state.stage}', not at an automatic ship step.`
        );
      }
      break;
    case "retry": {
      const there =
        state.stage === ship.id || (state.stage === "needs-you" && state.resumeStage === ship.id);
      if (!there || (state.shipConfirmed !== true && !ship.auto)) {
        // Only a ship that failed is retried: one the owner confirmed, or an automatic one. An
        // automatic ship has no ship gate, so the owner continues the recorded stage instead.
        return refuse(
          "ship-refused",
          ship.auto
            ? `'${ship.id}' runs automatically after the step before it. Continue #${n} from where it stopped: pnpm desk continue ${n}. Nothing was changed.`
            : `A ship starts only from '${gate?.id ?? "the gate before it"}', with your confirmation: pnpm desk ship ${n} --confirm. Nothing was changed.`
        );
      }
      break;
    }
  }

  if (!options.writeback && options.dryRun !== true) {
    return refuse(
      "ship-refused",
      `#${n} writes nothing to GitHub (no write-back or a snapshot file), so it cannot ship. Nothing was changed.`
    );
  }
  return { ok: true };
};
