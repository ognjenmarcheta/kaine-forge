import type { Exec, ExecRequest, ExecResult } from "../ports";
import { isDeskName } from "./docker.names";

/**
 * A thin client over `docker`. It runs argv arrays through the `Exec` port, so
 * tests use a fake. Removal is verified: after `rm` the same label filter must
 * list nothing, or the call throws. Removal only ever names resources that the
 * label filter returned AND that carry the desk name prefix.
 */

export class DockerError extends Error {
  override readonly name = "DockerError";
  constructor(
    message: string,
    readonly argv: readonly string[],
    readonly code: number | null
  ) {
    super(message);
  }
}

const DEFAULT_TIMEOUT_MS = 120_000;

/** The start and the end of the text: a tool prints its message first and a stack trace last. */
const tail = (text: string, max = 600): string => {
  const flat = text.trim().replace(/\s+/g, " ");
  const head = Math.floor(max / 3);
  return flat.length > max ? `${flat.slice(0, head)} ... ${flat.slice(-(max - head))}` : flat;
};

export interface RunOptions {
  readonly input?: string | undefined;
  readonly timeoutMs?: number | undefined;
  readonly cwd?: string | undefined;
}

export interface DockerClient {
  /** The result of `docker <args>`, even when it fails. */
  readonly run: (args: readonly string[], options?: RunOptions) => Promise<ExecResult>;
  /** The result of `docker <args>`. Throws `DockerError` on a non-zero exit. */
  readonly ok: (args: readonly string[], options?: RunOptions) => Promise<ExecResult>;
  /** True when the daemon answers. */
  readonly reachable: () => Promise<
    { readonly ok: true } | { readonly ok: false; readonly detail: string }
  >;
  /** Create a labelled volume if it does not exist. Returns true when it was created. */
  readonly ensureVolume: (
    name: string,
    labels: Readonly<Record<string, string>>
  ) => Promise<boolean>;
  readonly listContainers: (filters: readonly string[]) => Promise<string[]>;
  readonly listVolumes: (filters: readonly string[]) => Promise<string[]>;
  /** Remove every container that matches the filters, then verify none is left. */
  readonly removeContainers: (filters: readonly string[]) => Promise<string[]>;
  /** Remove every volume that matches the filters, then verify none is left. */
  readonly removeVolumes: (filters: readonly string[]) => Promise<string[]>;
}

const lines = (text: string): string[] =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

const filterArgs = (filters: readonly string[]): string[] =>
  filters.flatMap((filter) => ["--filter", filter]);

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface DockerClientOptions {
  /** Replaced in tests so verification does not wait. */
  readonly sleep?: (ms: number) => Promise<void>;
  /** How often a removal is verified. Default 50 tries, 100 ms apart. */
  readonly verifyTries?: number;
}

export const createDockerClient = (exec: Exec, options: DockerClientOptions = {}): DockerClient => {
  const sleep = options.sleep ?? defaultSleep;
  const tries = options.verifyTries ?? 50;

  const run: DockerClient["run"] = (args, runOptions = {}) => {
    const request: ExecRequest = {
      argv: ["docker", ...args],
      timeoutMs: runOptions.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      ...(runOptions.input === undefined ? {} : { input: runOptions.input }),
      ...(runOptions.cwd === undefined ? {} : { cwd: runOptions.cwd })
    };
    return exec(request);
  };

  const ok: DockerClient["ok"] = async (args, runOptions) => {
    const result = await run(args, runOptions);
    if (result.code !== 0) {
      throw new DockerError(
        `docker ${args.slice(0, 2).join(" ")} failed (exit ${result.code ?? "none"}${
          result.timedOut ? ", timed out" : ""
        }): ${tail(result.stderr) || tail(result.stdout) || "no output"}`,
        ["docker", ...args],
        result.code
      );
    }
    return result;
  };

  const list = async (noun: string[], format: string, filters: readonly string[]) => {
    const result = await ok([...noun, ...filterArgs(filters), "--format", format]);
    const names = lines(result.stdout);
    const foreign = names.filter((name) => !isDeskName(name));
    if (foreign.length > 0) {
      throw new DockerError(
        `A resource with a desk label has a foreign name and is left alone: ${foreign.join(", ")}`,
        ["docker", ...noun],
        null
      );
    }
    return names;
  };

  const listContainers: DockerClient["listContainers"] = (filters) =>
    list(["ps", "-a"], "{{.Names}}", filters);
  const listVolumes: DockerClient["listVolumes"] = (filters) =>
    list(["volume", "ls"], "{{.Name}}", filters);

  const removeVerified = async (
    what: string,
    listIt: (filters: readonly string[]) => Promise<string[]>,
    remove: (names: string[]) => Promise<void>,
    filters: readonly string[]
  ): Promise<string[]> => {
    const names = await listIt(filters);
    if (names.length === 0) return [];
    await remove(names);
    for (let attempt = 0; attempt < tries; attempt += 1) {
      if ((await listIt(filters)).length === 0) return names;
      await sleep(100);
    }
    throw new DockerError(`${what} cleanup could not be verified`, ["docker", what], null);
  };

  return {
    run,
    ok,
    reachable: async () => {
      const result = await run(["version", "--format", "{{.Server.Version}}"], {
        timeoutMs: 15_000
      });
      return result.code === 0
        ? { ok: true }
        : { ok: false, detail: tail(result.stderr) || "the Docker daemon did not answer" };
    },
    ensureVolume: async (name, labels) => {
      const exists = await run(["volume", "inspect", name], { timeoutMs: 30_000 });
      if (exists.code === 0) return false;
      await ok([
        "volume",
        "create",
        ...Object.entries(labels).flatMap(([key, value]) => ["--label", `${key}=${value}`]),
        name
      ]);
      return true;
    },
    listContainers,
    listVolumes,
    removeContainers: (filters) =>
      removeVerified(
        "container",
        listContainers,
        async (names) => {
          // A concurrent `--rm` may already be removing the container. That is not an error here:
          // the verification below decides.
          await run(["rm", "--force", ...names]);
        },
        filters
      ),
    removeVolumes: (filters) =>
      removeVerified(
        "volume",
        listVolumes,
        async (names) => {
          await ok(["volume", "rm", ...names]);
        },
        filters
      )
  };
};
