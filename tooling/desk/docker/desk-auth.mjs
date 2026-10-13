import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// Credential files of each provider CLI. The auth volume keeps one copy per
// provider. A run copies it into its own state folder and the CLI refreshes
// the copy there. `syncBack` returns a refreshed token to the auth volume.
export const SEED_FILES = {
  claude: [".credentials.json", ".claude.json"],
  codex: ["auth.json"]
};
export const REFRESHABLE_FILES = {
  claude: [".credentials.json"],
  codex: ["auth.json"]
};

export function validCredentials(provider, text) {
  try {
    const value = JSON.parse(text);
    if (provider === "claude") {
      return (
        typeof value?.claudeAiOauth?.accessToken === "string" &&
        value.claudeAiOauth.accessToken !== ""
      );
    }
    if (provider === "codex")
      return typeof value === "object" && value !== null && !Array.isArray(value);
  } catch {
    /* Not JSON: not a credential file. */
  }
  return false;
}

export function claudeLoginChanged(file, before) {
  try {
    const saved = readFileSync(file, "utf8");
    if (saved === before) return false;
    return validCredentials("claude", saved);
  } catch {
    // The CLI can replace or partially write credentials during a refresh.
    return false;
  }
}

/** Copy the seed files that exist from `fromDir` to `toDir`. Returns the names copied. */
export function seedCredentials(provider, fromDir, toDir) {
  const copied = [];
  mkdirSync(toDir, { recursive: true });
  for (const name of SEED_FILES[provider] ?? []) {
    const source = path.join(fromDir, name);
    if (!existsSync(source)) continue;
    copyFileSync(source, path.join(toDir, name));
    copied.push(name);
  }
  return copied;
}

/**
 * Copy a refreshed credential file from a run back to the auth volume. It copies
 * only a file that is valid JSON of the right shape and newer than the stored one,
 * so an agent that writes garbage cannot damage the login.
 */
export function syncBack(provider, runDir, authDir) {
  const synced = [];
  for (const name of REFRESHABLE_FILES[provider] ?? []) {
    const source = path.join(runDir, name);
    const target = path.join(authDir, name);
    if (!existsSync(source)) continue;
    const text = readFileSync(source, "utf8");
    if (!validCredentials(provider, text)) continue;
    if (existsSync(target) && readFileSync(target, "utf8") === text) continue;
    if (existsSync(target) && statSync(target).mtimeMs > statSync(source).mtimeMs) continue;
    copyFileSync(source, target);
    synced.push(name);
  }
  return synced;
}
