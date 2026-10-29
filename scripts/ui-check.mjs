#!/usr/bin/env node
/* global console, process */
/**
 * pnpm ui:check — the UI rules of docs/ui/guidelines.md that tools can check:
 *   1. every registered theme passes contrast and target size, and its files are current;
 *   2. every app stylesheet is token-only;
 *   3. the accessibility and UI lint rules pass on the React UI code.
 *
 * Usage:
 *   pnpm ui:check          human-readable report; exit 1 on any finding
 *   pnpm ui:check --json   one JSON object with every finding, for agents
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const asJson = process.argv.includes("--json");
const findings = [];

// 1. Themes: the theme CLI already checks contrast, target size, DESIGN.md, and drift.
const theme = spawnSync("pnpm", ["exec", "tsx", "packages/theme/src/theme.cli.ts", "--check"], {
  cwd: root,
  encoding: "utf8"
});
if (theme.status !== 0) {
  for (const line of `${theme.stderr}`.split("\n").filter((entry) => entry.startsWith("  "))) {
    findings.push({ source: "theme", rule: "COLOR-1", message: line.trim() });
  }
  if (findings.length === 0) {
    findings.push({ source: "theme", rule: "COLOR-1", message: theme.stderr.trim() });
  }
}

// 2. Stylesheets: no raw colors, only defined tokens, named transitions, token type sizes.
const tokensCss = readFileSync(join(root, "packages/ui/src/styles/tokens.generated.css"), "utf8");
const defined = new Set(Array.from(tokensCss.matchAll(/(--ds-[a-zA-Z0-9-]+)\s*:/g), (m) => m[1]));
const stylesheetRoots = [
  "packages/ui/src/styles",
  "apps/web/src",
  "tooling/desk-ui/src",
  "tooling/ui-lab/src"
];
const stylesheets = stylesheetRoots.flatMap((dir) =>
  readdirSync(join(root, dir), { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".css") && !file.endsWith(".generated.css"))
    .map((file) => join(dir, file))
);
const cssRules = [
  [/#[0-9a-fA-F]{3,8}\b/g, "COLOR-5", "a raw hex color"],
  [/\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklch)\(/g, "COLOR-5", "a raw color function"],
  [/transition\s*:\s*all\b/g, "MOTION-2", "transition: all"],
  [/font-size\s*:\s*\d+px/g, "TYPE-1", "a pixel font size"]
];

for (const file of stylesheets) {
  const lines = readFileSync(join(root, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
    .split("\n");
  lines.forEach((text, index) => {
    for (const [pattern, rule, what] of cssRules) {
      for (const match of text.matchAll(pattern)) {
        findings.push({
          source: "css",
          rule,
          file,
          line: index + 1,
          message: `${what}: ${match[0]}`
        });
      }
    }
    for (const [, token] of text.matchAll(/var\((--ds-[a-zA-Z0-9-]+)/g)) {
      if (!defined.has(token) && !new RegExp(`${token}\\s*:`).test(lines.join("\n"))) {
        findings.push({
          source: "css",
          rule: "COLOR-5",
          file,
          line: index + 1,
          message: `${token} is not a theme token`
        });
      }
    }
  });
}

// 3. Lint: the accessibility (jsx-a11y) and UI (ui/*) rules, per UI workspace.
const lintWorkspaces = [
  "packages/ui",
  "packages/ui-3d",
  "apps/web",
  "apps/desktop",
  "tooling/desk-ui",
  "tooling/ui-lab",
  "packages/mobile-ui",
  "apps/mobile"
];
for (const workspace of lintWorkspaces) {
  let output = "[]";
  try {
    output = execFileSync("pnpm", ["exec", "eslint", ".", "--format", "json"], {
      cwd: join(root, workspace),
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024
    });
  } catch (error) {
    // ESLint exits 1 when it finds problems and still prints the JSON; anything else means
    // it did not run, which must fail the check rather than pass it.
    if (typeof error.stdout === "string" && error.stdout.startsWith("[")) {
      output = error.stdout;
    } else {
      findings.push({
        source: "lint",
        rule: "tooling",
        file: workspace,
        line: 0,
        message: `ESLint did not run: ${
          String(error.stderr ?? error.message)
            .trim()
            .split("\n")[0]
        }`
      });
    }
  }
  for (const result of JSON.parse(output)) {
    for (const message of result.messages) {
      if (!/^(jsx-a11y|ui)\//.test(message.ruleId ?? "")) continue;
      findings.push({
        source: "lint",
        rule: message.ruleId,
        file: relative(root, result.filePath),
        line: message.line,
        message: message.message
      });
    }
  }
}

if (asJson) {
  console.log(JSON.stringify({ ok: findings.length === 0, findings }, null, 2));
} else if (findings.length === 0) {
  console.log("UI check passed: themes, stylesheets, and UI lint rules.");
} else {
  for (const finding of findings) {
    const where = finding.file ? `${finding.file}:${finding.line} ` : "";
    console.error(`${where}[${finding.rule}] ${finding.message}`);
  }
  console.error(`\nUI check failed with ${findings.length} finding(s). See docs/ui/guidelines.md.`);
}

process.exit(findings.length === 0 ? 0 : 1);
