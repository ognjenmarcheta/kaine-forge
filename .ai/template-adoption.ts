#!/usr/bin/env tsx

import { cancel, intro, isCancel, outro, text } from "@clack/prompts";
import chalk from "chalk";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";

import { REPO_ROOT } from "./ai.util";
import {
  activeTemplateReferences,
  adoptionTargets,
  applyTemplateAdoption,
  deriveTemplateAdoptionConfig,
  excludedFromTemplateAdoption,
  parseTemplateAdoptionConfig,
  slugify,
  type TemplateAdoptionConfig,
  type TemplateAdoptionInput
} from "./template-adoption.util";

interface CliOptions {
  configPath?: string;
  write: boolean;
  check: boolean;
}

const usage = `Usage:
  pnpm template:adopt
  pnpm template:adopt --config template-adoption.json [--write]
  pnpm template:adopt --check

Without --write, the command previews changes only.
`;

const textFileExtensions = new Set([
  ".css",
  ".graphql",
  ".html",
  ".json",
  ".md",
  ".mjs",
  ".rs",
  ".sql",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yml",
  ".yaml"
]);

const parseArgs = (): CliOptions => {
  const options: CliOptions = { write: false, check: false };
  const args = process.argv.slice(2);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      console.log(usage);
      process.exit(0);
    }
    if (arg === "--write") {
      options.write = true;
      continue;
    }
    if (arg === "--check") {
      options.check = true;
      continue;
    }
    if (arg === "--config") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("--config requires a file path");
      }
      options.configPath = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
};

const promptString = async (
  message: string,
  initialValue?: string,
  placeholder?: string
): Promise<string> => {
  const result = await text({
    message,
    ...(initialValue ? { initialValue } : {}),
    ...(placeholder ? { placeholder } : {}),
    validate(value) {
      if (!value.trim()) {
        return "Value is required.";
      }
      return undefined;
    }
  });

  if (isCancel(result)) {
    cancel("Cancelled.");
    process.exit(0);
  }

  return result;
};

const defaultDesktopIdentifier = (productName: string): string => {
  const slug = slugify(productName);
  const parts = slug.split("-").filter(Boolean);
  return `com.${parts.join(".")}.desktop`;
};

const promptConfig = async (): Promise<TemplateAdoptionConfig> => {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Interactive adoption requires a TTY. Use --config for non-interactive runs.");
  }

  intro(chalk.cyan("Template adoption"));
  const productName = await promptString("Product name", undefined, "Acme Ops");
  const initial = deriveTemplateAdoptionConfig({
    productName,
    desktopIdentifier: defaultDesktopIdentifier(productName)
  });

  const packageName = await promptString("Root package name", initial.packageName);
  const repoSlug = await promptString("Repository slug", initial.repoSlug);
  const desktopIdentifier = await promptString(
    "Desktop reverse-DNS identifier",
    initial.desktopIdentifier
  );
  const compatibilityPolicy = await promptString(
    "Compatibility and versioning policy",
    initial.compatibilityPolicy
  );
  const designCompatibilityPolicy = await promptString(
    "Design compatibility policy",
    initial.designCompatibilityPolicy
  );

  return deriveTemplateAdoptionConfig({
    productName,
    packageName,
    repoSlug,
    desktopIdentifier,
    compatibilityPolicy,
    designCompatibilityPolicy
  });
};

const readConfig = (configPath: string): TemplateAdoptionConfig => {
  const absolutePath = isAbsolute(configPath) ? configPath : join(REPO_ROOT, configPath);
  const parsed = JSON.parse(readFileSync(absolutePath, "utf8")) as unknown;
  return parseTemplateAdoptionConfig(parsed);
};

const readAdoptionTargetFiles = (): Map<string, string> => {
  const files = new Map<string, string>();
  for (const path of adoptionTargets) {
    const absolutePath = join(REPO_ROOT, path);
    if (!existsSync(absolutePath)) {
      continue;
    }
    files.set(path, readFileSync(absolutePath, "utf8"));
  }
  return files;
};

