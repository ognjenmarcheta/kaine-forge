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
 *     shortDescription?: string,
 *     readme?: string,
 *     status: string[],
 *     fields: Array<{ name: string, options: string[] }>,
 *     views: Array<{
 *       name: string,
 *       layout: string,
 *       filter: string,
 *       fields?: string[],
 *       sort?: { field: string, direction: string, steps: string[] }
 *     }>,
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
  // gh prints "HTTP 404" for most errors, but a validation error shows only its message and
  // keeps the status in the JSON body: `"status":"422"`.
  const httpStatus = (text.match(/HTTP (\d{3})/) ?? text.match(/"status":\s*"?(\d{3})/))?.[1];
  if (httpStatus === "404") return new GhError("notFound", detail);
  if (["401", "403", "422"].includes(httpStatus ?? "")) return new GhError("forbidden", detail);
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
 * @typedef {{
 *   gh: ReturnType<typeof createGh>,
 *   owner: string,
 *   name: string,
 *   base: string,
 *   repo: RepoInfo,
 *   manifest: Manifest,
 *   readJson: (path: string) => Ruleset,
 *   readText: (path: string) => string,
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

/**
 * True for errors GitHub returns when a feature does not exist for this repository: private
 * repositories have no fork approval or private vulnerability reporting, and plans differ.
 * @param {unknown} error
 */
const isUnavailable = (error) =>
  error instanceof GhError && (error.kind === "notFound" || error.kind === "forbidden");

const UNAVAILABLE = "not available for this repository or plan";

/**
 * A group of settings read from and written to one endpoint.
 * @typedef {{
 *   prefix: string,
 *   keys: string[],
 *   read: () => Record<string, unknown>,
 *   write: (live: Record<string, unknown>, patch: Record<string, unknown>) => void
 * }} SettingsGroup
 */

/** @param {Context} ctx @returns {SectionResult} */
function settingsSection(ctx) {
  const denied = needsAdmin(ctx);
  if (denied) return { section: "settings", status: "warn", lines: [denied] };
  const { gh, base, apply } = ctx;
  const desired = { ...ctx.manifest.repository, ...ctx.manifest.actions };
  /** @type {SettingsGroup[]} */
  const groups = [
    {
      prefix: "",
      keys: Object.keys(ctx.manifest.repository),
      read: () => ctx.repo,
      write: (_live, patch) => gh.api("PATCH", base, patch)
    },
    {
      prefix: "actions.",
      keys: ["sha_pinning_required"],
      read: () => gh.api("GET", `${base}/actions/permissions`),
      // PUT replaces the policy, so it repeats the two values this file does not manage.
      write: (live, patch) =>
        gh.api("PUT", `${base}/actions/permissions`, {
          enabled: live.enabled,
          allowed_actions: live.allowed_actions,
          ...patch
        })
    },
    {
      prefix: "actions.",
      keys: ["default_workflow_permissions", "can_approve_pull_request_reviews"],
      read: () => gh.api("GET", `${base}/actions/permissions/workflow`),
      write: (live, patch) =>
        gh.api("PUT", `${base}/actions/permissions/workflow`, { ...live, ...patch })
    },
    {
      prefix: "actions.",
      keys: ["fork_pr_contributor_approval"],
      read: () => ({
        fork_pr_contributor_approval: gh.api(
          "GET",
          `${base}/actions/permissions/fork-pr-contributor-approval`
        ).approval_policy
      }),
      write: (_live, patch) =>
        gh.api("PUT", `${base}/actions/permissions/fork-pr-contributor-approval`, {
          approval_policy: patch.fork_pr_contributor_approval
        })
    }
  ];

  const lines = [];
  let changed = false;
  let unavailable = false;
  for (const group of groups) {
    const wanted = Object.fromEntries(
      group.keys.filter((key) => key in desired).map((key) => [key, desired[key]])
    );
    if (Object.keys(wanted).length === 0) continue;
    /** @type {Record<string, unknown>} */
    let live;
    try {
      live = group.read();
    } catch (error) {
      if (!isUnavailable(error)) throw error;
      lines.push(`${group.prefix}${Object.keys(wanted).join(", ")}: ${UNAVAILABLE}`);
      unavailable = true;
      continue;
    }
    const patch = planSettings(wanted, live);
    if (Object.keys(patch).length === 0) continue;
    changed = true;
    for (const [key, value] of Object.entries(patch)) {
      lines.push(changeLine(`${group.prefix}${key}`, live[key], value));
    }
    if (apply) group.write(live, patch);
  }
  const status = changed ? "change" : unavailable ? "warn" : "ok";
  return { section: "settings", status, lines };
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
  /** @param {string} path */
  const endpoint = (path) => ({
    live: () => enabledFlag(path),
    /** @param {boolean} on */
    set: (on) => gh.api(on ? "PUT" : "DELETE", `${base}/${path}`)
  });
  /** @type {Record<string, { live: () => boolean, set: (on: boolean) => void }>} */
  const toggles = {
    vulnerability_alerts: {
      // 204 means on. 404 means off, so it is not "unavailable" here.
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
    automated_security_fixes: endpoint("automated-security-fixes"),
    private_vulnerability_reporting: endpoint("private-vulnerability-reporting"),
    immutable_releases: endpoint("immutable-releases"),
    ...Object.fromEntries(
      ["secret_scanning", "secret_scanning_push_protection"].map((key) => [
        key,
        {
          // GitHub leaves out a feature the repository cannot use (a private repository on a
          // free plan has no `security_and_analysis` at all).
          live: () => {
            if (!analysis[key]) throw new GhError("notFound", UNAVAILABLE);
            return analysis[key].status === "enabled";
          },
          /** @param {boolean} on */
          set: (on) =>
            gh.api("PATCH", base, {
              security_and_analysis: { [key]: { status: on ? "enabled" : "disabled" } }
            })
        }
      ])
    )
  };

  const lines = [];
  let changed = false;
  let unavailable = false;
  for (const [key, want] of Object.entries(desired)) {
    const toggle = toggles[key];
    if (!toggle) throw new Error(`Unknown security setting: ${key}`);
    try {
      if (toggle.live() === want) continue;
      lines.push(changeLine(key, !want, want));
      changed = true;
      if (apply) toggle.set(want);
    } catch (error) {
      if (!isUnavailable(error)) throw error;
      lines.push(`${key}: ${UNAVAILABLE}`);
      unavailable = true;
    }
  }
  const status = changed ? "change" : unavailable ? "warn" : "ok";
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
    if (!isUnavailable(error)) throw error;
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
      shortDescription
      readme
      url
      items(first: 1) { totalCount }
      fields(first: 50) {
        nodes {
          ... on ProjectV2FieldCommon { id name dataType }
          ... on ProjectV2SingleSelectField { options { id name color description } }
        }
      }
      views(first: 50) {
        nodes {
          id
          name
          layout
          filter
          fields(first: 30) { nodes { ... on ProjectV2FieldCommon { name } } }
          sortByFields(first: 5) {
            nodes { direction field { ... on ProjectV2FieldCommon { name } } }
          }
        }
      }
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

  let board = gh.graphql(PROJECT_QUERY, { id: project.id }).node;
  let fields = board.fields.nodes.filter((field) => field.name);
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

  /** @type {Record<string, string>} */
  const about = {};
  if (
    desired.shortDescription !== undefined &&
    board.shortDescription !== desired.shortDescription
  ) {
    about.shortDescription = desired.shortDescription;
  }
  const readme = desired.readme ? ctx.readText(desired.readme).trim() : undefined;
  if (readme !== undefined && (board.readme ?? "").trim() !== readme) about.readme = readme;
  if (Object.keys(about).length > 0) {
    lines.push(`update board ${Object.keys(about).join(" and ")}`);
    if (apply) {
      gh.graphql(
        `mutation($input: UpdateProjectV2Input!) { updateProjectV2(input: $input) { clientMutationId } }`,
        { input: { projectId: board.id, ...about } }
      );
    }
  }

  let fieldsCreated = false;

  for (const spec of [{ name: "Status", options: desired.status }, ...desired.fields]) {
    const field = fields.find((candidate) => candidate.name === spec.name);
    if (!field) {
      lines.push(`create field ${spec.name}`);
      fieldsCreated = true;
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

  // Views show fields by id, so read the ids of fields this run created.
  if (apply && fieldsCreated) {
    board = gh.graphql(PROJECT_QUERY, { id: board.id }).node;
    fields = board.fields.nodes.filter((field) => field.name);
  }
  /** @param {{ name: string, fields?: string[] }} spec */
  const visibleFieldIds = (spec) =>
    spec.fields?.map((name) => {
      const field = fields.find((candidate) => candidate.name === name);
      if (!field) throw new Error(`View ${spec.name} shows an unknown field: ${name}`);
      return field.id;
    });

  for (const spec of desired.views) {
    const view = board.views.nodes.find((candidate) => candidate.name === spec.name);
    const shown = view?.fields.nodes.map((node) => node.name).filter(Boolean) ?? [];
    // GitHub stores visible fields in its own order (built-in fields first), so compare the set.
    const fieldsDiffer =
      spec.fields !== undefined &&
      (shown.length !== spec.fields.length || spec.fields.some((name) => !shown.includes(name)));
    if (
      view &&
      view.layout === spec.layout &&
      (view.filter ?? "") === spec.filter &&
      !fieldsDiffer
    ) {
      continue;
    }
    lines.push(`${view ? "update" : "create"} view ${spec.name}`);
    if (!apply) continue;
    const configuration = spec.fields ? { visibleFieldIds: visibleFieldIds(spec) } : undefined;
    const viewId =
      view?.id ??
      gh.graphql(
        `mutation($input: CreateProjectV2ViewInput!) { createProjectV2View(input: $input) { projectV2View { id } } }`,
        { input: { projectId: board.id, name: spec.name, layout: spec.layout, configuration } }
      ).createProjectV2View.projectV2View.id;
    // A new view only needs a second call to set its filter.
    if (view || spec.filter) {
      gh.graphql(
        `mutation($input: UpdateProjectV2ViewInput!) { updateProjectV2View(input: $input) { clientMutationId } }`,
        { input: { viewId, layout: spec.layout, filter: spec.filter, configuration } }
      );
    }
  }

  // GitHub can read a view's sort but not set it, so the owner sorts by hand.
  const sorts = desired.views
    .filter((spec) => {
      if (!spec.sort) return false;
      const live = board.views.nodes.find((candidate) => candidate.name === spec.name)?.sortByFields
        .nodes;
      return !(
        live?.length === 1 &&
        live[0].field?.name === spec.sort.field &&
        live[0].direction === spec.sort.direction
      );
    })
    .map((spec) => ({ title: `${spec.name} view`, steps: spec.sort?.steps ?? [] }));

  // A workflow that sets Status keeps pointing at an option this run removed, and the API cannot
  // read or change its target, so a Status change repeats every workflow step.
  const manual = desired.workflows
    .filter(
      (spec) =>
        statusChanged ||
        !board.workflows.nodes.some((node) => node.name === spec.name && node.enabled)
    )
    .map((spec) => ({ title: spec.name, steps: spec.steps }));
  const status = lines.length > 0 ? "change" : manual.length + sorts.length > 0 ? "manual" : "ok";
  if (sorts.length > 0) {
    lines.push(
      ...manualSteps(
        `${board.url} and sort each view:`,
        sorts,
        "Each view must keep its sort after you reload the page."
      )
    );
  }
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
 *   readText?: (path: string) => string,
 *   run: Run,
 *   repo?: string,
 *   apply: boolean,
 *   only?: string[]
 * }} options
 * @returns {{ repo: string, results: SectionResult[] }}
 */
export function runSetup({
  manifest,
  readJson,
  readText = () => "",
  run,
  repo,
  apply,
  only = SECTIONS
}) {
  const unknown = only.filter((section) => !SECTIONS.includes(section));
  if (unknown.length > 0) {
    throw new Error(`Unknown section: ${unknown.join(", ")}. Use ${SECTIONS.join(", ")}.`);
  }
  const gh = createGh(run);
  const nameWithOwner = repo ?? gh.currentRepo();
  const [owner, name] = nameWithOwner.split("/");
  const base = `repos/${owner}/${name}`;
  /** @type {Context} */
  const ctx = {
    gh,
    owner,
    name,
    base,
    repo: gh.api("GET", base),
    manifest,
    readJson,
    readText,
    apply
  };
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
