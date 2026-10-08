import { conventionalTypeSchema, type ConventionalType } from "../contracts";

/**
 * The commit message and the PR title. Both follow Conventional Commits as
 * `commitlint.config.mjs` enforces them (it extends
 * `@commitlint/config-conventional`). The engine builds a message that should
 * pass, and the executor still runs `pnpm exec commitlint` on it before the
 * commit, because the real config is the authority.
 */

/** `header-max-length` of `@commitlint/config-conventional`. */
export const COMMIT_HEADER_MAX = 100;
const BODY_WRAP = 88;

export interface CommitMessageInput {
  readonly type: ConventionalType;
  /** Lower-case, for example `desk` or `api`. */
  readonly scope?: string | undefined;
  /** Free text. It is trimmed, lower-cased at the first letter and cut to fit the header. */
  readonly subject: string;
  readonly issue: number;
  /** Optional explanation. It is wrapped into the body. */
  readonly body?: string | undefined;
}

export interface CommitMessage {
  /** `type(scope): subject`. The PR title is the same text. */
  readonly header: string;
  readonly text: string;
}

const SCOPE_PATTERN = /^[a-z0-9]+(?:[-/][a-z0-9]+)*$/;

const wrap = (text: string, width: number): string[] => {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n{2,}/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter((part) => part !== "")) {
      if (line !== "" && line.length + 1 + word.length > width) {
        lines.push(line);
        line = word;
      } else {
        line = line === "" ? word : `${line} ${word}`;
      }
    }
    if (line !== "") lines.push(line);
    lines.push("");
  }
  while (lines.at(-1) === "") lines.pop();
  return lines;
};

/** Fit a subject into the header: one line, lower-case first letter, no final full stop. */
export const normalizeSubject = (subject: string, room: number): string => {
  const flat = subject
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.\s]+$/, "");
  if (flat === "") throw new RangeError("A commit needs a subject");
  const lowered = `${flat.charAt(0).toLowerCase()}${flat.slice(1)}`;
  if (lowered.length <= room) return lowered;
  const cut = lowered.slice(0, room);
  const atWord = cut.replace(/\s+\S*$/, "");
  return (atWord === "" ? cut : atWord).replace(/[.\s,;:-]+$/, "");
};

export const buildCommitMessage = (input: CommitMessageInput): CommitMessage => {
  const type = conventionalTypeSchema.parse(input.type);
  if (!Number.isSafeInteger(input.issue) || input.issue <= 0) {
    throw new RangeError(`Issue number must be a positive integer, got ${input.issue}`);
  }
  if (input.scope !== undefined && !SCOPE_PATTERN.test(input.scope)) {
    throw new RangeError(`Commit scope must be lower-case, got '${input.scope}'`);
  }
  const prefix = `${type}${input.scope === undefined ? "" : `(${input.scope})`}: `;
  const header = `${prefix}${normalizeSubject(input.subject, COMMIT_HEADER_MAX - prefix.length)}`;
  const body = input.body === undefined ? [] : wrap(input.body, BODY_WRAP);
  const text = [header, "", ...(body.length > 0 ? [...body, ""] : []), `Refs #${input.issue}`, ""];
  return { header, text: text.join("\n") };
};

const HEADER_PATTERN = /^([a-z]+)(?:\(([^)\s]+)\))?(!)?:\s+(\S.*)$/;

export interface ParsedHeader {
  readonly type: string;
  readonly scope: string | undefined;
  readonly subject: string;
}

export const parseConventionalHeader = (title: string): ParsedHeader | null => {
  const match = HEADER_PATTERN.exec(title.trim());
  if (match?.[1] === undefined || match[4] === undefined) return null;
  // Only a real Conventional Commit type counts. "note: see below" is a title, not a header.
  if (!conventionalTypeSchema.safeParse(match[1]).success) return null;
  return { type: match[1], scope: match[2], subject: match[4] };
};

export interface CommitSource {
  readonly plan: {
    readonly summary: string;
    readonly pr: { readonly type: ConventionalType; readonly slug: string };
  };
  /** The reviewer's draft PR title, when a review exists. */
  readonly reviewTitle?: string | undefined;
  readonly issue: number;
}

const firstSentence = (text: string): string =>
  (
    text
      .replace(/\s+/g, " ")
      .trim()
      .split(/(?<=[.!?])\s/)[0] ?? ""
  ).trim();

/**
 * Commit input from the plan and the reviewer's draft title. The type always
 * comes from the plan, because the branch name carries it. A reviewer title in
 * Conventional Commit form supplies the scope and the subject; any other title
 * is used as a subject. Without a title the plan summary's first sentence is
 * the subject, and the slug is the last resort.
 */
export const commitInputFor = ({ plan, reviewTitle, issue }: CommitSource): CommitMessageInput => {
  const parsed = reviewTitle === undefined ? null : parseConventionalHeader(reviewTitle);
  const scope =
    parsed?.scope !== undefined && SCOPE_PATTERN.test(parsed.scope) ? parsed.scope : undefined;
  const subject =
    parsed?.subject ??
    (reviewTitle !== undefined && reviewTitle.trim() !== "" ? reviewTitle : null) ??
    (firstSentence(plan.summary) || plan.pr.slug.replace(/-/g, " "));
  return {
    type: plan.pr.type,
    scope,
    subject,
    issue,
    body: plan.summary
  };
};
