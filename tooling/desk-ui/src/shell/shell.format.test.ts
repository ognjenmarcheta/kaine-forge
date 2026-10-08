import { describe, expect, it } from "vitest";

import {
  firstLine,
  formatClock,
  formatDuration,
  formatElapsed,
  relativeTime,
  safeHttpUrl
} from "./shell.format";

describe("safeHttpUrl", () => {
  it.each([
    ["https://github.com/o/r/pull/1", "https://github.com/o/r/pull/1"],
    ["http://127.0.0.1:3000/x", "http://127.0.0.1:3000/x"],
    ["javascript:alert(1)", null],
    ["data:text/html,<script>1</script>", null],
    ["not a url", null],
    [null, null],
    [undefined, null]
  ])("accepts only web links: %j", (value, expected) => {
    expect(safeHttpUrl(value)).toBe(expected);
  });
});

describe("firstLine", () => {
  it("returns the first line, trimmed", () => {
    expect(firstLine("  Two checks failed:  \nFAIL x")).toBe("Two checks failed:");
    expect(firstLine("")).toBe("");
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-03-01T12:00:00.000Z");
  it("speaks in the page language", () => {
    expect(relativeTime("2026-03-01T11:55:00.000Z", now, "en")).toBe("5 minutes ago");
    expect(relativeTime("2026-03-01T09:00:00.000Z", now, "en")).toBe("3 hours ago");
    expect(relativeTime("2026-03-01T11:55:00.000Z", now, "de")).toBe("vor 5 Minuten");
  });
  it("returns the raw text for a date it cannot read", () => {
    expect(relativeTime("later", now, "en")).toBe("later");
  });
});

describe("formatDuration", () => {
  it("joins hours, minutes, and seconds", () => {
    expect(formatDuration(3_723_000, "en")).toBe("1h 2m 3s");
    expect(formatDuration(45_000, "en")).toBe("45s");
    expect(formatDuration(0, "en")).toBe("0s");
  });
});

describe("formatElapsed", () => {
  it.each([
    [0, "0s"],
    [45_000, "45s"],
    [12 * 60_000 + 30_000, "12m"],
    [3 * 3_600_000 + 5 * 60_000, "3h 5m"],
    [3 * 3_600_000, "3h"],
    [2 * 86_400_000 + 4 * 3_600_000 + 59 * 60_000, "2d 4h"],
    [-5_000, "0s"]
  ])("shows %i ms as %s, with two units at most", (ms, text) => {
    expect(formatElapsed(ms, "en")).toBe(text);
  });
});

describe("formatClock", () => {
  it("shows the local time of day in the page language", () => {
    const iso = "2026-03-01T10:04:05.000Z";
    const local = new Date(iso);
    const expected = new Intl.DateTimeFormat("de", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(local);
    expect(formatClock(iso, "de")).toBe(expected);
    expect(formatClock(iso, "de")).toMatch(/^\d\d:\d\d:\d\d$/);
  });

  it("returns the raw text for a time it cannot read", () => {
    expect(formatClock("later", "en")).toBe("later");
  });
});
