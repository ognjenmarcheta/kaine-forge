import type { IncomingHttpHeaders } from "node:http";

import { AUTH_DEFINITIONS } from "./auth.definition";

interface ResolveActiveOrganizationIdInput {
  availableOrganizationIds: string[];
  requestedActiveOrganizationId: string | null;
}

const DEFAULT_ORGANIZATION_SLUG = "organization";

function readHeader(headers: Headers | IncomingHttpHeaders, name: string): string | null {
  if (headers instanceof Headers) {
    return headers.get(name);
  }

  const header = headers[name.toLowerCase()];

  if (Array.isArray(header)) {
    return header[0] ?? null;
  }

  return header ?? null;
}

function parseCookieHeader(headers: Headers | IncomingHttpHeaders): Record<string, string> {
  const cookieHeader = readHeader(headers, "cookie");

  if (!cookieHeader) {
    return {};
  }

  return cookieHeader
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((cookies, entry) => {
      const [key, ...valueParts] = entry.split("=");
      const value = valueParts.join("=");

      if (key) {
        try {
          cookies[key] = decodeURIComponent(value);
        } catch {
          cookies[key] = value;
        }
      }

      return cookies;
    }, {});
}

export function getSessionTokenFromHeaders(headers: Headers | IncomingHttpHeaders): string | null {
  const authorizationHeader = readHeader(headers, "authorization");

  if (authorizationHeader) {
    const [scheme, ...valueParts] = authorizationHeader.trim().split(/\s+/);

    if (scheme?.toLowerCase() === "bearer") {
      const token = valueParts.join(" ").trim();

      if (token) {
        return token;
      }
    }
  }

  return parseCookieHeader(headers)[AUTH_DEFINITIONS.COOKIE_NAME] ?? null;
}

export function resolveActiveOrganizationId(
  input: ResolveActiveOrganizationIdInput
): string | null {
  if (input.requestedActiveOrganizationId) {
    const isAvailable = input.availableOrganizationIds.includes(
      input.requestedActiveOrganizationId
    );

    if (isAvailable) {
      return input.requestedActiveOrganizationId;
    }
  }

  return input.availableOrganizationIds[0] ?? null;
}

export function slugifyOrganizationName(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || DEFAULT_ORGANIZATION_SLUG;
}
