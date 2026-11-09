import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

import { releaseOutputLine } from "./release-apps.util";
import { discoverDeployableApps } from "./release.util";

// Contract between the Release workflow's release:apps output, the publish-images
// and deploy-images jobs, and the app-image composite action. The jobs only run on
// main, so a broken edge or guard first shows up as a missed or wrong deploy.

const repoRoot = path.resolve(import.meta.dirname, "..");
const readText = (relativePath: string): string =>
  readFileSync(path.join(repoRoot, relativePath), "utf8");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const field = (value: unknown, key: string, where: string): unknown => {
  if (!isRecord(value) || !(key in value)) throw new Error(`${where} has no ${key}`);
  return value[key];
};

const text = (value: unknown, key: string, where: string): string => {
  const result = field(value, key, where);
  if (typeof result !== "string") throw new Error(`${where}.${key} is not a string`);
  return result;
};

const steps = (job: unknown, where: string): unknown[] => {
  const result = field(job, "steps", where);
  if (!Array.isArray(result)) throw new Error(`${where}.steps is not a list`);
  return result;
};

const stepWhere = (job: unknown, where: string, match: (step: unknown) => boolean): unknown => {
  const found = steps(job, where).find(match);
  if (found === undefined) throw new Error(`${where} has no matching step`);
  return found;
};

const stepById = (job: unknown, where: string, id: string): unknown =>
  stepWhere(job, where, (step) => isRecord(step) && step["id"] === id);

const workflow: unknown = parseYaml(readText(".github/workflows/release.yml"));
const job = (name: string): unknown => field(field(workflow, "jobs", "release.yml"), name, "jobs");
const action: unknown = parseYaml(readText(".github/actions/app-image/action.yml"));

const needsOf = (name: string): string[] => {
  const needs = field(job(name), "needs", name);
  return Array.isArray(needs) ? needs.map(String) : [String(needs)];
};

// `if: >-` folds to one line; each `&&` operand is one guard.
const guardsOf = (name: string): string[] =>
  text(job(name), "if", name)
    .split("&&")
    .map((clause) => clause.trim());

// Parses `key=value` and `key<<EOF ... EOF` lines from a GITHUB_OUTPUT file.
const parseOutputs = (raw: string): Record<string, string> => {
  const outputs: Record<string, string> = {};
  const lines = raw.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const heredoc = /^([\w-]+)<<(\w+)$/.exec(line);
    if (heredoc) {
      const [, key = "", delimiter] = heredoc;
      const body: string[] = [];
      for (index += 1; index < lines.length && lines[index] !== delimiter; index += 1) {
        body.push(lines[index] ?? "");
      }
      outputs[key] = body.join("\n");
    } else if (line.includes("=")) {
      const separator = line.indexOf("=");
      outputs[line.slice(0, separator)] = line.slice(separator + 1);
    }
  }
  return outputs;
};

const HERMETIC_GIT_ENV = {
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Release Test",
  GIT_AUTHOR_EMAIL: "release@example.test",
  GIT_COMMITTER_NAME: "Release Test",
  GIT_COMMITTER_EMAIL: "release@example.test"
};

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const git = (cwd: string, args: string[]): string =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...HERMETIC_GIT_ENV },
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();

// A checkout with one commit, origin/main at HEAD, and the given top-level files.
const checkout = (files: string[]): string => {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "release-workflow-")));
  tempDirs.push(dir);
  for (const file of files) writeFileSync(path.join(dir, file), "FROM scratch\n");
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "--allow-empty", "-m", "release"]);
  git(dir, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  return dir;
};

interface StepRun {
  status: number | null;
  outputs: Record<string, string>;
  stderr: string;
}

// Runs a step's `run` script the way the runner does: bash, step env, GITHUB_OUTPUT.
const runStep = (step: unknown, cwd: string, env: Record<string, string>): StepRun => {
  const outputFile = path.join(cwd, ".github-output");
  writeFileSync(outputFile, "");
  const result = spawnSync("bash", ["-c", text(step, "run", "step")], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...HERMETIC_GIT_ENV, ...env, GITHUB_OUTPUT: outputFile }
  });
  return {
    status: result.status,
    outputs: parseOutputs(readFileSync(outputFile, "utf8")),
    stderr: result.stderr
  };
};

const releaseJob = job("release");
const deployAppsStep = stepById(releaseJob, "release", "deploy-apps");

