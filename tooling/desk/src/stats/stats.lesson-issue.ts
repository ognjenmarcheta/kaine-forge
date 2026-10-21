import { createHash } from "node:crypto";
import { stripVTControlCharacters } from "node:util";

import type { LessonCandidate, LessonIssueDraft } from "../contracts";

/**
 * The GitHub issue for a lesson, in the six sections of `docs/agents/issue-format.md`. Lesson
 * text is untrusted: it was written by an agent or taken from tool output. It goes into the body
 * as quoted data (inline code and one code block), never into a prompt, and the body is plain
 * text. The owner sees this exact text before the desk sends it.
 */

const TITLE_KEY_LIMIT = 120;

/** One line without control characters: a sample or a key cannot add lines or escapes. */
const oneLine = (text: string): string =>
  [...stripVTControlCharacters(text).replace(/\s+/g, " ")]
    .filter((char) => char >= " " && char !== "\u007f")
    .join("")
    .trim();

const longestBacktickRun = (text: string): number =>
  Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));

/** Inline code whose fence is longer than any backtick run in the text. */
const code = (text: string): string => {
  const fence = "`".repeat(longestBacktickRun(text) + 1);
  return `${fence} ${text} ${fence}`;
};

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;

const lessonIssueTitle = (key: string): string => {
  const line = oneLine(key);
  const short = line.length > TITLE_KEY_LIMIT ? `${line.slice(0, TITLE_KEY_LIMIT - 3)}...` : line;
  return `chore(ai): encode the repeated desk lesson ${short}`;
};

const lessonIssueBody = (candidate: LessonCandidate, note: string | null): string => {
  const key = code(oneLine(candidate.key));
  const samples = candidate.samples.map(
    (sample) =>
      `#${sample.issue}${sample.file === null ? "" : ` ${oneLine(sample.file)}:`} ${oneLine(sample.detail)}`
  );
  const sampleText = samples.join("\n");
  const fence = "`".repeat(Math.max(3, longestBacktickRun(sampleText) + 1));
  const files = [
    ...new Set(candidate.samples.flatMap((sample) => (sample.file === null ? [] : [sample.file])))
  ];
  return [
    "## Outcome",
    "",
    `The problem the Agent Desk records as ${key} stops coming back: a check, a test, a lint rule, a review item, or a skill catches it before an agent repeats it.`,
    "",
    "## Acceptance criteria",
    "",
    `- A check, test, lint rule, REVIEW.md item, or skill change names the problem ${key} and prevents it.`,
    "- The change says which sample in Evidence it would have caught.",
    "",
    "## Scope",
    "",
    files.length === 0
      ? "unknown, investigate first"
      : `unknown, investigate first. The samples name ${files.map((file) => code(oneLine(file))).join(", ")}.`,
    "",
    "## Validation",
    "",
    "`pnpm check:affected` while iterating, and `pnpm check` before the PR (docs/agents/day-one.md section 5).",
    "",
    "## Evidence",
    "",
    `The Agent Desk saw ${key} (source \`${candidate.source}\`) ${plural(candidate.occurrences, "time")} in ${plural(candidate.issues.length, "issue")}: ${candidate.issues.map((issue) => `#${issue}`).join(", ")}. Last seen ${candidate.lastSeen.slice(0, 10)}. The samples are text from desk runs, quoted as data:`,
    "",
    `${fence}text`,
    sampleText === "" ? "(no sample)" : sampleText,
    fence,
    "",
    "## Out of scope",
    "",
    "- The Agent Desk's own lesson recording.",
    "",
    "## Origin",
    "",
    `Created from the Agent Desk lessons page for the lesson ${key}.`,
    ...(note === null ? [] : ["", "The owner's note:", "", note]),
    ""
  ].join("\n");
};

/** The title and body the desk sends, and the digest a confirmed create must repeat. */
export const buildLessonIssue = (
  candidate: LessonCandidate,
  note: string | null
): LessonIssueDraft => {
  const title = lessonIssueTitle(candidate.key);
  const body = lessonIssueBody(candidate, note);
  return {
    key: candidate.key,
    title,
    body,
    digest: createHash("sha256").update(`${title}\n${body}`).digest("hex")
  };
};
