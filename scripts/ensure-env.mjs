#!/usr/bin/env node
/* global console, process */
// Creates .env from .env.example when missing so bootstrap commands that load
// environment through dotenv (for example drizzle.config.ts) work on a fresh clone.

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(repoRoot, ".env");
const examplePath = join(repoRoot, ".env.example");

if (existsSync(envPath)) {
  console.log("[env:ensure] .env already exists; leaving it untouched.");
} else if (!existsSync(examplePath)) {
  console.error("[env:ensure] .env.example not found; cannot create .env.");
  process.exit(1);
} else {
  const example = readFileSync(examplePath, "utf8");
  // Generate a strong per-clone secret so a fresh .env never ships the shared
  // placeholder that would otherwise sign every developer's auth sessions.
  const secret = randomBytes(32).toString("base64url");
  const contents = example.replace(/^BETTER_AUTH_SECRET=.*$/m, `BETTER_AUTH_SECRET=${secret}`);
  writeFileSync(envPath, contents);
  console.log(
    contents === example
      ? "[env:ensure] Created .env from .env.example (no BETTER_AUTH_SECRET line found to replace)."
      : "[env:ensure] Created .env from .env.example with a generated BETTER_AUTH_SECRET."
  );
}
