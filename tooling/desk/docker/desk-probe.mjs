import dns from "node:dns/promises";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import process from "node:process";
import console from "node:console";
import { setTimeout } from "node:timers";

// Isolation probes. They run inside a throwaway container from the real image,
// started with the same flags as an agent container. Each probe reports ok or a
// short detail. The host decides what it means. The probes read no secret value.
//
// Usage: node desk-probe.mjs '<json>'
//   { hostPaths: string[], proxy: { allowed: string[], denied: string[] } | null }
const options = JSON.parse(process.argv[2] ?? "{}");
const results = [];
const record = (id, ok, detail) => results.push({ id, ok, detail });

const attempt = async (action) => {
  try {
    await action();
    return null;
  } catch (error) {
    return error instanceof Error ? error : new Error("failed");
  }
};

const interfaces = Object.entries(os.networkInterfaces()).filter(([, list]) =>
  (list ?? []).some((item) => !item.internal)
);
record(
  "network-interfaces",
  interfaces.length === 0,
  interfaces.length === 0
    ? "only the loopback interface exists"
    : `external interfaces: ${interfaces.map(([name]) => name).join(", ")}`
);

const resolveError = await attempt(async () => {
  await Promise.race([
    dns.resolve4("example.com"),
    new Promise((_resolve, reject) => setTimeout(() => reject(new Error("timeout")), 3000))
  ]);
});
const connectError = await new Promise((resolve) => {
  const socket = net.connect({ host: "1.1.1.1", port: 443 });
  socket.setTimeout(3000, () => {
    socket.destroy();
    resolve(new Error("timeout"));
  });
  socket.once("connect", () => {
    socket.destroy();
    resolve(null);
  });
  socket.once("error", (error) => resolve(error));
});
record(
  "no-egress",
  resolveError !== null && connectError !== null,
  resolveError !== null && connectError !== null
    ? "DNS and a direct TCP connection both fail"
    : "the container reached the internet"
);

const FORBIDDEN_ENV =
  /^(GH_|GITHUB_|GITLAB_|AWS_|AZURE_|GOOGLE_|GCP_|GCLOUD_|NPM_TOKEN|NODE_AUTH_TOKEN|SSH_|DOCKER_|ANTHROPIC_|OPENAI_|CLAUDE_CODE_OAUTH|CODEX_API|DATABASE_URL|BETTER_AUTH)/i;
const offending = Object.keys(process.env).filter((name) => FORBIDDEN_ENV.test(name));
record(
  "no-credentials-in-env",
  offending.length === 0,
  offending.length === 0
    ? "no provider, GitHub, or cloud variable"
    : `found: ${offending.join(", ")}`
);

const sockets = ["/var/run/docker.sock", "/run/docker.sock", "/docker.sock"].filter((file) =>
  fs.existsSync(file)
);
record(
  "no-docker-socket",
  sockets.length === 0,
  sockets.length === 0 ? "no Docker socket in the container" : `found: ${sockets.join(", ")}`
);

const rootWrite = await attempt(() => fs.writeFileSync("/opt/desk/probe-write", "x"));
const etcWrite = await attempt(() => fs.writeFileSync("/etc/desk-probe", "x"));
const tmpWrite = await attempt(() => fs.writeFileSync("/tmp/desk-probe", "x"));
record(
  "root-filesystem-read-only",
  rootWrite !== null && etcWrite !== null && tmpWrite === null,
  rootWrite !== null && etcWrite !== null
    ? `writes outside the tmpfs fail (${rootWrite.code ?? "error"}); /tmp is writable: ${tmpWrite === null}`
    : "the root filesystem is writable"
);

const uid = process.getuid?.() ?? -1;
const gid = process.getgid?.() ?? -1;
record("non-root", uid > 0 && gid > 0, `uid ${uid}, gid ${gid}`);

const status = fs.readFileSync("/proc/self/status", "utf8");
const field = (name) => status.match(new RegExp(`^${name}:\\s*([0-9a-f]+)`, "m"))?.[1] ?? "?";
const zero = (value) => /^0+$/.test(value);
const caps = { eff: field("CapEff"), prm: field("CapPrm"), bnd: field("CapBnd") };
record(
  "capabilities-empty",
  zero(caps.eff) && zero(caps.prm) && zero(caps.bnd),
  `effective ${caps.eff}, permitted ${caps.prm}, bounding ${caps.bnd}`
);
record("no-new-privileges", field("NoNewPrivs") === "1", `NoNewPrivs ${field("NoNewPrivs")}`);

const hostVisible = (options.hostPaths ?? []).filter((target) => fs.existsSync(target));
record(
  "host-paths-invisible",
  hostVisible.length === 0,
  hostVisible.length === 0
    ? `${(options.hostPaths ?? []).length} host path(s) do not exist in the container`
    : `visible: ${hostVisible.join(", ")}`
);

const readLimit = (file) => {
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    return null;
  }
};
const memory =
  readLimit("/sys/fs/cgroup/memory.max") ??
  readLimit("/sys/fs/cgroup/memory/memory.limit_in_bytes");
const pids = readLimit("/sys/fs/cgroup/pids.max") ?? readLimit("/sys/fs/cgroup/pids/pids.max");
const cpu = readLimit("/sys/fs/cgroup/cpu.max");
const limited = (value) => value !== null && value !== "max" && !value.startsWith("max ");
record(
  "resource-limits",
  limited(memory) && limited(pids) && limited(cpu),
  `memory ${memory ?? "?"}, pids ${pids ?? "?"}, cpu ${cpu ?? "?"}`
);

const SOCKET = "/socket/provider.sock";
const proxyStatus = (authority) =>
  new Promise((resolve) => {
    const client = net.connect(SOCKET, () =>
      client.write(`CONNECT ${authority}:443 HTTP/1.1\r\nHost: ${authority}:443\r\n\r\n`)
    );
    client.setTimeout(8000, () => {
      client.destroy();
      resolve("timeout");
    });
    client.once("error", () => resolve("error"));
    client.once("data", (data) => {
      resolve(data.toString().split("\r\n")[0] ?? "");
      client.destroy();
    });
  });
if (options.proxy) {
  const denied = [];
  for (const host of options.proxy.denied ?? []) {
    const line = await proxyStatus(host);
    if (!line.includes(" 403")) denied.push(`${host}: ${line}`);
  }
  const refused = [];
  for (const host of options.proxy.allowed ?? []) {
    const line = await proxyStatus(host);
    if (!line.includes(" 200")) refused.push(`${host}: ${line}`);
  }
  record(
    "proxy-allowlist",
    denied.length === 0 && refused.length === 0,
    denied.length === 0 && refused.length === 0
      ? `${(options.proxy.denied ?? []).length} denied host(s) get 403, ${(options.proxy.allowed ?? []).length} allowed host(s) get 200`
      : `unexpected: ${[...denied, ...refused].join("; ")}`
  );
}

const ok = results.every((entry) => entry.ok);
console.log(JSON.stringify({ ok, checks: results }));
process.exit(ok ? 0 : 2);
