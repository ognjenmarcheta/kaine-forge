import { describe, expect, it } from "vitest";

import { describeLogRecord, formatLogRecord, type LogRecord } from "./log.record";

const AT = "2026-03-01T10:04:05.000Z";

const records: readonly (readonly [LogRecord, string])[] = [
  [
    { v: 1, kind: "history", at: AT, issue: 7, stage: "plan", event: "plan-ready", note: "ok" },
    "plan: plan-ready - ok"
  ],
  [{ v: 1, kind: "log", at: AT, issue: 7, message: "setting up\nsecond line" }, "setting up"],
  [
    { v: 1, kind: "agent", at: AT, issue: 7, role: "builder", type: "tool_call", tool: "Bash" },
    "[builder] Bash"
  ]
];

describe("log record text", () => {
  it.each(records)("describes %j without a time", (record, text) => {
    expect(describeLogRecord(record)).toBe(text);
  });

  it.each(records)("prefixes the UTC time for a terminal: %j", (record, text) => {
    expect(formatLogRecord(record)).toBe(`10:04:05 ${text}`);
  });
});
