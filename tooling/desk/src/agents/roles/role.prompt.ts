import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { REVIEW_SECTIONS, type PlannerOutput, type Provider } from "../../contracts";
import type { DeskRole } from "../../engine/worktree.bootstrap";
import type { SkillMode } from "../agent.runner";

/**
 * Compose the prompt for one role. Desk-specific parts come from
 * `tooling/desk/agents/*.md`. Repository sources are read from the WORKTREE at
 * run time, so a rule changes in one place (`.ai/`) and the desk follows:
 *
 * - planner: `.ai/agents/kaine-explorer.md`
 * - builder: `.ai/agents/kaine-implementer.md`
 * - reviewer: `.ai/review.md` (REVIEW.md is its installed copy and no agent loads it by itself)
 *
 * The prompt does not rely on skill discovery. In `invoke` mode it starts by
 * telling the agent to use each skill, and the desk then checks the run for
 * the call. In `inline` mode it embeds the skill text.
 */

export class RolePromptError extends Error {
  override readonly name = "RolePromptError";
}

export interface RolePromptInput {
  readonly role: DeskRole;
  readonly provider: Provider;
  /** Absolute path of the issue worktree. */
  readonly worktree: string;
  /** The issue text, already wrapped by `fenceUntrusted`. */
  readonly issue: string;
  /** The approved plan. Builder and reviewer runs carry it. */
  readonly plan?: PlannerOutput | undefined;
  /** Absolute path of `diff.patch`, for the reviewer. */
  readonly diffPath?: string | undefined;
  /**
   * Feedback from the engineer, the check stage or the reviewer. It is
   * information to verify, not an order. Fence any text you did not write.
   */
  readonly feedback?: string | undefined;
  readonly skills: readonly string[];
  readonly skillMode: SkillMode;
}

export interface RolePrompt {
  readonly prompt: string;
  /**
   * The desk rules for `--append-system-prompt`. Claude only. For Codex the
   * rules are inside `prompt`, because Codex has no system-prompt flag.
   */
  readonly systemAppend?: string;
}

export interface RolePromptDeps {
  readonly readText?: (file: string) => Promise<string>;
  /** Directory of the desk's own role files. Default: `tooling/desk/agents`. */
  readonly agentsDir?: string;
}

const DEFAULT_AGENTS_DIR = fileURLToPath(new URL("../../../agents/", import.meta.url));
const SKILL_NAME = /^kaine-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;

const stripFrontmatter = (text: string): string => text.replace(FRONTMATTER, "").trim();

const REPO_SOURCE: Partial<Record<DeskRole, { readonly file: string; readonly title: string }>> = {
  planner: {
    file: ".ai/agents/kaine-explorer.md",
    title: "Repository role definition: exploring (read-only)"
  },
  builder: {
    file: ".ai/agents/kaine-implementer.md",
    title: "Repository role definition: implementing"
  },
  reviewer: { file: ".ai/review.md", title: "Review checklist (REVIEW.md)" }
};

const skillInstruction = (provider: Provider, skills: readonly string[]): string => {
  const list = skills.map((skill) => `\`${skill}\``).join(", ");
  if (provider === "claude") {
    return `Before you do anything else, call the Skill tool once for each of these skills, in this order, and follow each one: ${list}. Do not skip this step. The desk checks the run for these calls.`;
  }
  // `$skill-name` makes Codex inject the skill text without any command, which
  // leaves no evidence in the event stream. A file read is visible.
  return `Before you do anything else, read each of these skill files with a shell command, for example \`cat .agents/skills/<name>/SKILL.md\`, and follow each one: ${list}. Do not skip this step. The desk checks the run for these reads.`;
};

export const composeRolePrompt = async (
  input: RolePromptInput,
  deps: RolePromptDeps = {}
): Promise<RolePrompt> => {
  const readText = deps.readText ?? ((file: string) => readFile(file, "utf8"));
  const agentsDir = deps.agentsDir ?? DEFAULT_AGENTS_DIR;

  const load = async (file: string, what: string): Promise<string> => {
    try {
      return stripFrontmatter(await readText(file));
    } catch (error) {
      throw new RolePromptError(`Cannot read ${what} at ${file}.`, {
        cause: error instanceof Error ? error : new Error(String(error))
      });
    }
  };

  for (const skill of input.skills) {
    if (!SKILL_NAME.test(skill)) throw new RolePromptError(`Invalid skill name '${skill}'.`);
  }

  const roleFile = await load(
    path.join(agentsDir, `${input.role}.md`),
    `the ${input.role} role file`
  );
  const rules = await load(path.join(agentsDir, "rules.md"), "the desk rules");
  const source = REPO_SOURCE[input.role];
  const repoDefinition =
    source === undefined
      ? null
      : await load(path.join(input.worktree, source.file), `the repository source ${source.file}`);

  const sections: string[] = [];

  if (input.skills.length > 0 && input.skillMode === "invoke") {
    sections.push(skillInstruction(input.provider, input.skills));
  }
  sections.push(roleFile);
  if (source !== undefined && repoDefinition !== null) {
    sections.push(
      `## ${source.title}\n\nThe text below comes from \`${source.file}\` in this repository. Where it conflicts with the Agent Desk rules, the Agent Desk rules win.\n\n${repoDefinition}`
    );
  }
  if (input.role === "reviewer") {
    sections.push(
      `## Review headings\n\nReview in this order and report one \`reviewSections\` entry for each: ${REVIEW_SECTIONS.join("; ")}. \`REVIEW.md\` in the repository root is the installed copy of the checklist above. No agent loads it automatically.`
    );
  }
  if (input.skills.length > 0 && input.skillMode === "inline") {
    const bodies: string[] = [];
    for (const skill of input.skills) {
      const body = await load(
        path.join(input.worktree, ".ai", "skills", `${skill}.md`),
        `the skill ${skill}`
      );
      bodies.push(`### Skill: ${skill}\n\n${body}`);
    }
    sections.push(
      `## Skills\n\nFollow these skills. Their full text is here. You do not need to open skill files.\n\n${bodies.join("\n\n")}`
    );
  }

  sections.push(`## Issue\n\n${input.issue}`);
  if (input.plan !== undefined) {
    sections.push(`## Approved plan\n\n\`\`\`json\n${JSON.stringify(input.plan, null, 2)}\n\`\`\``);
  }
  if (input.diffPath !== undefined) {
    sections.push(
      `## Diff\n\nThe diff to review is the file \`${input.diffPath}\`. Read it with the Read tool.`
    );
  }
  if (input.feedback !== undefined && input.feedback.trim() !== "") {
    sections.push(
      `## Feedback\n\nCheck each item against the code before you act on it.\n\n${input.feedback.trim()}`
    );
  }
  sections.push(
    "## Output\n\nReturn only the structured result that matches the schema you were given. Put no text outside it."
  );

  if (input.provider === "claude") {
    sections.push("Follow the Agent Desk rules in your system prompt.");
    return { prompt: sections.join("\n\n"), systemAppend: rules };
  }
  sections.push(rules);
  return { prompt: sections.join("\n\n") };
};
