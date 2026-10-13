import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import console from "node:console";
import { clearInterval, setInterval } from "node:timers";

import { claudeLoginChanged, seedCredentials, syncBack } from "./desk-auth.mjs";
import { proxyAvailable, proxyEnvironment, startBridge } from "./desk-bridge.mjs";

// Entry point of the agent container.
//   agent <provider> -- <argv...>   run the provider CLI with its login copied in
//   login <provider>                interactive login into the auth volume (a TTY)
//   auth-sync <provider>            copy a refreshed token back to the auth volume
// The auth volume is mounted read-only for `agent`. The CLI works on a copy in
// the per-issue state volume, so a run can refresh its token and keep sessions.

const [mode, provider, ...rest] = process.argv.slice(2);
if (!["claude", "codex"].includes(provider ?? "")) throw new Error("Unsupported provider");

const configDirFor = (root) => `${root}/${provider}`;
const configVariable = provider === "claude" ? "CLAUDE_CONFIG_DIR" : "CODEX_HOME";

if (mode === "auth-sync") {
  const synced = syncBack(provider, configDirFor("/state"), "/auth");
  console.log(JSON.stringify({ synced }));
  process.exit(0);
}

const baseEnvironment = {
  ...process.env,
  DISABLE_AUTOUPDATER: "1",
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1"
};

if (mode === "login") {
  // `claude /login` shows the manual code entry; `claude auth login` only waits for a
  // loopback browser callback that cannot reach this container.
  const bridge = proxyAvailable() ? await startBridge() : null;
  const env = {
    ...baseEnvironment,
    ...(bridge ? proxyEnvironment() : {}),
    [configVariable]: "/auth"
  };
  const credential = "/auth/.credentials.json";
  const before = existsSync(credential) ? readFileSync(credential, "utf8") : "";
  if (provider === "claude") {
    writeFileSync(
      "/auth/.claude.json",
      JSON.stringify({
        hasCompletedOnboarding: true,
        theme: "dark",
        projects: { "/workspace": { hasTrustDialogAccepted: true } }
      })
    );
  }
  const args =
    provider === "codex"
      ? ["login", "--device-auth"]
      : [
          "/login",
          "--tools",
          "",
          "--permission-mode",
          "dontAsk",
          "--setting-sources",
          "",
          "--strict-mcp-config",
          "--mcp-config",
          '{"mcpServers":{}}'
        ];
  const child = spawn(provider, args, { env, stdio: "inherit" });
  let authenticated = false;
  const poll =
    provider === "claude"
      ? setInterval(() => {
          if (claudeLoginChanged(credential, before)) {
            authenticated = true;
            child.kill("SIGTERM");
          }
        }, 500)
      : null;
  const code = await new Promise((resolve) => child.once("close", resolve));
  if (poll) clearInterval(poll);
  bridge?.close();
  process.exit(authenticated ? 0 : (code ?? 1));
}

if (mode !== "agent" || rest[0] !== "--" || rest.length < 2) {
  throw new Error("Usage: desk-entry.mjs agent <provider> -- <argv...>");
}
const [program, ...args] = rest.slice(1);

const configDir = configDirFor("/state");
mkdirSync(configDir, { recursive: true, mode: 0o700 });
seedCredentials(provider, "/auth", configDir);
if (provider === "claude" && !existsSync(`${configDir}/.claude.json`)) {
  writeFileSync(
    `${configDir}/.claude.json`,
    JSON.stringify({
      hasCompletedOnboarding: true,
      theme: "dark",
      projects: { "/workspace": { hasTrustDialogAccepted: true } }
    })
  );
}

const bridge = proxyAvailable() ? await startBridge() : null;
const env = {
  ...baseEnvironment,
  ...(bridge ? proxyEnvironment() : {}),
  [configVariable]: configDir
};
const child = spawn(program, args, { env, stdio: ["ignore", "inherit", "inherit"] });
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
child.once("error", (error) => {
  console.error(`cannot start ${program}: ${error.message}`);
  process.exit(127);
});
const [code, signal] = await new Promise((resolve) =>
  child.once("close", (exitCode, exitSignal) => resolve([exitCode, exitSignal]))
);
bridge?.close();
process.exit(code ?? (signal ? 143 : 1));
