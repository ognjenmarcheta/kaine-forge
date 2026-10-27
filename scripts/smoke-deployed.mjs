/* global AbortSignal, fetch */
import console from "node:console";
import process from "node:process";
import { URL } from "node:url";
import { parseArgs } from "node:util";

/**
 * Check a deployed stack from outside: the API's liveness and readiness probes,
 * the web root, and GraphQL through the web origin's /graphql proxy. Exits 1
 * when any check fails. Usage:
 *   pnpm smoke:deployed --web https://app.example.com --api https://api.example.com
 */
const usage = "usage: pnpm smoke:deployed --web <web origin URL> --api <API base URL>";
const TIMEOUT_MS = 15_000;

function url(base, path) {
  return new URL(path, base.endsWith("/") ? base : `${base}/`).href;
}

async function expectOk(target) {
  const response = await fetch(target, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (response.status !== 200) throw new Error(`status ${response.status}`);
}

// Any GraphQL response passes, errors included: the request is unauthenticated.
// An HTML body means the proxy is missing and the app shell answered instead.
async function expectGraphql(target) {
  const response = await fetch(target, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ query: "{ __typename }" }),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`status ${response.status}, not a JSON body`);
  }
  if (body === null || typeof body !== "object" || !("data" in body || "errors" in body)) {
    throw new Error(`status ${response.status}, JSON without data or errors`);
  }
}

const { values } = parseArgs({
  options: { web: { type: "string" }, api: { type: "string" } }
});
if (!values.web || !values.api) {
  console.error(usage);
  process.exit(2);
}

const checks = [
  ["API liveness", url(values.api, "health"), expectOk],
  ["API readiness", url(values.api, "ready"), expectOk],
  ["web root", url(values.web, ""), expectOk],
  ["GraphQL through the web origin", url(values.web, "graphql"), expectGraphql]
];

let failed = false;
for (const [name, target, check] of checks) {
  try {
    await check(target);
    console.log(`PASS ${name} ${target}`);
  } catch (error) {
    failed = true;
    const reason = error instanceof Error ? (error.cause?.message ?? error.message) : error;
    console.error(`FAIL ${name} ${target}: ${reason}`);
  }
}
process.exit(failed ? 1 : 0);
