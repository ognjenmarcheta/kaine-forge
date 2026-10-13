import assert from "node:assert/strict";
import net from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { allowedProxyTarget, createProxyServer, listenOnSocket } from "./desk-proxy.mjs";

test("dependency proxy permits only the exact HTTPS npm registry destination", () => {
  assert.equal(allowedProxyTarget("registry.npmjs.org:443", "dependencies"), true);
  for (const target of [
    "example.com:443",
    "registry.npmjs.org.attacker.test:443",
    "attacker.test:443",
    "registry.npmjs.org:80",
    "registry.npmjs.org:443:",
    "user@registry.npmjs.org:443",
    "registry.npmjs.org",
    "127.0.0.1:443",
    "169.254.169.254:443",
    "[::1]:443",
    "chatgpt.com:443",
    "api.anthropic.com:443",
    "https://registry.npmjs.org:443",
    null
  ])
    assert.equal(allowedProxyTarget(target, "dependencies"), false, String(target));
});

test("provider and dependency policies stay separate and an unknown mode denies everything", () => {
  assert.equal(allowedProxyTarget("chatgpt.com:443", "providers"), true);
  assert.equal(allowedProxyTarget("api.anthropic.com:443", "providers"), true);
  assert.equal(allowedProxyTarget("registry.npmjs.org:443", "providers"), false);
  assert.equal(allowedProxyTarget("github.com:443", "providers"), false);
  assert.equal(allowedProxyTarget("registry.npmjs.org:443", "unknown"), false);
  assert.equal(allowedProxyTarget("api.anthropic.com:443", undefined), false);
});

const connectThrough = (socketPath, authority) =>
  new Promise((resolve, reject) => {
    const client = net.connect(socketPath, () =>
      client.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`)
    );
    client.setTimeout(5000, () => client.destroy(new Error("timeout")));
    client.once("error", reject);
    client.once("data", (data) => {
      resolve(data.toString().split("\r\n")[0]);
      client.destroy();
    });
  });

test("the server answers 403 to a denied host and never opens an upstream socket", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "desk-proxy-"));
  const socketPath = path.join(dir, "p.sock");
  const opened = [];
  const server = createProxyServer({
    isAllowed: (authority) => authority === "allowed.test:443",
    connect: (host) => {
      opened.push(host);
      // A local echo stands in for the upstream.
      return net.connect(echoPort, "127.0.0.1");
    }
  });
  const echo = net.createServer((socket) => socket.pipe(socket));
  let echoPort = 0;
  await new Promise((resolve) => echo.listen(0, "127.0.0.1", resolve));
  echoPort = echo.address().port;
  listenOnSocket(server, socketPath);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    assert.match(await connectThrough(socketPath, "example.com:443"), /403/);
    assert.deepEqual(opened, []);
    assert.match(await connectThrough(socketPath, "allowed.test:443"), /200/);
    assert.deepEqual(opened, ["allowed.test"]);
  } finally {
    server.close();
    echo.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
