import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import { describe, it } from "node:test";
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
