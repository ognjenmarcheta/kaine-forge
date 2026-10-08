import { z, type ZodType } from "zod";

import type { Exec, ExecResult } from "../ports";
import { repositorySchema, userSchema, type RepositoryInfo } from "./github.types";

const GH_TIMEOUT_MS = 30_000;
const MAX_PAGES = 100;

/** Never prompt, never colour, never check for updates: `gh` runs unattended. */
const GH_ENV = {
  GH_PROMPT_DISABLED: "1",
  GH_NO_UPDATE_NOTIFIER: "1",
  NO_COLOR: "1"
} as const;

/** A failed `gh` call. The message holds only a short stderr tail, never a body. */
export class GhError extends Error {
  override readonly name = "GhError";
  constructor(
    message: string,
    readonly kind: "exit" | "timeout" | "parse"
  ) {
    super(message);
  }
}

const tail = (text: string, max = 300): string => {
  const flat = text.trim().replace(/\s+/g, " ");
  return flat.length > max ? `...${flat.slice(-max)}` : flat;
};

export interface GhClient {
  /** Run `gh <argv>` and return stdout. Throws `GhError` on a non-zero exit or timeout. */
  readonly text: (argv: readonly string[], input?: string) => Promise<string>;
  /** `text` plus JSON parse and schema validation. */
  readonly json: <T>(schema: ZodType<T>, argv: readonly string[], input?: string) => Promise<T>;
  /** `gh api <endpoint>` with an optional JSON body, validated against `schema`. */
  readonly api: <T>(
    schema: ZodType<T>,
    endpoint: string,
    request?: { readonly method?: string; readonly body?: unknown }
  ) => Promise<T>;
  /** Every page of a list endpoint, each item validated against `item`. */
  readonly apiPages: <T>(item: ZodType<T>, endpoint: string) => Promise<T[]>;
}

export interface GhClientOptions {
  readonly exec: Exec;
  /** Run `gh` here so it resolves the repository from the checkout. */
  readonly cwd?: string | undefined;
}

const failure = (argv: readonly string[], result: ExecResult): GhError => {
  const label = `gh ${argv.slice(0, 2).join(" ")}`;
  if (result.timedOut) return new GhError(`${label} timed out`, "timeout");
  return new GhError(
    `${label} failed (exit ${result.code ?? "none"}): ${tail(result.stderr) || "no stderr"}`,
    "exit"
  );
};

export const createGhClient = ({ exec, cwd }: GhClientOptions): GhClient => {
  const text: GhClient["text"] = async (argv, input) => {
    const result = await exec({
      argv: ["gh", ...argv],
      cwd,
      env: GH_ENV,
      timeoutMs: GH_TIMEOUT_MS,
      input
    });
    if (result.code !== 0) throw failure(argv, result);
    return result.stdout;
  };

  const json: GhClient["json"] = async (schema, argv, input) => {
    const output = await text(argv, input);
    let value: unknown;
    try {
      value = output.trim() === "" ? null : JSON.parse(output);
    } catch {
      throw new GhError(`gh ${argv.slice(0, 2).join(" ")} returned invalid JSON`, "parse");
    }
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      const where = parsed.error.issues[0]?.path.join(".") || "(root)";
      throw new GhError(
        `gh ${argv.slice(0, 2).join(" ")} returned an unexpected shape at ${where}`,
        "parse"
      );
    }
    return parsed.data;
  };

  const api: GhClient["api"] = (schema, endpoint, request = {}) => {
    const argv = ["api", endpoint, "--method", request.method ?? "GET"];
    if (request.body !== undefined) argv.push("--input", "-");
    return json(
      schema,
      argv,
      request.body === undefined ? undefined : JSON.stringify(request.body)
    );
  };

  const apiPages: GhClient["apiPages"] = async (item, endpoint) => {
    const items: unknown[] = [];
    const separator = endpoint.includes("?") ? "&" : "?";
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      // Each item is validated below, so the page itself only needs to be an array.
      const batch = await json(z.array(z.unknown()), [
        "api",
        `${endpoint}${separator}per_page=100&page=${page}`,
        "--method",
        "GET"
      ]);
      items.push(...batch);
      if (batch.length < 100) {
        return items.map((entry) => item.parse(entry));
      }
    }
    throw new GhError("GitHub pagination exceeds the desk limit", "parse");
  };

  return { text, json, api, apiPages };
};

/** `gh api repos/{owner}/{repo}` resolves the repository from the checkout. */
export const fetchRepository = async (gh: GhClient): Promise<RepositoryInfo> => {
  const repository = await gh.api(repositorySchema, "repos/{owner}/{repo}");
  const type = repository.owner.type;
  return {
    fullName: repository.full_name,
    ownerLogin: repository.owner.login,
    ownerType: type === "User" ? "User" : type === "Organization" ? "Organization" : "Other"
  };
};

export const fetchViewer = async (gh: GhClient): Promise<string> =>
  (await gh.api(userSchema, "user")).login;
