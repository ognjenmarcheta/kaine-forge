import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import { describe, it } from "node:test";
import { data, Evaluator, Lexer, Parser } from "@actions/expressions";
import { parse } from "yaml";
import { QUALITY_JOBS, qualityGateFailures } from "./pr-quality-gate.mjs";

function passingInput() {
  const needs = Object.fromEntries(QUALITY_JOBS.map((job) => [job, { result: "success" }]));
  needs["detect-paths"].outputs = { code: "true", docker: "true", graphql: "true", mobile: "true" };
  return { eventName: "pull_request", visibility: "public", codeScanningEnabled: "", needs };
}

describe("PR Quality Gate", () => {
  it("accepts a fully passing public PR", () => {
    assert.deepEqual(qualityGateFailures(passingInput()), []);
  });

  for (const job of QUALITY_JOBS) {
    it(`rejects failure, cancellation, missing results and unexpected skips in ${job}`, () => {
      for (const result of ["failure", "cancelled", "skipped", "neutral", undefined]) {
        const input = passingInput();
        input.needs[job].result = result;
        assert.ok(qualityGateFailures(input).some((failure) => failure.startsWith(`${job}:`)));
      }
    });
  }

  it("accepts a docs-only PR without build or matrix check names", () => {
    const input = passingInput();
    input.needs["detect-paths"].outputs = {
      code: "false",
      docker: "false",
      graphql: "false",
      mobile: "false"
    };
    for (const job of QUALITY_JOBS.slice(4)) input.needs[job].result = "skipped";
    assert.deepEqual(qualityGateFailures(input), []);
    input.needs["docker-images"].result = "failure";
    assert.deepEqual(qualityGateFailures(input), ["docker-images: failure"]);
  });

  it("does not accept missing path detection as a docs-only change", () => {
    const input = passingInput();
    input.needs["detect-paths"] = { result: "success", outputs: {} };
    assert.equal(qualityGateFailures(input).length, 4);
  });

  it("requires mobile jobs for mobile changes and permits unrelated job skips", () => {
    const input = passingInput();
    input.needs["detect-paths"].outputs.docker = "false";
    input.needs["detect-paths"].outputs.graphql = "false";
    input.needs["docker-images"].result = "skipped";
    input.needs["graphql-schema"].result = "skipped";
    assert.deepEqual(qualityGateFailures(input), []);
    input.needs["mobile-export"].result = "skipped";
    assert.deepEqual(qualityGateFailures(input), ["mobile-export: skipped"]);
  });

  it("permits dependency review to skip only without public or opted-in scanning", () => {
    const input = passingInput();
    input.visibility = "private";
    input.needs["dependency-review"].result = "skipped";
    assert.deepEqual(qualityGateFailures(input), []);
    input.codeScanningEnabled = "true";
    assert.deepEqual(qualityGateFailures(input), ["dependency-review: skipped"]);
  });

  for (const eventName of ["workflow_dispatch", "merge_group"]) {
    it(`requires full validation for ${eventName} while allowing PR-only skips`, () => {
      const input = passingInput();
      input.eventName = eventName;
      delete input.needs["detect-paths"].outputs;
      for (const job of ["changeset-required", "dependency-review", "graphql-schema"]) {
        input.needs[job].result = "skipped";
      }
      assert.deepEqual(qualityGateFailures(input), []);
      input.needs.coverage.result = "skipped";
      assert.deepEqual(qualityGateFailures(input), ["coverage: skipped"]);
    });
  }

  it("rejects unknown jobs and malformed event metadata", () => {
    const input = passingInput();
    input.needs.extra = { result: "success" };
    assert.deepEqual(qualityGateFailures(input), ["Unrecognized job: extra"]);
    assert.ok(qualityGateFailures({ ...input, eventName: "push" }).length);
    assert.ok(qualityGateFailures({ ...input, visibility: undefined }).length);
    assert.ok(qualityGateFailures({ ...input, needs: null }).length);
  });

  it("returns nonzero for malformed CLI input without printing its contents", () => {
    const result = spawnSync(process.execPath, ["scripts/pr-quality-gate.mjs"], {
      encoding: "utf8",
      env: { ...process.env, NEEDS_JSON: "sensitive-invalid-input" }
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Invalid PR quality gate input/);
    assert.doesNotMatch(result.stderr, /sensitive-invalid-input/);
  });

  it("waits for every workflow job and always runs without suppressing failures", () => {
    const workflow = parse(readFileSync(".github/workflows/ci-pr.yml", "utf8"));
    const gate = workflow.jobs["pr-quality-gate"];
    assert.equal(gate.name, "PR Quality Gate");
    assert.equal(gate.if, "always()");
    assert.deepEqual([...gate.needs].sort(), [...QUALITY_JOBS].sort());
    assert.deepEqual(
      Object.keys(workflow.jobs)
        .filter((job) => job !== "pr-quality-gate")
        .sort(),
      [...QUALITY_JOBS].sort()
    );
    assert.equal(gate["continue-on-error"], undefined);
    const check = gate.steps.find((step) => step.run === "node scripts/pr-quality-gate.mjs");
    assert.equal(check.env.NEEDS_JSON, "${{ toJSON(needs) }}");
    assert.equal(check["continue-on-error"], undefined);
  });

  it("requires owner PR handoff and both CI checks without a queue or bypass", () => {
    const ruleset = JSON.parse(readFileSync(".github/rulesets/main.json", "utf8"));
    assert.equal(ruleset.enforcement, "active");
    assert.deepEqual(ruleset.bypass_actors, []);
    assert.deepEqual(ruleset.conditions.ref_name, { include: ["~DEFAULT_BRANCH"], exclude: [] });
    const rules = Object.fromEntries(ruleset.rules.map((rule) => [rule.type, rule]));
    assert.ok(rules.deletion);
    assert.ok(rules.non_fast_forward);
    assert.equal(rules.merge_queue, undefined);
    assert.equal(rules.pull_request.parameters.required_approving_review_count, 0);
    assert.equal(rules.pull_request.parameters.required_review_thread_resolution, true);
    assert.deepEqual(rules.pull_request.parameters.allowed_merge_methods, ["squash"]);
    assert.equal(
      rules.required_status_checks.parameters.strict_required_status_checks_policy,
      true
    );
    assert.equal(rules.required_status_checks.parameters.do_not_enforce_on_create, false);
    assert.deepEqual(rules.required_status_checks.parameters.required_status_checks, [
      { context: "PR Quality Gate", integration_id: 15368 },
      { context: "Analyze TypeScript", integration_id: 15368 }
    ]);

    const owner = JSON.parse(readFileSync(".github/rulesets/main-owner.json", "utf8"));
    assert.equal(owner.enforcement, "active");
    assert.deepEqual(owner.conditions, ruleset.conditions);
    assert.deepEqual(owner.bypass_actors, [
      { actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "exempt" }
    ]);
    assert.deepEqual(owner.rules, [
      { type: "update", parameters: { update_allows_fetch_and_merge: false } }
    ]);
  });
});

function runnerLabels(
  expression,
  {
    visibility = "private",
    linux = "",
    macos = "",
    eventName = "workflow_dispatch",
    fork = false
  } = {}
) {
  assert.ok(expression.startsWith("${{") && expression.endsWith("}}"));
  const { tokens } = new Lexer(expression.slice(3, -2)).lex();
  const parsed = new Parser(tokens, ["github", "vars"], []).parse();
  const context = {
    github: {
      repository: "owner/repo",
      event_name: eventName,
      event: {
        repository: { visibility },
        ...(eventName.startsWith("pull_request")
          ? {
              pull_request: {
                head: { repo: { full_name: fork ? "contributor/repo" : "owner/repo" } }
              }
            }
          : {})
      }
    },
    vars: { CI_SELF_HOSTED_LINUX: linux, CI_SELF_HOSTED_MACOS: macos }
  };
  const result = new Evaluator(
    parsed,
    JSON.parse(JSON.stringify(context), data.reviver)
  ).evaluate();
  assert.equal(result.kind, data.Kind.Array);
  return result.values().map((label) => label.coerceString());
}

describe("Self-hosted runner routing", () => {
  for (const name of [
    "ci-pr",
    "codeql",
    "security",
    "release",
    "docker-cache",
    "deep-checks",
    "labeler"
  ]) {
    const workflow = parse(readFileSync(`.github/workflows/${name}.yml`, "utf8"));
    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      it(`${name}/${jobName} preserves hosted defaults and enforces private platform opt-ins`, () => {
        const mac = name === "deep-checks" && jobName === "desktop-build-macos";
        const hosted = [mac ? "macos-latest" : "ubuntu-latest"];
        const selfHosted = mac
          ? ["self-hosted", "macOS", "kaine-ci-macos"]
          : ["self-hosted", "linux", "x64", "kaine-ci-linux"];
        const enabled = mac ? { macos: "true" } : { linux: "true" };
        assert.deepEqual(runnerLabels(job["runs-on"]), hosted);
        assert.deepEqual(
          runnerLabels(job["runs-on"], mac ? { linux: "true" } : { macos: "true" }),
          hosted
        );
        assert.deepEqual(runnerLabels(job["runs-on"], enabled), selfHosted);
        assert.deepEqual(
          runnerLabels(job["runs-on"], { linux: "true", macos: "true" }),
          selfHosted
        );
        for (const visibility of ["public", "internal", ""]) {
          assert.deepEqual(runnerLabels(job["runs-on"], { ...enabled, visibility }), hosted);
        }
        for (const value of ["false", "1", "yes", " true", "true ", "null", '"true"']) {
          assert.deepEqual(
            runnerLabels(job["runs-on"], mac ? { macos: value } : { linux: value }),
            hosted
          );
        }
        // GitHub compares strings case-insensitively; JSON parsing rejects these opt-ins.
        for (const value of ["TRUE", "True"]) {
          assert.throws(
            () => runnerLabels(job["runs-on"], mac ? { macos: value } : { linux: value }),
            /JSON/i
          );
        }
        for (const eventName of [
          "pull_request",
          "merge_group",
          "workflow_dispatch",
          "push",
          "schedule"
        ]) {
          assert.deepEqual(runnerLabels(job["runs-on"], { ...enabled, eventName }), selfHosted);
        }
        assert.deepEqual(
          runnerLabels(job["runs-on"], { ...enabled, eventName: "pull_request", fork: true }),
          hosted
        );
      });
    }
  }

  it("keeps the required CodeQL check and metadata-only labeler behavior", () => {
    const codeql = parse(readFileSync(".github/workflows/codeql.yml", "utf8"));
    assert.equal(codeql.jobs.analyze.name, "Analyze TypeScript");
    const labeler = parse(readFileSync(".github/workflows/labeler.yml", "utf8"));
    assert.ok(labeler.on.pull_request_target);
    assert.equal(labeler.on.pull_request, undefined);
    assert.ok(
      labeler.jobs.label.steps.every(
        (step) => step.uses && !step.uses.startsWith("actions/checkout")
      )
    );
    assert.deepEqual(
      runnerLabels(labeler.jobs.label["runs-on"], {
        linux: "true",
        eventName: "pull_request_target",
        fork: true
      }),
      ["self-hosted", "linux", "x64", "kaine-ci-linux"]
    );
  });
});

