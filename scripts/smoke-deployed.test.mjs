import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import process from "node:process";
import { after, before, describe, it } from "node:test";
import { promisify } from "node:util";

const run = promisify(execFile);

const healthy = {
  "GET /health": [200, "text/plain", "ok"],
  "GET /ready": [200, "text/plain", "ok"],
  "GET /": [200, "text/html", "<!doctype html><title>app</title>"],
  "POST /graphql": [200, "application/json", '{"data":{"__typename":"Query"}}']
};

// One server plays both the API and the web origin; each case swaps its routes.
let routes = healthy;
const server = createServer((request, response) => {
  const route = routes[`${request.method} ${request.url}`];
  const [status, type, body] = route ?? [404, "text/plain", "not found"];
  response.writeHead(status, { "content-type": type }).end(body);
});
let origin;

before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function smoke(args) {
  try {
    const { stdout, stderr } = await run(
      process.execPath,
      ["scripts/smoke-deployed.mjs", ...args],
      { encoding: "utf8" }
    );
    return { code: 0, output: stdout + stderr };
  } catch (error) {
    return { code: error.code, output: `${error.stdout}${error.stderr}` };
  }
}

describe("smoke-deployed", () => {
  it("passes a healthy stack", async () => {
    routes = healthy;
    const result = await smoke(["--web", origin, "--api", `${origin}/`]);
    assert.equal(result.code, 0, result.output);
  });

  for (const [name, broken, failing] of [
    ["a database that is not ready", { "GET /ready": [503, "text/plain", "down"] }, "/ready"],
    [
      "a web origin that serves the app shell instead of proxying GraphQL",
      { "POST /graphql": [200, "text/html", "<!doctype html><title>app</title>"] },
      "/graphql"
    ],
    ["a missing web root", { "GET /": [502, "text/html", "bad gateway"] }, "web root"]
  ]) {
    it(`fails on ${name}`, async () => {
      routes = { ...healthy, ...broken };
      const result = await smoke(["--web", origin, "--api", origin]);
      assert.notEqual(result.code, 0);
      assert.match(result.output, new RegExp(`FAIL .*${failing}`));
    });
  }

  it("fails on an unreachable API without crashing", async () => {
    routes = healthy;
    const result = await smoke(["--web", origin, "--api", "http://127.0.0.1:1"]);
    assert.equal(result.code, 1);
    assert.match(result.output, /FAIL .*\/health/);
    assert.match(result.output, /PASS .*web root/);
  });

  it("requires both URLs", async () => {
    const result = await smoke(["--web", origin]);
    assert.notEqual(result.code, 0);
    assert.match(result.output, /--api/);
  });
});
