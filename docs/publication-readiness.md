# Public repository preparation

Audit date: 2026-09-13. Audited base revision: `a948c89`.

**Status: public. Owner-controlled merging and required checks are active and
verified.** The owner approved publication after merging PR #412. The live
verification PR #416 is closed without merging. The first full CI run exposed an
API unit-test isolation failure; the follow-up fix and full validation are tracked
in the PR carrying this report update. Committing ruleset files alone does not
enable protection; the remote rules below were applied and read back.

## Publication audit

The audit retained history, logs, and artifacts. Detailed inventories, redacted
scan results, and finding dispositions are local in `.ai.local/`. Do not attach
those raw downloads to a public issue or PR.

| Surface                       | Evidence and result                                                                                                                                                                                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Git history                   | Refreshed remote branches and tags. Gitleaks 8.30.1 scanned all 491 reachable commits with `--all` and redaction. No findings. The checkout is not shallow.                                                                                                             |
| Issues and PRs                | Retrieved 95 issues, 316 PRs, 523 issue/PR comments, 5 inline review comments, and 4 submitted reviews. No commit comments were listed. Scanned the accessible text and reviewed flagged content.                                                                       |
| Release notes and attachments | Retrieved 35 releases. No release assets or GitHub-uploaded attachment links were found in the collected discussion text.                                                                                                                                               |
| Actions logs                  | Inventoried 2,219 runs. Downloaded 1,875 log archives. 344 were inaccessible: 334 returned HTTP 410 and 10 returned HTTP 404. Their content cannot be certified.                                                                                                        |
| Actions artifacts             | Inventoried 779 artifacts. Downloaded all 517 then available. The other 262 were marked expired. Expanded ZIP, gzip, tar, and nested report archives.                                                                                                                   |
| Artifact images               | Inspected 84 distinct images. They show synthetic test accounts, login screens, theme/language checks, and demo application state.                                                                                                                                      |
| Binary limits                 | Extracted printable strings from 241 binary entries. These include build records and video entries. Videos were not watched end to end; binary-string scanning is not a complete visual or semantic audit.                                                              |
| Tracked media                 | Owner confirmed ownership of `media/logo.jpg`. Desktop icons have a checked-in SVG source and were added with the Tauri migration. The four redesign screenshots show the synthetic Test User and example Todos. No unresolved third-party media source was identified. |

The content scan raised 68 matches: 10 dependency-cache keys, 10 Git commit SHA
matches, and 48 repeated matches from synthetic E2E sessions in two artifacts.
The corresponding CI run used loopback services and disposable PostgreSQL
containers. Its logs record container creation and removal. These are test
sessions, not production credentials. A second scan with only the reviewed local
fingerprints excluded reported no remaining findings. The repository's scanner
rules and history were not weakened or rewritten.

No production credential or confidential customer record was identified in the
examined material. This is bounded evidence, not a guarantee about inaccessible
logs, expired artifacts, or every binary frame.

Publication also exposes past engineering plans, CI billing discussions, commit
author names/emails, and earlier file versions. Deleting a file from the current
tree does not remove it from history. The owner must accept this retained history
and the stated audit limits when approving publication. Any later real-secret
finding requires credential rotation and a separate remediation review.

## Access audit

The repository collaborator list contains one administrator: `@ognjenmarcheta`.
No deploy keys or repository webhooks were listed. Repository Actions secrets
were empty at audit time. CODEOWNERS assigns all paths to the owner.

Eight GitHub App installations initially included this repository. Their current
grants were inspected in GitHub's installation settings:

| App                     | Relevant initial permissions                                                                         | Disposition                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| ChatGPT Codex Connector | Code, workflows, Actions, issues, and PR write; no administration write                              | Retain feature-branch access; no ruleset exception                                       |
| Claude                  | Code, workflows, Actions, checks, issues, PRs, discussions, and hooks write; no administration write | Retain feature-branch access; no ruleset exception                                       |
| CodeRabbit              | Code, checks, statuses, issues, and PR write; no administration write                                | Retain review access; no ruleset exception; pending permission increase was not accepted |
| DigitalOcean            | Code and administration read; checks, statuses, issues, PRs, and hooks write                         | Retain existing access; no ruleset exception                                             |
| Dokploy                 | Code read and PR write; no administration write                                                      | Retain existing access; no ruleset exception                                             |
| Renovate                | Code, workflows, checks, statuses, issues, and PR write; administration read                         | Retain proposal access; no ruleset exception                                             |
| Lovable                 | Administration, code, and workflows write                                                            | Owner authorized removal; no longer listed for this repository                           |
| Vercel                  | Administration, code, checks, statuses, deployments, issues, PRs, and hooks write                    | Owner authorized removal; no longer listed for this repository                           |

