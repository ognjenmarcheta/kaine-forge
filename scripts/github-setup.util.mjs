/**
 * Plans and applies the GitHub repository state in `.github/repo-setup.json`.
 * Pure Node (no workspace deps) so it runs right after cloning a repo made from the template.
 * Every write goes through `gh api`: subcommand flags change between gh versions, the REST and
 * GraphQL endpoints do not.
 */

export const SECTIONS = ["settings", "security", "labels", "rulesets", "discussions", "project"];

/**
 * @typedef {{ status: number | null, stdout: string, stderr: string, error?: Error }} RunResult
 * @typedef {(args: string[], input?: string) => RunResult} Run
 * @typedef {"ok" | "change" | "manual" | "warn" | "fail"} Status
 * @typedef {{ section: string, status: Status, lines: string[] }} SectionResult
 * @typedef {{ name: string, color: string, description: string }} Label
 * @typedef {Record<string, unknown> & { name: string }} Ruleset
 * @typedef {{
 *   repository: Record<string, string | boolean>,
 *   actions: Record<string, string | boolean>,
 *   security: Record<string, boolean>,
 *   rulesets: string[],
 *   labels: Label[],
 *   discussions: { categories: Array<{ slug: string, name: string, format: string }> },
 *   project: {
 *     status: string[],
 *     fields: Array<{ name: string, options: string[] }>,
 *     views: Array<{ name: string, layout: string, filter: string }>,
 *     workflows: Array<{ name: string, steps: string[] }>
 *   }
 * }} Manifest
 * @typedef {Record<string, unknown> & {
 *   permissions?: { admin?: boolean, push?: boolean },
 *   security_and_analysis?: Record<string, { status?: string }>
 * }} RepoInfo
 */

const SCOPE_HINT = "Run `gh auth refresh -s project`, then run this command again.";

export class GhError extends Error {
  /**
   * @param {"missing" | "scope" | "notFound" | "forbidden" | "other"} kind
   * @param {string} message
   */
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

/**
 * @param {RunResult} result
 * @returns {GhError}
 */
function classify(result) {
  if (result.error) {
    return new GhError(
      "missing",
      "gh CLI not found on PATH. Install it from https://cli.github.com"
    );
  }
  const text = `${result.stderr}\n${result.stdout}`;
  const detail = result.stderr.trim().split("\n").slice(-2).join(" ").slice(-300);
  if (/INSUFFICIENT_SCOPES|required scopes/i.test(text)) return new GhError("scope", detail);
  if (/HTTP 404/.test(text)) return new GhError("notFound", detail);
  if (/HTTP 40[13]|HTTP 422/.test(text)) return new GhError("forbidden", detail);
  return new GhError("other", detail || `gh exited with ${result.status}`);
}

/**
 * @param {Run} run
 */
export function createGh(run) {
  /**
   * @param {string[]} args
   * @param {unknown} [body]
   */
  const call = (args, body) => {
    const result = run(args, body === undefined ? undefined : JSON.stringify(body));
    if (result.error || result.status !== 0) throw classify(result);
    const text = result.stdout.trim();
    return text ? JSON.parse(text) : null;
  };
  return {
    /**
     * @param {"GET" | "POST" | "PATCH" | "PUT" | "DELETE"} method
     * @param {string} path
     * @param {unknown} [body]
     */
    api: (method, path, body) =>
      call(
        ["api", "--method", method, path, ...(body === undefined ? [] : ["--input", "-"])],
        body
      ),
    /**
     * @param {string} query
     * @param {Record<string, unknown>} variables
     */
    graphql: (query, variables) => {
      const response = call(["api", "graphql", "--input", "-"], { query, variables });
      if (response?.errors?.length) {
        throw classify({ status: 1, stdout: JSON.stringify(response.errors), stderr: "" });
      }
      return response.data;
    },
    /** @returns {string} */
    currentRepo: () => {
      const result = run(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]);
      if (result.error || result.status !== 0) throw classify(result);
      return result.stdout.trim();
    }
  };
}

/**
 * True when every key that `desired` declares has the same value in `live`. Live API objects
 * carry server-only keys (`id`, `_links`, `source`, new rule parameters) that the file never
 * declares, so a full equality check would report drift on every run.
 * @param {unknown} desired
 * @param {unknown} live
 * @returns {boolean}
 */
