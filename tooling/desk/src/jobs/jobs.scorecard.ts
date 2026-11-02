import { scorecardLedgerSchema, type ScorecardJobResult, type ScorecardRun } from "../contracts";

/**
 * The scorecard job: its prompt and the ledger write. The scorer returns a run; the engine
 * owns the facts it can prove (date, commit, mode, agent, overall) and writes the ledger.
 */

export interface ScorecardPromptInput {
  readonly sweepPath: string;
  readonly head: string;
  readonly date: string;
  readonly note: string;
  readonly feedback: readonly string[];
}

export const scorecardPrompt = (input: ScorecardPromptInput): string =>
  [
    "You are the agent desk's scorecard job. Score this monorepo with the kaine-scorecard skill.",
    "",
    "Call the Skill tool with kaine-scorecard first, read docs/agents/monorepo-scorecard.md, and follow the skill's Run steps with these desk changes:",
    "",
    `- Step 2 is done. The engine ran the machine checks at commit ${input.head} and wrote every command, its exit code, and its output to ${input.sweepPath}, with the coverage totals of the latest green CI PR run. Read that file. You have no shell and no gh: read the repository with Read, Glob, and Grep.`,
    "- Step 3: start five kaine-explorer subagents with the Agent tool, in parallel, one per dimension group: 1/2, 4/7, 3/5/6, 8/9, and 10. Hand each one the sweep facts it needs, its band descriptors, and its previous scores and evidence. Wait for all five before you score.",
    "- Step 4: score as the skill says. Cite a path:line or a sweep result for every score.",
    "- Step 5: do not edit any file. Return the run in your answer. The engine appends it to the ledger, adds your calibration bullets under a heading it writes, and renders the ledger.",
    "- Findings: carry every finding of the previous run forward with its current disposition, and add the new ones with deterministic slugs.",
    "- proposedIssues: only findings that meet the skill's filing rule. Write each body with kaine-write-issue in the six-heading issue format, and end it with an Origin section that names this run's date, commit, overall score, and docs/agents/monorepo-scorecard.md. The owner ticks the ones the desk files; you file nothing.",
    "",
    `The engine sets these run fields itself: date ${input.date}, commit ${input.head}, mode fan-out, agent desk-job, and the overall as the mean of the scored dimensions.`,
    "",
    `Owner note: ${input.note.trim() === "" ? "none" : input.note.trim()}`,
    ...(input.feedback.length === 0
      ? []
      : [
          "",
          "The owner sent the last result back from the gate. Address every note, newest last:",
          ...input.feedback.map((note) => `- ${note}`)
        ])
  ].join("\n");

/** The mean of the scored dimensions, to one decimal, as the ledger header defines it. */
export const overallOf = (run: Pick<ScorecardRun, "dimensions">): number => {
  const scores = Object.values(run.dimensions).flatMap((entry) =>
    entry.score === null ? [] : [entry.score]
  );
  if (scores.length === 0) return 0;
  return Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10;
};

/** The run as the ledger keeps it: the engine's facts over the scorer's. */
export const ledgerRun = (
  result: ScorecardJobResult,
  facts: { readonly date: string; readonly head: string }
): ScorecardRun => ({
  ...result.run,
  date: facts.date,
  commit: facts.head,
  mode: "fan-out",
  agent: "desk-job",
  overall: overallOf(result.run)
});

const DATA_REGION = /(<!--\s*scorecard:data:start\s*-->\s*```json\n)([\s\S]*?)(```)/;

/** A ledger the job cannot write. The message is the reason. */
export class LedgerWriteError extends Error {
  override readonly name = "LedgerWriteError";
}

/**
 * The ledger text with the run appended to the data block and the calibration bullets under a
 * new heading at the end. The heading carries the short commit, which the Scorecard view keys
 * the notes by. The data block must still parse after the change.
 */
export const appendScorecardRun = (
  raw: string,
  run: ScorecardRun,
  calibration: readonly string[],
  jobId: number
): string => {
  const match = DATA_REGION.exec(raw);
  const body = match?.[2];
  if (match === null || body === undefined) {
    throw new LedgerWriteError("The ledger has no scorecard:data json block.");
  }
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch (error) {
    throw new LedgerWriteError(
      `The ledger data block is not JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const ledger = scorecardLedgerSchema.safeParse(data);
  if (!ledger.success)
    throw new LedgerWriteError("The ledger data block does not match the schema.");
  if (typeof data !== "object" || data === null || !("runs" in data) || !Array.isArray(data.runs)) {
    throw new LedgerWriteError("The ledger data block has no runs.");
  }
  // Keep every field the ledger has, including ones the schema does not know.
  const next = { ...data, runs: [...data.runs, run] };
  if (!scorecardLedgerSchema.safeParse(next).success) {
    throw new LedgerWriteError("The new run does not match the ledger schema.");
  }
  const withRun = raw.replace(
    DATA_REGION,
    (_full, start: string, _body: string, end: string) =>
      `${start}${JSON.stringify(next, null, 2)}\n${end}`
  );
  const heading = `### ${run.date} — desk job ${jobId} (\`${run.commit.slice(0, 7)}\`, fan-out)`;
  const bullets = calibration.map((line) => `- ${line.replace(/\s+/g, " ").trim()}`);
  const notes = `${heading}\n\n${bullets.join("\n")}\n`;
  // The notes go at the end of `## Calibration notes`, which the Scorecard view reads up to the
  // next `## ` heading.
  const section = withRun.search(/^## Calibration notes\s*$/m);
  if (section === -1) return `${withRun.trimEnd()}\n\n## Calibration notes\n\n${notes}`;
  const lineEnd = withRun.indexOf("\n", section);
  const following = lineEnd === -1 ? -1 : withRun.slice(lineEnd).search(/^## /m);
  if (following === -1) return `${withRun.trimEnd()}\n\n${notes}`;
  const end = lineEnd + following;
  return `${withRun.slice(0, end).trimEnd()}\n\n${notes}\n${withRun.slice(end)}`;
};

/** The ledger PR's title and body. */
export const scorecardPullRequest = (
  run: ScorecardRun,
  result: ScorecardJobResult,
  filed: readonly { readonly slug: string; readonly number: number }[]
): { readonly title: string; readonly body: string } => ({
  title: `docs(scorecard): record the ${run.date} scorecard run`,
  body: [
    "## Summary",
    "",
    result.summary,
    "",
    `Overall: **${run.overall}** (mode fan-out, desk job). The ledger's generated region was rendered with \`pnpm scorecard\`.`,
    "",
    "## Filed issues",
    "",
    ...(filed.length === 0
      ? ["None."]
      : filed.map((entry) => `- #${entry.number} (\`${entry.slug}\`)`)),
    "",
    "## In plain language",
    "",
    result.plainLanguage
  ].join("\n")
});
