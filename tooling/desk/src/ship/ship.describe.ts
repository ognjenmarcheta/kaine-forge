import type { ShipEvent, ShipFailure } from "./ship.contract";
import type { ShipGateFailure } from "./ship.gate";
import { redact } from "../log/log.redact";
import { boundedTail } from "../process/process.output";

/**
 * Plain text for the results of a ship run. The pipeline puts it in the
 * `needs-you` reason, which goes to the state file and to the status comment
 * on GitHub, so every line passes `redact()` and the output tails are cut.
 */

const TAIL_LINES = 20;
const TAIL_CHARS = 2000;

export const describeGateFailures = (failures: readonly ShipGateFailure[]): string =>
  failures.map((failure) => `- ${failure.kind}: ${failure.message}`).join("\n");

/** One log line for a progress event of the ship run. */
export const describeShipEvent = (event: ShipEvent): string =>
  event.type === "log"
    ? `ship: ${event.message}`
    : `ship ${event.step} ${event.status}${event.detail === undefined ? "" : `: ${event.detail}`}`;

const outputOf = (failure: ShipFailure): string => {
  if ("log" in failure) return failure.log;
  if (failure.kind === "commit-message-invalid") return failure.output;
  return "";
};

export const describeShipFailure = (failure: ShipFailure): string => {
  const output = boundedTail(outputOf(failure), TAIL_LINES, TAIL_CHARS);
  const lines = [`Ship failed (${failure.kind}): ${failure.message}`];
  if (failure.kind === "checks-failed") {
    lines.push("Read ship/check-report.json in the artifacts folder.");
  }
  if (output !== "") lines.push(output);
  lines.push("A new ship run continues where this one stopped. Fix the cause, then continue.");
  return redact(lines.join("\n"));
};
