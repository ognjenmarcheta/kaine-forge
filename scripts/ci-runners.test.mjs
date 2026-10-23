import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import process from "node:process";
import { describe, it } from "node:test";
import { URL } from "node:url";
import { parse } from "yaml";
import {
  appJwt,
  HEARTBEAT_VARIABLE,
  managedRepos,
  needsFallback,
  PENDING_VARIABLE,
  readyRepos,
  repoFromUrl,
  ROUTING_VARIABLE,
  RUNNER_LABEL,
  waitsForSelfHosted
} from "./ci-runners.mjs";

/** In-memory GitHub API for one repo with one run waiting for the self-hosted label. */
function fakeGitHub() {
  const state = {
    variables: new Map([
      [ROUTING_VARIABLE, "true"],
      [HEARTBEAT_VARIABLE, "1"]
    ]),
    run: { id: 7, status: "queued", conclusion: null, html_url: "https://github.test/runs/7" },
    rerunFails: true,
    reruns: 0
  };
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const url = new URL(req.url, "http://fake");
    const send = (status, json) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(json === undefined ? undefined : JSON.stringify(json));
    };
    const variable = /^\/repos\/owner\/repo\/actions\/variables(?:\/(\w+))?$/.exec(url.pathname);
    const route = `${req.method} ${url.pathname}`;
    const { run, variables } = state;
    if (route === "GET /installation/repositories") {
      return send(200, { repositories: [{ full_name: "owner/repo", archived: false }] });
    }
    if (variable) {
      const name = variable[1] ?? JSON.parse(body).name;
      if (req.method === "GET") {
        return variables.has(name) ? send(200, { name, value: variables.get(name) }) : send(404);
      }
      if (req.method === "DELETE") return send(variables.delete(name) ? 204 : 404);
      if (req.method === "PATCH" && !variables.has(name)) return send(404);
      variables.set(name, JSON.parse(body).value);
      return req.method === "POST" ? send(201, {}) : send(204);
    }
    if (route === "GET /repos/owner/repo/actions/runs") {
      return send(200, {
        workflow_runs: url.searchParams.get("status") === run.status ? [run] : []
      });
    }
    if (route === "GET /repos/owner/repo/actions/runs/7/jobs") {
      return send(200, { jobs: [{ status: run.status, labels: ["self-hosted", RUNNER_LABEL] }] });
    }
    if (route === "GET /repos/owner/repo/actions/runs/7") return send(200, run);
    if (route === "POST /repos/owner/repo/actions/runs/7/cancel") {
      Object.assign(run, { status: "completed", conclusion: "cancelled" });
      return send(202, {});
    }
    if (route === "POST /repos/owner/repo/actions/runs/7/rerun") {
      state.reruns++;
      if (state.rerunFails) return send(500, { message: "server error" });
      Object.assign(run, { status: "queued", conclusion: null });
      return send(201, {});
    }
    return send(404);
  });
  return { state, server };
}

async function runWatchdog(port) {
  const child = spawn(process.execPath, ["scripts/ci-runners.mjs", "watchdog"], {
    env: { ...process.env, GH_TOKEN: "test", GITHUB_API_URL: `http://127.0.0.1:${port}` },
    stdio: "ignore"
  });
  const [code] = await once(child, "close");
  return code;
}

function runnerSet(name, repo) {
  return {
    metadata: { name, namespace: "arc-runners" },
    spec: { githubConfigUrl: `https://github.com/${repo}` }
  };
}

function listenerPod(scaleSet, ready, namespace = "arc-runners") {
  return {
    metadata: {
      labels: {
        "actions.github.com/scale-set-name": scaleSet,
        "actions.github.com/scale-set-namespace": namespace
      }
    },
    status: { conditions: [{ type: "Ready", status: ready ? "True" : "False" }] }
  };
}

