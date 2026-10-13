import type { IntakeDraft } from "../contracts";

/**
 * Renders an issue body in the format of `docs/agents/issue-format.md` from the intake
 * agent's fields. The engine renders, not the agent: the six headings come out the same
 * every time, and nothing the agent writes can open a heading or a code fence of its own.
 * The old body follows as a quote, so no fact of the author is lost and none of its old
 * headings count as a section.
 */

export const ORIGINAL_TEXT_HEADING = "Original text";

const STRUCTURE_LINE = /^ {0,3}(#{1,6}[ \t]|```|~~~)/;

/** Text for a section: a line that looks like a heading or a fence is escaped. */
const sectionText = (text: string): string =>
  text
    .trim()
    .split(/\r?\n/)
    .map((line) => (STRUCTURE_LINE.test(line) ? `\\${line.trimStart()}` : line))
    .join("\n");

/** One list item per entry, each on one line. An empty list is "None". */
const list = (items: readonly string[]): string =>
  items.length === 0
    ? "None"
    : items.map((item) => `- ${item.replace(/\s*\r?\n\s*/g, " ").trim()}`).join("\n");

const quote = (text: string): string =>
  text
    .trim()
    .split(/\r?\n/)
    .map((line) => (line.trim() === "" ? ">" : `> ${line}`))
    .join("\n");

export const renderIssueBody = (draft: IntakeDraft, original: string): string =>
  [
    "## Outcome",
    "",
    sectionText(draft.outcome),
    "",
    "## Acceptance criteria",
    "",
    list(draft.acceptanceCriteria),
    "",
    "## Scope",
    "",
    sectionText(draft.scope),
    "",
    "## Validation",
    "",
    sectionText(draft.validation),
    "",
    "## Evidence",
    "",
    sectionText(draft.evidence),
    "",
    "## Out of scope",
    "",
    list(draft.outOfScope),
    ...(original.trim() === "" ? [] : ["", `## ${ORIGINAL_TEXT_HEADING}`, "", quote(original)]),
    ""
  ].join("\n");
