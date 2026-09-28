import http from "node:http";
import net from "node:net";
import { chmodSync, existsSync, unlinkSync } from "node:fs";

// TLS remains end-to-end. Only the subscription providers can be reached.
const hosts = new Set([
  "chatgpt.com",
  "api.openai.com",
  "auth.openai.com",
  "auth0.openai.com",
  "api.anthropic.com",
  "claude.ai",
  "platform.claude.com",
  "console.anthropic.com"
]);
const socketPath = "/socket/provider.sock";
if (existsSync(socketPath)) unlinkSync(socketPath);
const server = http.createServer((_request, response) => response.writeHead(403).end());
server.on("connect", (request, client, head) => {
  const [host, port, extra] = (request.url ?? "").split(":");
  if (!hosts.has(host) || port !== "443" || extra) {
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