describe("release:apps output feeds the deploy matrix", () => {
  it("wires deploy-images to the apps that release:apps moved", () => {
    expect(text(stepById(releaseJob, "release", "release-apps"), "run", "release-apps")).toBe(
      "pnpm release:apps"
    );
    // The key release:apps appends to GITHUB_OUTPUT is the one the workflow reads.
    expect(releaseOutputLine({ status: "no-updates" })).toBe("apps=[]");
    expect(field(deployAppsStep, "env", "deploy-apps")).toMatchObject({
      MOVED: "${{ steps.release-apps.outputs.apps }}"
    });
    expect(field(releaseJob, "outputs", "release")).toMatchObject({
      apps: "${{ steps.deploy-apps.outputs.apps }}",
      images: "${{ steps.images.outputs.matrix }}"
    });
    expect(needsOf("deploy-images")).toContain("release");
    expect(field(job("deploy-images"), "strategy", "deploy-images")).toEqual({
      "fail-fast": false,
      matrix: { app: "${{ fromJSON(needs.release.outputs.apps) }}" }
    });
    expect(needsOf("publish-images")).toContain("release");
    expect(field(job("publish-images"), "strategy", "publish-images")).toEqual({
      "fail-fast": false,
      matrix: { include: "${{ fromJSON(needs.release.outputs.images) }}" }
    });
  });

  it.each([
    {
      name: "a moved app",
      moved: '["api"]',
      requested: "",
      behind: false,
      apps: '["api"]'
    },
    { name: "no moved app", moved: "[]", requested: "", behind: false, apps: "[]" },
    {
      name: "a requested app at the tip of main",
      moved: "[]",
      requested: " web ",
      behind: false,
      apps: '["web"]'
    },
    {
      name: "a requested app behind main",
      moved: '["api"]',
      requested: "web",
      behind: true,
      apps: '["api"]'
    }
  ])("deploys only moved apps: $name", ({ moved, requested, behind, apps }) => {
    const dir = checkout(["Dockerfile.api", "Dockerfile.web"]);
    if (behind) {
      git(dir, ["commit", "-q", "--allow-empty", "-m", "newer"]);
      git(dir, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
      git(dir, ["reset", "-q", "--hard", "HEAD~1"]);
    }

    const run = runStep(deployAppsStep, dir, { MOVED: moved, REQUESTED: requested });

    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    expect(run.outputs).toEqual({ apps });
  });

  it("rejects a requested app that has no Dockerfile", () => {
    const run = runStep(deployAppsStep, checkout(["Dockerfile.api"]), {
      MOVED: "[]",
      REQUESTED: "worker"
    });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("deploy_apps: no Dockerfile.worker");
    expect(run.outputs).toEqual({});
  });
});

describe("job guards", () => {
  it.each([
    {
      name: "deploy-images",
      guards: [
        // A later release step that fails must not strand an app whose branch moved.
        "!cancelled()",
        "vars.DEPLOY_SOURCE == 'image'",
        "needs.release.outputs.apps != ''",
        "needs.release.outputs.apps != '[]'",
        "github.ref == 'refs/heads/main'",
        "!github.event.repository.fork"
      ]
    },
    {
      name: "publish-images",
      guards: [
        "needs.release.outputs.images != ''",
        "needs.release.outputs.images != '[]'",
        "github.ref == 'refs/heads/main'",
        "!github.event.repository.fork"
      ]
    }
  ])("$name keeps its run guards", ({ name, guards }) => {
    expect(guardsOf(name)).toEqual(guards);
  });
});

describe("deployable apps", () => {
  const deployable = discoverDeployableApps(repoRoot);
  const imagesStep = stepById(releaseJob, "release", "images");

  // Keeps the per-app rows below from passing vacuously.
  it("finds the top-level Dockerfile.<app> files", () => {
    expect(deployable.length).toBeGreaterThan(0);
  });

  it.each(deployable.map((app) => [app.app, app] as const))(
    "%s: its changesets tag publishes an image and the deploy calls its webhook",
    (app, deployableApp) => {
      // changesets tags `<package name>@<version>`; the images step reads `@repo/<app>@`.
      expect(deployableApp.workspaceName).toBe(`@repo/${app}`);
      const manifest: unknown = JSON.parse(
        readText(path.join(deployableApp.workspaceDir, "package.json"))
      );
      const version = text(manifest, "version", deployableApp.workspaceDir);
      const tag = `${deployableApp.workspaceName}@${version}`;

      const dir = checkout([deployableApp.dockerfile]);
      git(dir, ["tag", tag]);
      git(dir, ["tag", "@repo/ui@1.0.0"]);
      const run = runStep(imagesStep, dir, {});

      expect(run.status).toBe(0);
      expect(JSON.parse(run.outputs["matrix"] ?? "null")).toEqual([{ app, version, tag }]);

      const trigger = stepWhere(job("deploy-images"), "deploy-images", (step) =>
        text(step, "name", "deploy-images step").startsWith("Trigger the")
      );
      const webhook = text(field(trigger, "env", "trigger"), "WEBHOOK", "trigger.env");
      const secret = `DEPLOY_WEBHOOK_${app.toUpperCase().replaceAll("-", "_")}`;
      expect(webhook.replace(/\s+/g, " ")).toContain(
        `matrix.app == '${app}' && secrets.${secret} ||`
      );
    }
  );
});

describe("image build and tags", () => {
  // `${GITHUB_REPOSITORY,,}` needs bash 4; macOS ships bash 3.2, the runners bash 5.
  const bashMajor = Number(
    spawnSync("bash", ["-c", "echo ${BASH_VERSINFO[0]}"], { encoding: "utf8" }).stdout.trim()
  );

  it.skipIf(bashMajor < 4).each([
    {
      name: "publish-images",
      env: { APP: "api", VERSION: "2.5.0" },
      tags: (sha: string) => ["ghcr.io/owner/repo-api:2.5.0", `ghcr.io/owner/repo-api:sha-${sha}`]
    },
    {
      name: "deploy-images",
      env: { APP: "api" },
      tags: (sha: string) => [`ghcr.io/owner/repo-api:sha-${sha}`, "ghcr.io/owner/repo-api:release"]
    }
  ])("$name tags the image with the commit SHA", ({ name, env, tags }) => {
    const dir = checkout([]);
    const run = runStep(stepById(job(name), name, "meta"), dir, {
      ...env,
      GITHUB_REPOSITORY: "Owner/Repo"
    });

    expect(run.status).toBe(0);
    expect(run.outputs["tags"]?.split("\n")).toEqual(
      tags(git(dir, ["rev-parse", "--short=7", "HEAD"]))
    );
    expect(run.outputs["revision"]).toBe(git(dir, ["rev-parse", "HEAD"]));
    expect(run.outputs["image"]).toBe("ghcr.io/owner/repo-api");
  });

  it.each(["publish-images", "deploy-images"])(
    "%s builds through app-image with the computed tags",
    (name) => {
      const build = stepById(job(name), name, "push");
      expect(text(build, "uses", name)).toBe("./.github/actions/app-image");
      const passed = field(build, "with", name);
      expect(passed).toMatchObject({
        app: "${{ matrix.app }}",
        tags: "${{ steps.meta.outputs.tags }}",
        revision: "${{ steps.meta.outputs.revision }}",
        token: "${{ secrets.GITHUB_TOKEN }}"
      });

      // Every input the action requires is passed, and nothing it does not declare.
      const declared = field(action, "inputs", "app-image");
      if (!isRecord(declared) || !isRecord(passed)) throw new Error("inputs are not maps");
      expect(Object.keys(passed).sort()).toEqual(Object.keys(declared).sort());
    }
  );

  it("app-image builds Dockerfile.<app>, scans it, then pushes every tag", () => {
    const runs = field(action, "runs", "app-image");
    const actionSteps = steps(runs, "app-image.runs");
    const index = (match: (step: unknown) => boolean): number => actionSteps.findIndex(match);
    const uses = (prefix: string) => (step: unknown) =>
      isRecord(step) && String(step["uses"]).startsWith(prefix);

    const build = index(uses("docker/build-push-action@"));
    const scan = index(uses("aquasecurity/trivy-action@"));
    const push = index((step) => isRecord(step) && step["id"] === "push");
    expect([build, scan, push].every((position) => position >= 0)).toBe(true);
    expect(build).toBeLessThan(scan);
    expect(scan).toBeLessThan(push);

    expect(field(actionSteps[build], "with", "build")).toMatchObject({
      file: "Dockerfile.${{ inputs.app }}",
      tags: "${{ inputs.tags }}"
    });
    expect(field(actionSteps[scan], "with", "scan")).toMatchObject({
      severity: "CRITICAL",
      "exit-code": "1"
    });
    expect(field(actionSteps[push], "env", "push")).toMatchObject({ TAGS: "${{ inputs.tags }}" });
    expect(field(field(action, "outputs", "app-image"), "digest", "outputs")).toMatchObject({
      value: "${{ steps.push.outputs.digest }}"
    });
  });
});

describe("Docker pruner turbo", () => {
  const lock: unknown = parseYaml(readText("pnpm-lock.yaml"));
  const rootTurbo = text(
    field(
      field(field(field(lock, "importers", "lock"), ".", "importers"), "devDependencies", "."),
      "turbo",
      "devDependencies"
    ),
    "version",
    "turbo"
  );

  it.each(discoverDeployableApps(repoRoot).map((app) => app.dockerfile))(
    "%s installs the turbo version pnpm-lock.yaml resolves",
    (dockerfile) => {
      const pins = [...readText(dockerfile).matchAll(/pnpm add -g turbo@(\S+)/g)].map(
        (match) => match[1]
      );
      expect(
        pins,
        `${dockerfile} must run \`pnpm add -g turbo@${rootTurbo}\`, the version pnpm-lock.yaml ` +
          `resolves for the root workspace, so turbo prune matches the CI turbo.`
      ).toEqual([rootTurbo]);
    }
  );
});
