import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { discoverAgentDefinitions, discoverSkills, REPO_ROOT } from "./ai.util";

const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  options: { revision: { type: "string" } }
});
const read = (file: string) =>
  (values.revision
    ? execFileSync("git", ["show", `${values.revision}:${file}`], {
        cwd: REPO_ROOT,
        encoding: "utf8"
      })
    : readFileSync(path.join(REPO_ROOT, file), "utf8")
  ).replaceAll("\r\n", "\n");
const count = (text: string) => ({
  words: text.trim().split(/\s+/u).filter(Boolean).length,
  characters: [...text].length
});
const entry = (file: string, owner: string, loading: string, duplication: string) => ({
  file,
  owner,
  loading,
  duplication,
  ...count(read(file))
});
const skills = discoverSkills();
const inventory = [
  entry(
    ".ai/guide.md",
    "canonical .ai",
    "generator input; not automatically loaded",
    "AGENTS.md is generated from this source"
  ),
  entry(
    "AGENTS.md",
    "generated .ai/guide.md + skill metadata + permissions",
    "repository instruction injection; host dependent",
    "Claude imports this file; do not count its source again"
  ),
  entry(
    "CLAUDE.md",
    "generated import",
    "Claude instruction import",
    "imports AGENTS.md; import bytes are not a second copy of the guide"
  ),
  entry(
    ".ai/cursor-rules.md",
    "canonical .ai",
    "Cursor always-applied generated rule source",
    "overlaps selected root guide rules; different host"
  ),
  ...[
    "MONOREPO_GUIDE.md",
    "CONTEXT.md",
    "REVIEW.md",
    "DESIGN_SYSTEM.md",
    "docs/agents/day-one.md",
    "docs/agents/domain.md"
  ].map((file) =>
    entry(
      file,
      file === "REVIEW.md" ? "generated .ai/review.md" : "repository documentation",
      "on demand, according to task and required reading",
      "substantive rule overlap; not removed"
    )
  ),
  ...discoverAgentDefinitions().map((agent) =>
    entry(
      `.ai/agents/${agent.name}.md`,
      "canonical .ai agent definition",
      "selected agent dispatch only",
      "task emphasis overlaps guide; no causal performance claim"
    )
  ),
  ...skills.map((skill) => {
    const text = read(`.ai/skills/${skill.name}.md`);
    const metadata = text.split(/^---\s*$/m)[1] ?? "";
    return {
      file: `.ai/skills/${skill.name}.md`,
      owner: "canonical skill",
      loading: "metadata discovery; full body on demand",
      duplication: "name and description also appear once in generated guide index",
      ...count(text),
      metadata: count(metadata)
    };
  })
];
console.log(
  JSON.stringify(
    {
      schemaVersion: 1,
      revision: values.revision ?? "working-tree",
      measurement:
        "UTF-8 decoded Unicode characters, LF normalized; whitespace-delimited words. Not model tokens.",
      scope:
        "Repository-owned files only. No invisible host, tool, plugin or personal context included. No session-total claim.",
      inventory
    },
    null,
    2
  )
);