Lovable and Vercel could change protection settings. Their installation removals
occurred during the audit and the repository app list now contains the six retained
apps. No agent operation granted new app permissions. The remaining app grants do
not include administration write. Recheck this after any installation or permission
update. An app's external dashboard configuration is not proof of its effective
GitHub permissions.

Repository workflows contain no unattended PR merge or approval operation. The
agent guide, review contract, PR skill, dependency-triage skill, and guarded-command
policy require owner handoff. GitHub identifies accounts, not the person operating
them: automation using the owner's personal credentials has the owner's identity.
These credentials must not be used for unattended merging or approval.

## Exact target settings

| Setting                           | Required value                                                                                                             |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Visibility                        | Public; owner approved the transition on 2026-09-13                                                                        |
| Human merge authority             | Owner remains the sole administrator; outside contributors use forks                                                       |
| Quality ruleset                   | Active `.github/rulesets/main.json`, default branch, no bypass actors                                                      |
| Owner update ruleset              | Active `.github/rulesets/main-owner.json`; restrict updates; only repository administrator role 5 is exempt from this rule |
| Required checks                   | `PR Quality Gate` and `Analyze TypeScript`, both bound to GitHub Actions integration 15368                                 |
| Branch freshness                  | Strict: branch must be up to date                                                                                          |
| PR reviews                        | Zero additional approvals; resolve all review conversations; owner's final manual merge supplies approval                  |
| Merge method                      | Squash through a PR, including owner and version PRs                                                                       |
| Force pushes / branch deletion    | Blocked, including for administrators                                                                                      |
| Automatic merge / merge queue     | Disabled / no queue rule                                                                                                   |
| Default Actions token             | Read-only; already changed and verified                                                                                    |
| Actions create/approve setting    | Enabled so Release can create version PRs; no workflow automatically approves or merges                                    |
| Explicit workflow write scopes    | Preserve release and labeling scopes, and security-result uploads; fork PRs receive no repository secrets or write token   |
| External fork workflow approval   | All external contributors (`all_external_contributors`)                                                                    |
| Secret scanning / push protection | Enable available public-repository features; inspect resulting alerts                                                      |
| Private vulnerability reporting   | Enabled, with the private report option verified                                                                           |

The two rulesets are cumulative. The owner update rule exempts only the sole
administrator from its update restriction. The separate quality ruleset still
requires a PR and passing checks, with no bypass actors. Installed apps receive
no exception. The `exempt` mode is deliberate: `pull_request` and `always` modes
left the owner's normal merge button blocked behind a bypass checkbox in the
live test. The exemption fixes that UI behavior without exempting the owner
from the quality rules. Administrators can still administer
the settings themselves, so keep that permission restricted to the owner.
See GitHub's [ruleset behavior](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
and [available rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets).

The aggregate gate runs with `always()`. It checks every CI PR job and validates
path-detection outputs. Failures, cancellations, missing results, and unexpected
skips fail the gate. Only skips justified by the existing path and event conditions
are accepted. Contract tests also detect an added job missing from the aggregate.

For a bot version PR created with `GITHUB_TOKEN`, the owner closes and reopens the
PR to trigger `pull_request` checks under the owner's event. Then wait for both
required checks on the current revision. Do not bypass protection or accept a
manually dispatched run against the wrong revision. See [bot version PRs](../CONTRIBUTING.md)
and GitHub's [workflow trigger rules](https://docs.github.com/en/actions/how-tos/writing-workflows/choosing-when-your-workflow-runs/triggering-a-workflow).

## Approved-transition procedure

The owner approved this procedure on 2026-09-13. Current execution evidence is
recorded below; a future visibility change needs its own approval.

1. Finish preparation checks and open an unmerged preparation PR. Present this
   report and both ruleset files to the owner. Resolve new audit findings first.
2. Obtain explicit owner approval for publication with retained history and the
   stated audit limits. Refresh the audit for any intervening revisions or uploads.
3. Save current Actions settings and temporarily disable repository Actions.
4. Change visibility to public. Immediately install both active rulesets, keep
   auto-merge off, configure all-external-contributor workflow approval, and enable
   available secret scanning, push protection, and private vulnerability reporting.
   Read back effective settings. If protection fails, keep Actions disabled and
   stop for remediation; do not use unprotected main pushes as a workaround.