export function isSubset(desired, live) {
  // GitHub omits rule parameters that hold their default: `{ "type": "update" }` comes back for
  // a file that declares `update_allows_fetch_and_merge: false`.
  if (live === undefined && desired === false) return true;
  if (Array.isArray(desired)) {
    return (
      Array.isArray(live) &&
      desired.length === live.length &&
      desired.every((item, index) => isSubset(item, live[index]))
    );
  }
  if (desired !== null && typeof desired === "object") {
    if (live === undefined)
      return Object.values(desired).every((value) => isSubset(value, undefined));
    if (live === null || typeof live !== "object" || Array.isArray(live)) return false;
    return Object.entries(desired).every(([key, value]) =>
      isSubset(value, /** @type {Record<string, unknown>} */ (live)[key])
    );
  }
  return desired === live;
}

/**
 * @param {Record<string, unknown>} desired
 * @param {Record<string, unknown>} live
 * @returns {Record<string, unknown>} only the keys whose live value differs
 */
export function planSettings(desired, live) {
  return Object.fromEntries(Object.entries(desired).filter(([key, value]) => live[key] !== value));
}

/**
 * Labels are created or updated, never deleted: a repository may carry labels this file does
 * not know (Dependabot adds `javascript` and `rust`).
 * @param {Label[]} desired
 * @param {Array<{ name: string, color: string, description: string | null }>} live
 */
export function planLabels(desired, live) {
  const byName = new Map(live.map((label) => [label.name, label]));
  /** @type {Label[]} */
  const create = [];
  /** @type {Label[]} */
  const update = [];
  for (const label of desired) {
    const current = byName.get(label.name);
    if (!current) create.push(label);
    else if (
      current.color.toLowerCase() !== label.color.toLowerCase() ||
      (current.description ?? "") !== label.description
    ) {
      update.push(label);
    }
  }
  const known = new Set(desired.map((label) => label.name));
  const extra = live.map((label) => label.name).filter((name) => !known.has(name));
  return { create, update, extra };
}

/**
 * Rulesets match by name, so a second run updates in place instead of adding a duplicate.
 * @param {Ruleset[]} desired
 * @param {Array<{ id: number, body: Ruleset }>} live
 * @returns {Array<{ action: "create" | "update", name: string, id?: number, body: Record<string, unknown> }>}
 */
export function planRulesets(desired, live) {
  return desired.flatMap((body) => {
    const match = live.find((ruleset) => ruleset.body.name === body.name);
    if (!match) return [{ action: "create", name: body.name, body }];
    if (isSubset(body, match.body)) return [];
    return [{ action: "update", name: body.name, id: match.id, body }];
  });
}

/**
 * Single-select options for a project field, or null when no change is needed. Options keep
 * their ids, so items keep their values. On a board with items, options the file does not list
 * stay at the end: dropping one would clear it from every item that uses it.
 * @param {string[]} desired
 * @param {Array<{ id: string, name: string, color: string, description: string }>} live
 * @param {boolean} dropExtras true when no item can use an option (a new or empty board)
 */
export function planOptions(desired, live, dropExtras) {
  const wanted = desired.map((name) => {
    const match = live.find((option) => option.name.toLowerCase() === name.toLowerCase());
    return match
      ? { id: match.id, name, color: match.color, description: match.description }
      : { name, color: "GRAY", description: "" };
  });
  const keep = dropExtras
    ? []
    : live.filter(
        (option) => !desired.some((name) => name.toLowerCase() === option.name.toLowerCase())
      );
  const next = [...wanted, ...keep];
  const same =
    next.length === live.length && next.every((option, index) => option.name === live[index].name);
  return same ? null : next;
}

/**
 * @param {Error} error
 * @returns {Status}
 */
const failureStatus = (error) =>
  error instanceof GhError && ["notFound", "forbidden"].includes(error.kind) ? "warn" : "fail";

/**
 * @typedef {{
 *   gh: ReturnType<typeof createGh>,
 *   owner: string,
 *   name: string,
 *   base: string,
 *   repo: RepoInfo,
 *   manifest: Manifest,
 *   readJson: (path: string) => Ruleset,
 *   apply: boolean
 * }} Context
 */

/** @param {Context} ctx */
function needsAdmin(ctx) {
  return ctx.repo.permissions?.admin
    ? null
    : "needs repository admin rights; run this command as the repository owner";
}

