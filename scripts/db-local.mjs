import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

import { runLocalDatabase } from "./db-local.util.mjs";
import { pnpmInvocation } from "./pnpm.util.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const envPath = fileURLToPath(new URL("../.env", import.meta.url));

try {
  // Matches dotenv's precedence: explicit process variables win over .env.
  if (existsSync(envPath)) process.loadEnvFile(envPath);
  runLocalDatabase(process.argv.slice(2), process.env, (script, databaseUrl) => {
    const invocation = pnpmInvocation(["--filter", "@repo/db", "run", script]);
    const result = spawnSync(invocation.command, invocation.args, {
      cwd: repoRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "inherit"
    });
    if (result.error || result.status !== 0) {
      throw new Error(`${script} failed; local database preparation stopped.`);
    }
  });
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Local database command failed."}\n`
  );
  process.exitCode = 1;
}
