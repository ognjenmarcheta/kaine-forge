import process from "node:process";
import { fileURLToPath } from "node:url";
import http from "node:http";
import net from "node:net";
import { chmodSync, existsSync, unlinkSync } from "node:fs";

// TLS remains end-to-end. Dependency fetches cannot reach subscription services.
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

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const mode = process.argv[2] ?? "providers";
  if (!["providers", "dependencies"].includes(mode)) throw new Error("Unknown proxy policy");
  const socketPath = "/socket/provider.sock";
  if (existsSync(socketPath)) unlinkSync(socketPath);
  const server = http.createServer((_request, response) => response.writeHead(403).end());
  server.on("connect", (request, client, head) => {
    const [host] = (request.url ?? "").split(":");
    if (!allowedProxyTarget(request.url, mode)) {
      client.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    const upstream = net.connect({ host, port: 443 });
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
  server.listen(socketPath, () => chmodSync(socketPath, 0o666));
}