/**
 * @param {string} key
 * @param {unknown} from
 * @param {unknown} to
 */
const changeLine = (key, from, to) => `${key}: ${JSON.stringify(from)} → ${JSON.stringify(to)}`;

/** @param {Context} ctx @returns {SectionResult} */
function settingsSection(ctx) {
  const denied = needsAdmin(ctx);
  if (denied) return { section: "settings", status: "warn", lines: [denied] };
  const { gh, base, apply } = ctx;
  const { fork_pr_contributor_approval: forkPolicy, ...workflow } = ctx.manifest.actions;
  const lines = [];
  let status = /** @type {Status} */ ("ok");

  const repoPatch = planSettings(ctx.manifest.repository, ctx.repo);
  for (const [key, value] of Object.entries(repoPatch)) {
    lines.push(changeLine(key, ctx.repo[key], value));
  }
  const liveWorkflow = gh.api("GET", `${base}/actions/permissions/workflow`);
  const workflowPatch = planSettings(workflow, liveWorkflow);
  for (const [key, value] of Object.entries(workflowPatch)) {
    lines.push(changeLine(`actions.${key}`, liveWorkflow[key], value));
  }
  /** @type {string | null} */
  let liveFork = null;
  try {
    liveFork = gh.api(
      "GET",
      `${base}/actions/permissions/fork-pr-contributor-approval`
    ).approval_policy;
  } catch (error) {
    if (!(error instanceof GhError) || error.kind !== "notFound") throw error;
    lines.push("actions.fork_pr_contributor_approval: not available for this repository");
    status = "warn";
  }
  const forkChange = liveFork !== null && liveFork !== forkPolicy;
  if (forkChange)
    lines.push(changeLine("actions.fork_pr_contributor_approval", liveFork, forkPolicy));

  const changed =
    Object.keys(repoPatch).length > 0 || Object.keys(workflowPatch).length > 0 || forkChange;
  if (changed && apply) {
    if (Object.keys(repoPatch).length > 0) gh.api("PATCH", base, repoPatch);
    if (Object.keys(workflowPatch).length > 0) {
      gh.api("PUT", `${base}/actions/permissions/workflow`, { ...liveWorkflow, ...workflowPatch });
    }
    if (forkChange) {
      gh.api("PUT", `${base}/actions/permissions/fork-pr-contributor-approval`, {
        approval_policy: forkPolicy
      });
    }
  }
  return { section: "settings", status: changed ? "change" : status, lines };
}

/** @param {Context} ctx @returns {SectionResult} */
function securitySection(ctx) {
  const denied = needsAdmin(ctx);
  if (denied) return { section: "security", status: "warn", lines: [denied] };
  const { gh, base, apply } = ctx;
  const desired = ctx.manifest.security;
  const analysis = ctx.repo.security_and_analysis ?? {};
  /** @param {string} path */
  const enabledFlag = (path) => gh.api("GET", `${base}/${path}`)?.enabled === true;
  /** @type {Array<{ key: string, live: () => boolean, set: (on: boolean) => void }>} */
  const toggles = [
    {
      key: "vulnerability_alerts",
      live: () => {
        try {
          gh.api("GET", `${base}/vulnerability-alerts`);
          return true;
        } catch (error) {
          if (error instanceof GhError && error.kind === "notFound") return false;
          throw error;
        }
      },
      set: (on) => gh.api(on ? "PUT" : "DELETE", `${base}/vulnerability-alerts`)
    },
    {
      key: "automated_security_fixes",
      live: () => enabledFlag("automated-security-fixes"),
      set: (on) => gh.api(on ? "PUT" : "DELETE", `${base}/automated-security-fixes`)
    },
    {
      key: "private_vulnerability_reporting",
      live: () => enabledFlag("private-vulnerability-reporting"),
      set: (on) => gh.api(on ? "PUT" : "DELETE", `${base}/private-vulnerability-reporting`)
    },
    ...["secret_scanning", "secret_scanning_push_protection"].map((key) => ({
      key,
      live: () => analysis[key]?.status === "enabled",
      /** @param {boolean} on */
      set: (on) =>
        gh.api("PATCH", base, {
          security_and_analysis: { [key]: { status: on ? "enabled" : "disabled" } }
        })
    }))
  ];

  const lines = [];
  let status = /** @type {Status} */ ("ok");
  for (const toggle of toggles) {
    if (!(toggle.key in desired)) continue;
    const want = desired[toggle.key] === true;
    if (toggle.live() === want) continue;
    lines.push(changeLine(toggle.key, !want, want));
    status = "change";
    if (!apply) continue;
    try {
      toggle.set(want);
    } catch (error) {
      if (failureStatus(/** @type {Error} */ (error)) === "fail") throw error;
      lines.push(`${toggle.key}: not available for this repository or plan`);
      status = "warn";
    }
  }
  return { section: "security", status, lines };
}

