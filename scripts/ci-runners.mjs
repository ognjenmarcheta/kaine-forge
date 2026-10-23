/* global AbortSignal, fetch */
// Automatic hosted fallback for the ARC runners (docs/self-hosted-ci.md).
//   heartbeat  host timer: mark repos with a Ready listener as self-hosted
//   offline    host shutdown: route every managed repo back to hosted runners
//   watchdog   hosted workflow: route repos with a stale heartbeat back to hosted
//              runners and re-run the runs that wait for the self-hosted label
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import console from "node:console";
import { createSign } from "node:crypto";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

export const ROUTING_VARIABLE = "CI_SELF_HOSTED_LINUX";
export const HEARTBEAT_VARIABLE = "CI_RUNNER_HEARTBEAT";
export const RUNNER_LABEL = "kaine-ci-linux";
const LISTENER_SELECTOR = "app.kubernetes.io/component=runner-scale-set-listener";

/** `owner/name` from a scale set's repository githubConfigUrl. */
export function repoFromUrl(url) {
  const match = /^https:\/\/github\.com\/([^/]+\/[^/]+?)\/?$/.exec(url ?? "");
  if (!match) throw new Error(`Not a repository githubConfigUrl: ${url}`);
  return match[1];
}

/** Every repo that has a scale set, ready or not. */
export function managedRepos(runnerSets) {
  return runnerSets.items.map((set) => repoFromUrl(set.spec.githubConfigUrl));
}

/** Repos whose scale set has a Ready listener pod, so jobs routed there will start. */
export function readyRepos(runnerSets, listenerPods) {
  const ready = new Set(
    listenerPods.items
      .filter((pod) =>
        pod.status?.conditions?.some((c) => c.type === "Ready" && c.status === "True")
      )
      .map(
        (pod) =>
          `${pod.metadata.labels["actions.github.com/scale-set-namespace"]}/${pod.metadata.labels["actions.github.com/scale-set-name"]}`
      )
  );
  return runnerSets.items
    .filter((set) => ready.has(`${set.metadata.namespace}/${set.metadata.name}`))
    .map((set) => repoFromUrl(set.spec.githubConfigUrl));
}

/** A repo routed to self-hosted runners whose heartbeat is missing or too old. */
export function needsFallback({ routing, heartbeat, nowSeconds, maxAgeHours }) {
  if (routing !== "true") return false;
  if (!/^\d+$/.test(heartbeat ?? "")) return true;
  return nowSeconds - Number(heartbeat) > maxAgeHours * 3600;
}

/** A run that still has a job waiting for the self-hosted label. */
export function waitsForSelfHosted(jobs) {
  return jobs.some((job) => job.status === "queued" && job.labels.includes(RUNNER_LABEL));
}

/** GitHub App JWT (RS256), backdated 60 s for clock drift. */
export function appJwt(appId, privateKey, nowSeconds) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    iat: nowSeconds - 60,
    exp: nowSeconds + 540,
    iss: appId
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(privateKey, "base64url");
  return `${unsigned}.${signature}`;
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

async function github(token, method, path, body) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000)
  });
  if (response.status === 404) return undefined;
  if (!response.ok)
    throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

async function getVariable(token, repo, name) {
  return (await github(token, "GET", `/repos/${repo}/actions/variables/${name}`))?.value;
}

async function setVariable(token, repo, name, value) {
  const updated = await github(token, "PATCH", `/repos/${repo}/actions/variables/${name}`, {
    name,
    value
  });
  if (updated === undefined) {
    await github(token, "POST", `/repos/${repo}/actions/variables`, { name, value });
  }
}

function kubectlJson(args) {
  return JSON.parse(execFileSync("kubectl", [...args, "-o", "json"], { encoding: "utf8" }));
}

const runnerSets = () =>
  kubectlJson(["get", "autoscalingrunnersets.actions.github.com", "-n", "arc-runners"]);

/** Installation token from the same App secret ARC uses, so no second key copy exists. */
async function hostInstallationToken() {
  const { data } = kubectlJson(["get", "secret", "arc-github-app", "-n", "arc-runners"]);
  const field = (key) => Buffer.from(data[key], "base64").toString("utf8");
  const jwt = appJwt(field("github_app_id"), field("github_app_private_key"), nowSeconds());
  const installation = field("github_app_installation_id");
  return (await github(jwt, "POST", `/app/installations/${installation}/access_tokens`)).token;
}

async function heartbeat() {
  const repos = readyRepos(
    runnerSets(),
    kubectlJson(["get", "pods", "-A", "-l", LISTENER_SELECTOR])
  );
  if (repos.length === 0) return;
  const token = await hostInstallationToken();
  const now = String(nowSeconds());
  for (const repo of repos) {
    await setVariable(token, repo, ROUTING_VARIABLE, "true");
    await setVariable(token, repo, HEARTBEAT_VARIABLE, now);
    console.log(`${repo}: self-hosted, heartbeat ${now}`);
  }
}

async function offline() {
  const repos = managedRepos(runnerSets());
  if (repos.length === 0) return;
  const token = await hostInstallationToken();
  for (const repo of repos) {
    try {
      await setVariable(token, repo, ROUTING_VARIABLE, "false");
      console.log(`${repo}: hosted`);
    } catch (error) {
      console.error(`${repo}: ${error.message}`);
      process.exitCode = 1;
    }
  }
}

async function rerunOnHosted(token, repo) {
  for (const status of ["queued", "in_progress"]) {
    const { workflow_runs: runs } = await github(
      token,
      "GET",
      `/repos/${repo}/actions/runs?status=${status}&per_page=100`
    );
    for (const run of runs) {
      const { jobs } = await github(
        token,
        "GET",
        `/repos/${repo}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`
      );
      if (!waitsForSelfHosted(jobs)) continue;
      await github(token, "POST", `/repos/${repo}/actions/runs/${run.id}/cancel`);
      for (let attempt = 0; attempt < 24; attempt++) {
        await sleep(5_000);
        if (
          (await github(token, "GET", `/repos/${repo}/actions/runs/${run.id}`)).status ===
          "completed"
        ) {
          break;
        }
      }
      await github(token, "POST", `/repos/${repo}/actions/runs/${run.id}/rerun`);
      console.log(`${repo}: re-ran ${run.html_url}`);
    }
  }
}

async function watchdog() {
  const token = process.env.GH_TOKEN;
  if (!token) throw new Error("GH_TOKEN must hold a GitHub App installation token");
  const maxAgeHours = Number(process.env.CI_RUNNER_FALLBACK_HOURS || "2");
  const { repositories } = await github(token, "GET", "/installation/repositories?per_page=100");
  for (const { full_name: repo, archived } of repositories) {
    if (archived) continue;
    const routing = await getVariable(token, repo, ROUTING_VARIABLE);
    const heartbeat = await getVariable(token, repo, HEARTBEAT_VARIABLE);
    if (!needsFallback({ routing, heartbeat, nowSeconds: nowSeconds(), maxAgeHours })) continue;
    await setVariable(token, repo, ROUTING_VARIABLE, "false");
    console.log(`::warning::${repo}: no runner heartbeat for ${maxAgeHours} h, routed to hosted`);
    await rerunOnHosted(token, repo);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const commands = { heartbeat, offline, watchdog };
  const command = commands[process.argv[2]];
  if (!command) {
    console.error(`Usage: ci-runners.mjs ${Object.keys(commands).join("|")}`);
    process.exit(2);
  }
  await command();
}
