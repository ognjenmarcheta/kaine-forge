#!/usr/bin/env node
/* global console, process */
/**
 * Scaffold a new @repo/* package with standard scripts, tsconfig, and FDD stubs.
 *
 * Usage:
 *   pnpm create:package <name>
 *   pnpm create:package notes
 *   pnpm create:package my-lib --description "Shared helpers"
 *
 * Creates packages/<name>/ with package.json, tsconfig.json, src/index.ts,
 * and a sample {name}.util.ts + test.
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function usage(exitCode = 1) {
  console.log(`Usage: pnpm create:package <kebab-name> [--description "..."]

Examples:
  pnpm create:package notes
  pnpm create:package billing-util --description "Billing helpers"
`);
  process.exit(exitCode);
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  usage(args.includes("--help") || args.includes("-h") ? 0 : 1);
}

const name = args[0];
let description = `Shared @repo/${name} package`;
for (let i = 1; i < args.length; i += 1) {
  if (args[i] === "--description") {
    description = args[i + 1] ?? description;
    i += 1;
  }
}

if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name) || name.startsWith("-")) {
  console.error(`Invalid package name "${name}". Use lowercase kebab-case (e.g. feature-flags).`);
  process.exit(1);
}

const dir = join(root, "packages", name);
if (existsSync(dir)) {
  console.error(`Package directory already exists: packages/${name}`);
  process.exit(1);
}

const packageName = `@repo/${name}`;
const utilBase = name.replace(/-/g, ".");

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
    dev: "tsx watch src/index.ts",
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
  }
};

const tsconfig = {
  extends: "../../tsconfig.base.json",
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

function toCamel(kebab) {
  return kebab.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

mkdirSync(join(dir, "src"), { recursive: true });
writeFileSync(join(dir, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
writeFileSync(join(dir, "tsconfig.json"), `${JSON.stringify(tsconfig, null, 2)}\n`);
writeFileSync(join(dir, "CHANGELOG.md"), changelog);
writeFileSync(join(dir, "src", "index.ts"), indexTs);
writeFileSync(join(dir, "src", `${utilBase}.util.ts`), utilTs);
writeFileSync(join(dir, "src", `${utilBase}.util.test.ts`), utilTestTs);

console.log(`Created ${packageName} at packages/${name}`);
console.log(`
Next steps:
  1. Add path mapping in tsconfig.base.json if consumers need source resolution:
       "${packageName}": ["packages/${name}/src/index.ts"],
       "${packageName}/*": ["packages/${name}/src/*"]
  2. pnpm install
  3. pnpm --filter ${packageName} test
  4. Wire dependents with "${packageName}": "workspace:*"
  5. pnpm changeset when ready to version
`);