/** @param {Context} ctx @returns {SectionResult} */
function labelsSection(ctx) {
  if (!ctx.repo.permissions?.push) {
    return { section: "labels", status: "warn", lines: ["needs write access to the repository"] };
  }
  const { gh, base, apply } = ctx;
  /** @type {Array<{ name: string, color: string, description: string | null }>} */
  const live = [];
  for (let page = 1; ; page += 1) {
    const batch = gh.api("GET", `${base}/labels?per_page=100&page=${page}`);
    live.push(...batch);
    if (batch.length < 100) break;
  }
  const plan = planLabels(ctx.manifest.labels, live);
  const lines = [
    ...plan.create.map((label) => `create ${label.name}`),
    ...plan.update.map((label) => `update ${label.name} (color or description)`)
  ];
  if (apply) {
    for (const label of plan.create) gh.api("POST", `${base}/labels`, label);
    for (const label of plan.update) {
      gh.api("PATCH", `${base}/labels/${encodeURIComponent(label.name)}`, {
        color: label.color,
        description: label.description
      });
    }
  }
  if (plan.extra.length > 0) lines.push(`left as they are: ${plan.extra.join(", ")}`);
  const changed = plan.create.length + plan.update.length > 0;
  return { section: "labels", status: changed ? "change" : "ok", lines };
}

/** @param {Context} ctx @returns {SectionResult} */
function rulesetsSection(ctx) {
  const denied = needsAdmin(ctx);
  if (denied) return { section: "rulesets", status: "warn", lines: [denied] };
  const { gh, base, apply } = ctx;
  const desired = ctx.manifest.rulesets.map(ctx.readJson);
  /** @type {Array<{ id: number, name: string }>} */
  let summaries;
  try {
    summaries = gh.api("GET", `${base}/rulesets?includes_parents=false`);
  } catch (error) {
    if (failureStatus(/** @type {Error} */ (error)) === "fail") throw error;
    return {
      section: "rulesets",
      status: "warn",
      lines: ["rulesets are not available: they need a public repository or GitHub Pro or Team"]
    };
  }
  const wanted = new Set(desired.map((body) => body.name));
  const live = summaries
    .filter((summary) => wanted.has(summary.name))
    .map((summary) => ({ id: summary.id, body: gh.api("GET", `${base}/rulesets/${summary.id}`) }));
  const plan = planRulesets(desired, live);
  if (apply) {
    for (const step of plan) {
      if (step.action === "create") gh.api("POST", `${base}/rulesets`, step.body);
      else gh.api("PUT", `${base}/rulesets/${step.id}`, step.body);
    }
  }
  return {
    section: "rulesets",
    status: plan.length > 0 ? "change" : "ok",
    lines: plan.map((step) => `${step.action} "${step.name}"`)
  };
}

const RECHECK = "Then run `pnpm github:setup --check` again.";

/**
 * Manual steps as the owner follows them: what to open, one click per line, how to confirm.
 * @param {string} open
 * @param {Array<{ title: string, steps: string[] }>} tasks
 * @param {string} confirm
 * @returns {string[]}
 */
const manualSteps = (open, tasks, confirm) => [
  `GitHub has no API for this. Open ${open}`,
  ...tasks.flatMap((task) => [
    `${task.title}:`,
    ...task.steps.map((step, index) => `  ${index + 1}. ${step}`)
  ]),
  `${confirm} ${RECHECK}`
];

