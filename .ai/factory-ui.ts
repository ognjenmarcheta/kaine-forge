import { actionRequestSchema } from "@repo/factory-ui/contracts";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  createReadStream,
  existsSync,
  readSync,
  closeSync,
  readFileSync,
  mkdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { z } from "zod";

import { REPO_ROOT } from "./ai.util";
import {
  discoverCheckouts,
  checkoutId,
  commonDirectory,
  resolveCheckout
} from "./factory-checkouts";
import { containedFile, openArtifact, redact, registeredArtifacts } from "./factory-progress";
import { FactoryStore } from "./factory-store";
import { DashboardActions } from "./factory-ui-actions";
import { alive, artifactKind, historyQuerySchema, readHistory, runDetail } from "./factory-ui-data";
import { dashboardState, type DashboardTarget } from "./factory-ui-state";
import { factoryConfigSchema } from "./factory.util";
import { pnpmInvocation } from "../scripts/pnpm.util.mjs";

async function body(request: IncomingMessage): Promise<z.infer<ReturnType<typeof z.json>>> {
  if (request.headers["content-type"] !== "application/json") throw new Error("JSON required");
  let data = "";
  for await (const chunk of request) {
    data += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    if (data.length > 8192) throw new Error("Request too large");
  }
  return z.json().parse(JSON.parse(data));
}
function json<T>(response: ServerResponse, value: T, status = 200): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}
function equal(left: string, right: string): boolean {
  return (
    Buffer.byteLength(left) === Buffer.byteLength(right) &&
    timingSafeEqual(Buffer.from(left), Buffer.from(right))
  );
}

