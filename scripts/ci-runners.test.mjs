import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parse } from "yaml";
import {
  appJwt,
  managedRepos,
  needsFallback,
  readyRepos,
  repoFromUrl,
  RUNNER_LABEL,
  waitsForSelfHosted
} from "./ci-runners.mjs";

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
