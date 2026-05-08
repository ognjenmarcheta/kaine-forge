import { spawn, type ChildProcess } from "node:child_process";
import { networkInterfaces, type NetworkInterfaceInfo } from "node:os";
import { pathToFileURL } from "node:url";

type NetworkInterfaceMap = NodeJS.Dict<NetworkInterfaceInfo[]>;

interface MobileLanDevConfigInput {
  apiPort?: number | undefined;
  lanIp: string;
}

export interface MobileLanDevConfig {
  apiHost: string;
  apiPort: number;
  apiUrl: string;
  graphqlUrl: string;
}

export function selectLanIpv4Address(interfaces: NetworkInterfaceMap): string | null {
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        return entry.address;
      }
    }
  }

  return null;
}

export function buildMobileLanDevConfig(input: MobileLanDevConfigInput): MobileLanDevConfig {
  const apiPort = input.apiPort ?? 4000;
  const apiUrl = `http://${input.lanIp}:${String(apiPort)}`;

  return {
    apiHost: "0.0.0.0",
    apiPort,
    apiUrl,
    graphqlUrl: `${apiUrl}/graphql`
  };
}

function spawnDevProcess(name: string, args: string[], env: NodeJS.ProcessEnv): ChildProcess {
  const child = spawn("pnpm", args, {
    env,
    shell: process.platform === "win32",
    stdio: "inherit"
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      console.log(`${name} exited from ${signal}`);
      return;
    }

    if (code !== null && code !== 0) {
      console.error(`${name} exited with code ${String(code)}`);
      process.exitCode = code;
    }
  });

  return child;
}

function stopChildren(children: ChildProcess[]): void {
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
}

export function runMobileLanDev(): void {
  const lanIp = process.env.MOBILE_LAN_IP ?? selectLanIpv4Address(networkInterfaces());

  if (!lanIp) {
    throw new Error("No LAN IPv4 address found. Set MOBILE_LAN_IP to your laptop IP address.");
  }

  const config = buildMobileLanDevConfig({
    apiPort: Number(process.env.API_PORT ?? 4000),
    lanIp
  });
  const env = {
    ...process.env,
    API_HOST: config.apiHost,
    API_PORT: String(config.apiPort),
    API_URL: config.apiUrl,
    BETTER_AUTH_URL: config.apiUrl,
    EXPO_PUBLIC_API_URL: config.apiUrl,
    EXPO_PUBLIC_GRAPHQL_URL: config.graphqlUrl
  };

  console.log(`API LAN URL: ${config.apiUrl}`);
  console.log(`GraphQL LAN URL: ${config.graphqlUrl}`);
  console.log("Open the API URL from your phone browser before testing login.");

  const children = [
    spawnDevProcess("api", ["--filter", "@repo/api", "dev"], env),
    spawnDevProcess("mobile", ["--filter", "@repo/mobile", "start", "--", "--clear"], env)
  ];

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      stopChildren(children);
      process.exit(0);
    });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMobileLanDev();
}
