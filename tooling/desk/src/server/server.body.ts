import type { IncomingMessage } from "node:http";

import { HttpError } from "./server.errors";

export const DEFAULT_MAX_BODY_BYTES = 64 * 1024;

const isJsonContentType = (value: string | undefined): boolean => {
  if (value === undefined) return false;
  const [type, ...params] = value.split(";").map((part) => part.trim().toLowerCase());
  if (type !== "application/json") return false;
  return params.every((param) => param === "charset=utf-8");
};

/**
 * Read a JSON request body. It needs `Content-Type: application/json`, counts
 * bytes as they arrive, and stops keeping data at `maxBytes`. The rest of an
 * oversized body is read and dropped, so the client can finish its upload and
 * read the 413 answer. The result is `unknown`: the caller narrows it with a
 * Zod schema.
 */
export const readJsonBody = async (
  request: IncomingMessage,
  maxBytes: number
): Promise<unknown> => {
  if (!isJsonContentType(request.headers["content-type"])) {
    request.resume();
    throw new HttpError("unsupported-media-type", "Send application/json");
  }
  const declared = Number(request.headers["content-length"]);
  if (Number.isFinite(declared) && declared > maxBytes) {
    request.resume();
    throw new HttpError("payload-too-large");
  }

  const body = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let failed = false;
    request.on("data", (chunk: Buffer) => {
      if (failed) return;
      total += chunk.length;
      if (total > maxBytes) {
        failed = true;
        chunks.length = 0;
        reject(new HttpError("payload-too-large"));
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (!failed) resolve(Buffer.concat(chunks));
    });
    request.on("error", reject);
  });
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    throw new HttpError("bad-request", "Body is not valid JSON");
  }
};
