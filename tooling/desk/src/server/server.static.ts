import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

import { HttpError } from "./server.errors";

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8"
};

export const contentTypeFor = (file: string): string =>
  CONTENT_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";

export interface StaticHandler {
  /** Serve the file for `pathname`. Throws `HttpError` when there is none. */
  readonly serve: (
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string
  ) => Promise<void>;
}

const isFile = async (file: string): Promise<boolean> => {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
};

const within = (root: string, file: string): boolean =>
  file === root || file.startsWith(`${root}${path.sep}`);

/**
 * Static files of a built UI. Only files under `uiDir` are served, symbolic
 * links included only when they stay inside it. A directory is never listed.
 * A path without a file extension that is not a file gets `index.html`, so a
 * single-page app can route on its own; a missing asset (`/assets/x.js`) is a 404.
 */
export const createStaticHandler = (uiDir: string): StaticHandler => {
  const root = path.resolve(uiDir);
  let realRoot: string | null = null;

  const rootReal = async (): Promise<string> => {
    realRoot ??= await realpath(root);
    return realRoot;
  };

  const resolveFile = async (pathname: string): Promise<string | null> => {
    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      throw new HttpError("bad-request", "Malformed path");
    }
    if (decoded.includes("\0") || decoded.includes("\\")) {
      throw new HttpError("bad-request", "Malformed path");
    }
    const segments = decoded.split("/").filter((segment) => segment !== "");
    if (segments.some((segment) => segment === ".." || segment === ".")) {
      throw new HttpError("not-found");
    }
    const candidate = path.join(root, ...segments);
    if (!within(root, candidate) || !(await isFile(candidate))) return null;
    // A link may point out of the tree. Compare the real locations.
    const real = await realpath(candidate);
    return within(await rootReal(), real) ? real : null;
  };

  return {
    serve: async (request, response, pathname) => {
      if (request.method !== "GET" && request.method !== "HEAD") {
        throw new HttpError("method-not-allowed");
      }
      let file: string | null;
      try {
        file = await resolveFile(pathname);
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError("not-found");
      }
      if (file === null) {
        const looksLikeAsset = path.extname(pathname) !== "";
        const index = looksLikeAsset ? null : await resolveFile("/index.html").catch(() => null);
        if (index === null) throw new HttpError("not-found");
        file = index;
      }
      const info = await stat(file);
      response.writeHead(200, {
        "Content-Type": contentTypeFor(file),
        "Content-Length": info.size
      });
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      await new Promise<void>((resolve) => {
        const stream = createReadStream(file);
        stream.on("error", () => {
          response.destroy();
          resolve();
        });
        response.on("close", () => {
          stream.destroy();
          resolve();
        });
        stream.on("end", resolve);
        stream.pipe(response);
      });
    }
  };
};