/** @param {Context} ctx @returns {SectionResult} */
function discussionsSection(ctx) {
  const data = ctx.gh.graphql(
    `query($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        hasDiscussionsEnabled
        discussionCategories(first: 50) { nodes { slug } }
      }
    }`,
    { owner: ctx.owner, name: ctx.name }
  );
  const repository = data.repository;
  if (!repository.hasDiscussionsEnabled) {
    return ctx.manifest.repository.has_discussions && !ctx.apply
      ? {
          section: "discussions",
          status: "change",
          lines: ["settings turn Discussions on; the default categories appear then"]
        }
      : { section: "discussions", status: "warn", lines: ["Discussions are turned off"] };
  }
  const live = new Set(repository.discussionCategories.nodes.map((node) => node.slug));
  const missing = ctx.manifest.discussions.categories.filter(
    (category) => !live.has(category.slug)
  );
  if (missing.length === 0) return { section: "discussions", status: "ok", lines: [] };
  return {
    section: "discussions",
    status: "manual",
    lines: manualSteps(
      `https://github.com/${ctx.owner}/${ctx.name}/discussions/categories and create each category:`,
      missing.map((category) => ({
        title: category.name,
        steps: [
          "Click New category.",
          `Enter the name ${category.name} and choose the format ${category.format}.`,
          "Click Create."
        ]
      })),
      "Each category must appear in the list."
    )
  };
}

const PROJECT_QUERY = `query($id: ID!) {
  node(id: $id) {
    ... on ProjectV2 {
      id
      title
      url
      items(first: 1) { totalCount }
      fields(first: 50) {
        nodes {
          ... on ProjectV2FieldCommon { id name dataType }
          ... on ProjectV2SingleSelectField { options { id name color description } }
        }
      }
      views(first: 50) { nodes { id name layout filter } }
      workflows(first: 30) { nodes { name enabled } }
    }
  }
}`;

/** @param {Context} ctx @returns {SectionResult} */
function projectSection(ctx) {
  const { gh, apply } = ctx;
  const desired = ctx.manifest.project;
  /** @type {{ id: string, owner: { id: string }, projectsV2: { nodes: Array<{ id: string, title: string, closed: boolean }> } }} */
  let repository;
  try {
    repository = gh.graphql(
      `query($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          id
          owner { id }
          projectsV2(first: 20) { nodes { id title closed } }
        }
      }`,
      { owner: ctx.owner, name: ctx.name }
    ).repository;
  } catch (error) {
    if (error instanceof GhError && error.kind === "scope") {
      return {
        section: "project",
        status: "warn",
        lines: [`gh needs the project scope. ${SCOPE_HINT}`]
      };
    }
    throw error;
  }

  const open = repository.projectsV2.nodes.filter((node) => !node.closed);
  let project = open.find((node) => node.title === ctx.name) ?? open[0];
  const lines = [];
  const created = !project;
  if (created) {
    lines.push(`create board "${ctx.name}" and link it to the repository`);
    if (!apply) {
      lines.push(`add Status options: ${desired.status.join(", ")}`);
      for (const field of desired.fields) lines.push(`create field ${field.name}`);
      for (const view of desired.views) lines.push(`create view ${view.name}`);
      return { section: "project", status: "change", lines };
    }
    project = gh.graphql(
      `mutation($input: CreateProjectV2Input!) { createProjectV2(input: $input) { projectV2 { id } } }`,
      { input: { ownerId: repository.owner.id, title: ctx.name, repositoryId: repository.id } }
    ).createProjectV2.projectV2;
  }

  const board = gh.graphql(PROJECT_QUERY, { id: project.id }).node;
  const fields = board.fields.nodes.filter((field) => field.name);
  const emptyBoard = created || board.items.totalCount === 0;
  let statusChanged = false;

  // "New project" in the GitHub UI names a board "@<login>'s untitled project". Any other title
  // is the owner's choice and stays.
  if (/'s untitled project$/.test(board.title)) {
    lines.push(`rename board "${board.title}" to "${ctx.name}"`);
    if (apply) {
      gh.graphql(
        `mutation($input: UpdateProjectV2Input!) { updateProjectV2(input: $input) { clientMutationId } }`,
        { input: { projectId: board.id, title: ctx.name } }
      );
    }
  }

  for (const spec of [{ name: "Status", options: desired.status }, ...desired.fields]) {
    const field = fields.find((candidate) => candidate.name === spec.name);
    if (!field) {
      lines.push(`create field ${spec.name}`);
      if (apply) {
        gh.graphql(
          `mutation($input: CreateProjectV2FieldInput!) { createProjectV2Field(input: $input) { clientMutationId } }`,
          {
            input: {
              projectId: board.id,
              dataType: "SINGLE_SELECT",
              name: spec.name,
              singleSelectOptions: spec.options.map((name) => ({
                name,
                color: "GRAY",
                description: ""
              }))
            }
          }
        );
      }
      continue;
    }
    const options = planOptions(spec.options, field.options ?? [], emptyBoard);
    if (!options) continue;
    if (spec.name === "Status") statusChanged = true;
    lines.push(`set ${spec.name} options: ${options.map((option) => option.name).join(", ")}`);
    if (apply) {
      gh.graphql(
        `mutation($input: UpdateProjectV2FieldInput!) { updateProjectV2Field(input: $input) { clientMutationId } }`,
        { input: { fieldId: field.id, singleSelectOptions: options } }
      );
    }
  }

  for (const spec of desired.views) {
    const view = board.views.nodes.find((candidate) => candidate.name === spec.name);
    if (view && view.layout === spec.layout && (view.filter ?? "") === spec.filter) continue;
    lines.push(`${view ? "update" : "create"} view ${spec.name}`);
    if (!apply) continue;
    const viewId =
      view?.id ??
      gh.graphql(
        `mutation($input: CreateProjectV2ViewInput!) { createProjectV2View(input: $input) { projectV2View { id } } }`,
        { input: { projectId: board.id, name: spec.name, layout: spec.layout } }
      ).createProjectV2View.projectV2View.id;
    // A new view only needs a second call to set its filter.
    if (view || spec.filter) {
      gh.graphql(
        `mutation($input: UpdateProjectV2ViewInput!) { updateProjectV2View(input: $input) { clientMutationId } }`,
        { input: { viewId, layout: spec.layout, filter: spec.filter } }
      );
    }
  }

  // A workflow that sets Status keeps pointing at an option this run removed, and the API cannot
  // read or change its target, so a Status change repeats every workflow step.
  const manual = desired.workflows
    .filter(
      (spec) =>
        statusChanged ||
        !board.workflows.nodes.some((node) => node.name === spec.name && node.enabled)
    )
    .map((spec) => ({ title: spec.name, steps: spec.steps }));
  const status = lines.length > 0 ? "change" : manual.length > 0 ? "manual" : "ok";
  if (manual.length > 0) {
    lines.push(
      ...manualSteps(
        `${board.url}/workflows and turn on each workflow:`,
        manual,
        "Each workflow must show On in the list on the left. If one does not, open it and click Save and turn on workflow again."
      )
    );
  }
  return { section: "project", status, lines };
}

