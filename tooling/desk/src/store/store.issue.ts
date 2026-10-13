import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  historyEventSchema,
  issueStateSchema,
  type HistoryEvent,
  type IssueState
} from "../contracts";
import { appendJsonl, writeJsonAtomic } from "./store.atomic";

export type UnreadableReason =
  "io-error" | "invalid-json" | "unknown-schema-version" | "invalid-schema";

export type IssueReadResult =
  | { readonly status: "ok"; readonly state: IssueState }
  | { readonly status: "missing" }
  | { readonly status: "unreadable"; readonly reason: UnreadableReason; readonly detail: string };

export interface IssueListEntry {
  readonly issueNumber: number;
  readonly result: IssueReadResult;
}

export interface IssueStore {
  readonly issueDir: (issueNumber: number) => string;
  readonly statePath: (issueNumber: number) => string;
  readonly eventsPath: (issueNumber: number) => string;
  readonly artifactsDir: (issueNumber: number) => string;
  readonly leasePath: (issueNumber: number) => string;
  /** Never throws for bad data: corrupt files come back as `unreadable`. */
  readonly read: (issueNumber: number) => Promise<IssueReadResult>;
  readonly write: (state: IssueState) => Promise<void>;
  readonly appendEvent: (issueNumber: number, event: HistoryEvent) => Promise<void>;
  readonly list: () => Promise<IssueListEntry[]>;
}

const assertIssueNumber = (issueNumber: number): void => {
  if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) {
    throw new RangeError(`Issue number must be a positive integer, got ${issueNumber}`);
  }
};

const isMissing = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

/**
 * Per-issue records under `<root>/issues/<n>/`: `state.json`, `events.jsonl`,
 * `lease.json`, and `artifacts/`. The caller supplies the root, so the store
 * knows nothing about Git or the checkout.
 */
export const createIssueStore = (root: string): IssueStore => {
  const issuesDir = path.join(root, "issues");
  const issueDir = (issueNumber: number): string => {
    assertIssueNumber(issueNumber);
    return path.join(issuesDir, String(issueNumber));
  };
  const statePath = (issueNumber: number) => path.join(issueDir(issueNumber), "state.json");

  const read = async (issueNumber: number): Promise<IssueReadResult> => {
    let raw: string;
    try {
      raw = await readFile(statePath(issueNumber), "utf8");
    } catch (error) {
      if (isMissing(error)) return { status: "missing" };
      return {
        status: "unreadable",
        reason: "io-error",
        detail: error instanceof Error ? error.message : "Could not read state.json"
      };
    }

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch (error) {
      return {
        status: "unreadable",
        reason: "invalid-json",
        detail: error instanceof Error ? error.message : "state.json is not valid JSON"
      };
    }

    const parsed = issueStateSchema.safeParse(json);
    if (!parsed.success) {
      const versionIssue = parsed.error.issues.some((issue) => issue.path[0] === "schemaVersion");
      return {
        status: "unreadable",
        reason: versionIssue ? "unknown-schema-version" : "invalid-schema",
        detail: parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
          .join("; ")
      };
    }
    if (parsed.data.issueNumber !== issueNumber) {
      return {
        status: "unreadable",
        reason: "invalid-schema",
        detail: `issueNumber ${parsed.data.issueNumber} does not match directory ${issueNumber}`
      };
    }
    return { status: "ok", state: parsed.data };
  };

  return {
    issueDir,
    statePath,
    eventsPath: (issueNumber) => path.join(issueDir(issueNumber), "events.jsonl"),
    artifactsDir: (issueNumber) => path.join(issueDir(issueNumber), "artifacts"),
    leasePath: (issueNumber) => path.join(issueDir(issueNumber), "lease.json"),
    read,
    write: async (state) => {
      const valid = issueStateSchema.parse(state);
      await mkdir(path.join(issueDir(valid.issueNumber), "artifacts"), { recursive: true });
      await writeJsonAtomic(statePath(valid.issueNumber), valid);
    },
    appendEvent: async (issueNumber, event) => {
      await appendJsonl(
        path.join(issueDir(issueNumber), "events.jsonl"),
        historyEventSchema.parse(event)
      );
    },
    list: async () => {
      let names: string[];
      try {
        names = await readdir(issuesDir);
      } catch (error) {
        if (isMissing(error)) return [];
        throw error;
      }
      const numbers = names
        .filter((name) => /^[1-9]\d*$/.test(name))
        .map(Number)
        .filter(Number.isSafeInteger)
        .sort((left, right) => left - right);
      return Promise.all(
        numbers.map(async (issueNumber) => ({ issueNumber, result: await read(issueNumber) }))
      );
    }
  };
};
