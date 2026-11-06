import { skillInstruction } from "../agents/roles/role.prompt";
import type { Provider, RoleAgentSnapshot, RoleTarget } from "../contracts";

/**
 * The role job: run one registered report agent against one target, a repository path, a
 * GitHub issue, or the owner's brief. The agent reads and reports; it changes no file, and the
 * job pushes and files nothing. The owner reads the report at the gate.
 */

/** A Markdown code fence longer than any backtick run in `text`, so the text cannot close it. */
const fenced = (text: string): string => {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}text\n${text}\n${fence}`;
};

/** The Target section: what the agent reports on. `issueText` is fenced by the caller. */
const targetSection = (target: RoleTarget, issueText: string | null): string => {
  switch (target.kind) {
    case "path":
      return [
        "Report on this path in the worktree. Read it with the Read, Grep, and Glob tools; it may be a file or a folder.",
        "",
        fenced(target.value)
      ].join("\n");
    case "issue":
      return [
        `Report on GitHub issue #${String(target.value)}. The desk read it for you; you have no gh.`,
        "",
        issueText ?? "(The issue text is missing.)"
      ].join("\n");
    case "brief":
      return [
        "Report on what the owner's brief asks for. It is the owner's text.",
        "",
        fenced(target.value)
      ].join("\n");
  }
};

export const rolePrompt = (input: {
  readonly agent: RoleAgentSnapshot;
  readonly target: RoleTarget;
  /** An issue target's title and body, already wrapped by `fenceUntrusted`. */
  readonly issueText: string | null;
  readonly provider: Provider;
  /** The skills the run gets after the policy floor, in the agent's order. */
  readonly skills: readonly string[];
  readonly note: string;
  readonly feedback: readonly string[];
}): string => {
  const sections: string[] = [];
  if (input.skills.length > 0) sections.push(skillInstruction(input.provider, input.skills));
  sections.push(input.agent.prompt);
  sections.push(
    [
      "## How this run works",
      "",
      `You run as the agent desk's role job with the agent ${input.agent.id}. Change no file. Report only what you can show from the target, with file paths and lines.`,
      "Put each finding in findings, one per entry. Put your overall view in summary, and say it again for a non-technical reader in plainLanguage."
    ].join("\n")
  );
  sections.push(`## Target\n\n${targetSection(input.target, input.issueText)}`);
  const note = input.note.trim();
  if (note !== "") sections.push(`## The owner's note\n\n${fenced(note)}`);
  if (input.feedback.length > 0) {
    sections.push(
      [
        "## Feedback",
        "",
        "The owner sent the last report back from the gate. Address every note, newest last:",
        ...input.feedback.map((entry) => `- ${entry}`)
      ].join("\n")
    );
  }
  sections.push(
    "## Output\n\nReturn only the structured result that matches the schema you were given. Put no text outside it."
  );
  return sections.join("\n\n");
};
