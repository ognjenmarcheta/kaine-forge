import { eventSchema, type FactoryEvent } from "@repo/factory-ui/contracts";
import { createHash, randomUUID } from "node:crypto";
import {
  appendFileSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync
} from "node:fs";
import path from "node:path";
import { stripVTControlCharacters } from "node:util";
import { z } from "zod";

import type { FactoryStore } from "./factory-store";
import { factoryRunSchema } from "./factory.util";

/** Diagnostic data crosses an untrusted boundary before reaching the browser. */
export function redact(text: string): string {
  return stripVTControlCharacters(text)
    .replace(/(Bearer\s+)[^\s"']+/gi, "$1[redacted]")
    .replace(
      /((?:token|password|secret|api[_-]?key|authorization|cookie)[\w-]*["']?\s*[:=]\s*["']?)[^\s,"';}]+/gi,
      "$1[redacted]"
    )
    .replace(
      /\b(?:sk-[\w-]+|gh[pousr]_[\w]+|github_pat_[\w]+|eyJ[\w-]+\.[\w-]+\.[\w-]+)\b/g,
      "[redacted]"
    )
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g, "$1[redacted]@")
    .replace(/(https?:\/\/[^\s?#]+)[?#][^\s]+/g, "$1[redacted]");
}

export function progress(
  store: FactoryStore,
  id: string,
  phase: FactoryEvent["phase"],
  state: FactoryEvent["state"],
  detail = "",
  artifactId?: string
): void {
  const event = eventSchema.parse({
    version: 1,
    at: new Date().toISOString(),
    phase,
    state,
    detail: redact(detail),
    ...(artifactId ? { artifactId } : {})
  });
  appendFileSync(
    store.file(`${z.string().uuid().parse(id)}.events.jsonl`),
    `${JSON.stringify(event)}\n`,
    { mode: 0o600 }
  );
}

export function events(
  store: FactoryStore,
  id: string
): { events: FactoryEvent[]; warnings: string[] } {
  const file = store.file(`${z.string().uuid().parse(id)}.events.jsonl`);
  const result: FactoryEvent[] = [];
  const warnings: string[] = [];
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split("\n").filter(Boolean)) {
      try {
        result.push(eventSchema.parse(JSON.parse(line)));
      } catch {
        warnings.push("Invalid progress event; history is incomplete");
      }
    }
  }
  return { events: result, warnings: [...new Set(warnings)] };
}

const registrationSchema = z.object({ id: z.string().uuid(), path: z.string(), name: z.string() });
export function registeredArtifacts(store: FactoryStore, id: string) {
  const file = store.file(`${z.string().uuid().parse(id)}.artifacts.json`);
  if (existsSync(file))
    return z.array(registrationSchema).parse(JSON.parse(readFileSync(file, "utf8")));
  const runFile = store.file(`${id}.json`);
  if (!existsSync(runFile)) return [];
  const run = factoryRunSchema.parse(JSON.parse(readFileSync(runFile, "utf8")));
  // Stable virtual registrations expose legacy check logs without rewriting run records.
  return run.validation
    .filter(
      (check) =>
        check.artifact.startsWith(`${id}.check-`) &&
        /^[a-f0-9-]{36}\.check-\d+\.log$/.test(check.artifact)
    )
    .map((check) => {
      const hash = createHash("sha256").update(`${id}:${check.artifact}`).digest("hex");
      return {
        id: `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`,
        path: `runs/${check.artifact}`,
        name: check.artifact
      };
    });
}

/** The trusted host anchor may resolve through symlinks; every child must be ordinary. */
export function containedFile(root: string, relative: string, anchor: string): string {
  if (
    !relative ||
    path.isAbsolute(relative) ||
    relative.includes(":") ||
    relative.includes("\\") ||
    relative.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error("Unsafe artifact path");
  const below = path.relative(path.resolve(anchor), path.resolve(root));
  if (path.isAbsolute(below) || below.split(path.sep).includes(".."))
    throw new Error("Artifact root outside trusted anchor");
  let base = realpathSync(anchor);
  for (const part of below.split(path.sep).filter(Boolean)) {
    base = path.join(base, part);
    if (lstatSync(base).isSymbolicLink()) throw new Error("Symlink artifact root");
  }
  let target = base;
  for (const part of relative.split("/")) {
    target = path.join(target, part);
    if (lstatSync(target).isSymbolicLink()) throw new Error("Symlink artifact");
  }
  if (
    !realpathSync(target).startsWith(`${realpathSync(base)}${path.sep}`) ||
    !statSync(target).isFile()
  )
    throw new Error("Artifact outside evidence root");
  return target;
}

export function openArtifact(
  root: string,
  relative: string,
  anchor: string
): { descriptor: number; size: number } {
  const file = containedFile(root, relative, anchor);
  const before = statSync(file);
  const descriptor = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(descriptor);
    // Recheck the path after opening. A changed parent or target must not redirect a read.
    const after = statSync(containedFile(root, relative, anchor));
    if (
      opened.dev !== before.dev ||
      opened.ino !== before.ino ||
      opened.dev !== after.dev ||
      opened.ino !== after.ino
    )
      throw new Error("Artifact changed during access");
    return { descriptor, size: opened.size };
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
}

export function registerArtifact(store: FactoryStore, id: string, file: string): string {
  const relative = path.relative(path.dirname(store.directory), file).split(path.sep).join("/");
  containedFile(path.dirname(store.directory), relative, store.anchor);
  const registered = registeredArtifacts(store, id);
  const existing = registered.find((entry) => entry.path === relative);
  if (existing) return existing.id;
  const artifact = { id: randomUUID(), path: relative, name: path.basename(file) };
  registered.push(artifact);
  store.write(`${id}.artifacts.json`, registered);
  return artifact.id;
}

export function registerEvidence(store: FactoryStore, id: string, directory: string): void {
  if (!existsSync(directory) || lstatSync(directory).isSymbolicLink()) return;
  let count = 0;
  function visit(folder: string, depth: number): void {
    if (depth > 12 || count >= 500) return;
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || count >= 500) continue;
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) visit(file, depth + 1);
      else if (entry.isFile() && /\.(png|jpe?g|webm|mp4|zip|html|log|txt)$/i.test(entry.name)) {
        registerArtifact(store, id, file);
        count++;
      }
    }
  }
  visit(directory, 0);
}
