import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import console from "node:console";
import { clearInterval, setInterval } from "node:timers";

import { claudeLoginChanged, seedCredentials, syncBack, validCredentials } from "./desk-auth.mjs";
import { proxyAvailable, proxyEnvironment, startBridge } from "./desk-bridge.mjs";

// Entry point of the agent container.
//   agent <provider> -- <argv...>   run the provider CLI with its login copied in
//   login <provider>                interactive login into the auth volume (a TTY)
//   auth-sync <provider>            copy a refreshed token back to the auth volume
// The auth volume is mounted read-only for `agent`. The CLI works on a copy in
// the per-issue state volume, so a run can refresh its token and keep sessions.

const [mode, provider, ...rest] = process.argv.slice(2);
if (!["claude", "codex", "opencode"].includes(provider ?? "")) {
  throw new Error("Unsupported provider");
}

const configDirFor = (root) => `${root}/${provider}`;

// Where the CLI keeps its login and state. OpenCode follows the XDG folders.
const configEnvironment = (dir) => {
  if (provider === "claude") return { CLAUDE_CONFIG_DIR: dir };
  if (provider === "codex") return { CODEX_HOME: dir };
  return {
    XDG_DATA_HOME: `${dir}/data`,
    XDG_CONFIG_HOME: `${dir}/config`,
    XDG_STATE_HOME: `${dir}/state`,
    XDG_CACHE_HOME: `${dir}/cache`,
    OPENCODE_DISABLE_AUTOUPDATE: "1",
    OPENCODE_DISABLE_MODELS_FETCH: "1"
  };
};

// OpenCode's login lives in a database. The auth volume keeps `opencode auth export`.
const opencodeCredentials = (dir) => `${dir}/credentials.json`;
const opencodeAuth = (env, args, options = {}) =>
  spawnSync("opencode", ["auth", ...args, "--standalone"], {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    ...options
  });
const exportOpencodeLogin = (env, file) => {
  const result = opencodeAuth(env, ["export"]);
  if (result.status !== 0 || !validCredentials("opencode", result.stdout)) return false;
  writeFileSync(file, result.stdout, { mode: 0o600 });
  return true;
};

if (mode === "auth-sync") {
  const configDir = configDirFor("/state");
  if (provider === "opencode") {
    exportOpencodeLogin(
      { ...process.env, ...configEnvironment(configDir) },
      opencodeCredentials(configDir)
    );
  }
  const synced = syncBack(provider, configDir, "/auth");
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
  // OpenCode logs in to a scratch database, then the login is exported to the auth volume.
  const loginDir = provider === "opencode" ? "/tmp/opencode-login" : "/auth";
  const env = {
    ...baseEnvironment,
    ...(bridge ? proxyEnvironment() : {}),
    ...configEnvironment(loginDir)
  };
  if (provider === "opencode") {
    const login = spawnSync("opencode", ["auth", "login", "--standalone"], {
      env,
      stdio: "inherit"
    });
    const saved = login.status === 0 && exportOpencodeLogin(env, opencodeCredentials("/auth"));
    bridge?.close();
    if (!saved) console.error("OpenCode stored no login.");
    process.exit(saved ? 0 : 1);
  }
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
  ...configEnvironment(configDir)
};
if (provider === "opencode") {
  const credentials = opencodeCredentials(configDir);
  // A forwarded API key needs no login, so a missing file is not an error.
  if (existsSync(credentials) && validCredentials("opencode", readFileSync(credentials, "utf8"))) {
    const imported = opencodeAuth(env, ["import", credentials]);
    if (imported.status !== 0) console.error("OpenCode could not import the stored login.");
  }
}
// The runner writes the prompt to stdin (`docker run --interactive`). Without that flag stdin is closed.
const child = spawn(program, args, { env, stdio: "inherit" });
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
