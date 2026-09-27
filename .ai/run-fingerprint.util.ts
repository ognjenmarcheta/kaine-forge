import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export function fingerprintInstructions(root: string): string {
  const files = [
    "AGENTS.md",
    "CLAUDE.md",
    "REVIEW.md",
    "MONOREPO_GUIDE.md",
    "CONTEXT.md",
    "DESIGN_SYSTEM.md"
  ];
  for (const directory of [".ai/skills", ".ai/agents"]) {
    if (existsSync(path.join(root, directory)))
      files.push(
        ...readdirSync(path.join(root, directory))
          .filter((name) => name.endsWith(".md"))
          .map((name) => `${directory}/${name}`)
      );
  }
  const installed = path.join(root, ".agents/skills");
  if (existsSync(installed)) {
    for (const entry of readdirSync(installed, { withFileTypes: true }))
      if (entry.isDirectory() && existsSync(path.join(installed, entry.name, "SKILL.md")))
        files.push(`.agents/skills/${entry.name}/SKILL.md`);
  }
  const hash = createHash("sha256");
  for (const file of files.sort()) {
    hash
      .update(file)
      .update("\0")
      .update(
        existsSync(path.join(root, file))
          ? readFileSync(path.join(root, file), "utf8").replaceAll("\r\n", "\n")
          : "<missing>"
      )
      .update("\0");
  }
  return hash.digest("hex");
}
