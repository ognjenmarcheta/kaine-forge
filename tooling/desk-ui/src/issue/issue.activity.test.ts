import type { HistoryEvent, Stage } from "@repo/desk/contracts";
import { describe, expect, it } from "vitest";

import { activityGroups, isKnownEvent } from "./issue.activity";

const T0 = Date.parse("2026-03-01T10:00:00.000Z");
const event = (minute: number, stage: Stage, name: string, note?: string): HistoryEvent => ({
  at: new Date(T0 + minute * 60_000).toISOString(),
  stage,
  event: name,
  ...(note === undefined ? {} : { note })
});

const HISTORY: HistoryEvent[] = [
  event(0, "build", "stage-started"),
  event(2, "build", "build-complete"),
  event(3, "check", "stage-started"),
  event(4, "check", "check-failed", "fingerprint abc"),
  event(5, "build", "stage-started")
];

describe("activityGroups", () => {
  it("groups runs of a stage newest first and numbers the loop rounds", () => {
    const groups = activityGroups(HISTORY, T0 + 9 * 60_000, true);
    expect(groups.map((group) => [group.node, group.round])).toEqual([
      ["build", 2],
      ["check", 1],
      ["build", 1]
    ]);
    expect(groups[1]?.rows.map((row) => row.event)).toEqual(["check-failed", "stage-started"]);
  });

  it("measures each event until the next one, and the last one until now while it runs", () => {
    const groups = activityGroups(HISTORY, T0 + 9 * 60_000, true);
    expect(groups[2]?.rows.map((row) => row.durationMs)).toEqual([60_000, 120_000]);
    expect(groups[0]?.rows[0]).toMatchObject({ durationMs: 240_000, ongoing: true });
    const stopped = activityGroups(HISTORY, T0 + 9 * 60_000, false);
    expect(stopped[0]?.rows[0]).toMatchObject({ durationMs: null, ongoing: false });
  });

  it("names the outcome of each event and keeps the engine's note", () => {
    const rows = activityGroups(HISTORY, T0, false).flatMap((group) => group.rows);
    expect(rows.find((row) => row.event === "check-failed")).toMatchObject({
      outcome: "back",
      note: "fingerprint abc"
    });
    expect(rows.find((row) => row.event === "build-complete")?.outcome).toBe("done");
  });

  it("keeps a stop as its own group and an unknown event as information", () => {
    const groups = activityGroups(
      [event(0, "check", "check-failed"), event(1, "needs-you", "needs-you", "Stopped:\nreason")],
      T0,
      false
    );
    expect(groups[0]).toMatchObject({ node: null, stage: "needs-you", round: 1 });
    expect(isKnownEvent("needs-you")).toBe(true);
    expect(isKnownEvent("something-new")).toBe(false);
    expect(
      activityGroups([event(0, "build", "something-new")], T0, false)[0]?.rows[0]?.outcome
    ).toBe("info");
  });

  it("returns nothing for an empty history", () => {
    expect(activityGroups([], T0, true)).toEqual([]);
  });
});
