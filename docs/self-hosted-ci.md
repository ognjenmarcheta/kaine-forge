# Optional self-hosted CI

Private repositories can run the existing GitHub Actions jobs on owner-managed
machines. GitHub still schedules jobs, stores logs, and reports PR checks. No
runner setting changes the required **PR Quality Gate** or **Analyze TypeScript**
checks. Only the owner merges after the checks pass.

GitHub currently lists self-hosted runner compute as free. Artifact and cache
storage have separate allowances. The owner pays for the machines and their
operation. Check [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
before rollout. Self-hosting does not unlock paid security products; keep the
existing `ENABLE_GITHUB_CODE_SCANNING` policy.

## Routing settings

Set these **repository Actions variables** under **Settings → Secrets and
variables → Actions → Variables**. These are not application `.env` variables
or secrets.

| Variable               | Runner labels                                   | Hosted default  |
| ---------------------- | ----------------------------------------------- | --------------- |
| `CI_SELF_HOSTED_LINUX` | `self-hosted`, `linux`, `x64`, `kaine-ci-linux` | `ubuntu-latest` |
| `CI_SELF_HOSTED_MACOS` | `self-hosted`, `macOS`, `kaine-ci-macos`        | `macos-latest`  |

Use the exact lowercase value `true` to enable a platform. Leave the variable
unset or use `false` to retain its hosted default. The switches are independent.
Other values do not enable routing. `TRUE` and `True` cause an expression error:
GitHub compares strings without case sensitivity, so the workflow also parses
the matching value as JSON to enforce lowercase `true`.

Linux routing covers all Linux jobs in CI PR, CodeQL, Security, Release, Docker
Cache, Deep Checks, and PR Labeler. macOS routing covers the scheduled or manually
dispatched desktop build. Enabling only Linux leaves the macOS job hosted.
Public and internal repositories retain hosted runners. Fork `pull_request`
events retain hosted runners even in a private repository. PR Labeler keeps
its metadata-only `pull_request_target` behavior and does not check out PR code.

Self-hosted routing is a workflow policy, not an access-control boundary. A PR
can change workflow YAML. Restrict runner access to this repository and allow
only trusted contributors to submit branches that use these runners. Keep the
existing approval policy for fork workflows. Fork jobs still need hosted minutes.

## Prepare runner environments

Use dedicated runner environments. Do not run CI directly in a personal
workstation environment with SSH keys, cloud credentials, or access to shared
databases. A Windows workstation can host a dedicated Ubuntu VM; a Windows
runner does not meet the Linux job contract.

Provide a clean, isolated environment for **each job**. Register runners with
`--ephemeral`, then destroy or reset the VM after the job and register a fresh
runner for the next job. Ephemeral registration removes the runner after one
job; it does not clean the host. The owner supplies this lifecycle automation.
For one Linux workstation, [Reference setup: ARC on one Linux workstation](#reference-setup-arc-on-one-linux-workstation)
supplies it.
Keep management tokens outside job environments. Keep runner diagnostic logs
outside the disposable VM. See [GitHub runner security](https://docs.github.com/en/actions/reference/security/secure-use)
and [ephemeral runner operation](https://docs.github.com/en/actions/reference/runners/self-hosted-runners).

Use one active runner per VM or machine environment. Separate concurrent jobs
with separate VMs and Docker daemons. E2E shards and Release bind their Postgres
service to port `5432`. These jobs must not share a host with an existing database
on that port. Multiple registrations on the same host can also collide on Docker
image tags and caches. One available runner can process jobs sequentially; the
two E2E shards remain separate jobs with their own databases.

### Linux

Use Ubuntu 24.04 x64 with:

- A current GitHub Actions runner. Keep automatic updates enabled.
- Host Node.js 22 or newer, Git, Bash, `tar`, `gzip`, `curl`, and `unzip`.
- Docker Engine with access from the runner user. Buildx setup remains in the
  workflows. Do not point Docker at a shared or production daemon.
- GitHub CLI (`gh`) for Release. Job tokens remain the authentication source.
- Passwordless `sudo` for Playwright's existing `install --with-deps` step.
- Enough disk and memory for package builds, Docker images, browsers, and CodeQL.

The shared Node/pnpm action checks host tools, Node version, and Linux Docker
access before installation. It then installs the repo's Node version from
`.nvmrc` and pnpm version from the workflow. Jobs that do not call that shared
action rely on the same prepared host; their actions report missing requirements.
Service containers start before steps, so missing Docker can fail a service job
before the prerequisite check runs.

### macOS

Use a dedicated, supported macOS environment on Intel or Apple Silicon with:

- A current GitHub Actions runner and host Node.js 22 or newer.
- Git, Bash, `tar`, `gzip`, `curl`, and `unzip`.
- Stable Rust (`rustc` and `cargo`) and Xcode command-line tools selected with
  `xcode-select`. Confirm `xcode-select -p`, `rustc --version`, and `cargo --version`.

Docker and `gh` are not prerequisites for the macOS desktop job. Each clean
macOS environment must also be recreated between jobs. Runner provisioning is
outside this template.

## Register and enable

1. Prepare the clean VM image and its job lifecycle before enabling variables.
2. In the private repository, open **Settings → Actions → Runners → New
   self-hosted runner**. Select Linux x64 or the Mac's architecture. Use GitHub's
   current download and registration instructions.
3. Add `--ephemeral` and the custom label to the registration command:
   `--labels kaine-ci-linux` or `--labels kaine-ci-macos`. Keep the default
   OS and architecture labels. Use the short-lived registration token supplied
   by GitHub. Do not save it in tracked files or workflow secrets.
4. Start the runner with `./run.sh` in the disposable environment. Confirm it
   appears online with all labels. Ensure the lifecycle provisions a fresh
   environment after each job.
5. Allow outbound HTTPS to GitHub's runner, action, artifact, and cache endpoints,
   plus npm and the container registries used by these workflows. No inbound
   listener is needed. Use GitHub's [connectivity reference](https://docs.github.com/en/actions/reference/runners/self-hosted-runners#communication).
6. Validate in a private test repository first. Then set each desired variable
   to `true` in the production repository and start a new workflow run.

Do not reuse a PR job's environment for Release. Release must start in its own
clean environment. It retains its existing permissions and updates deployment
branches only inside the Release workflow after its gates pass. Do not run
`pnpm release:apps` locally to validate runner setup.

## Reference setup: ARC on one Linux workstation

`tooling/ci-runners/` runs the Linux contract above on one Ubuntu machine with
[Actions Runner Controller](https://docs.github.com/en/actions/concepts/runners/actions-runner-controller)
(ARC) on single-node k3s. It is one tested way to run the contract, not a
requirement.

- Each job runs in a new pod: a runner container and a privileged Docker-in-Docker
  (DinD) sidecar in one network namespace. Service containers on `127.0.0.1`
  work as on a hosted VM. ARC deletes the pod, its Docker daemon, and the
  workspace after the job.
- Each repository gets its own runner scale set with the `kaine-ci-linux` labels.
  Personal accounts have no shared runner pool, so a repository is added with one
  command. Scale sets scale to zero when idle.
- Runner pods cannot reach the host or the LAN (NetworkPolicy). They reach the
  internet, cluster DNS, and an in-cluster Docker Hub pull-through cache.
- k3s keeps 4 CPUs and 10 GiB for the desktop (`k3s-config.yaml`). Each runner
  pod requests 1 CPU and 2 GiB; jobs mostly wait on the network. The runner
  container may use up to 16 GiB, because tools size their worker pools by
  every host CPU they see. Pods beyond the free capacity wait as `Pending`, so this caps
  parallel jobs across all repositories (about 8 on a 32 GiB machine).
- Runner pods share a persistent pnpm store on the host
  (`/var/lib/ci-runners/pnpm-store`, set through `npm_config_store_dir`). The
  setup action then skips the GitHub pnpm cache, so jobs install from local disk
  instead of downloading and saving about 1 GB per job. The store is shared and
  writable across jobs and repositories, which is acceptable only with trusted
  contributors. It grows over time; delete the directory to reset it.
- Docker image jobs build on one shared BuildKit daemon (`buildkitd`, found
  through `BUILDKIT_HOST`). Its layer cache persists on the host
  (`/var/lib/ci-runners/buildkit`, at most 60 GB, keeping 50 GB of disk free),
  so builds skip the `type=gha` cache there. Hosted runners keep `type=gha`.
  The daemon is privileged and its cache is shared across repositories, with
  the same trust limits as the pnpm store.
- Privileged DinD is root-equivalent on the host. Use it only for private
  repositories with trusted contributors. The routing expression keeps fork PRs
  on hosted runners.

| File                         | Purpose                                                        |
| ---------------------------- | -------------------------------------------------------------- |
| `ci-runners.sh`              | `bootstrap` the host; `add-repo` one repository                |
| `runner.Dockerfile`          | Official runner image plus Node.js, `gh`, and `zstd`           |
| `scale-set.values.yaml`      | Shared scale set: labels, DinD pod spec, resource requests     |
| `cluster.yaml`               | Namespace, Docker Hub cache, BuildKit daemon, network policies |
| `k3s-config.yaml`            | k3s flags and desktop capacity reserve                         |
| `scripts/ci-runners.mjs`     | Heartbeat, shutdown hook, and watchdog logic                   |
| `ci-runners-*.service/timer` | systemd units for the heartbeat and the shutdown hook          |

### Install

1. Run `tooling/ci-runners/ci-runners.sh bootstrap` as your normal user. It asks
   for `sudo`. It installs pinned k3s and Helm, builds and imports the runner
   image, applies `cluster.yaml`, installs the ARC controller, and enables the
   heartbeat timer and shutdown hook. It writes the kubeconfig to
   `~/.kube/k3s-arc.yaml`. Run it again after you change files in this folder.
2. Create a GitHub App on the account that owns the repositories (**Settings →
   Developer settings → GitHub Apps**). Turn off the webhook. Repository
   permissions: **Administration** read and write (runner registration),
   **Variables** read and write (heartbeat and fallback), **Actions** read and
   write (cancel and re-run queued runs). Generate a private key. Install the
   App on each repository that uses the runners and on the repository that runs
   the watchdog. Note the Client ID and the installation ID (the number at the
   end of the installation settings URL).
3. Create the cluster secret yourself. Do not paste the key into chat or tracked files:

   ```bash
   kubectl --kubeconfig ~/.kube/k3s-arc.yaml create secret generic arc-github-app \
     --namespace arc-runners \
     --from-literal=github_app_id=<client-id> \
     --from-literal=github_app_installation_id=<installation-id> \
     --from-file=github_app_private_key=<path-to-key.pem>
   ```

4. Run `tooling/ci-runners/ci-runners.sh add-repo <owner>/<repo> [max-runners]`
   for each repository (default 8 runners). The scale set appears under
   **Settings → Actions → Runners**. The heartbeat then sets
   `CI_SELF_HOSTED_LINUX=true` on that repository.
5. To remove a repository, run `helm uninstall <repo> --namespace arc-runners`
   with the same kubeconfig and set its `CI_SELF_HOSTED_LINUX` to `false`.

The runner image pins the runner version. GitHub stops serving old runner
versions, so bump the base image when Dependabot proposes it and run
`bootstrap` again.

### Automatic hosted fallback

Workflow expressions have no clock, so this setup switches the routing variable
for you:

- **Heartbeat** (`ci-runners-heartbeat.timer`, every 15 minutes and 2 minutes
  after boot): for each scale set with a Ready listener, it sets
  `CI_SELF_HOSTED_LINUX=true` and `CI_RUNNER_HEARTBEAT=<unix seconds>`. A machine
  that is on but has a broken ARC sends no heartbeat.
- **Shutdown hook** (`ci-runners-offline.service`): a clean shutdown or reboot,
  for example into another operating system, sets `CI_SELF_HOSTED_LINUX=false`
  at once.
- **Watchdog** (`.github/workflows/runner-watchdog.yml`, hourly on a hosted
  runner): for every repository the App is installed on, a heartbeat older than
  `CI_RUNNER_FALLBACK_HOURS` (default `2`) sets `CI_SELF_HOSTED_LINUX=false`. The
  watchdog then cancels and re-runs the runs that wait for the `kaine-ci-linux`
  label. It covers crashes, power cuts, and network loss. When a re-run fails
  after its cancel, the watchdog stores the run ID in `CI_RUNNER_RERUN_PENDING`,
  retries it on each later run, and deletes the variable when no ID is left. A
  watchdog run with a failure or a pending ID fails, so GitHub notifies you.

Enable the watchdog in exactly one repository that the App is installed on.
Add the repository variables `CI_RUNNER_WATCHDOG=true` and
`CI_RUNNER_APP_CLIENT_ID=<client-id>` and the secret
`CI_RUNNER_APP_PRIVATE_KEY`. Other copies of the workflow stay skipped. Each
hourly run bills about one hosted minute in a private repository. To spend
less, raise `CI_RUNNER_FALLBACK_HOURS` and the cron interval together. The
heartbeat sets `true` again when the machine returns.

## Validate before rollout

Use an owner-managed private test repository with disposable deployment targets.
Record the runner labels and check results for:

- Both variables unset: existing hosted Linux and macOS jobs.
- Linux enabled, macOS enabled, and both enabled: correct independent routing.
- A fork PR: hosted PR CI and CodeQL; labeler only reads metadata.
- Clean self-hosted runs: Docker builds and scans, both E2E shards, build and
  report artifact transfers, CodeQL, and both required checks.
- An intentionally failing required job: PR Quality Gate fails and merge remains
  blocked. Restore the test before rollout.
- Release on the test repository only: quality gates, disposable release
  branches, version PRs, and tags. Never target production deployments in this test.
- Runner outage and rollback: queued jobs recover when a matching runner returns,
  or a new run uses hosted runners after disabling its variable.

Keep the existing cache and artifact behavior. Compare hosted-minute usage in
GitHub billing before and after rollout. Review queue time, runner availability,
disk use, and artifact/cache storage. No automated billing monitor is added.

## Queued jobs and rollback

An enabled self-hosted job waits for a matching available runner. GitHub has no
automatic hosted fallback. The reference setup adds one: see
[Automatic hosted fallback](#automatic-hosted-fallback). Other setups switch the
variable by hand. GitHub fails jobs that remain queued for more than
24 hours; `timeout-minutes` does not limit queue time. See [routing precedence](https://docs.github.com/en/actions/reference/runners/self-hosted-runners#routing-precedence-for-self-hosted-runners).

Restore the runner and its labels to continue queued work. To return to hosted
runners, set the platform variable to `false` or remove it. Cancel affected runs
and start **new** runs; do not assume already evaluated routing changes. For PR
checks, a new commit triggers new PR runs. A manual dispatch is not a substitute
for validating PR metadata. Hosted fallback still needs available hosted minutes.
Do not disable required checks or bypass the owner-only merge rules.

## Local checks

Run `pnpm check:affected` while iterating and `pnpm check` before a PR. Run
`pnpm build:core` for API/web runtime changes. These commands use no hosted
minutes, but they do not publish required GitHub checks. Self-hosted CI remains
the supported path for reporting checks without hosted compute. This change
does not add `act`. The optional runner tooling lives in `tooling/ci-runners/`.
