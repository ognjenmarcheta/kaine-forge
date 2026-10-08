import type { CheckReport } from "../check";
import type { PlannerOutput, ReviewerOutput } from "../contracts";
import { SEVERITY_LABELS } from "../contracts";
import type { ChangesetDecision } from "./ship.changeset";

/**
 * The PR body. The shape comes from `.github/pull_request_template.md`, read
 * from the worktree at run time, so the template can change without a code
 * change here. Every template heading is kept, in order. A heading this module
 * has no filler for gets `n/a` and is reported in `unfilled`; the drift test in
 * `ship.pr-body.test.ts` fails when the real template gains such a heading.
 *
 * The body states only what the desk can prove: the checks come from check
 * report receipts, and a checklist box is ticked only when a passed step has
 * exactly that command. Risk level and impact stay for the owner to set.
 */

export interface TemplateSection {
  readonly level: number;
  readonly title: string;
  /** Lines under the heading, up to the next heading. */
  readonly lines: readonly string[];
}

export interface ParsedTemplate {
  /** Text before the first heading. */
  readonly preamble: readonly string[];
  readonly sections: readonly TemplateSection[];
}

const HEADING = /^(#{1,6})\s+(\S.*?)\s*#*\s*$/;
const FENCE = /^\s*(```|~~~)/;

export const parseTemplate = (template: string): ParsedTemplate => {
  const preamble: string[] = [];
  const sections: { level: number; title: string; lines: string[] }[] = [];
  let fenced = false;
  for (const line of template.split(/\r?\n/)) {
    if (FENCE.test(line)) fenced = !fenced;
    const heading = fenced ? null : HEADING.exec(line);
    if (heading?.[1] !== undefined && heading[2] !== undefined) {
      sections.push({ level: heading[1].length, title: heading[2], lines: [] });
    } else {
      (sections.at(-1)?.lines ?? preamble).push(line);
    }
  }
  return { preamble, sections };
};

export interface PrBodyInput {
  /** Text of `.github/pull_request_template.md`. */
  readonly template: string;
  readonly issue: number;
  readonly plan: PlannerOutput;
  /** Check reports the engine wrote. Only these count as "checks run". */
  readonly reports: readonly CheckReport[];
  /** The review, or `null` when none was read. */
  readonly review: ReviewerOutput | null;
  readonly changeset: ChangesetDecision;
  /** Repo-relative path of the changeset file the engine writes, or `null`. */
  readonly changesetPath: string | null;
}

export interface PrBody {
  readonly body: string;
  /** Template headings in order, as written. */
  readonly headings: readonly string[];
  /** Headings that got `n/a` because no filler knows them. */
  readonly unfilled: readonly string[];
}

const bullets = (items: readonly string[], empty = "none"): string[] =>
  items.length === 0 ? [`- ${empty}`] : items.map((item) => `- ${item}`);

const command = (argv: readonly string[]): string => argv.join(" ");

const stepOutcome = (code: number | null, timedOut: boolean): string =>
  timedOut ? "timed out" : code === 0 ? "passed" : `failed (exit ${code ?? "none"})`;

/** One line per step of each report. This is the "checks run" evidence. */
const checkLines = (reports: readonly CheckReport[]): string[] =>
  reports.flatMap((report) =>
    report.steps.map(
      (step) =>
        `\`${command(step.argv)}\`: ${stepOutcome(step.code, step.timedOut)} (${report.kind} check)`
    )
  );

const CHECKBOX = /^(\s*- )\[( |x)\] (.*)$/;

