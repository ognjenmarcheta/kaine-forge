#!/usr/bin/env node
/* global console, process */
/**
 * Scaffold a new @repo/* package with standard scripts, tsconfig, and FDD stubs.
 *
 * Usage:
 *   pnpm create:package <name>
 *   pnpm create:package notes
 *   pnpm create:package my-lib --description "Shared helpers"
 *   pnpm create:package widgets --react
 *   pnpm create:package native-kit --native
 *
 * Creates packages/<name>/ and wires tsconfig.base paths, web Vite aliases,
 * and vitest.coverage.config.ts projects. Fails if any wiring target is missing.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function usage(exitCode = 1) {
  console.log(`Usage: pnpm create:package <kebab-name> [options]

Options:
  --description "..."   Package description
  --react               Extend tsconfig.react.json (DOM React package)
  --native              Extend tsconfig.native.json (React Native package)

Examples:
  pnpm create:package notes
  pnpm create:package billing-util --description "Billing helpers"
`);
  process.exit(exitCode);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function toCamel(kebab) {
  return kebab.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function insertTsconfigPaths(packageName, name) {
  const path = join(root, "tsconfig.base.json");
  if (!existsSync(path)) {
    fail(`Missing ${path}`);
  }
  const text = readFileSync(path, "utf8");
  const key = `"${packageName}"`;
  if (text.includes(key)) {
    return;
  }
  const pathsMatch = text.match(/"paths"\s*:\s*\{/);
  if (!pathsMatch || pathsMatch.index === undefined) {
    fail('tsconfig.base.json: could not find "paths" object');
  }
  const insertAt = pathsMatch.index + pathsMatch[0].length;
  const entry = `
      "${packageName}": ["packages/${name}/src/index.ts"],
      "${packageName}/*": ["packages/${name}/src/*"],`;
  writeFileSync(path, `${text.slice(0, insertAt)}${entry}${text.slice(insertAt)}`);
}

function insertViteAlias(packageName, name) {
  const path = join(root, "apps/web/vite.config.ts");
  if (!existsSync(path)) {
    fail(`Missing ${path}`);
  }
  const text = readFileSync(path, "utf8");
  if (text.includes(`"${packageName}"`)) {
    return;
  }
  const marker = '        "@repo/ui": path.join(workspaceRoot, "packages/ui/src/index.ts")';
  if (!text.includes(marker)) {
    fail("apps/web/vite.config.ts: could not find @repo/ui alias anchor");
  }
  const aliasLine = `        "${packageName}": path.join(workspaceRoot, "packages/${name}/src/index.ts"),\n`;
  writeFileSync(path, text.replace(marker, `${aliasLine}${marker}`));
}

function insertCoverageProject(name) {
  const path = join(root, "vitest.coverage.config.ts");
  if (!existsSync(path)) {
    fail(`Missing ${path}`);
  }
  const text = readFileSync(path, "utf8");
  const project = `"packages/${name}"`;
  if (text.includes(project)) {
    return;
  }
  const marker = '      "packages/ui"';
  if (!text.includes(marker)) {
    fail("vitest.coverage.config.ts: could not find packages/ui project anchor");
  }
  writeFileSync(path, text.replace(marker, `      "packages/${name}",\n${marker}`));
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  usage(args.includes("--help") || args.includes("-h") ? 0 : 1);
}

const name = args[0];
let description = `Shared @repo/${name} package`;
let preset = "node";
for (let i = 1; i < args.length; i += 1) {
  if (args[i] === "--description") {
    description = args[i + 1] ?? description;
    i += 1;
  } else if (args[i] === "--react") {
    preset = "react";
  } else if (args[i] === "--native") {
    preset = "native";
  }
}

if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name) || name.startsWith("-")) {
  fail(`Invalid package name "${name}". Use lowercase kebab-case (e.g. feature-flags).`);
}

const dir = join(root, "packages", name);
if (existsSync(dir)) {
  fail(`Package directory already exists: packages/${name}`);
}

const packageName = `@repo/${name}`;
const utilBase = name.replace(/-/g, ".");
const tsconfigExtends =
  preset === "react"
    ? "../config/typescript/tsconfig.react.json"
    : preset === "native"
      ? "../config/typescript/tsconfig.native.json"
      : "../config/typescript/tsconfig.node.json";

const packageJson = {
  name: packageName,
  version: "0.0.0",
  private: true,
  type: "module",
  main: "dist/index.js",
  types: "dist/index.d.ts",
  exports: {
    ".": {
      types: "./dist/index.d.ts",
      default: "./dist/index.js"
    }
  },
  scripts: {
    dev: `echo "${packageName} has no dev runtime"`,
    build: "tsc -p tsconfig.json",
    check: "pnpm run format:check && pnpm run lint && pnpm run typecheck && pnpm run test",
    format: "prettier --write .",
    "format:check": "prettier --check .",
    lint: "eslint .",
    "lint:fix": "eslint . --fix",
    typecheck: "tsc --noEmit",
    test: "vitest run --passWithNoTests",
    "test:watch": "vitest --passWithNoTests",
    clean: "rm -rf dist .turbo"
  },
  devDependencies: {
    "@repo/config": "workspace:*",
    vitest: "catalog:"
  }
};

const tsconfig = {
  extends: tsconfigExtends,
  compilerOptions: {
    outDir: "dist",
    rootDir: "src"
  },
  include: ["src/**/*.ts"]
};

const indexTs = `export * from "./${utilBase}.util";
`;

const utilTs = `/**
 * ${description}
 */
export function ${toCamel(name)}Placeholder(): string {
  return "${packageName}";
}
`;

const utilTestTs = `import { describe, expect, it } from "vitest";

import { ${toCamel(name)}Placeholder } from "./${utilBase}.util";

describe("${packageName}", () => {
  it("exports a placeholder helper", () => {
    expect(${toCamel(name)}Placeholder()).toBe("${packageName}");
  });
});
`;

const changelog = `# ${packageName}

## 0.0.0

- Initial scaffold via \`pnpm create:package\`
`;

// Wire monorepo targets first so a partial package is not left behind on failure.
insertTsconfigPaths(packageName, name);
insertViteAlias(packageName, name);
insertCoverageProject(name);

mkdirSync(join(dir, "src"), { recursive: true });
writeFileSync(join(dir, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
writeFileSync(join(dir, "tsconfig.json"), `${JSON.stringify(tsconfig, null, 2)}\n`);
writeFileSync(join(dir, "CHANGELOG.md"), changelog);
writeFileSync(join(dir, "src", "index.ts"), indexTs);
writeFileSync(join(dir, "src", `${utilBase}.util.ts`), utilTs);
writeFileSync(join(dir, "src", `${utilBase}.util.test.ts`), utilTestTs);

console.log(`Created ${packageName} at packages/${name}`);
console.log(`
Wired:
  - tsconfig.base.json paths
  - apps/web/vite.config.ts alias
  - vitest.coverage.config.ts project
  - tsconfig extends ${tsconfigExtends}
  - devDependencies: @repo/config, vitest

Next steps:
  1. pnpm install
  2. pnpm --filter ${packageName} test
  3. Wire dependents with "${packageName}": "workspace:*"
  4. pnpm changeset when ready to version
`);
