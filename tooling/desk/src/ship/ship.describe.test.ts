import { describe, expect, it } from "vitest";

import type { ShipFailure } from "./ship.contract";
import { describeGateFailures, describeShipEvent, describeShipFailure } from "./ship.describe";
import { checkReportOf } from "./ship.testing";

describe("describeShipFailure", () => {
  it("names the kind and the message, and tells that a new run continues", () => {
    const text = describeShipFailure({
      kind: "push-failed",
      message: "git push failed.",
      log: "fatal: unable to access remote",
      progress: null
    });
    expect(text).toContain("Ship failed (push-failed): git push failed.");
    expect(text).toContain("fatal: unable to access remote");
    expect(text).toContain("A new ship run continues where this one stopped.");
  });

  it("keeps the last lines of a long hook log and redacts secrets", () => {
    const log = [
      ...Array.from({ length: 100 }, (_, index) => `line ${index}`),
      "pre-push: token=ghp_1234567890abcdefABCDEF1234567890abcd"
    ].join("\n");
    const failure: ShipFailure = {
      kind: "hook-failed",
      hook: "push",
      message: "A pre-push hook refused the push.",
      log,
      progress: null
    };
    const text = describeShipFailure(failure);
    expect(text).toContain("line 99");
    expect(text).not.toContain("line 10\n");
    expect(text).not.toContain("ghp_1234567890");
    expect(text).toContain("[redacted]");
  });

  it("includes the output of a rejected commit message", () => {
    const text = describeShipFailure({
      kind: "commit-message-invalid",
      message: "commitlint rejects the commit message.",
      output: "subject may not be empty",
      progress: null
    });
    expect(text).toContain("subject may not be empty");
  });
});

describe("describeShipFailure for failed checks", () => {
  it("points at the ship check report", () => {
    const text = describeShipFailure({
      kind: "checks-failed",
      message: "The ship checks failed (pnpm check).",
      report: checkReportOf({ passed: false }),
      progress: null
    });
    expect(text).toContain("Read ship/check-report.json in the artifacts folder.");
  });
});

describe("describeGateFailures and describeShipEvent", () => {
  it("lists each failed rule on its own line", () => {
    expect(
      describeGateFailures([
        { kind: "not-confirmed", message: "No confirmation." },
        { kind: "refs-baseline-missing", message: "No baseline." }
      ])
    ).toBe("- not-confirmed: No confirmation.\n- refs-baseline-missing: No baseline.");
  });

  it("writes one short line for a step and for a log message", () => {
    expect(describeShipEvent({ type: "step", step: "push", status: "done" })).toBe(
      "ship push done"
    );
    expect(
      describeShipEvent({ type: "step", step: "checks", status: "failed", detail: "pnpm check" })
    ).toBe("ship checks failed: pnpm check");
    expect(describeShipEvent({ type: "log", message: "hello" })).toBe("ship: hello");
  });
});
