import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { ChangesetDecision } from "./ship.changeset";
import { buildPrBody, FILLED_HEADINGS, parseTemplate, type PrBodyInput } from "./ship.pr-body";
import { checkReportOf } from "./ship.testing";
import { planOutput, reviewOutput } from "../testing/pipeline.testing";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");
const readTemplate = (): Promise<string> =>
  readFile(path.join(REPO_ROOT, ".github/pull_request_template.md"), "utf8");

const none: ChangesetDecision = { kind: "none", reason: "No source file changed." };

const inputWith = async (over: Partial<PrBodyInput> = {}): Promise<PrBodyInput> => ({
  template: await readTemplate(),
  issue: 42,
  plan: planOutput({ risks: ["The CSV escapes commas"], openQuestions: ["Which encoding?"] }),
  reports: [checkReportOf()],
  review: reviewOutput(),
  changeset: none,
  changesetPath: null,
  ...over
});

const headingsOf = (body: string): string[] =>
  parseTemplate(body).sections.map((section) => section.title);

describe("buildPrBody with the real template", () => {
  it("keeps every template heading, in order, and fills each one", async () => {
    const input = await inputWith();
    const result = buildPrBody(input);
    const expected = parseTemplate(input.template).sections.map((section) => section.title);
    expect(expected.length).toBeGreaterThanOrEqual(7);
    expect(result.headings).toEqual(expected);
    expect(headingsOf(result.body)).toEqual(expected);
    expect(result.unfilled).toEqual([]);
  });

  // Drift guard: if .github/pull_request_template.md gains a heading, this fails
  // until ship.pr-body.ts learns to fill it.
  it("can fill every heading of the real template", async () => {
    const template = parseTemplate(await readTemplate());
    const known = new Set(FILLED_HEADINGS);
    const missing = template.sections
      .map((section) => section.title)
      .filter((title) => !known.has(title.toLowerCase().replace(/[^a-z0-9]+/g, "")));
    expect(missing).toEqual([]);
  });

  it("links the issue so merging closes it", async () => {
    const { body } = buildPrBody(await inputWith({ issue: 42 }));
    expect(body.match(/Closes #42/g)).toHaveLength(1);
    expect(body).toContain("Add a CSV export for reports");
  });

  it("lists the checks from the reports and nothing else", async () => {
    const { body } = buildPrBody(
      await inputWith({
        reports: [
          checkReportOf({ kind: "loop", steps: [checkReportOf().steps[0]!] }),
          checkReportOf()
        ]
      })
    );
    expect(body).toContain("`pnpm generate`: passed (loop check)");
    expect(body).toContain("`pnpm check`: passed (ship check)");
    expect(body).not.toContain("`pnpm test`: passed");
  });

  it("ticks only the checklist boxes a passed step proves", async () => {
    const { body } = buildPrBody(await inputWith());
    expect(body).toContain("- [x] `pnpm check`");
    for (const unproven of ["pnpm lint", "pnpm typecheck", "pnpm test", "pnpm coverage"]) {
      expect(body).toContain(`- [ ] \`${unproven}\``);
    }
    expect(body).toMatch(/Not run by the desk: .*`pnpm coverage`/);
  });

  it("does not tick a box for a failed step", async () => {
    const failed = checkReportOf({
      passed: false,
      steps: [{ argv: ["pnpm", "check"], code: 1, timedOut: false, tail: "no", durationMs: 1 }]
    });
    const { body } = buildPrBody(await inputWith({ reports: [failed] }));
    expect(body).toContain("`pnpm check`: failed (exit 1) (ship check)");
    expect(body).toContain("- [ ] `pnpm check`");
  });

  it("shows the review verdict, the finding counts and the plan's open questions", async () => {
    const review = reviewOutput({
      findings: [
        {
          severity: "Consider",
          blocking: false,
          file: "src/feature.ts",
          line: 1,
          section: "Correctness",
          summary: "Escape quotes",
          fix: ""
        }
      ]
    });
    const { body } = buildPrBody(await inputWith({ review }));
    expect(body).toContain(
      "Reviewer verdict: approve. Findings: 0 Critical, 1 Consider, 0 Nit, 0 FYI."
    );
    expect(body).toContain("src/feature.ts:1 [Consider] Escape quotes");
    expect(body).toContain("Which encoding?");
    expect(body).toContain("The CSV escapes commas");
  });

  it("says so when no review was read", async () => {
    expect(buildPrBody(await inputWith({ review: null })).body).toContain(
      "No review result was read."
    );
  });

  it("leaves the risk level and impact boxes to the owner", async () => {
    const { body } = buildPrBody(await inputWith());
    expect(body).not.toMatch(/- \[x\] (Low|Medium|High)/);
    expect(body).toContain("The owner sets them.");
  });

  it.each<[string, ChangesetDecision, string | null, RegExp, RegExp]>([
    [
      "a changeset file",
      { kind: "file", packages: ["@repo/desk"], bump: "minor", reason: "Plan asks.", unlisted: [] },
      ".changeset/export-reports.md",
      /- \[x\] This PR touches .*includes a `\.changeset\/\*\.md`/,
      /- \[ \] This PR is intentionally non-releasable/
    ],
    [
      "the skip label",
      { kind: "skip-label", label: "release:skip-changeset", reason: "Not releasable." },
      null,
      /- \[x\] This PR is intentionally non-releasable/,
      /- \[ \] This PR touches/
    ],
    [
      "no source change",
      { kind: "none", reason: "No file under apps/, packages/ or tooling/ changed." },
      null,
      /- \[ \] This PR touches/,
      /- \[ \] This PR is intentionally non-releasable/
    ],
    [
      "an existing changeset",
      { kind: "none", reason: "The change already carries a .changeset/*.md file." },
      null,
      /- \[x\] This PR touches/,
      /- \[ \] This PR is intentionally non-releasable/
    ]
  ])(
    "states the release metadata for %s",
    async (_name, changeset, changesetPath, first, second) => {
      const { body } = buildPrBody(await inputWith({ changeset, changesetPath }));
      expect(body).toMatch(first);
      expect(body).toMatch(second);
      expect(body).toContain("Changeset / skip reason:");
      expect(body).toContain(`- ${changeset.reason}`);
      if (changesetPath !== null) expect(body).toContain(changesetPath);
    }
  );

  it("mentions packages the plan did not list", async () => {
    const { body } = buildPrBody(
      await inputWith({
        changeset: {
          kind: "file",
          packages: ["@repo/desk"],
          bump: "patch",
          reason: "Plan asks.",
          unlisted: ["@repo/ui"]
        }
      })
    );
    expect(body).toContain("packages the plan did not list: @repo/ui");
  });

  it("carries no AI footer", async () => {
    const { body } = buildPrBody(await inputWith());
    expect(body).not.toMatch(/generated with|co-authored-by|claude/i);
  });
});

describe("buildPrBody with a template that changed", () => {
  it("keeps an unknown heading with n/a and reports it", async () => {
    const template = `${await readTemplate()}\n## Rollout plan\n\n- fill me\n`;
    const result = buildPrBody(await inputWith({ template }));
    expect(result.unfilled).toEqual(["Rollout plan"]);
    expect(result.body).toContain("## Rollout plan\n\nn/a");
    expect(result.headings.at(-1)).toBe("Rollout plan");
  });

  it("keeps text before the first heading and heading levels", () => {
    const result = buildPrBody({
      template: "<!-- note -->\n\n### Summary\n\n- x\n\n#### Mystery\n",
      issue: 1,
      plan: planOutput(),
      reports: [],
      review: null,
      changeset: none,
      changesetPath: null
    });
    expect(result.body.startsWith("<!-- note -->\n\n### Summary\n\nCloses #1")).toBe(true);
    expect(result.body).toContain("#### Mystery\n\nn/a");
  });

  it("does not read a heading inside a code fence or a list item", () => {
    const parsed = parseTemplate("## A\n\n```\n## not a heading\n```\n\n- ## nor this\n\n## B\n");
    expect(parsed.sections.map((section) => section.title)).toEqual(["A", "B"]);
  });

  it("does not run an inherited object key as a filler", () => {
    const result = buildPrBody({
      template: "## Constructor\n\n## toString\n",
      issue: 1,
      plan: planOutput(),
      reports: [],
      review: null,
      changeset: none,
      changesetPath: null
    });
    expect(result.unfilled).toEqual(["Constructor", "toString"]);
  });
});