export async function createDashboard(root: string, port = 0) {
  const managers = new Map<string, { store: FactoryStore; actions: DashboardActions }>();
  function targets(): DashboardTarget[] {
    const discovered = discoverCheckouts(root)
      .filter((worktree) => worktree.available)
      .map((worktree) => {
        const file = path.join(worktree.path, ".ai.local/factory/config.json");
        try {
          return {
            worktree,
            config: factoryConfigSchema.parse(JSON.parse(readFileSync(file, "utf8")))
          };
        } catch {
          return { worktree, config: null };
        }
      });
    const fallback = discovered.find((entry) => entry.config)?.config;
    if (!fallback) return [];
    return discovered.flatMap(({ worktree, config }) => {
      if (!config && !existsSync(path.join(worktree.path, ".ai.local/factory/runs"))) return [];
      let manager = managers.get(worktree.id);
      if (!manager) {
        const store = new FactoryStore(path.join(worktree.path, ".ai.local/factory/runs"));
        manager = { store, actions: new DashboardActions(store, worktree.path) };
        managers.set(worktree.id, manager);
      }
      return [
        {
          ...manager,
          worktree: { ...worktree, configured: !!config },
          config: config ?? { ...fallback, enabled: false, watch: false }
        }
      ];
    });
  }
  const token = randomBytes(32).toString("hex");
  const session = randomBytes(32).toString("hex");
  const cookieName = `factory_session_${randomBytes(8).toString("hex")}`;
  let exchanged = false;
  let origin = "";
  const server = createServer((request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; media-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
    );
    void (async () => {
      if (
        request.headers.host !== new URL(origin).host ||
        (request.headers.origin && request.headers.origin !== origin) ||
        request.headers["sec-fetch-site"] === "cross-site"
      )
        return json(response, { error: "Local same-origin access required" }, 403);
      const url = new URL(request.url ?? "/", origin);
      if (url.pathname === "/api/session" && request.method === "POST") {
        if (request.headers.origin !== origin)
          return json(response, { error: "Origin required" }, 403);
        const input = z
          .object({ token: z.string() })
          .strict()
          .parse(await body(request));
        if (exchanged || !equal(input.token, token))
          return json(response, { error: "Open the launch URL from the terminal" }, 403);
        exchanged = true;
        response.setHeader(
          "Set-Cookie",
          `${cookieName}=${session}; HttpOnly; SameSite=Strict; Path=/`
        );
        return json(response, { ok: true });
      }
      if (url.pathname.startsWith("/api/")) {
        const cookie =
          request.headers.cookie
            ?.split(";")
            .map((item) => item.trim())
            .find((item) => item.startsWith(`${cookieName}=`))
            ?.slice(cookieName.length + 1) ?? "";
        if (!equal(cookie, session))
          return json(response, { error: "Open the launch URL from the terminal" }, 401);
        const worktreeMatch = url.pathname.match(/^\/api\/worktrees\/([a-f0-9]{24})\//);
        const targetId = worktreeMatch?.[1] ?? url.searchParams.get("worktree") ?? checkoutId(root);
        const target = targets().find((entry) => entry.worktree.id === targetId);
        if (request.method === "POST") {
          if (request.headers.origin !== origin)
            return json(response, { error: "Origin required" }, 403);
          if (url.pathname !== "/api/actions")
            return json(response, { error: "Unknown action" }, 404);
          const input = actionRequestSchema.parse(await body(request));
          const owner = targets().find((entry) => entry.worktree.id === input.worktreeId);
          if (!owner?.worktree.configured)
            return json(response, { error: "Select an available configured worktree" }, 400);
          resolveCheckout(root, owner.worktree.id);
          const receipts = path.join(commonDirectory(root), "kaine-factory");
          mkdirSync(receipts, { recursive: true });
          const receipt = path.join(receipts, `action-${input.key}.json`);
          if (existsSync(receipt)) {
            const previous = actionRequestSchema.parse(JSON.parse(readFileSync(receipt, "utf8")));
            if (JSON.stringify(previous) !== JSON.stringify(input))
              throw new Error("Action key already used for another request");
            const existing = owner.actions.list().find((action) => action.id === input.key);
            if (!existing)
              throw new Error("Action was interrupted before dispatch; use a new action key");
            return json(response, existing, 202);
          }
          writeFileSync(receipt, JSON.stringify(input), { flag: "wx", mode: 0o600 });
          return json(response, owner.actions.start(input), 202);
        }
        if (request.method !== "GET") return json(response, { error: "Method not permitted" }, 405);
        if (url.pathname === "/api/state") {
          const query = historyQuerySchema.parse(Object.fromEntries(url.searchParams));
          return json(
            response,
            dashboardState(
              targets(),
              discoverCheckouts(root),
              url.searchParams.get("worktree"),
              query
            )
          );
        }
        if (!target) return json(response, { error: "Worktree unavailable" }, 404);
        const { store } = target;
        const local = path.join(target.worktree.path, ".ai.local/factory");
        const route = worktreeMatch
          ? url.pathname.replace(worktreeMatch[0], "/api/")
          : url.pathname;
        const runMatch = route.match(/^\/api\/runs\/([a-f0-9-]{36})$/);
        if (runMatch) {
          const run = readHistory(store).runs.find((entry) => entry.id === runMatch[1]);
          return run
            ? json(response, {
                ...runDetail(store, run),
                worktreeId: target.worktree.id,
                worktree: `${target.worktree.branch} · ${target.worktree.path}`
              })
            : json(response, { error: "Run unavailable" }, 404);
        }
        const artifactMatch = route.match(/^\/api\/artifacts\/([a-f0-9-]{36})\/([a-f0-9-]{36})$/);
        if (artifactMatch?.[1]) {
          const entry = registeredArtifacts(store, artifactMatch[1]).find(
            (item) => item.id === artifactMatch[2]
          );
          if (!entry) return json(response, { error: "Artifact not registered" }, 404);
          const file = containedFile(local, entry.path);
          const opened = openArtifact(local, entry.path);
          const kind = artifactKind(entry.name);
          if (kind === "log") {
            const size = opened.size;
            const buffer = Buffer.alloc(Math.min(size, 32768));
            const descriptor = opened.descriptor;
            try {
              readSync(descriptor, buffer, 0, buffer.length, Math.max(0, size - buffer.length));
            } finally {
              closeSync(descriptor);
            }
            return json(response, {
              text: redact(
                size > buffer.length
                  ? buffer
                      .subarray(buffer.indexOf(10) >= 0 ? buffer.indexOf(10) + 1 : buffer.length)
                      .toString()
                  : buffer.toString()
              ),
              truncated: size > buffer.length
            });
          }
          const type = /\.png$/i.test(file)
            ? "image/png"
            : /\.jpe?g$/i.test(file)
              ? "image/jpeg"
              : /\.webm$/i.test(file)
                ? "video/webm"
                : /\.mp4$/i.test(file)
                  ? "video/mp4"
                  : "application/octet-stream";
          response.setHeader("Content-Type", type);
          if (kind === "download")
            response.setHeader(
              "Content-Disposition",
              `attachment; filename="${entry.name.replace(/[^a-zA-Z0-9._-]/g, "_")}"`
            );
          createReadStream(file, { fd: opened.descriptor, autoClose: true })
            .on("error", () => response.destroy())
            .pipe(response);
          return;
        }
        return json(response, { error: "Unknown endpoint" }, 404);
      }
      if (request.method !== "GET") return json(response, { error: "Method not permitted" }, 405);
      const relative =
        url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
      const assets = path.join(root, "tooling/factory-ui/dist");
      const file = containedFile(assets, relative);
      response.setHeader(
        "Content-Type",
        file.endsWith(".html")
          ? "text/html; charset=utf-8"
          : file.endsWith(".js")
            ? "application/javascript"
            : file.endsWith(".css")
              ? "text/css"
              : "application/octet-stream"
      );
      createReadStream(file)
        .on("error", () => response.destroy())
        .pipe(response);
    })().catch((error: unknown) => {
      if (!response.headersSent)
        json(
          response,
          { error: redact(error instanceof Error ? error.message : "Request failed") },
          400
        );
      else response.destroy();
    });
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Loopback listener unavailable");
  origin = `http://127.0.0.1:${address.port}`;
  let refreshing = false;
  function refresh(): void {
    if (refreshing) return;
    refreshing = true;
    try {
      for (const target of targets()) {
        if (!target.worktree.configured) continue;
        if (
          !target.actions
            .list()
            .some((item) => item.state === "running" && item.request.kind === "refresh")
        )
          target.actions.start({
            key: randomUUID(),
            kind: "refresh",
            worktreeId: target.worktree.id
          });
      }
    } finally {
      refreshing = false;
    }
  }
  const timer = setInterval(refresh, 60000);
  return {
    url: `${origin}/#session=${token}`,
    refresh,
    async close() {
      clearInterval(timer);
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      const stopped = await Promise.allSettled(
        [...managers.values()].map((manager) => manager.actions.stop())
      );
      if (stopped.some((result) => result.status === "rejected"))
        throw new Error("Dashboard cleanup remains unverified");
    }
  };
}

export async function launchDashboard(port: number, open: boolean): Promise<void> {
  const build = pnpmInvocation(["exec", "turbo", "run", "build", "--filter=@repo/factory-ui"]);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(build.command, build.args, {
      cwd: REPO_ROOT,
      windowsHide: true,
      stdio: "inherit"
    });
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0 ? resolve() : reject(new Error("Dashboard build failed"))
    );
  });
  const coordination = path.join(commonDirectory(REPO_ROOT), "kaine-factory");
  mkdirSync(coordination, { recursive: true });
  const lock = path.join(coordination, "ui.lock");
  if (existsSync(lock)) {
    const previous = z.object({ pid: z.number() }).parse(JSON.parse(readFileSync(lock, "utf8")));
    if (alive(previous.pid)) throw new Error("Dashboard already running for this repository");
    rmSync(lock);
  }
  writeFileSync(lock, JSON.stringify({ pid: process.pid }), { flag: "wx", mode: 0o600 });
  try {
    const dashboard = await createDashboard(REPO_ROOT, port);
    console.log(`Factory dashboard: ${dashboard.url}`);
    dashboard.refresh();
    if (open) {
      const args =
        process.platform === "win32"
          ? ["url.dll,FileProtocolHandler", dashboard.url]
          : [dashboard.url];
      const command =
        process.platform === "win32"
          ? "rundll32"
          : process.platform === "darwin"
            ? "open"
            : "xdg-open";
      spawn(command, args, { windowsHide: true, stdio: "ignore" }).on("error", () =>
        console.log("Open the launch URL in your browser")
      );
    }
    await new Promise<void>((resolve) => {
      const stop = () => {
        process.removeListener("SIGINT", stop);
        process.removeListener("SIGTERM", stop);
        resolve();
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    });
    await dashboard.close();
  } finally {
    rmSync(lock, { force: true });
  }
}
