import process from "node:process";
import { fileURLToPath } from "node:url";
import http from "node:http";
import net from "node:net";
import { chmodSync, existsSync, unlinkSync } from "node:fs";

// Copied from the software factory proxy (.ai/docker/factory-proxy.mjs).
// TLS stays end to end: the proxy only tunnels a CONNECT to an allowlisted
// host on port 443. Dependency fetches cannot reach a provider, and provider
// runs cannot reach the npm registry.
const providerHosts = new Set([
  "chatgpt.com",
  "api.openai.com",
  "auth.openai.com",
  "auth0.openai.com",
  "api.anthropic.com",
  "claude.ai",
  "platform.claude.com",
  "console.anthropic.com"
]);

export function allowedProxyTarget(authority, mode) {
  const [host, port, extra] = (authority ?? "").split(":");
  const allowed =
    mode === "dependencies"
      ? host === "registry.npmjs.org"
      : mode === "providers" && providerHosts.has(host);
  return allowed && port === "443" && extra === undefined;
}

/**
 * A CONNECT-only proxy server. `isAllowed(authority)` decides, and `connect(host)`
 * opens the upstream socket. Tests pass their own two functions; the real
 * entry point below passes the policy above and a plain TCP connect.
 */
export function createProxyServer({ isAllowed, connect }) {
  const server = http.createServer((_request, response) => response.writeHead(403).end());
  server.on("connect", (request, client, head) => {
    const [host] = (request.url ?? "").split(":");
    if (!isAllowed(request.url)) {
      client.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    const upstream = connect(host);
    upstream.setTimeout(120000, () => upstream.destroy());
    client.setTimeout(120000, () => client.destroy());
    upstream.once("connect", () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.on("error", () => client.destroy());
    client.on("error", () => upstream.destroy());
    client.on("close", () => upstream.destroy());
  });
  return server;
}

export function listenOnSocket(server, socketPath) {
  if (existsSync(socketPath)) unlinkSync(socketPath);
  server.listen(socketPath, () => chmodSync(socketPath, 0o666));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const mode = process.argv[2] ?? "providers";
  if (!["providers", "dependencies"].includes(mode)) throw new Error("Unknown proxy policy");
  listenOnSocket(
    createProxyServer({
      isAllowed: (authority) => allowedProxyTarget(authority, mode),
      connect: (host) => net.connect({ host, port: 443 })
    }),
    "/socket/provider.sock"
  );
}
