import { cp, stat } from "node:fs/promises";
import path from "node:path";

import { CONVENTIONAL_TYPES, type ConventionalType, type Provider } from "../contracts";
import { createWorktree } from "../worktree";
import { ISSUE_SUMMARY_FILE, issueSummarySchema } from "./intake.run";
import { readArtifactJson } from "./pipeline.artifacts";
import type { PipelineDeps, StageHandler } from "./pipeline.types";
import { skillsForRoles, slugify } from "./worktree.bootstrap";

/** The base branch on `origin`. The template's pull requests all target `main`. */
export const BASE_BRANCH = "main";

const BRANCH_PARTS = new RegExp(
  `^KAINE-\\d+-(${CONVENTIONAL_TYPES.join("|")})-([a-z0-9]+(?:-[a-z0-9]+)*)$`
);

/** The type and slug of a desk branch name, or `null` for any other name. */
export const parseDeskBranch = (
  branch: string
): { readonly type: ConventionalType; readonly slug: string } | null => {
  const match = BRANCH_PARTS.exec(branch);
  const type = CONVENTIONAL_TYPES.find((candidate) => candidate === match?.[1]);
  const slug = match?.[2];
  return type === undefined || slug === undefined ? null : { type, slug };
};

/** `worktreesDir`, or the sibling `<repo>.worktrees` directory when it is `null`. */
export const worktreeDirFor = (
  deps: Pick<PipelineDeps, "config" | "location">,
  issue: number
): string => {
  const { repoRoot } = deps.location;
  const parent =
    deps.config.worktreesDir === null
      ? path.join(path.dirname(repoRoot), `${path.basename(repoRoot)}.worktrees`)
      : path.resolve(repoRoot, deps.config.worktreesDir);
  return path.join(parent, `KAINE-${issue}`);
};

const exists = async (target: string): Promise<boolean> => {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
};

/**
 * Setup: derive the provisional branch, run the worktree recipe (Phase 2A),
 * record the branch, worktree and base commit. The branch type is `fix` for a
 * `bug` label and `feat` otherwise. The planner may change it at the gate.
 * `ticket.md` was written by intake.
 */
export const setupStage: StageHandler = async (context) => {
  const { deps } = context;
  const state = context.state();

  const summary = await readArtifactJson(
    context.artifactsDir,
    ISSUE_SUMMARY_FILE,
    issueSummarySchema
  );
  if (summary.status !== "ok") {
    return {
      kind: "needs-you",
      reason:
        summary.status === "missing"
          ? "Setup cannot start: the intake summary (issue.json) is missing. Run 'start' again to repeat intake."
          : `Setup cannot start: ${summary.detail}.`
    };
  }

  // A retry keeps the branch and the directory it chose the first time.
  const known = state.branch === null ? null : parseDeskBranch(state.branch);
  const type: ConventionalType =
    known?.type ??
    (summary.value.labels.some((label) => label.toLowerCase() === "bug") ? "fix" : "feat");
  const slug = known?.slug ?? slugify(summary.value.title);
  const worktreeDir = state.worktreePath ?? worktreeDirFor(deps, context.issue);
  const agents = [...new Set<Provider>(Object.values(deps.config.providers))];

  let created;
  try {
    created = await createWorktree(
      {
        exec: deps.exec,
        git: deps.git,
        ...(deps.setupTimeoutsMs === undefined ? {} : { timeoutsMs: deps.setupTimeoutsMs }),
        log: context.log
      },
      {
        repoDir: deps.location.repoRoot,
        input: {
          issue: context.issue,
          type,
          slug,
          base: BASE_BRANCH,
          worktreeDir,
          agents,
          skills: skillsForRoles(["planner", "builder", "reviewer"]),
          mcp: ["serena"]
        }
      }
    );
  } catch (error) {
    return {
      kind: "needs-you",
      reason: `Setup failed: ${error instanceof Error ? error.message : "unknown error"}`
    };
  }
  if (!created.ok) {
    return {
      kind: "needs-you",
      reason: [
        `Setup failed at step '${created.step}': ${created.reason}.`,
        created.tail === "" ? null : `Output:\n${created.tail}`,
        "The worktree is kept. Fix the cause, then continue."
      ]
        .filter((part): part is string => part !== null)
        .join("\n")
    };
  }

  // Files the developer wants in every worktree (for example a local `.env`).
  // They are copied after the recipe and never overwrite a file that is there.
  for (const relative of deps.config.copyIntoWorktree) {
    const from = path.join(deps.location.repoRoot, relative);
    const to = path.join(created.worktreePath, relative);
    try {
      if ((await exists(from)) && !(await exists(to))) {
        await cp(from, to, { recursive: true, errorOnExist: true });
      }
    } catch (error) {
      context.log(
        `could not copy ${relative}: ${error instanceof Error ? error.message : "error"}`
      );
    }
  }

  return {
    kind: "complete",
    event: "setup-complete",
    note: `${created.reused ? "reused" : "created"} worktree ${created.worktreePath} on ${created.branch}`,
    patch: {
      branch: created.branch,
      worktreePath: created.worktreePath,
      baseSha: created.baseSha
    }
  };
};
