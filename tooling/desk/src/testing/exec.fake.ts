import type { Exec, ExecRequest, ExecResult } from "../ports";

export interface FakeReply {
  readonly code?: number | null;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly timedOut?: boolean;
}

export interface FakeRoute {
  /** Matches when the argv starts with these words. */
  readonly argv: readonly string[];
  readonly reply: FakeReply | ((request: ExecRequest) => FakeReply);
}

export interface FakeExec {
  readonly exec: Exec;
  readonly calls: ExecRequest[];
}

export const ok = (stdout = ""): FakeReply => ({ code: 0, stdout });
export const fail = (stderr: string, code = 1): FakeReply => ({ code, stderr });

/**
 * An `Exec` that never starts a process. The first route whose argv prefix
 * matches answers. Anything else exits 127, like a missing command.
 */
export const fakeExec = (routes: readonly FakeRoute[]): FakeExec => {
  const calls: ExecRequest[] = [];
  const exec: Exec = (request) => {
    calls.push(request);
    const route = routes.find((candidate) =>
      candidate.argv.every((word, index) => request.argv[index] === word)
    );
    const reply = route
      ? typeof route.reply === "function"
        ? route.reply(request)
        : route.reply
      : fail(`no fake route for: ${request.argv.join(" ")}`, 127);
    const result: ExecResult = {
      code: reply.code === undefined ? 0 : reply.code,
      stdout: reply.stdout ?? "",
      stderr: reply.stderr ?? "",
      timedOut: reply.timedOut ?? false,
      truncated: false
    };
    return Promise.resolve(result);
  };
  return { exec, calls };
};
