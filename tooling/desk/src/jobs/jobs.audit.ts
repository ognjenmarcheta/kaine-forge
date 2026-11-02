import type { AuditSpec } from "../contracts";

/**
 * The audit job: check one lab screen against the UI guidelines and WCAG 2.2 in the job's lab
 * server, and propose each finding as an issue. It changes no file and pushes nothing; the
 * owner ticks the findings the desk files.
 */

export const auditPrompt = (input: {
  readonly audit: AuditSpec;
  /** The screen's reference image in the worktree, when the owner has one locally. */
  readonly referencePath: string | null;
  readonly labUrl: string;
  readonly note: string;
  readonly feedback: readonly string[];
}): string => {
  const id = input.audit.screenId;
  const compare = input.labUrl.replace("/lab-frame.html", `/?view=lab#/compare/${id}`);
  return [
    `You are the agent desk's audit job. Audit the lab screen ${id} (tooling/desk-ui/src/lab/screens/${id}/).`,
    "",
    "Call the Skill tool with kaine-audit-ui first and follow it. Call it with kaine-write-issue before you write the findings.",
    "",
    `- The job's lab server runs for you. The screen is at ${input.labUrl}#/screens/${id} (add /light or /dark for a mode). Look at it with the Playwright browser tools, in both modes and with the keyboard.`,
    input.referencePath === null
      ? "- The screen has no reference image here: audit the guidelines and WCAG only, and set matchPercent to null."
      : `- The reference image is ${input.referencePath}: also audit in reference mode. The compare view is ${compare}; \`pnpm lab:diff ${id}\` measures it (LAB_URL is set). Set matchPercent from your reference-mode score.`,
    "- Change no file. You may run `pnpm ui:check`, `pnpm lab:diff`, and `pnpm lab:shots`.",
    "- findings: one per problem, with its rule ID and severity (must, should, could). Each is the issue the desk files when the owner ticks it: a kebab-case slug, a `scope: lowercase statement` title, labels, and a body in the six-heading issue format.",
    "- You may start subagents with the Agent tool. They have your permissions.",
    "",
    `Owner note: ${input.note.trim() === "" ? "none" : input.note.trim()}`,
    ...(input.feedback.length === 0
      ? []
      : [
          "",
          "The owner sent the last report back from the gate. Address every note, newest last:",
          ...input.feedback.map((entry) => `- ${entry}`)
        ])
  ].join("\n");
};
