import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { safeFile, type FactoryResult } from "./factory.util";

export function git(root: string, args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    timeout: args[0] === "push" ? 1800000 : 60000,
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

export function safeDestination(root: string, relative: string): string {
  safeFile(relative);
  const base = path.resolve(root);
  let current = base;
  for (const segment of relative.split("/")) {
    current = path.join(current, segment);
    if (lstatSync(current, { throwIfNoEntry: false })?.isSymbolicLink())
      throw new Error(`Symlink in change path: ${relative}`);
  }
  if (!current.startsWith(`${base}${path.sep}`)) throw new Error("Path escapes checkout");
  return current;
}

export function applyFiles(root: string, result: FactoryResult): void {
  for (const file of result.files) safeDestination(root, file.path);
  for (const file of result.files) {
    const target = safeDestination(root, file.path);
    if (existsSync(target) && !lstatSync(target).isFile())
      throw new Error("Changes must target regular files");
    if (file.content === null) rmSync(target);
    else {
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, file.content, "utf8");
    }
  }
}

export function repositoryContext(root: string, revision: string, scope: string[]) {
  const tree = git(root, ["ls-tree", "-r", "--name-only", revision]).split("\n");
  const required = [
    "MONOREPO_GUIDE.md",
    "CONTEXT.md",
    "REVIEW.md",
    "DESIGN_SYSTEM.md",
    "package.json"
  ];
  const files = tree.filter(
    (file) =>
      required.includes(file) ||
      scope.some((prefix) => file === prefix || file.startsWith(`${prefix.replace(/\/$/, "")}/`))
  );
  const content: { path: string; content: string }[] = [];
  let size = 0;
  for (const file of files) {
    if (
      !/\.(?:md|[cm]?[jt]sx?|json|ya?ml|graphql|css|sql)$/.test(file) ||
      file === "pnpm-lock.yaml"
    )
      continue;
    const text = git(root, ["show", `${revision}:${file}`]);
    size += Buffer.byteLength(text);
    if (size > 1400000)
      throw new Error("Approved context exceeds 1.4 MiB; split the issue or narrow its scope");
    content.push({ path: file, content: text });
  }
  return { tree, files: content };
}

export function changedContent(root: string, revision: string, files: string[]) {
  return files.map((file) => {
    safeFile(file);
    const entry = git(root, ["ls-tree", revision, "--", file]);
    if (entry && !/^100(?:644|755) blob /.test(entry))
      throw new Error("Candidate contains a non-regular file");
    return { path: file, content: entry ? git(root, ["show", `${revision}:${file}`]) : null };
  });
}

export function candidateBundle(root: string): string {
  const dir = path.join(root, ".ai.local");
  const file = path.join(dir, "factory.bundle");
  if (
    lstatSync(dir).isSymbolicLink() ||
    lstatSync(file).isSymbolicLink() ||
    !lstatSync(file).isFile()
  )
    throw new Error("Unsafe candidate bundle");
  if (
    !readFileSync(file).subarray(0, 16).toString().startsWith("# v2 git bundle") &&
    !readFileSync(file).subarray(0, 16).toString().startsWith("# v3 git bundle")
  )
    throw new Error("Invalid candidate bundle");
  return file;
}
