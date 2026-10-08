import type { Exec, ExecRequest, ExecResult } from "../ports";

/**
 * A fake Docker daemon behind the `Exec` port. It understands the commands the
 * desk issues: `run`, `exec`, `ps`, `rm`, `volume ...`, `image inspect`, `version`.
 * `docker run` of a helper script calls a handler that the test supplies. Other
 * commands (git) go to `delegate`. Nothing starts a process or a container.
 */

export interface FakeRun {
  readonly argv: readonly string[];
  readonly name: string;
  readonly labels: Readonly<Record<string, string>>;
  readonly mounts: readonly string[];
  readonly entrypoint: string;
  readonly image: string;
  readonly command: readonly string[];
  readonly detached: boolean;
  readonly input: string | undefined;
  /** The script the container runs, for example `desk-workspace.mjs`. */
  readonly script: string;
}

type Reply = Partial<Pick<ExecResult, "code" | "stdout" | "stderr" | "timedOut">>;
export type RunHandler = (run: FakeRun) => Reply | Promise<Reply>;

export interface FakeDocker {
  readonly exec: Exec;
  readonly runs: FakeRun[];
  /** Every `docker` call, in order, as one string. */
  readonly calls: string[];
  readonly containers: Map<string, Record<string, string>>;
  readonly volumes: Map<string, Record<string, string>>;
  /** Handlers by script (`desk-workspace.mjs sync`, `desk-fetch.mjs`) or entrypoint (`cat`, `pnpm`). */
  readonly handlers: Map<string, RunHandler>;
  /** A container that `docker rm --force` cannot remove. */
  stubborn: Set<string>;
  daemonUp: boolean;
  imagePresent: boolean;
  /** Every `docker build`, with its arguments. */
  readonly builds: string[][];
  buildReply: Reply;
}

export const jsonReply = (value: unknown): Reply => ({ stdout: `${JSON.stringify(value)}\n` });

const option = (args: readonly string[], flag: string): string | undefined => {
  const index = args.indexOf(flag);
  return index < 0 ? undefined : args[index + 1];
};
const options = (args: readonly string[], flag: string): string[] =>
  args.flatMap((arg, index) => (arg === flag ? [args[index + 1] ?? ""] : []));

const labelsOf = (entries: readonly string[]): Record<string, string> =>
  Object.fromEntries(
    entries.map((entry) => {
      const at = entry.indexOf("=");
      return [entry.slice(0, at), entry.slice(at + 1)];
    })
  );

/** `label=k=v` filters, ANDed. */
const matches = (labels: Readonly<Record<string, string>>, filters: readonly string[]): boolean =>
  filters.every((filter) => {
    const body = filter.replace(/^label=/, "");
    const at = body.indexOf("=");
    return at < 0 ? body in labels : labels[body.slice(0, at)] === body.slice(at + 1);
  });

export const createFakeDocker = (delegate: Exec): FakeDocker => {
  const state: FakeDocker = {
    exec: (request) => (request.argv[0] === "docker" ? handle(request) : delegate(request)),
    runs: [],
    calls: [],
    containers: new Map(),
    volumes: new Map(),
    handlers: new Map(),
    stubborn: new Set(),
    daemonUp: true,
    imagePresent: true,
    builds: [],
    buildReply: {}
  };

  const ok = (stdout = ""): ExecResult => ({
    code: 0,
    stdout,
    stderr: "",
    timedOut: false,
    truncated: false
  });
  const fail = (stderr: string): ExecResult => ({
    code: 1,
    stdout: "",
    stderr,
    timedOut: false,
    truncated: false
  });

  const handle = async (request: ExecRequest): Promise<ExecResult> => {
    const args = request.argv.slice(1);
    state.calls.push(args.join(" "));
    const [command, second] = args;
    if (!state.daemonUp) return fail("Cannot connect to the Docker daemon");

    switch (command) {
      case "version":
        return ok("29.2.1");
      case "image":
        if (second === "inspect") {
          return state.imagePresent ? ok("2090000000\n") : fail("No such image");
        }
        return ok("");
      case "exec":
        return ok("");
      case "build":
        state.builds.push(args);
        return {
          code: state.buildReply.code ?? 0,
          stdout: state.buildReply.stdout ?? "",
          stderr: state.buildReply.stderr ?? "",
          timedOut: false,
          truncated: false
        };
      case "ps": {
        const filters = options(args, "--filter");
        return ok(
          [...state.containers]
            .filter(([, labels]) => matches(labels, filters))
            .map(([name]) => name)
            .join("\n")
        );
      }
      case "rm": {
        for (const name of args.slice(2)) {
          if (!state.stubborn.has(name)) state.containers.delete(name);
        }
        return ok("");
      }
      case "volume": {
        if (second === "inspect") {
          return state.volumes.has(args[2] ?? "") ? ok("[]") : fail("No such volume");
        }
        if (second === "create") {
          const name = args.at(-1) ?? "";
          state.volumes.set(name, labelsOf(options(args, "--label")));
          return ok(name);
        }
        if (second === "ls") {
          const filters = options(args, "--filter");
          return ok(
            [...state.volumes]
              .filter(([, labels]) => matches(labels, filters))
              .map(([name]) => name)
              .join("\n")
          );
        }
        if (second === "rm") {
          for (const name of args.slice(2)) state.volumes.delete(name);
          return ok("");
        }
        return fail(`unknown volume command ${second ?? ""}`);
      }
      case "run": {
        const entrypointAt = args.indexOf("--entrypoint");
        const entrypoint = args[entrypointAt + 1] ?? "";
        const image = args[entrypointAt + 2] ?? "";
        const rest = args.slice(entrypointAt + 3);
        const run: FakeRun = {
          argv: args,
          name: option(args, "--name") ?? "",
          labels: labelsOf(options(args, "--label")),
          mounts: options(args, "--mount"),
          entrypoint,
          image,
          command: rest,
          detached: args.includes("--detach"),
          input: request.input,
          script: entrypoint === "node" ? (rest[0]?.split("/").at(-1) ?? "") : entrypoint
        };
        state.runs.push(run);
        if (run.detached) {
          state.containers.set(run.name, { ...run.labels });
          return ok("container-id\n");
        }
        const key = `${run.script} ${run.script.startsWith("desk-") ? (rest[1] ?? "") : ""}`.trim();
        const handler = state.handlers.get(key) ?? state.handlers.get(run.script);
        if (handler === undefined) return fail(`no fake handler for: ${key}`);
        const reply = await handler(run);
        return {
          code: reply.code ?? 0,
          stdout: reply.stdout ?? "",
          stderr: reply.stderr ?? "",
          timedOut: reply.timedOut ?? false,
          truncated: false
        };
      }
      default:
        return fail(`unknown docker command ${command ?? ""}`);
    }
  };

  return state;
};
