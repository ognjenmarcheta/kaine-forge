import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import net from "node:net";
import process from "node:process";
import console from "node:console";
import { setInterval, clearInterval } from "node:timers";

import {
  parseProviderOutput,
  providerFailure,
  providerErrorMessage,
  claudeLoginChanged
} from "./factory-provider.mjs";

mkdirSync("/tmp/home/.codex", { recursive: true });
mkdirSync("/tmp/home/.claude", { recursive: true });
mkdirSync("/tmp/work", { recursive: true });
const bridge = net.createServer((client) => {
  const upstream = net.connect("/socket/provider.sock");
  upstream.on("error", () => client.destroy());
  client.on("error", () => upstream.destroy());
  client.on("close", () => upstream.destroy());
  client.pipe(upstream).pipe(client);
});
await new Promise((resolve) => bridge.listen(8080, "127.0.0.1", resolve));
const env = {
  ...process.env,
  HTTPS_PROXY: "http://127.0.0.1:8080",
  HTTP_PROXY: "http://127.0.0.1:8080",
  ALL_PROXY: "http://127.0.0.1:8080",
  NO_PROXY: "",
  DISABLE_AUTOUPDATER: "1",
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1"
};
const provider = process.argv[2];
const operation = process.argv[3];
if (!["codex", "claude"].includes(provider)) throw new Error("Unsupported provider");
// Dedicated provider state persists refresh-token rotation, including cancellation.
// Settings are ignored and sessions are ephemeral; this is never a host directory.
if (provider === "codex") env.CODEX_HOME = "/auth";
else env.CLAUDE_CONFIG_DIR = "/auth";

if (operation === "probe") {
  const interfaces = Object.values((await import("node:os")).networkInterfaces()).flat();
  if (interfaces.some((item) => item && !item.internal))
    throw new Error("Worker has a network interface");
  if (
    existsSync("/var/run/docker.sock") ||
    process.env.GH_TOKEN ||
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY
  )
    throw new Error("Unexpected credential or Docker socket");
  let denied = false;
  try {
    writeFileSync("/opt/factory/probe", "forbidden");
  } catch {
    denied = true;
  }
  if (!denied) throw new Error("Worker policy is writable");
  const connectStatus = (host) =>
    new Promise((resolve, reject) => {
      const socket = net.connect(8080, "127.0.0.1", () =>
        socket.write(`CONNECT ${host}:443 HTTP/1.1\r\nHost: ${host}:443\r\n\r\n`)
      );
      socket.setTimeout(10000, () => socket.destroy(new Error("Proxy probe timed out")));
      socket.once("error", reject);
      socket.once("data", (data) => {
        resolve(data.toString().split("\r\n")[0]);
        socket.destroy();
      });
    });
  if (!(await connectStatus("example.com")).includes("403"))
    throw new Error("Proxy permits unrelated destinations");
  if (
    !(await connectStatus(provider === "codex" ? "chatgpt.com" : "api.anthropic.com")).includes(
      "200"
    )
  )
    throw new Error("Provider destination unreachable");
  const status = provider === "codex" ? ["login", "status"] : ["auth", "status"];
  const authentication = spawn(provider, status, { env, stdio: ["ignore", "pipe", "pipe"] });
  authentication.stdout.resume();
  authentication.stderr.resume();
  const code = await new Promise((resolve) => authentication.once("close", resolve));
  console.log(
    JSON.stringify({
      isolation: true,
      authenticated: code === 0,
      version: execFileSync(provider, ["--version"], { encoding: "utf8" }).trim()
    })
  );
  bridge.close();
  process.exit(code === 0 ? 0 : 2);
}

if (operation === "login") {
  // The interactive /login flow exposes manual code entry; `auth login` only
  // waits for a loopback browser callback that cannot reach this container.
  const credential = "/auth/.credentials.json";
  const before = existsSync(credential) ? readFileSync(credential, "utf8") : "";
  if (provider === "claude")
    writeFileSync(
      "/auth/.claude.json",
      JSON.stringify({
        hasCompletedOnboarding: true,
        theme: "dark",
        projects: { "/tmp/work": { hasTrustDialogAccepted: true } }
      })
    );
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
  process.exit(authenticated ? 0 : (code ?? 1));
}

let input = "";
for await (const chunk of process.stdin) {
  input += chunk;
  if (input.length > 2 * 1024 * 1024) throw new Error("Context exceeds 2 MiB");
}
const { model, schema, prompt } = JSON.parse(input);
writeFileSync("/tmp/result-schema.json", JSON.stringify(schema));
const config = [
  'approval_policy="never"',
  'sandbox_mode="read-only"',
  'web_search="disabled"',
  'model_reasoning_effort="high"',
  "mcp_servers={}",
  ...[
    "shell_tool",
    "unified_exec",
    "shell_snapshot",
    "hooks",
    "apps",
    "plugins",
    "browser_use",
    "browser_use_external",
    "in_app_browser",
    "computer_use",
    "multi_agent",
    "multi_agent_v2",
    "memories",
    "skill_mcp_dependency_install"
  ].map((feature) => `features.${feature}=false`)
];
const args =
  provider === "codex"
    ? [
        "exec",
        "--ignore-user-config",
        "--strict-config",
        "--skip-git-repo-check",
        "--ephemeral",
        "--model",
        model,
        ...config.flatMap((setting) => ["-c", setting]),
        "--json",
        "--output-schema",
        "/tmp/result-schema.json",
        "--output-last-message",
        "/tmp/result.json",
        "-"
      ]
    : [
        "-p",
        "--model",
        model,
        "--effort",
        "high",
        "--settings",
        JSON.stringify({ availableModels: [model] }),
        "--tools",
        "",
        "--permission-mode",
        "dontAsk",
        "--setting-sources",
        "",
        "--strict-mcp-config",
        "--mcp-config",
        '{"mcpServers":{}}',
        "--no-session-persistence",
        "--no-chrome",
        "--output-format",
        "json",
        "--json-schema",
        JSON.stringify(schema)
      ];
const child = spawn(provider, args, { cwd: "/tmp/work", env, stdio: ["pipe", "pipe", "pipe"] });
let output = "";
let diagnostics = "";
child.stdout.on("data", (chunk) => {
  output += chunk;
  if (output.length > 8 * 1024 * 1024) child.kill();
});
child.stderr.on("data", (chunk) => {
  if (diagnostics.length < 20000) diagnostics += chunk;
});
child.stdin.end(prompt);
const code = await new Promise((resolve) => child.once("close", resolve));
if (code !== 0) {
  console.log(
    JSON.stringify({
      error: providerFailure(output + diagnostics),
      message: providerErrorMessage(output, diagnostics),
      version: execFileSync(provider, ["--version"], { encoding: "utf8" }).trim(),
      code
    })
  );
  process.exit(1);
}
const { result, usage } = parseProviderOutput(
  provider,
  output,
  provider === "codex" ? readFileSync("/tmp/result.json", "utf8") : null
);
console.log(
  JSON.stringify({
    result,
    version: execFileSync(provider, ["--version"], { encoding: "utf8" }).trim(),
    usage
  })
);
bridge.close();
process.exit(0);
