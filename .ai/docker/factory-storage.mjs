import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import process from "node:process";
import { Buffer } from "node:buffer";
import console from "node:console";

const root = "/workspace";
const limit = 64 * 1024 * 1024;
function safe(relative) {
  if (
    typeof relative !== "string" ||
    !relative ||
    relative.includes("\\") ||
    relative.includes(":")
  )
    throw new Error("Invalid transfer path");
  const parts = relative.split("/");
  if (
    parts.some(
      (part) =>
        !part ||
        part === "." ||
        part === ".." ||
        part.toLowerCase() === ".git" ||
        /[. ]$/.test(part) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)
    )
  )
    throw new Error("Unsafe transfer path");
  let target = root;
  for (const part of parts) {
    target = path.join(target, part);
    if (fs.lstatSync(target, { throwIfNoEntry: false })?.isSymbolicLink())
      throw new Error("Symlink transfer path");
  }
  return target;
}
function git(args) {
  return execFileSync("git", ["-C", root, ...args], { maxBuffer: limit, encoding: "utf8" });
}
let inputBytes = 0;
const chunks = [];
for await (const chunk of process.stdin) {
  inputBytes += chunk.length;
  if (inputBytes > 96 * 1024 * 1024) throw new Error("Transfer input too large");
  chunks.push(chunk);
}
const input = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
switch (process.argv[2]) {
  case "init":
    if (input.bundle) {
      execFileSync("git", ["clone", "--no-hardlinks", "/input/source.bundle", root]);
      git(["checkout", "-B", "candidate", input.revision]);
      git(["remote", "remove", "origin"]);
    }
    fs.mkdirSync(path.join(root, ".ai.local"), { recursive: true });
    fs.mkdirSync(path.join(root, "evidence"), { recursive: true });
    break;
  case "apply":
    if (!Array.isArray(input.files) || input.files.length > 100) throw new Error("Invalid files");
    for (const file of input.files) {
      const target = safe(file.path);
      if (file.content === null) fs.rmSync(target, { force: true });
      else {
        if (typeof file.content !== "string" || Buffer.byteLength(file.content) > limit)
          throw new Error("Invalid content");
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, file.content);
      }
    }
    break;
  case "read": {
    const target = safe(input.path);
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.size > limit) throw new Error("Invalid export file");
    console.log(JSON.stringify({ content: fs.readFileSync(target).toString("base64") }));
    break;
  }
  case "evidence": {
    const files = [];
    let bytes = 0;
    const warnings = new Set();
    const recovery = "evidence/recovery.patch";
    if (fs.existsSync(path.join(root, ".git"))) {
      const untracked = git(["ls-files", "--others", "--exclude-standard", "-z"])
        .split("\0")
        .filter(Boolean)
        .filter(
          (name) =>
            !name
              .split("/")
              .some((part) =>
                [
                  "evidence",
                  "node_modules",
                  ".ai.local",
                  ".cache",
                  ".turbo",
                  ".pnpm-store",
                  "dist",
                  "build",
                  "coverage",
                  "test-results",
                  "playwright-report"
                ].includes(part)
              )
        );
      for (const name of untracked) {
        const stat = fs.lstatSync(safe(name));
        if (!stat.isFile() || stat.size > limit) throw new Error("Invalid recovery source file");
        git(["--literal-pathspecs", "add", "--intent-to-add", "--", name]);
      }
      const patch = git([
        "diff",
        "--binary",
        "HEAD",
        "--",
        ".",
        ":(exclude)evidence",
        ":(exclude).ai.local"
      ]);
      bytes = Buffer.byteLength(patch);
      if (bytes > limit) throw new Error("Recovery patch too large");
      fs.mkdirSync(safe("evidence"), { recursive: true });
      fs.writeFileSync(safe(recovery), patch);
      files.push(recovery);
    }
    function visit(relative, depth = 0) {
      const target = safe(relative);
      if (!fs.existsSync(target)) return;
      if (depth > 12) {
        warnings.add("Optional evidence truncated: depth limit exceeded");
        return;
      }
      for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
        const name = `${relative}/${entry.name}`;
        if (entry.isSymbolicLink()) throw new Error("Symlink evidence");
        if (entry.isDirectory()) visit(name, depth + 1);
        else if (entry.isFile() && /\.(png|jpe?g|webm|mp4|zip|html|log|txt)$/i.test(name)) {
          const size = fs.statSync(safe(name)).size;
          if (files.length >= 500) {
            warnings.add("Optional evidence truncated: file count limit exceeded");
            continue;
          }
          if (size > limit || bytes + size > 256 * 1024 * 1024) {
            warnings.add("Optional evidence truncated: byte limit exceeded");
            continue;
          }
          bytes += size;
          files.push(name);
        }
      }
    }
    for (const directory of ["evidence", "apps/e2e/test-results", "apps/e2e/playwright-report"])
      visit(directory);
    console.log(JSON.stringify({ files, warnings: [...warnings] }));
    break;
  }
  default:
    throw new Error("Unknown storage operation");
}