describe("Self-hosted prerequisites", () => {
  const setup = parse(readFileSync(".github/actions/setup-node-pnpm/action.yml", "utf8"));
  const check = setup.runs.steps[0];
  const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "/bin/bash";

  function preflight({ missing = "", nodeStatus = "0", dockerStatus = "0", os = "Linux" } = {}) {
    return spawnSync(bash, ["--noprofile", "--norc"], {
      encoding: "utf8",
      env: {
        ...process.env,
        MISSING_TOOL: missing,
        NODE_STATUS: nodeStatus,
        DOCKER_STATUS: dockerStatus,
        RUNNER_OS: os
      },
      input: `command() { [ "$2" != "$MISSING_TOOL" ]; }
node() { return "$NODE_STATUS"; }
docker() { return "$DOCKER_STATUS"; }
${check.run}`
    });
  }

  it("runs before installation only on self-hosted runners", () => {
    assert.equal(check.if, "runner.environment == 'self-hosted'");
    assert.equal(check.shell, "bash");
    assert.equal(check.env.RUNNER_OS, "${{ runner.os }}");
    assert.match(setup.runs.steps[1].uses, /^pnpm\/action-setup@/);
  });

  it("accepts Linux and macOS prerequisites", () => {
    for (const os of ["Linux", "macOS"]) {
      const result = preflight({ os });
      assert.equal(result.status, 0, result.error?.message ?? result.stderr);
    }
  });

  it("reports each missing tool before installation", () => {
    for (const missing of ["node", "git", "bash", "tar", "gzip", "curl", "unzip", "docker", "gh"]) {
      const result = preflight({ missing });
      assert.equal(result.status, 1);
      assert.ok(result.stdout.includes(`requires ${missing}.`), result.stdout);
      assert.match(result.stdout, /docs\/self-hosted-ci\.md/);
    }
  });

  it("reports unsupported host Node and inaccessible Docker", () => {
    const oldNode = preflight({ nodeStatus: "1" });
    assert.equal(oldNode.status, 1);
    assert.match(oldNode.stdout, /requires host Node\.js 22 or newer/);
    const noDocker = preflight({ dockerStatus: "1" });
    assert.equal(noDocker.status, 1);
    assert.match(noDocker.stdout, /access to a running Docker daemon/);
    assert.equal(preflight({ os: "macOS", missing: "docker", dockerStatus: "1" }).status, 0);
  });
});
