import { existsSync } from "node:fs";
import net from "node:net";

// A container has no network interface. The proxy container listens on a unix
// socket in a shared volume. This bridge turns that socket into a loopback TCP
// port, because the provider CLIs and pnpm only speak to an HTTP proxy by TCP.
export const PROXY_SOCKET = "/socket/provider.sock";
export const PROXY_URL = "http://127.0.0.1:8080";

export function proxyAvailable(socketPath = PROXY_SOCKET) {
  return existsSync(socketPath);
}

export async function startBridge(socketPath = PROXY_SOCKET, port = 8080) {
  const bridge = net.createServer((client) => {
    const upstream = net.connect(socketPath);
    upstream.on("error", () => client.destroy());
    client.on("error", () => upstream.destroy());
    client.on("close", () => upstream.destroy());
    client.pipe(upstream).pipe(client);
  });
  await new Promise((resolve) => bridge.listen(port, "127.0.0.1", resolve));
  return bridge;
}

export function proxyEnvironment() {
  return {
    HTTPS_PROXY: PROXY_URL,
    HTTP_PROXY: PROXY_URL,
    ALL_PROXY: PROXY_URL,
    https_proxy: PROXY_URL,
    http_proxy: PROXY_URL,
    all_proxy: PROXY_URL,
    NO_PROXY: "",
    no_proxy: ""
  };
}