describe("ARC runner heartbeat", () => {
  const sets = {
    items: [runnerSet("mo-forge", "owner/mo-forge"), runnerSet("byte-forge", "owner/byte-forge")]
  };

  it("reads owner/repo from repository config URLs only", () => {
    assert.equal(repoFromUrl("https://github.com/owner/repo"), "owner/repo");
    assert.equal(repoFromUrl("https://github.com/owner/repo/"), "owner/repo");
    for (const url of ["https://github.com/owner", "https://example.com/owner/repo", undefined]) {
      assert.throws(() => repoFromUrl(url));
    }
  });

  it("lists every scale set repo as managed, ready or not", () => {
    assert.deepEqual(managedRepos(sets), ["owner/mo-forge", "owner/byte-forge"]);
  });

  it("reports only repos whose listener pod is Ready in the same namespace", () => {
    const pods = {
      items: [
        listenerPod("mo-forge", true),
        listenerPod("byte-forge", false),
        listenerPod("byte-forge", true, "other-namespace")
      ]
    };
    assert.deepEqual(readyRepos(sets, pods), ["owner/mo-forge"]);
    assert.deepEqual(readyRepos(sets, { items: [] }), []);
  });
});

describe("ARC runner watchdog", () => {
  const now = 1_800_000_000;
  const hoursAgo = (hours) => String(now - hours * 3600);

  it("keeps repos with a fresh heartbeat on self-hosted runners", () => {
    const input = { routing: "true", heartbeat: hoursAgo(1.5), nowSeconds: now, maxAgeHours: 2 };
    assert.equal(needsFallback(input), false);
  });

  it("falls back when the heartbeat is stale, missing, or not a timestamp", () => {
    for (const heartbeat of [hoursAgo(2.1), undefined, "", "soon", "-5", "1.5"]) {
      const input = { routing: "true", heartbeat, nowSeconds: now, maxAgeHours: 2 };
      assert.equal(needsFallback(input), true, `heartbeat ${heartbeat}`);
    }
  });

  it("leaves repos alone that are not routed to self-hosted runners", () => {
    for (const routing of [undefined, "false", "TRUE"]) {
      const input = { routing, heartbeat: undefined, nowSeconds: now, maxAgeHours: 2 };
      assert.equal(needsFallback(input), false);
    }
  });

  it("re-runs only runs with a job queued for the self-hosted label", () => {
    const job = (status, labels) => ({ status, labels });
    assert.equal(waitsForSelfHosted([job("queued", ["self-hosted", RUNNER_LABEL])]), true);
    assert.equal(waitsForSelfHosted([job("in_progress", ["self-hosted", RUNNER_LABEL])]), false);
    assert.equal(waitsForSelfHosted([job("queued", ["ubuntu-latest"])]), false);
    assert.equal(waitsForSelfHosted([]), false);
  });

  it("re-runs a cancelled run on the next watchdog run when its re-run failed", async () => {
    const { state, server } = fakeGitHub();
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const { port } = server.address();
    try {
      assert.equal(await runWatchdog(port), 1);
      assert.equal(state.run.conclusion, "cancelled");
      assert.equal(state.variables.get(ROUTING_VARIABLE), "false");
      assert.equal(state.variables.get(PENDING_VARIABLE), "7");

      state.rerunFails = false;
      assert.equal(await runWatchdog(port), 0);
      assert.equal(state.reruns, 2);
      assert.equal(state.run.status, "queued");
      assert.equal(state.variables.has(PENDING_VARIABLE), false);
    } finally {
      server.close();
    }
  });

  it("signs a GitHub App JWT that the public key verifies", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwt = appJwt("Iv1.client", privateKey.export({ type: "pkcs8", format: "pem" }), now);
    const [header, payload, signature] = jwt.split(".");
    const decode = (part) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    assert.deepEqual(decode(header), { alg: "RS256", typ: "JWT" });
    assert.deepEqual(decode(payload), { iat: now - 60, exp: now + 540, iss: "Iv1.client" });
    const verifier = createVerify("RSA-SHA256").update(`${header}.${payload}`);
    assert.equal(verifier.verify(publicKey, signature, "base64url"), true);
  });

  it("runs only where opted in and always on a hosted runner", () => {
    const workflow = parse(readFileSync(".github/workflows/runner-watchdog.yml", "utf8"));
    const job = workflow.jobs.watchdog;
    assert.equal(job["runs-on"], "ubuntu-latest");
    assert.equal(job.if, "vars.CI_RUNNER_WATCHDOG == 'true'");
    assert.deepEqual(workflow.permissions, {});
  });
});
