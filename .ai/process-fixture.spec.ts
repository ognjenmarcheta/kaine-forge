import { expect, it } from "vitest";

import { createFixturePidReader } from "./process-fixture.util";

it.each(["\n", "\r\n"])("waits for a complete PID with %j line endings", (ending) => {
  const readPid = createFixturePidReader();
  expect(readPid(Buffer.from("123"))).toBeUndefined();
  expect(readPid(Buffer.from("45"))).toBeUndefined();
  expect(readPid(Buffer.from(ending))).toBe(12345);
  expect(readPid(Buffer.from("999\n"))).toBe(12345);
});

it("reads only the first complete line when several arrive together", () => {
  expect(createFixturePidReader()(Buffer.from("12345\n999\n"))).toBe(12345);
});

it.each(["", "0", "-12", "1.5", "1e3", "NaN", "Infinity", "2147483648", "9007199254740993"])(
  "rejects invalid PID %j before it can be used for cleanup",
  (line) => {
    const readPid = createFixturePidReader();
    expect(readPid(Buffer.from(line))).toBeUndefined();
    expect(() => readPid(Buffer.from("\n"))).toThrow("Synthetic process emitted an invalid PID");
  }
);
