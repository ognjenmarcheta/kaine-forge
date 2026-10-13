import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import { DESK_REQUEST_HEADER, DESK_REQUEST_HEADER_VALUE } from "../contracts";
import { HttpError } from "./server.errors";

/**
 * Security model of the desk server, ported from the factory dashboard
 * (ADR 0010): a loopback listener, an HttpOnly SameSite=Strict cookie, Host and
 * Origin checks, a custom header on every write, and strict response headers.
 * The built UI issues a session on direct local navigation; the one-use token
 * serves the separate Vite development origin. The server has no login.
 */

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'"
].join("; ");

/** Headers on every response, including errors and the event stream. */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Resource-Policy": "same-origin"
};

export const applySecurityHeaders = (response: ServerResponse): void => {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.setHeader(name, value);
};

/** Compare secrets without leaking their length or the first differing byte. */
export const constantTimeEqual = (left: string, right: string): boolean =>
  timingSafeEqual(
    createHash("sha256").update(left).digest(),
    createHash("sha256").update(right).digest()
  );

export interface SecurityOptions {
  readonly port: number;
}

export interface Security {
  /** `http://127.0.0.1:<port>`. The page and the API live here. */
  readonly origin: string;
  /** Throws `HttpError` for a request that is not same-origin, local, or well formed. */
  readonly checkRequest: (request: IncomingMessage) => void;
  /** Throws unless the request carries the session cookie. */
  readonly requireSession: (request: IncomingMessage) => void;
  /** Trade the one-use token for the cookie value. Throws `forbidden` after the first success. */
  readonly exchange: (token: string) => string;
  /** Issue a browser session when the local UI entry page is opened directly. */
  readonly issueSession: () => string;
  readonly launchToken: string;
  readonly cookieName: string;
}

const hostsFor = (port: number): readonly string[] => [`127.0.0.1:${port}`, `localhost:${port}`];

const single = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export const createSecurity = (options: SecurityOptions): Security => {
  const launchToken = randomBytes(32).toString("hex");
  const session = randomBytes(32).toString("hex");
  const cookieName = `desk_session_${randomBytes(8).toString("hex")}`;
  const hosts = hostsFor(options.port);
  const origins = new Set(hosts.map((host) => `http://${host}`));
  let exchanged = false;

  const cookieOf = (request: IncomingMessage): string => {
    const header = single(request.headers.cookie) ?? "";
    for (const part of header.split(";")) {
      const item = part.trim();
      if (item.startsWith(`${cookieName}=`)) return item.slice(cookieName.length + 1);
    }
    return "";
  };

  return {
    origin: `http://127.0.0.1:${options.port}`,
    launchToken,
    cookieName,
    checkRequest: (request) => {
      // A DNS-rebinding page reaches this socket with its own Host. Refuse that first.
      const host = single(request.headers.host);
      if (host === undefined || !hosts.includes(host)) {
        throw new HttpError("forbidden", "Host is not allowed");
      }
      const origin = single(request.headers.origin);
      if (origin !== undefined && !origins.has(origin)) {
        throw new HttpError("forbidden", "Origin is not allowed");
      }
      if (single(request.headers["sec-fetch-site"]) === "cross-site") {
        throw new HttpError("forbidden", "Cross-site requests are not allowed");
      }
      const method = request.method ?? "GET";
      if (method !== "GET" && method !== "HEAD") {
        // Browsers always send Origin on a write. A missing one is a script, not the UI.
        if (origin === undefined) throw new HttpError("forbidden", "Origin is required");
        if (single(request.headers[DESK_REQUEST_HEADER]) !== DESK_REQUEST_HEADER_VALUE) {
          throw new HttpError("forbidden", `Header ${DESK_REQUEST_HEADER} is required`);
        }
      }
    },
    requireSession: (request) => {
      if (!constantTimeEqual(cookieOf(request), session)) {
        throw new HttpError("unauthorized", "Open the launch URL from the terminal");
      }
    },
    exchange: (token) => {
      if (exchanged || !constantTimeEqual(token, launchToken)) {
        throw new HttpError("forbidden", "Open the launch URL from the terminal");
      }
      exchanged = true;
      return session;
    },
    issueSession: () => session
  };
};

/** The `Set-Cookie` value for the session. No `Secure`: the origin is plain-HTTP loopback. */
export const sessionCookie = (name: string, value: string): string =>
  `${name}=${value}; HttpOnly; SameSite=Strict; Path=/`;
