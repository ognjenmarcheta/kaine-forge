import { describe, expect, it } from "vitest";

import { createNotifier, notifyArgv, notifyEnv } from "./notify.command";
import type { PipelineNotification } from "../engine/pipeline.types";
import { fail, fakeExec, ok } from "../testing/exec.fake";

const gate: PipelineNotification = {
  issue: 12,
  stage: "plan-gate",
  kind: "gate",
  message: "Plan ready: add a thing"
};

describe("notifyEnv", () => {
  it("passes the notification as DESK_* variables", () => {
    expect(notifyEnv(gate)).toEqual({
      DESK_ISSUE: "12",
      DESK_STAGE: "plan-gate",
      DESK_KIND: "gate",
      DESK_MESSAGE: "Plan ready: add a thing"
    });
  });

  it("redacts secrets and bounds the message", () => {
    const env = notifyEnv({
      ...gate,
      message: `token sk-ant-api03-SECRETSECRET ${"x".repeat(5_000)}`
    });
    expect(env.DESK_MESSAGE).not.toContain("SECRETSECRET");
    expect(env.DESK_MESSAGE?.length).toBeLessThan(1_100);
  });
});

describe("notifyArgv", () => {
  it("fills the placeholders inside a word and keeps each word whole", () => {
    expect(
      notifyArgv(
        [
          "terminal-notifier",
          "-title",
          "Desk #{issue} {kind}",
          "-message",
          "{message}",
          "-x{stage}"
        ],
        { ...gate, message: "a b; $(rm -rf /) 'q'" }
      )
    ).toEqual([
      "terminal-notifier",
      "-title",
      "Desk #12 gate",
      "-message",
      "a b; $(rm -rf /) 'q'",
      "-xplan-gate"
    ]);
  });

  it("leaves other braces alone", () => {
    expect(notifyArgv(["echo", "{other}", "{{message}}"], gate)).toEqual([
      "echo",
      "{other}",
      "{Plan ready: add a thing}"
    ]);
  });
});

describe("createNotifier", () => {
  const setup = (reply = ok(), command: readonly string[] | null = ["notify", "{kind}"]) => {
    const logs: string[] = [];
    const fake = fakeExec([{ argv: ["notify"], reply }]);
    const notifier = createNotifier({
      exec: fake.exec,
      command: command === null ? undefined : [...command],
      cwd: "/repo",
      log: (message) => logs.push(message),
      timeoutMs: 1_234
    });
    return { notifier, fake, logs };
  };

  it("runs the command as an argv with the variables, in the repository, with a timeout", async () => {
    const { notifier, fake, logs } = setup();
    notifier.notify(gate);
    await notifier.settled();
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]).toMatchObject({
      argv: ["notify", "gate"],
      cwd: "/repo",
      timeoutMs: 1_234,
      env: { DESK_ISSUE: "12", DESK_KIND: "gate", DESK_STAGE: "plan-gate" }
    });
    expect(logs).toEqual([]);
  });

  it("does nothing without a command", async () => {
    const { notifier, fake } = setup(ok(), null);
    notifier.notify(gate);
    await notifier.settled();
    expect(fake.calls).toEqual([]);
  });

  it("logs a failing command and a timeout, and never throws", async () => {
    const failing = setup(fail("boom", 4));
    failing.notifier.notify(gate);
    await failing.notifier.settled();
    expect(failing.logs).toEqual(["notify command failed (exit 4): boom"]);

    const slow = setup({ code: null, timedOut: true });
    slow.notifier.notify(gate);
    await slow.notifier.settled();
    expect(slow.logs).toEqual(["notify command timed out after 1234 ms"]);

    const missing = setup(fail("spawn notify ENOENT", 127));
    missing.notifier.notify(gate);
    await missing.notifier.settled();
    expect(missing.logs[0]).toContain("exit 127");
  });

  it("logs an exec that throws", async () => {
    const logs: string[] = [];
    const notifier = createNotifier({
      exec: () => Promise.reject(new Error("exec exploded")),
      command: ["notify"],
      cwd: "/repo",
      log: (message) => logs.push(message)
    });
    notifier.notify(gate);
    await notifier.settled();
    expect(logs).toEqual(["notify command failed: exec exploded"]);
  });
});