const fileExtension = (path: string): string => {
  const match = path.match(/(\.[^./]+)$/);
  return match?.[1] ?? "";
};

const isTextFile = (path: string): boolean =>
  path === ".env.example" ||
  path === "Dockerfile.api" ||
  path === "Dockerfile.web" ||
  textFileExtensions.has(fileExtension(path));

const collectRepoTextFiles = (dir = REPO_ROOT): Map<string, string> => {
  const files = new Map<string, string>();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolutePath = join(dir, entry.name);
    const relativePath = relative(REPO_ROOT, absolutePath).replace(/\\/g, "/");

    if (excludedFromTemplateAdoption(relativePath)) {
      continue;
    }
    if (entry.isDirectory()) {
      collectRepoTextFiles(absolutePath).forEach((content, path) => files.set(path, content));
      continue;
    }
    if (!entry.isFile() || !isTextFile(relativePath) || statSync(absolutePath).size > 500_000) {
      continue;
    }
    files.set(relativePath, readFileSync(absolutePath, "utf8"));
  }
  return files;
};

const writeChangedFiles = (changedFiles: string[], files: ReadonlyMap<string, string>): void => {
  for (const path of changedFiles) {
    const absolutePath = join(REPO_ROOT, path);
    const content = files.get(path);
    if (content === undefined) {
      continue;
    }
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content);
  }
};

const printConfig = (config: TemplateAdoptionConfig): void => {
  const printable: TemplateAdoptionInput = {
    productName: config.productName,
    packageName: config.packageName,
    repoSlug: config.repoSlug,
    dockerImagePrefix: config.dockerImagePrefix,
    s3Bucket: config.s3Bucket,
    webTitle: config.webTitle,
    mobileName: config.mobileName,
    mobileSlug: config.mobileSlug,
    mobileScheme: config.mobileScheme,
    desktopProductName: config.desktopProductName,
    desktopWindowTitle: config.desktopWindowTitle,
    desktopIdentifier: config.desktopIdentifier,
    compatibilityPolicy: config.compatibilityPolicy,
    designCompatibilityPolicy: config.designCompatibilityPolicy
  };

  console.log(chalk.bold("Resolved config"));
  console.log(JSON.stringify(printable, null, 2));
  console.log();
};

const runCheck = (): void => {
  const references = activeTemplateReferences(collectRepoTextFiles());
  if (references.length === 0) {
    console.log(chalk.green("No active Kaine Forge template identity references found."));
    return;
  }

  console.error(chalk.red("Active Kaine Forge template identity remains:"));
  for (const reference of references.slice(0, 80)) {
    console.error(`  ${reference.path}:${reference.line} ${chalk.gray(`(${reference.match})`)}`);
  }
  if (references.length > 80) {
    console.error(`  ...and ${references.length - 80} more`);
  }
  process.exitCode = 1;
};

const main = async (): Promise<void> => {
  const options = parseArgs();
  if (options.check) {
    runCheck();
    return;
  }

  const config = options.configPath ? readConfig(options.configPath) : await promptConfig();
  const files = readAdoptionTargetFiles();
  const result = applyTemplateAdoption(files, config);
  const changedPaths = result.changedFiles.map((file) => file.path);

  printConfig(config);
  console.log(chalk.bold(options.write ? "Applying changes" : "Preview changes"));
  if (result.changedFiles.length === 0) {
    console.log("  No allowlisted files need changes.");
  } else {
    for (const file of result.changedFiles) {
      console.log(`  ${file.path} ${chalk.gray(`(${file.replacements} replacements)`)}`);
    }
  }

  if (options.write) {
    writeChangedFiles(changedPaths, result.files);
    console.log();
    outro(
      chalk.green(`Updated ${changedPaths.length} file(s). Run pnpm ai:install after adoption.`)
    );
  } else {
    console.log();
    outro(chalk.gray("Dry run only. Re-run with --write to apply these changes."));
  }
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(chalk.red(message));
  process.exit(1);
});
