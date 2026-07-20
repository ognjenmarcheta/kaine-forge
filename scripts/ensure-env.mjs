#!/usr/bin/env node
/* global console, process */
// Creates .env from .env.example when missing so bootstrap commands that load
// environment through dotenv (for example drizzle.config.ts) work on a fresh clone.

import { copyFileSync, existsSync } from "node:fs";
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
  copyFileSync(examplePath, envPath);
  console.log("[env:ensure] Created .env from .env.example.");
}
