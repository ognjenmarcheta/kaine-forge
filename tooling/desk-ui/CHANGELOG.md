# @repo/desk-ui

## 0.6.1

### Patch Changes

- Updated dependencies [1d503d9]
  - @repo/desk@0.6.1
  - @repo/theme@0.2.0
  - @repo/translation@1.15.0
  - @repo/ui@2.1.0

## 0.6.0

### Minor Changes

- d1325ed: The issue header shows the active time of a finished issue beside the total. The active time
  leaves out the waits at a gate, the open pull request, and a stop in `needs-you`, so a PR that
  sat on GitHub for hours no longer counts as work.
- 1a3fc0f: Every agent now has an avatar, an icon on a theme tone, which the agent file sets with an optional `avatar` field and the agent editor picks; an agent without one gets a stable default from its id, and the avatar is not part of the definition or snapshot hash.
- cef5a53: The agent desk adds two lab jobs (ADR 0021). Build component plans a new @repo/ui component, waits
  for your approval of the plan, then builds it with its test and a lab specimen, and opens a draft
  PR with its changeset. Audit screen checks a lab screen against the UI guidelines, WCAG 2.2, and
  its reference image, and files only the findings you tick. The lab gains a Specimens page.
- cd5c89e: The agent desk keeps watching a promoted lesson. `pnpm desk lessons` and the **Promoted lessons**
  list show the times and the issues a promoted lesson's problem came back after the promotion, so an
  encoding that did not cover the problem can be revised or removed. The lessons report gives each
  promoted lesson a `recurrence` field.
- cc50650: The agent desk can fix a PR until merge. The Board's Open pull requests list shows each PR's CI and
  review state. A desk PR offers Check CI and comments, which reads what a fix round would read and
  keeps a summary, and Address feedback, which runs the PR feedback round. A fresh list notices a
  merged desk PR and moves its issue to done with the merge date, which the Done list shows and sorts
  by. A new PR carries its issue's `source:*` labels, and the desk trusts the usual review bots
  (CodeRabbit, GitHub Actions, Copilot) by default.