const RUNNERS = {
  settings: settingsSection,
  security: securitySection,
  labels: labelsSection,
  rulesets: rulesetsSection,
  discussions: discussionsSection,
  project: projectSection
};

/**
 * Runs each selected section in order. A section that fails does not stop the next one.
 * @param {{
 *   manifest: Manifest,
 *   readJson: (path: string) => Ruleset,
 *   run: Run,
 *   repo?: string,
 *   apply: boolean,
 *   only?: string[]
 * }} options
 * @returns {{ repo: string, results: SectionResult[] }}
 */
export function runSetup({ manifest, readJson, run, repo, apply, only = SECTIONS }) {
  const unknown = only.filter((section) => !SECTIONS.includes(section));
  if (unknown.length > 0) {
    throw new Error(`Unknown section: ${unknown.join(", ")}. Use ${SECTIONS.join(", ")}.`);
  }
  const gh = createGh(run);
  const nameWithOwner = repo ?? gh.currentRepo();
  const [owner, name] = nameWithOwner.split("/");
  const base = `repos/${owner}/${name}`;
  /** @type {Context} */
  const ctx = { gh, owner, name, base, repo: gh.api("GET", base), manifest, readJson, apply };
  const results = SECTIONS.filter((section) => only.includes(section)).map((section) => {
    try {
      return RUNNERS[/** @type {keyof typeof RUNNERS} */ (section)](ctx);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { section, status: /** @type {Status} */ ("fail"), lines: [message] };
    }
  });
  return { repo: nameWithOwner, results };
}

/**
 * Dry runs and applies fail only on errors. `--check` also fails on pending changes and on
 * steps that wait for a human, so agents and CI can tell "done" from "not yet".
 * @param {SectionResult[]} results
 * @param {"plan" | "apply" | "check"} mode
 */
export function exitCodeFor(results, mode) {
  const failing = mode === "check" ? ["fail", "change", "manual"] : ["fail"];
  return results.some((result) => failing.includes(result.status)) ? 1 : 0;
}