5. Re-enable Actions after protection is confirmed. Run CI PR validation, CodeQL,
   and Security on the preparation branch. Do not dispatch Release, merge a PR, or
   trigger a deployment as part of this transition.
6. Open a temporary, unmerged verification PR containing the prepared gate and an
   intentional check failure. Record required check failure and GitHub's blocked
   merge state. Correct that failure, rerun checks, and record that the owner can
   manually merge once all checks pass and the branch is current. Use the merge
   panel and effective-rule API for evidence; do not test by submitting a merge.
   Close the verification PR without merging it.
7. Verify effective main rules, owner-only update permission, retained app grants,
   anonymous repository access, and private security-reporting options. Record run
   and verification PR links here. Only then close issue #325.
8. The owner reviews and manually merges the preparation PR when ready. A later
   owner merge can trigger the normal Release workflow; it is outside the
   no-release publication verification above.

Before publication, the private plan returned HTTP 403 for rulesets and did not
allow the public fork-approval setting. Both settings are now applied and verified.

## Transition evidence (2026-09-13)

- Refreshed history scan: 499 reachable commits, no findings. Refreshed discussion
  and Actions scan: six updated issue/PR records, five comments, 36 additional run
  archives, and no new artifacts; no findings. Earlier audit limits still apply.
- Actions were disabled during the visibility and protection changes, then
  restored. Anonymous repository API and security page requests return HTTP 200.
  The public security page includes the private Report a vulnerability option.
- [Quality ruleset 12994169](https://github.com/ognjenmarcheta/kaine-forge/rules/12994169):
  required PR, strict checks, resolved conversations, no force pushes or deletion,
  no bypass actors. Owner API response: `current_user_can_bypass=never`.
- [Owner update ruleset 23204248](https://github.com/ognjenmarcheta/kaine-forge/rules/23204248):
  only repository administrator role 5 is exempt from the update restriction.
  The owner remains the sole administrator. The six retained app grants are unchanged.
- Actions default token is read-only, auto-merge is off, no merge queue is configured,
  and fork approval is `all_external_contributors`. Secret scanning, push protection,
  and private vulnerability reporting report enabled. The secret-alert list is empty.
- [Security run](https://github.com/ognjenmarcheta/kaine-forge/actions/runs/34777939637)
  and [CodeQL run](https://github.com/ognjenmarcheta/kaine-forge/actions/runs/34777938752)
  passed on `db46fcf`. CodeQL uploaded 15 existing-code alerts for review. A passing
  analysis job is not a verdict that these alerts are harmless; none was dismissed.
- [Full CI run](https://github.com/ognjenmarcheta/kaine-forge/actions/runs/34777937812)
  passed coverage, mobile checks/export, and both Docker builds. Check Fast failed
  because `context.loaders.test.ts` imported production adapters without a database
  URL. Build Core and E2E correctly skipped behind that failure, and the aggregate
  gate failed. The test now mocks its unused default adapters instead of loading
  the real database. With no database URL, the scoped test changes from an import
  failure to three passes; all 222 API tests pass. Runtime source is unchanged.
- [Verification PR #416](https://github.com/ognjenmarcheta/kaine-forge/pull/416):
  the [intentional title failure](https://github.com/ognjenmarcheta/kaine-forge/actions/runs/34777986569)
  failed the required gate and disabled the owner's merge button. After title
  correction, [CI PR](https://github.com/ognjenmarcheta/kaine-forge/actions/runs/34778104843)
  and [CodeQL](https://github.com/ognjenmarcheta/kaine-forge/actions/runs/34778104805)
  passed. GitHub reported `mergeStateStatus=CLEAN` and enabled the normal Squash
  and merge button without a bypass checkbox. The PR was closed with `mergedAt=null`.
- No agent merge, automatic approval, Release dispatch, deployment operation,
  history rewrite, or artifact deletion occurred during the transition.

## Acceptance record

- Local gate tests cover every dependency job, allowed path/event skips, invalid
  inputs, cancellation, missing results, workflow wiring, and both rulesets.
- Guarded-command tests cover manual merge, auto-merge, administrator merge, and
  approval commands. AI outputs are regenerated from canonical sources.
- Final local checks and PR evidence are recorded in the preparation PR.
- Hosted PR, CodeQL, Security, blocked/allowed merge controls, anonymous access,
  and private security-reporting controls are verified above. Full CI on the
  unit-test fix remains a separate follow-up before its owner merge.

The Windows sandbox loopback limitation, first live assistant baseline, and
moderate/low dependency triage remain separate follow-ups.
