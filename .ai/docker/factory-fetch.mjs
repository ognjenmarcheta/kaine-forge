import { spawn } from "node:child_process";
import net from "node:net";
import { networkInterfaces } from "node:os";
import process from "node:process";

if (
  Object.values(networkInterfaces())
    .flat()
    .some((item) => item && !item.internal)
)
  throw new Error("Dependency fetch must not have a network interface");
const bridge = net.createServer((client) => {
  const upstream = net.connect("/socket/provider.sock");
  upstream.on("error", () => client.destroy());
  client.on("error", () => upstream.destroy());
  client.on("close", () => upstream.destroy());
  client.pipe(upstream).pipe(client);
});
await new Promise((resolve) => bridge.listen(8080, "127.0.0.1", resolve));
const proxy = "http://127.0.0.1:8080";
const child = spawn(
  "pnpm",
  [
    "fetch",
    "--ignore-scripts",
    "--ignore-pnpmfile",
    "--store-dir",
    "/workspace/store",
    "--fetch-retries=0"
  ],
  {
    env: {
      ...process.env,
      HTTPS_PROXY: proxy,
      HTTP_PROXY: proxy,
      ALL_PROXY: proxy,
      https_proxy: proxy,
      http_proxy: proxy,
      all_proxy: proxy,
      NO_PROXY: "",
      no_proxy: ""
    },
    stdio: "inherit"
  }
);
child.once("error", () => process.exit(1));
const code = await new Promise((resolve) => child.once("close", resolve));
process.exit(code ?? 1);
