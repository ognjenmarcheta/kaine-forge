import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";

import { labelerLabelNames } from "./doctor.mjs";
import {
  isSubset,
  planLabels,
  planOptions,
  planRulesets,
  planSettings,
  runSetup
} from "./github-setup.util.mjs";

const readRepoFile = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const manifest = JSON.parse(readRepoFile(".github/repo-setup.json"));

test("a second run against the applied state plans no change", () => {
  // Live shapes as GitHub returns them: server-only keys, defaults omitted, other color case.
  const ownerRuleset = JSON.parse(readRepoFile(".github/rulesets/main-owner.json"));
  const liveRuleset = {
    id: 7,
    name: "main: owner-only updates through pull requests",
    source: "acme/app",
    target: "branch",
    enforcement: "active",
    bypass_actors: [{ actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "exempt" }],
    conditions: { ref_name: { exclude: [], include: ["~DEFAULT_BRANCH"] } },
    rules: [{ type: "update" }],
    _links: { self: { href: "https://api.github.com/repos/acme/app/rulesets/7" } }
  };
  assert.deepEqual(planRulesets([ownerRuleset], [{ id: 7, body: liveRuleset }]), []);
  assert.deepEqual(
    planLabels(
      [{ name: "type:fix", color: "bfe5bf", description: "Bug fix" }],
      [{ name: "type:fix", color: "BFE5BF", description: "Bug fix" }]
    ),
    { create: [], update: [], extra: [] }
  );
  assert.deepEqual(
    planSettings({ allow_merge_commit: false }, { allow_merge_commit: false, id: 1 }),
    {}
  );
});

test("rulesets update by name and never duplicate", () => {
  const desired = { name: "main", enforcement: "active", rules: [{ type: "deletion" }] };
  const live = [
    { id: 42, body: { name: "main", enforcement: "disabled", rules: [{ type: "deletion" }] } }
  ];
  assert.deepEqual(planRulesets([desired], live), [
    { action: "update", name: "main", id: 42, body: desired }
  ]);
  assert.deepEqual(planRulesets([desired], []), [
    { action: "create", name: "main", body: desired }
  ]);
});

test("rule drift that GitHub does not hide by omission still counts", () => {
  assert.equal(isSubset({ parameters: { strict: true } }, {}), false);
  assert.equal(isSubset({ parameters: { strict: false } }, {}), true);
});

test("labels are created or updated and extra labels are only listed", () => {
  const plan = planLabels(
    [
      { name: "needs-spec", color: "d4c5f9", description: "Requires a reviewed specification" },
      { name: "area:api", color: "c5def5", description: "GraphQL API (apps/api)" }
    ],
    [
      { name: "area:api", color: "ededed", description: null },
      { name: "rust", color: "000000", description: "Pull requests that update rust code" }
    ]
  );
  assert.deepEqual(plan, {
    create: [
      { name: "needs-spec", color: "d4c5f9", description: "Requires a reviewed specification" }
    ],
    update: [{ name: "area:api", color: "c5def5", description: "GraphQL API (apps/api)" }],
    extra: ["rust"]
  });
});

test("project options keep their ids, and a board with items keeps options they may use", () => {
  const live = [
    { id: "a", name: "Todo", color: "GREEN", description: "" },
    { id: "b", name: "In Progress", color: "YELLOW", description: "" },
    { id: "c", name: "Done", color: "PURPLE", description: "" }
  ];
  assert.deepEqual(planOptions(["In progress", "Done"], live, false), [
    { id: "b", name: "In progress", color: "YELLOW", description: "" },
    { id: "c", name: "Done", color: "PURPLE", description: "" },
    { id: "a", name: "Todo", color: "GREEN", description: "" }
  ]);
  assert.deepEqual(planOptions(["Triage", "Done"], live, true), [
    { name: "Triage", color: "GRAY", description: "" },
    { id: "c", name: "Done", color: "PURPLE", description: "" }
  ]);
  assert.equal(planOptions(["Todo", "In Progress", "Done"], live, false), null);
});

test("a token without the project scope skips the board and still applies the labels", () => {
  const posted = [];
  const ok = (value) => ({ status: 0, stdout: JSON.stringify(value), stderr: "" });
  const run = (args, input) => {
    const key = args.join(" ");
    if (key === "api --method GET repos/acme/app") {
      return ok({ permissions: { admin: true, push: true } });
    }
    if (key === "api --method GET repos/acme/app/labels?per_page=100&page=1") return ok([]);
    if (key === "api --method POST repos/acme/app/labels --input -") {
      posted.push(JSON.parse(input).name);
      return ok({});
    }
    if (key === "api graphql --input -") {
      return {
        status: 1,
        stdout: '{"errors":[{"type":"INSUFFICIENT_SCOPES"}]}',
        stderr: "gh: Your token has not been granted the required scopes"
      };
    }
    return { status: 1, stdout: "", stderr: `unexpected: gh ${key}` };
  };
  const { results } = runSetup({
    manifest: {
      ...manifest,
      labels: [{ name: "needs-spec", color: "d4c5f9", description: "Spec" }]
    },
    readJson: () => ({ name: "unused" }),
    run,
    repo: "acme/app",
    apply: true,
    only: ["labels", "project"]
  });
  assert.deepEqual(posted, ["needs-spec"]);
  assert.deepEqual(results, [
    { section: "labels", status: "change", lines: ["create needs-spec"] },
    {
      section: "project",
      status: "warn",
      lines: [
        "gh needs the project scope. Run `gh auth refresh -s project`, then run this command again."
      ]
    }
  ]);
});

test("every label that repository config applies is in repo-setup.json", () => {
  const known = new Set(manifest.labels.map((label) => label.name));
  const listed = (yaml) =>
    [...yaml.matchAll(/^labels: \[(.*)\]$/gm)].flatMap((match) =>
      match[1].split(",").map((name) => name.trim().replace(/^"|"$/g, ""))
    );
  const dependabot = [
    ...readRepoFile(".github/dependabot.yml").matchAll(/^ {6}- ([\w:-]+)$/gm)
  ].map((match) => match[1]);
  const referenced = [
    ...labelerLabelNames(readRepoFile(".github/labeler.yml")),
    ...dependabot,
    ...listed(readRepoFile(".github/ISSUE_TEMPLATE/bug_report.yml")),
    ...listed(readRepoFile(".github/ISSUE_TEMPLATE/feature_request.yml"))
  ];
  assert.ok(referenced.includes("dependencies") && referenced.includes("type:fix"));
  assert.deepEqual(
    referenced.filter((name) => !known.has(name)),
    []
  );
});
