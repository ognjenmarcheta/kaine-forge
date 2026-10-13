import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { CONTRACT_SECTIONS, parseContract } from "./github.contract";

/**
 * The issue format is a contract between the places that write issues and intake, which reads
 * them. These tests run the real parser on what GitHub renders from each issue template, and on
 * the example of docs/agents/issue-format.md, so neither side can drift.
 */

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const TEMPLATES = path.join(ROOT, ".github", "ISSUE_TEMPLATE");

interface TemplateField {
  readonly label: string;
  readonly required: boolean;
}

/** Each field of a form template, in order. GitHub renders a field as `### <label>`. */
const fieldsOf = (yaml: string): TemplateField[] =>
  yaml
    .split(/\n {2}- type: /)
    .slice(1)
    .flatMap((block) => {
      const label = /\n {6}label: (.+)/.exec(block)?.[1]?.trim();
      return label === undefined
        ? []
        : [{ label: label.replace(/^"|"$/g, ""), required: /required: true/.test(block) }];
    });

/** The body GitHub writes when the reporter fills in only the required fields. */
const renderRequired = (fields: readonly TemplateField[]): string =>
  fields
    .map((field) =>
      field.required
        ? `### ${field.label}\n\n- filled in\n`
        : `### ${field.label}\n\n_No response_\n`
    )
    .join("\n");

const templates = readdirSync(TEMPLATES).filter(
  (name) => /\.ya?ml$/.test(name) && name !== "config.yml"
);

describe("issue templates", () => {
  it("exist", () => {
    expect(templates.length).toBeGreaterThan(0);
  });

  it.each(templates)("%s gives a full contract with only its required fields", (name) => {
    const report = parseContract(
      renderRequired(fieldsOf(readFileSync(path.join(TEMPLATES, name), "utf8")))
    );
    expect(report.missing).toEqual([]);
    expect(report.found).toBe(CONTRACT_SECTIONS.length);
    expect(report.acceptanceCriteria.length).toBeGreaterThan(0);
  });
});

describe("docs/agents/issue-format.md", () => {
  it("shows an example that intake reads as a full contract", () => {
    const doc = readFileSync(path.join(ROOT, "docs", "agents", "issue-format.md"), "utf8");
    const example = /```markdown\n([\s\S]*?)```/.exec(doc)?.[1];
    expect(example).toBeDefined();
    const report = parseContract(example ?? "");
    expect(report.missing).toEqual([]);
    expect(report.acceptanceCriteria.length).toBeGreaterThan(0);
  });
});
