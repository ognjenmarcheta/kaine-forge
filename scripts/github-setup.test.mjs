import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";

import { labelerLabelNames } from "./doctor.mjs";
import {
  exitCodeFor,
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

test("a private repository passes the check when GitHub lacks a feature there", () => {
  const ok = (value) => ({
    status: 0,
    stdout: value === undefined ? "" : JSON.stringify(value),
    stderr: ""
  });
  // Responses recorded from a private repository on a free plan.
  const replies = {
    "repos/acme/app": ok({
      ...manifest.repository,
      permissions: { admin: true },
      security_and_analysis: null
    }),
    "repos/acme/app/actions/permissions": ok({
      enabled: true,
      allowed_actions: "all",
      sha_pinning_required: true
    }),
    "repos/acme/app/actions/permissions/workflow": ok({
      default_workflow_permissions: "read",
      can_approve_pull_request_reviews: true
    }),
    "repos/acme/app/actions/permissions/fork-pr-contributor-approval": {
      status: 1,
      stdout: '{"message":"Validation Failed","status":"422"}',
      stderr: "gh: Fork PR approval is not allowed for private repositories. (Validation Failed)"
    },
    "repos/acme/app/vulnerability-alerts": ok(),
    "repos/acme/app/automated-security-fixes": ok({ enabled: true, paused: false }),
    "repos/acme/app/private-vulnerability-reporting": {
      status: 1,
      stdout: '{"message":"Not Found","status":"404"}',
      stderr: "gh: Not Found (HTTP 404)"
    },
    "repos/acme/app/immutable-releases": ok({ enabled: true, enforced_by_owner: false })
  };
  const run = (args) =>
    replies[args[3]] ?? { status: 1, stdout: "", stderr: `unexpected: gh ${args.join(" ")}` };
  const { results } = runSetup({
    manifest,
    readJson: () => ({ name: "unused" }),
    run,
    repo: "acme/app",
    apply: false,
    only: ["settings", "security"]
  });
  assert.deepEqual(results, [
    {
      section: "settings",
      status: "warn",
      lines: ["actions.fork_pr_contributor_approval: not available for this repository or plan"]
    },
    {
      section: "security",
      status: "warn",
      lines: [
        "private_vulnerability_reporting: not available for this repository or plan",
        "secret_scanning: not available for this repository or plan",
        "secret_scanning_push_protection: not available for this repository or plan"
      ]
    }
  ]);
  assert.equal(exitCodeFor(results, "check"), 0);
});

test("manual steps give one click per line, then how to confirm and check again", () => {
  const data = (value) => ({ status: 0, stdout: JSON.stringify({ data: value }), stderr: "" });
  const run = (args, input) => {
    if (args.join(" ") === "api --method GET repos/acme/app") {
      return { status: 0, stdout: JSON.stringify({ permissions: { admin: true } }), stderr: "" };
    }
    const { query } = JSON.parse(input);
    if (query.includes("hasDiscussionsEnabled")) {
      return data({
        repository: { hasDiscussionsEnabled: true, discussionCategories: { nodes: [] } }
      });
    }
    if (query.includes("projectsV2(first")) {
      return data({
        repository: {
          id: "R",
          owner: { id: "O" },
          projectsV2: { nodes: [{ id: "P", title: "app", closed: false }] }
        }
      });
    }
    return data({
      node: {
        id: "P",
        title: "app",
        url: "https://github.com/users/acme/projects/1",
        items: { totalCount: 3 },
        fields: {
          nodes: [
            {
              id: "F",
              name: "Status",
              dataType: "SINGLE_SELECT",
              options: [{ id: "o", name: "Done", color: "GREEN", description: "" }]
            }
          ]
        },
        views: {
          nodes: [
            {
              id: "V",
              name: "Ready",
              layout: "TABLE_LAYOUT",
              filter: null,
              fields: { nodes: [] },
              sortByFields: { nodes: [] }
            }
          ]
        },
        workflows: { nodes: [{ name: "Auto-add to project", enabled: false }] }
      }
    });
  };
  const { results } = runSetup({
    manifest: {
      ...manifest,
      discussions: { categories: [{ slug: "q-a", name: "Q&A", format: "Question / Answer" }] },
      project: {
        status: ["Done"],
        fields: [],
        views: [
          {
            name: "Ready",
            layout: "TABLE_LAYOUT",
            filter: "",
            sort: {
              field: "Priority",
              direction: "ASC",
              steps: ["Click the Ready tab.", "Click Save."]
            }
          }
        ],
        workflows: [
          {
            name: "Auto-add to project",
            steps: ["Click Edit.", "Click Save and turn on workflow."]
          }
        ]
      }
    },
    readJson: () => ({ name: "unused" }),
    run,
    repo: "acme/app",
    apply: false,
    only: ["discussions", "project"]
  });
  assert.deepEqual(results, [
    {
      section: "discussions",
      status: "manual",
      lines: [
        "GitHub has no API for this. Open https://github.com/acme/app/discussions/categories and create each category:",
        "Q&A:",
        "  1. Click New category.",
        "  2. Enter the name Q&A and choose the format Question / Answer.",
        "  3. Click Create.",
        "Each category must appear in the list. Then run `pnpm github:setup --check` again."
      ]
    },
    {
      section: "project",
      status: "manual",
      lines: [
        "GitHub has no API for this. Open https://github.com/users/acme/projects/1 and sort each view:",
        "Ready view:",
        "  1. Click the Ready tab.",
        "  2. Click Save.",
        "Each view must keep its sort after you reload the page. Then run `pnpm github:setup --check` again.",
        "GitHub has no API for this. Open https://github.com/users/acme/projects/1/workflows and turn on each workflow:",
        "Auto-add to project:",
        "  1. Click Edit.",
        "  2. Click Save and turn on workflow.",
        "Each workflow must show On in the list on the left. If one does not, open it and click Save and turn on workflow again. Then run `pnpm github:setup --check` again."
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
