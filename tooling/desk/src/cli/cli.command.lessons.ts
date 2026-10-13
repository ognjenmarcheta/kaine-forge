import { stripVTControlCharacters } from "node:util";

import { parse } from "./cli.args";
import { UsageError, type CliCommand } from "./cli.types";
import { HARNESS_SHORT_LENGTH, lessonSourceSchema, type LessonReport } from "../contracts";
import { repoFingerprint } from "../engine/harness.fingerprint";
import { aggregateLessons, DEFAULT_MIN_ISSUES, readLessonRecords } from "../stats/stats.lessons";
import { resolveRepoLocation } from "../store/store.root";

const USAGE =
  "Usage: pnpm desk lessons [--min-issues N] [--source review|check|stuck|verify|denial|invariant] [--json]";

/** Agent text is data: no terminal control sequences reach the screen. */
const plain = (text: string): string => stripVTControlCharacters(text);

const formatLessons = (report: LessonReport): string[] => {
  const scope = `seen in ${report.minIssues} or more issues`;
  if (report.candidates.length === 0) {
    return [
      `No problem ${scope} yet. ${report.belowThreshold} other kind(s) seen in fewer issues.`
    ];
  }
  const current =
    report.currentRepo === null
      ? "the current instructions could not be read"
      : `"now" counts the times under the current instructions (${report.currentRepo.slice(0, HARNESS_SHORT_LENGTH)})`;
  const lines = [`Lesson candidates, ${scope}. ${current}.`, ""];
  for (const candidate of report.candidates) {
    lines.push(
      `${plain(candidate.key)}  ${candidate.issues.length} issues (${candidate.issues.map((issue) => `#${issue}`).join(" ")})` +
        `  ${candidate.occurrences} times, ${candidate.currentOccurrences} now  last ${candidate.lastSeen.slice(0, 10)}`
    );
    for (const sample of candidate.samples) {
      const where = sample.file === null ? "" : ` ${plain(sample.file)}:`;
      lines.push(`  #${sample.issue}${where} ${plain(sample.detail)}`);
    }
  }
  lines.push(
    "",
    `${report.belowThreshold} other kind(s) seen in fewer issues.`,
    "Promote one with the kaine-encode-knowledge skill: it turns a repeated problem into a check, a test, or a rule. The desk changes nothing."
  );
  if (report.invalidLines > 0) {
    lines.push(
      `${report.invalidLines} line(s) of lessons.jsonl could not be read and were skipped.`
    );
  }
  return lines;
};

/** Reads `lessons.jsonl` and the repository's instructions. It changes nothing. */
export const commandLessons: CliCommand = async (args, deps, io) => {
  const { values, positionals } = parse(args, {
    json: { type: "boolean" },
    "min-issues": { type: "string" },
    source: { type: "string" }
  });
  if (positionals.length > 0) throw new UsageError(USAGE);
  const rawMin = values["min-issues"];
  const minIssues =
    rawMin === undefined
      ? DEFAULT_MIN_ISSUES
      : /^[1-9]\d{0,3}$/.test(rawMin)
        ? Number(rawMin)
        : null;
  if (minIssues === null) throw new UsageError(USAGE);
  const source =
    values.source === undefined ? undefined : lessonSourceSchema.safeParse(values.source);
  if (source !== undefined && !source.success) throw new UsageError(USAGE);

  const { repoRoot, stateRoot } = await resolveRepoLocation(deps.exec, deps.cwd);
  const read = await readLessonRecords(stateRoot);
  const report = aggregateLessons(
    source === undefined
      ? read
      : { ...read, records: read.records.filter((record) => record.source === source.data) },
    { minIssues, currentRepo: await repoFingerprint(repoRoot).catch(() => null) }
  );

  if (values.json === true) io.out(`${JSON.stringify(report, null, 2)}\n`);
  else io.out(`${formatLessons(report).join("\n")}\n`);
  return 0;
};
