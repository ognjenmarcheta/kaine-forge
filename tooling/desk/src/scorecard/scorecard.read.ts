import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { scorecardLedgerSchema, type ScorecardLedger, type ScorecardView } from "../contracts";
import { derivedFlows, layoutFlow } from "./scorecard.flows";

/** The ledger the `kaine-scorecard` skill keeps, relative to the checkout. */
export const SCORECARD_LEDGER_PATH = "docs/agents/monorepo-scorecard.md";

const DATA_REGION = /<!--\s*scorecard:data:start\s*-->([\s\S]*?)<!--\s*scorecard:data:end\s*-->/;
const JSON_FENCE = /```json\s*([\s\S]*?)```/;

/** A ledger that does not parse. The message is the reason, as raw text. */
export class ScorecardLedgerError extends Error {
  override readonly name = "ScorecardLedgerError";
}

const readLedgerData = (raw: string): unknown => {
  const region = DATA_REGION.exec(raw)?.[1];
  if (region === undefined)
    throw new ScorecardLedgerError("The scorecard:data markers are missing.");
  const body = JSON_FENCE.exec(region)?.[1];
  if (body === undefined)
    throw new ScorecardLedgerError("The scorecard:data region has no json block.");
  try {
    return JSON.parse(body);
  } catch (error) {
    throw new ScorecardLedgerError(
      `The scorecard:data JSON is invalid: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

/** The ledger's data block, through the contract. Throws `ScorecardLedgerError` with the reason. */
export const parseScorecardLedger = (raw: string): ScorecardLedger => {
  const parsed = scorecardLedgerSchema.safeParse(readLedgerData(raw));
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  throw new ScorecardLedgerError(
    `The scorecard:data JSON does not match the schema at ${issue?.path.join(".") || "the root"}: ${issue?.message ?? "invalid"}`
  );
};

/**
 * The bullets under `## Calibration notes`, per `### <date> — … (`<commit>`, …)` heading,
 * keyed by that seven-character commit. A heading without a commit is skipped.
 */
export const readCalibration = (raw: string): Record<string, string[]> => {
  const start = raw.search(/^## Calibration notes\s*$/m);
  if (start === -1) return {};
  const notes: Record<string, string[]> = {};
  let current: string[] | null = null;
  for (const line of raw.slice(start).split("\n").slice(1)) {
    if (line.startsWith("## ")) break;
    if (line.startsWith("### ")) {
      const commit = /`([0-9a-f]{7})[0-9a-f]*`/.exec(line)?.[1];
      current = commit === undefined ? null : (notes[commit] = []);
    } else if (current !== null && line.startsWith("- ")) {
      current.push(line.slice(2).trim());
    }
  }
  return notes;
};

/** `owner/name` of a GitHub remote URL (`https://` or `git@`), else `null`. */
export const githubRepository = (remote: string): string | null =>
  /github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec(remote.trim())?.[1] ?? null;

export interface ReadScorecardOptions {
  readonly repoRoot: string;
  /** The origin remote URL, or `null` when the checkout has none. */
  readonly remote: string | null;
}

/** The scorecard as the desk shows it: the ledger's runs oldest first, notes, and diagrams. */
export const readScorecard = async ({
  repoRoot,
  remote
}: ReadScorecardOptions): Promise<ScorecardView> => {
  const file = path.join(repoRoot, SCORECARD_LEDGER_PATH);
  let raw: string;
  let updatedAt: Date;
  try {
    [raw, updatedAt] = await Promise.all([
      readFile(file, "utf8"),
      stat(file).then((info) => info.mtime)
    ]);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { state: "missing", ledgerPath: SCORECARD_LEDGER_PATH };
    }
    throw error;
  }

  let ledger: ScorecardLedger;
  try {
    ledger = parseScorecardLedger(raw);
  } catch (error) {
    if (!(error instanceof ScorecardLedgerError)) throw error;
    return { state: "invalid", ledgerPath: SCORECARD_LEDGER_PATH, detail: error.message };
  }

  return {
    state: "ready",
    ledgerPath: SCORECARD_LEDGER_PATH,
    updatedAt: updatedAt.toISOString(),
    repository: remote === null ? null : githubRepository(remote),
    runs: [...ledger.runs].sort((left, right) => left.date.localeCompare(right.date)),
    calibration: readCalibration(raw),
    flows: [...derivedFlows(repoRoot), ...ledger.authoredFlows].map(layoutFlow)
  };
};