/** Tick a template item only when a passed step ran exactly the command in backticks. */
const tickValidated = (line: string, passedCommands: ReadonlySet<string>): string => {
  const match = CHECKBOX.exec(line);
  const item = match?.[3];
  const quoted = item === undefined ? null : /^`([^`]+)`\s*$/.exec(item);
  if (match?.[1] === undefined || quoted?.[1] === undefined) return line;
  return passedCommands.has(quoted[1]) ? `${match[1]}[x] ${item ?? ""}` : line;
};

const isChecklist = (line: string): boolean => CHECKBOX.test(line);

type Filler = (context: PrBodyInput, section: TemplateSection) => string[];

const key = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, "");

const severityCounts = (review: ReviewerOutput): string =>
  SEVERITY_LABELS.map(
    (label) => `${review.findings.filter((finding) => finding.severity === label).length} ${label}`
  ).join(", ");

const FILLERS: Readonly<Record<string, Filler>> = {
  summary: ({ issue, plan }) => [`Closes #${issue}`, "", plan.summary],

  why: ({ plan }) => [
    plan.plainLanguage,
    "",
    "Acceptance criteria and the change that meets each:",
    "",
    ...bullets(
      plan.acceptanceCriteria.map((entry) => `${entry.criterion}: ${entry.change}`),
      "none listed"
    )
  ],

  scope: ({ plan }) => [
    "In scope:",
    "",
    ...bullets([
      ...plan.files.map((file) => `${file.action} \`${file.path}\`: ${file.purpose}`),
      ...plan.tests.map((test) => `${test.action} test \`${test.path}\`: ${test.reason}`)
    ]),
    "",
    "Out of scope:",
    "",
    "- Anything the approved plan does not list."
  ],

  riskimpact: ({ plan }, section) => [
    ...section.lines.filter((line) => line.trim() !== ""),
    "",
    "The desk does not set the risk level or the impact boxes. The owner sets them.",
    "",
    "Risks the plan names:",
    "",
    ...bullets(plan.risks)
  ],

  validation: ({ reports }, section) => {
    const passed = new Set(
      reports.flatMap((report) =>
        report.steps.filter((step) => step.code === 0).map((step) => command(step.argv))
      )
    );
    const checklist = section.lines.filter(isChecklist);
    const notRun = checklist
      .filter((line) => tickValidated(line, passed) === line)
      .flatMap((line) => {
        const quoted = /`([^`]+)`/.exec(line)?.[1];
        return quoted === undefined || quoted.includes("<") ? [] : [`\`${quoted}\``];
      });
    return [
      "Checks the desk ran, from its check reports:",
      "",
      ...bullets(checkLines(reports), "none"),
      "",
      ...checklist.map((line) => tickValidated(line, passed)),
      "",
      "Manual validation notes:",
      "",
      "- none",
      "",
      "If a required check was skipped, explain why:",
      "",
      notRun.length === 0
        ? "- none"
        : `- Not run by the desk: ${notRun.join(", ")}. The PR checks in CI run the full gate.`
    ];
  },

  releasemetadata: ({ changeset, changesetPath }, section) => {
    const carries =
      changeset.kind === "file" ||
      (changeset.kind === "none" && /already carries/.test(changeset.reason));
    const skips = changeset.kind === "skip-label";
    const checklist = section.lines.filter(isChecklist).map((line) => {
      const match = CHECKBOX.exec(line);
      if (match?.[1] === undefined) return line;
      const ticked =
        (/\.changeset\/\*\.md/.test(line) && carries) ||
        (/release:skip-changeset/.test(line) && skips);
      return ticked ? `${match[1]}[x] ${match[3] ?? ""}` : line;
    });
    const reason =
      changeset.kind === "file"
        ? `${changeset.reason} The file is \`${changesetPath ?? ".changeset/*.md"}\`.`
        : changeset.reason;
    return [...checklist, "", "Changeset / skip reason:", "", `- ${reason}`];
  },

  reviewerfocus: ({ review, plan, changeset }) => {
    const lines: string[] = [];
    if (review === null) {
      lines.push("No review result was read.");
    } else {
      lines.push(
        `Reviewer verdict: ${review.verdict}. Findings: ${severityCounts(review)}.`,
        "",
        review.plainLanguage
      );
      const open = review.findings.filter((finding) => finding.severity !== "FYI").slice(0, 5);
      if (open.length > 0) {
        lines.push(
          "",
          "Findings to look at:",
          "",
          ...open.map(
            (finding) =>
              `- ${finding.file}:${finding.line} [${finding.severity}] ${finding.summary}`
          )
        );
      }
    }
    if (plan.openQuestions.length > 0) {
      lines.push("", "Open questions from the plan:", "", ...bullets(plan.openQuestions));
    }
    if (changeset.kind === "file" && changeset.unlisted.length > 0) {
      lines.push(
        "",
        `The diff also changes packages the plan did not list: ${changeset.unlisted.join(", ")}.`
      );
    }
    return lines;
  }
};

/** Normalized names of the headings this module can fill. */
export const FILLED_HEADINGS: readonly string[] = Object.keys(FILLERS);

export const buildPrBody = (input: PrBodyInput): PrBody => {
  const template = parseTemplate(input.template);
  const unfilled: string[] = [];
  const out: string[] = [...template.preamble];
  while (out.at(-1)?.trim() === "") out.pop();

  for (const section of template.sections) {
    const name = key(section.title);
    const filler = Object.hasOwn(FILLERS, name) ? FILLERS[name] : undefined;
    if (filler === undefined) unfilled.push(section.title);
    const content = filler === undefined ? ["n/a"] : filler(input, section);
    if (out.length > 0) out.push("");
    out.push(`${"#".repeat(section.level)} ${section.title}`, "", ...content);
    while (out.at(-1)?.trim() === "") out.pop();
  }
  return {
    body: `${out.join("\n")}\n`,
    headings: template.sections.map((section) => section.title),
    unfilled
  };
};