- bdbfa41: The agent desk has a new look and new names. A sidebar groups the pages: Inbox and All work,
  Flows, Agents and Setup, Insights and Scorecard, and Lab. The Inbox (was the Board's Your turn)
  shows Stopped, Your decision, and Merge on GitHub, with desk jobs beside issues, unread marks, and
  a first-run guide; All work lists everything as a list or in columns. New work starts an issue or a
  desk job from one dialog. The item page has a steps rail, Details tabs (History, Files and outputs,
  Agent runs), a single choice list when work stopped, Tell the agent and Pause side by side while it
  runs, and line comments on the review diff for the builder. Health is now Setup and Runs is now
  Insights; the Lab has Components, Tokens, Screens, and Compare tabs. Preferences add density and
  keeping an undo message while the pointer is on it. Old `?view=health` and `?view=stats` addresses
  open the Inbox.
- a554319: A report step can go anywhere in a flow. A gate after the plan stays the plan approval when
  report steps sit between them, and the validator applies the same rule. Every agent step now
  reads the reports of earlier report steps as fenced advice, and a rerun after feedback also reads
  the reports on its earlier output. The plan gate shows the reports on the plan.
- 5c0f6b4: A desk stop that comes from a command the desk refused to an agent now has two buttons on the issue card: "Allow this command and retry" and "Skip it and continue". Allow keeps the exact command for that issue only, as one exact allow rule, and the desk never offers a command that its deny rules refuse. Skip tells the agent to leave the command out. The new `resolve-denial` action and the `deniedCommands` field of the issue detail carry it.
- 4c41c94: The agent desk runs the monorepo scorecard as a desk job (ADR 0021). Run scorecard on the
  Scorecard view starts it: the engine runs the checks and the GitHub reads, one Claude run scores
  with kaine-explorer subagents under a dollar budget and a time limit, and the engine writes the
  ledger. At the job's gate you preview the new scores and tick the issues to file; approve files
  them and opens a draft PR with the ledger. Desk agent runs can now carry a budget
  (`--max-budget-usd`), and issue-less branches are named `KAINE-<type>-<slug>`.
- cc50650: The Scorecard view tracks scorecard work end to end. Scorecard and audit jobs label the issues they
  file `source:scorecard` and `source:audit`, the ledger PR gets `source:scorecard`, and ship writes
  each filed issue's number on its finding. The view reads the scorecard's issues live from GitHub
  and shows Recently solved (with the dimension's score change), each finding's issue, PR, and desk
  run, Fix with desk, findings sorts, and a confirmed backfill of the label on older issues.
- 87b8219: The agent desk has a Scorecard view. `GET /api/scorecard` reads the monorepo health ledger of the
  checkout through one contract, and the view shows the selected run's scores and their change, the
  overall trend, each dimension's reasons, the open findings, and the diagrams. The desk preferences
  also choose the theme (Byte Forge or Moss). `pnpm scorecard` no longer writes `scorecard-out/`.
- 2271b43: The agent desk recreates a reference image as a lab screen in a desk job (ADR 0021). Recreate
  screen in the Lab view uploads the image; the job builds the screen in its own worktree and lab
  server with the Playwright browser, may write only its screen folder, and passes the lab checks
  and `lab:diff`. At the gate you open the live compare view, then approve to push the folder as a
  draft PR.
- e4a6c42: The agent desk adds the specialist job (ADR 0021). Run a specialist in New work, or Run on a report
  agent in Agents, runs one report agent from the agent library, such as a built-in specialist,
  against a repository path, a GitHub issue, or your brief, without an issue run. The agent reads and
  reports; you read the report at the gate and close the job. Nothing is pushed or filed.
- 27abb62: The agent desk lets the owner reach a running agent (ADR 0022). Steer sends a note: the agent
  stops and goes on in the same session with it, or starts again with it when it had no session
  yet. Take over stops a plan or change agent so the
  owner works in its session; continue or feedback hands it back. Both are on the running issue's
  card and in the HTTP API.
- 87b8219: The UI lab is now the agent desk's Lab view (`?view=lab`, G then L), and `@repo/ui-lab` is gone.
  `pnpm lab` starts the desk UI dev server; the lab opens without a desk server. `lab-frame.html`
  shows the lab alone for the compare view and `lab:shots`/`lab:diff`, and it is the one desk page
  that the desk itself may frame. Lab themes load as a constructed stylesheet under the desk CSP.

### Patch Changes

- 6a13c9b: The PR-review gate has an Apply fix button on each finding that has a suggested fix. It queues the
  fix as a comment for the builder. A strip shows the comments not sent, and Send back lists them
  and sends them with your note. The ship dialog now warns when comments are not sent.
- d9eecbc: A desk job page now updates while the job runs. The server sent `job-updated` and `job-removed`
  events, but the browser did not listen for them, so a job page stayed on its first state until a
  reload.
- b1b7350: The agent desk no longer stops when a provider CLI is missing. Before each run it checks which of Claude Code, Codex, and OpenCode run, keeps the provider the role asks for when it can, and otherwise moves the run to the best other one with a note in the history. Desk jobs follow the same rule. A new config opt-in, `allowCodexBuilder`, lets Codex change code, and Setup offers it as a fix. A step that no CLI can run stops with the new code `no-provider`, and the step rail names the provider that ran.
- d2ade33: The scorecard review gate now reads top to bottom: the score tiles and the plain-language result,
  the dimensions that moved, each open question in its own numbered block, the proposed issues as
  cards with label tags, and the decision. The technical summary and evidence are folded. The other
  job gates use the same question blocks and issue cards. The scorer prompt asks for a summary of
  at most three sentences.
- Updated dependencies [d1325ed]
- Updated dependencies [1a3fc0f]
- Updated dependencies [d947f31]
- Updated dependencies [91e33eb]
- Updated dependencies [6a13c9b]
- Updated dependencies [cef5a53]
- Updated dependencies [79327c2]
- Updated dependencies [40b44ce]
- Updated dependencies [d9eecbc]
- Updated dependencies [cd5c89e]
- Updated dependencies [a4943a9]
- Updated dependencies [cc50650]
- Updated dependencies [b1b7350]
- Updated dependencies [d2ade33]
- Updated dependencies [bdbfa41]
- Updated dependencies [a554319]
- Updated dependencies [5c0f6b4]
- Updated dependencies [69d84bb]
- Updated dependencies [4c41c94]
- Updated dependencies [cc50650]
- Updated dependencies [87b8219]
- Updated dependencies [2271b43]
- Updated dependencies [e4a6c42]
- Updated dependencies [27abb62]
- Updated dependencies [bdbfa41]
- Updated dependencies [87b8219]
- Updated dependencies [5a9cb42]
- Updated dependencies [a9a2d2c]
- Updated dependencies [a9a2d2c]
- Updated dependencies [3e8bb66]
- Updated dependencies [bdbfa41]
  - @repo/desk@0.6.0
  - @repo/translation@1.15.0
  - @repo/theme@0.2.0
  - @repo/ui@2.1.0

## 0.5.7

### Patch Changes

- Updated dependencies [474e9c1]
- Updated dependencies [4bf3bde]
- Updated dependencies [6f6690c]
- Updated dependencies [6980f5e]
  - @repo/translation@1.14.0
  - @repo/ui@2.0.1

## 0.5.6

### Patch Changes

- e64ae54: Themes are now data in the new `@repo/theme` package. Byte Forge stays the default with unchanged colors, and Moss is an example custom theme. `pnpm theme:build` writes the web tokens and utilities, the mobile tokens, the NativeWind preset tokens, and each theme's `DESIGN.md`. It fails when a theme misses WCAG 2.2 AA contrast or the 24px target size. `createTheme` derives a full theme from a brand color, a neutral tint, fonts, density, and depth. `pnpm ui:check` runs the accessibility and UI lint rules, and `pnpm lab` previews themes and components.

  Breaking changes:

  - `@repo/ui`: the web gets theme utilities (`bg-ds-surface-raised`, `p-ds-200`, `text-body`, `rounded-card`, `shadow-card`), and the default Tailwind palette, font sizes, radii, and shadows generate no CSS. Replace `text-sm` with `text-body`, `text-xs` with `text-body-sm`, and `bg-[var(--ds-*)]` with the matching utility.
  - `@repo/ui` and `@repo/config`: 127 unused tokens are removed, including the accent hues and the attention, severe, open, closed, and done families. `--ds-lineHeight-*` is renamed `--ds-line-height-*`, and the `--ds-base-*` tier is gone.
  - The root element now carries `data-color-mode="light|dark"`, and `data-theme` names the theme. The Tailwind `dark:` variant follows `data-color-mode`.
  - `@repo/mobile-ui`: `nativeThemeTokens` is keyed by theme name, and the `fontFamilies` export is removed. Wrap the app in `ThemeRoot` and read colors with `useThemeTokens()`.
  - `@repo/translation`: `navigation.theme*` and `desk.prefs.theme*` are now `navigation.appearance*` and `desk.prefs.appearance*`, and the label reads "Appearance".
  - `@repo/ui`: `AvatarGroup` requires an `aria-label`, and with `max` an `overflowLabel`.

  New components: `Table`, `SegmentedControl`, `Kbd`, `ProportionBar`, and the charts `LineChart`, `BarChart`, `DonutChart`, `RadialProgress`, and `Sparkline` in `@repo/ui`; `ProgressBar`, `DonutChart`, and `BarChart` in `@repo/mobile-ui`. Chart series take a fixed `color` (a chart slot, a role, or `"neutral"`), and the charts add dashed lines, reference lines, value labels, a highlighted bar, legend positions, and hidden axes.

  Shared components gain what designs kept rebuilding. `Button` has `appearance="outline"` and `spacing="icon"`. `CardTitle` takes `as`. `StatCard` takes any value node, an `icon`, a `delta` badge, a `description`, and an `action`. `Checkbox` draws the indeterminate state and has a 24px hit area. `Banner` has `emphasis="subtle"`, and it is a polite `status` unless `urgent`. `Table` scrolls by keyboard when it overflows and takes `scrollLabel`. `AppSidebar` holds its parts in one navigation landmark named by `label`. `CommandMenu` returns focus to where it opened. Web fields and selects are 40px high.

  The `@repo/ui` CSS now sits in cascade layers, so a utility in `className` wins over a component's own CSS. The new `ui/no-reset-default` lint rule reports Tailwind defaults that the theme removes, such as `rounded`, `text-sm`, and `bg-red-500`, and the motion tokens are used through `duration-*` and `ease-standard` instead of arbitrary values.

  A second round added `appearance="raised"` on `Button`, `FilterMenu`, `CardAction`, `TopNav`, `StatCard` part slots and a `visual` slot, `AvatarFallback` tones, `PageHeader size="display"`, `CopyButton labelSuffix`, chart dots, annotations, gradient areas, bar tracks, horizontal bars and highlight colors, a colored `RadialProgress`, and `Gauge`. A focus ring no longer fades in, a labelled sidebar group is a named group, a sidebar count describes its link, and the contrast check now covers role borders, chart colors, and raised fills on cards and sunken areas.

  Themes gain a `display` type step (`text-display`), per-step `type` changes and a `color.darkSurface` lightness in `createTheme`, and the motion utilities `duration-control`, `duration-overlay`, `duration-drawer`, and `ease-standard`. In dark mode, derived cards sit one step above the page and sunken areas one step below it, and the contrast check also measures text, charts, and role borders on cards and sunken areas. Field borders now reach 3:1 against the surface, and the email fallback link now reaches 4.5:1.

- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
- Updated dependencies [e64ae54]
  - @repo/ui@2.0.0
  - @repo/translation@1.13.0
  - @repo/desk@0.5.2

## 0.5.5

### Patch Changes

- Updated dependencies [54c80df]
- Updated dependencies [4dcc509]
- Updated dependencies [0100b46]
- Updated dependencies [a26fb69]
  - @repo/desk@0.5.2
  - @repo/translation@1.12.0
  - @repo/ui@1.10.0

## 0.5.4

### Patch Changes

- Updated dependencies [729d942]
- Updated dependencies [1e5e82d]
- Updated dependencies [a54d7ff]
- Updated dependencies [fc6f746]
- Updated dependencies [d1fa587]
- Updated dependencies [8be54b9]
- Updated dependencies [a9cc2b2]
- Updated dependencies [5752644]
- Updated dependencies [6839bae]
- Updated dependencies [4e3873d]
- Updated dependencies [a2b6d40]
  - @repo/ui@1.9.0
  - @repo/translation@1.11.0
  - @repo/desk@0.5.1

## 0.5.3

### Patch Changes

- Updated dependencies [12ad7c5]
- Updated dependencies [2ddc1a9]
  - @repo/ui@1.8.0
  - @repo/translation@1.10.0

## 0.5.2

### Patch Changes

- Updated dependencies [6d93644]
  - @repo/ui@1.7.2

## 0.5.1

### Patch Changes

- 22dd10f: Derive a flow step's role in one contract function and send it on `FlowStepView.role`. Only a ship gate accepts a ship confirmation, so the CLI no longer suggests `ship --confirm` before an automatic ship.
- Updated dependencies [a1c0431]
- Updated dependencies [40cca08]
- Updated dependencies [ccdac99]
- Updated dependencies [40cca08]
- Updated dependencies [22dd10f]
  - @repo/ui@1.7.1
  - @repo/translation@1.9.1
  - @repo/desk@0.5.1

## 0.5.0

### Minor Changes

- 500e8a7: Make the agent desk's flows and agents configurable data: issues run on a frozen flow snapshot through one interpreter, agents resolve presets against a policy floor and record a capability receipt per run, and definitions save locally and promote to `.desk/`. The desk UI adds the Flows and Agents pages, a flow picker on Start, the issue's flow in its header and stages, and capability receipts in the stage side sheet, with new `desk` translation keys.
- 500e8a7: Add `pnpm doc:export`, which exports a small Markdown subset to Word (`.docx`) and PowerPoint (`.pptx`) files with the same bytes for the same input, and verifies exported files with `--verify`. The tool keeps its input and output inside the repository and outside dot-directories, `node_modules`, and the desk's protected paths. Agent Desk agents gain opt-in extra tools (`capabilities.tools`, catalog `doc-export`) for the edit-code preset: the resolver allows exactly `pnpm doc:export`, the capability profile and run receipt list `extraTools`, and the Agents page adds an Extra tools field with new `desk` translation keys.

### Patch Changes

- Updated dependencies [527509e]
- Updated dependencies [500e8a7]
- Updated dependencies [500e8a7]
- Updated dependencies [b7011e2]
  - @repo/ui@1.7.0
  - @repo/desk@0.5.0
  - @repo/translation@1.9.0

## 0.4.0

### Minor Changes

- 4f69756: Redesign the agent desk around the owner's turn. The board opens on Your turn with quick and batch approve for low-risk plans, the issue page has a short header, decision gates with plan risk and file review, a trace of every step, and a stage side sheet, and the shell adds a command palette, shortcuts, an 8-second undo window, and opt-in notifications. Health shows setup progress, Runs adds today's summary, seven-day cards, and cost by role, and lessons can be promoted, unpromoted, or turned into a GitHub issue after the owner confirms the exact text. The engine records plan risk, pause and resume, approve notes, and a seven-day series, and the design system adds the tokens the desk uses.

### Patch Changes

- Updated dependencies [4f69756]
  - @repo/desk@0.4.0
  - @repo/translation@1.8.0
  - @repo/ui@1.6.0

## 0.3.0

### Minor Changes

- 3408a45: Adopt the Byteforge brand as the default light and dark themes. The palette uses one orange for actions, selection, links, and focus, on cool white and ink-black neutrals, with matching success, information, warning, and danger roles and a darker amber severe role. Text on orange fills uses the new `--ds-text-brand-inverse` token so it meets WCAG AA, and a contrast contract test checks the key pairs in both themes. Web, desktop, and mobile use Geist and Geist Mono, self-hosted. Shapes follow the site: pill buttons, 8px inputs, 12px menus, and 20px cards and dialogs. Shadows are ink-tinted, the easing is a quick ease-out, and buttons scale to `--ds-motion-press-scale` (0.97) on press. This replaces `--ds-motion-distance-press`, and `@repo/mobile-ui` exports `motionPressScale` and `fontFamilies` and drops `motionDistances.press`. A new mark, an olive tree growing through the Byteforge anvil, replaces the app icons, favicon, and README logo, and its Blender source and render script are in `media/brand/`.

### Patch Changes

- Updated dependencies [3408a45]
- Updated dependencies [040fc60]
  - @repo/ui@1.5.0
  - @repo/desk@0.3.2
  - @repo/translation@1.7.0

## 0.2.2

### Patch Changes

- Updated dependencies [5d411b1]
  - @repo/desk@0.3.1

## 0.2.1

### Patch Changes

- Updated dependencies [6a30ea3]
  - @repo/desk@0.3.0
  - @repo/translation@1.7.0

## 0.2.0

### Minor Changes

- 5786f03: Intake drafts grade the issue's fit for an agent run: clarity, complexity, and verifiability from 1 to 3, with the lowest grade as the confidence. `desk draft` and the draft dialog show the grades, and `desk start` warns, without blocking, when the scored body has confidence 1.
- 078f259: Send PR feedback back to the builder after ship. At `pr-open`, `pnpm desk feedback <n> --from-pr [text]` (and the `pr-feedback` action, **Send PR feedback** in the UI) reads the failing checks with their log tail and the reviews and comments of trusted accounts on the PR head, redacts, cuts, and fences that text, adds the owner's optional note, and runs build, check, and review again. It refuses with `pr-refused` and changes nothing unless the PR is open, its head is the clean worktree HEAD, and there is something to send. The ship of such a round updates the open PR: no rebase, a plain push to the same branch, no new PR, and a fresh read of the PR right before the push.
- 078f259: Add a `pr-open` stage after `ship`. The desk waits there while the owner reviews and merges the draft PR on GitHub. `pnpm desk refresh <n>` (and the `refresh-pr` action, **Check the PR** in the UI) reads the PR once: merged ends the issue at `shipped`, closed ends it at `cancelled`, open changes nothing. The desk does not poll, and it never merges, approves, marks a PR ready, enables auto-merge, or force-pushes. The issue state counts PR feedback rounds against the new `maxPrRounds` config (default 3).

### Patch Changes

- Updated dependencies [5786f03]
- Updated dependencies [078f259]
- Updated dependencies [078f259]
  - @repo/desk@0.2.0
  - @repo/translation@1.6.0

## 0.1.3

### Patch Changes

- Updated dependencies [e047bf0]
  - @repo/ui@1.4.0

## 0.1.2

### Patch Changes

- Updated dependencies [cdbf45d]
  - @repo/desk@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [cfa361b]
  - @repo/desk@0.1.1

## 0.1.0

### Minor Changes

- cb7174c: Add the `@repo/desk` workspace: the shared stage and agent-output contracts, the pure pipeline
  transition table, the per-issue state store with a process lease, and the desk configuration
  loader for the upcoming local agent desk. Add the GitHub intake path: the `gh` port, owner
  authorization, the issue contract reader, `agent:*` execution labels, the status comment, the
  worktree bootstrap plan, `desk doctor`, and the `start`, `status`, and `labels sync` commands.
  Add the pipeline engine: the stage runner with engine invariants around every agent run, the
  scheduler, process leases, and restart recovery.
  Add the engine commands (`approve`, `feedback`, `continue`, `cancel`, `remove`, `logs`, `resume`), live progress, a persistent redacted agent log, and a `notifyCommand` that runs without a shell.
  Add the ship step: `ship --dry-run` and `ship --confirm` commit, push, and open a draft PR through the repository hooks after a fail-closed gate (confirmation, matching checks and review, owner identity, authorization, refs baseline). The desk never merges. Add the local server (`desk serve`) with a loopback-only, cookie-protected API.
  Add the `@repo/desk-ui` workspace: the React desk with a board, an issue page, a React Flow graph of the pipeline, the plan and ship gates with a two-step ship dialog, a live log, and a health view, in English, German, and Serbian. Add the `desk` translation namespace. `pnpm desk serve` builds the UI first when it is missing, and `pnpm desk:ui` starts the Vite dev server with a proxy to a running desk. `@repo/desk` adds the `ship-plan` artifact id and browser-safe views of the check report and the ship plan.
  The built desk opens at a plain local URL in each browser and issues its session cookie on page load. The one-use link remains for the separate Vite development origin.
  Add optional Docker isolation (`desk start --isolation docker`, `isolation: "docker"`). One `IsolationPort` decides where the builder and the check steps run. In Docker mode they run in hardened containers with no network, a read-only root, no capabilities, and no host mount. Work moves in as a git bundle and a patch and out as a guarded patch, and dependencies come through a registry-only proxy and install offline. Add `desk docker build|login|doctor|status|prune`, `desk doctor --probe` with isolation probes, a per-issue `isolation` state field, a `docker` config block, labelled and verified cleanup in `remove` and crash recovery, and a container-only Codex sandbox flag. Real-Docker tests run with `DESK_DOCKER=1`.
  The desk board is a kanban with search, a start dialog, toasts, and compact cards that read only the issue summary (`prUrl`, `contract`, `stageEnteredAt`, `resumeStage`, `progress`, `currentNode`). Log entries carry their time in `at` only. `@repo/ui` also exports the `GitPullRequest`, `Plus`, `Search`, `SlidersHorizontal`, and `X` icons.
  The engine stops an agent run that repeats the same failing tool call 8 times and sends the issue to `needs-you`. Every agent run appends a record to `runs.jsonl` in the state root, and `desk stats` compares the runs by role, provider, and model. `GET /api/stats` serves the same numbers, the issue detail carries its `runs`, and the desk UI adds a **Runs** view and agent-usage tiles in the inspector. Token counts mean the same for Claude and Codex. A failed health check shows the command that repairs it, and the Health page can build the Docker image after a confirmation (`POST /api/health/fix`). `desk serve` reports the Docker checks too. On Windows the engine starts `pnpm` through `npm_execpath` and keeps the profile variables, so `pnpm` and the `gh` login work there. The Start dialog lists the open issues of the repository to pick from (ready label, contract count, already on the board), and the board shows the open pull requests read-only (`GET /api/github`). `desk contract` shows how intake reads an issue body, the issue templates follow the shared issue format, an issue that stops at intake keeps its title, and the UI offers Start again for it instead of a Continue that intake refuses. `desk draft` has the read-only intake agent draft a stopped issue in the issue format; the engine renders the body and keeps the old text as a quote. `desk draft --apply` writes the draft to the issue after an explicit yes, as the owner, and only when the issue did not change since the draft. The issue page offers Draft the issue format, a review dialog with the proposal and the open questions, and Apply with a second confirmation (actions `draft` and `apply-draft`, artifact `issue-draft`).
  Each run record now names the harness the agent started with (`harness: { repo, desk, head }`), and `desk stats --by-harness` splits the rows by instruction version. The desk writes review findings, failed checks, stuck runs, denials, verification violations, and broken invariants to `lessons.jsonl`, which `remove` keeps. `desk lessons` and `GET /api/lessons` list the problems seen in two or more issues, and the **Runs** view shows them as lesson candidates. The harness-eval ledger accepts calibrations and protocol 2 runs, whose conclusion must agree with the measured noise floor.

### Patch Changes

- Updated dependencies [cb7174c]
  - @repo/desk@0.1.0
  - @repo/translation@1.5.0
  - @repo/ui@1.3.1
