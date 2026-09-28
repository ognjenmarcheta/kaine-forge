import { translationInstance, SUPPORTED_LANGUAGES } from "@repo/translation";
import {
  Button,
  Card,
  Input,
  ConfirmModal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@repo/ui";
import { StrictMode, useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

import { act, api, bootstrap } from "./factory.api";
import {
  detailSchema,
  logSchema,
  phaseSchema,
  providerSchema,
  stageSchema,
  stateSchema,
  type ActionRequest,
  type DashboardState,
  type RunDetail,
  type RunSummary
} from "./factory.contract";
import "@repo/ui/styles/globals.css";
import "./factory.styles.css";

function t(key: string, values: Record<string, string | number> = {}): string {
  return translationInstance.t(key, { ...values, ns: "factory" });
}
function time(value: string | null): string {
  return value ? new Date(value).toLocaleString() : t("unavailable");
}
function duration(run: RunSummary): string {
  return `${Math.max(0, Math.floor(((run.finishedAt ? Date.parse(run.finishedAt) : Date.now()) - Date.parse(run.startedAt)) / 1000))} ${t("seconds")}`;
}
function runLink(run: RunSummary): string {
  return `?run=${run.id}&worktree=${run.worktreeId ?? ""}`;
}
function artifactLink(run: RunSummary, artifact: string): string {
  return `/api/worktrees/${run.worktreeId}/artifacts/${run.id}/${artifact}`;
}
function Status({ value }: { value: string }) {
  return (
    <span className="factory-status" data-status={value}>
      {t(value)}
    </span>
  );
}
function Choice({
  label,
  value,
  options,
  change
}: {
  label: string;
  value: string;
  options: string[];
  change: (value: string) => void;
}) {
  return (
    <label className="factory-field">
      <span>{t(label)}</span>
      <Select value={value || "all"} onValueChange={(next) => change(next === "all" ? "" : next)}>
        <SelectTrigger aria-label={t(label)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option || "all"} value={option || "all"}>
              {t(option || "all")}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
function Panel({ headingKey, children }: { headingKey: string; children: ReactNode }) {
  return (
    <Card className="factory-panel">
      <h2>{t(headingKey)}</h2>
      {children}
    </Card>
  );
}
function RunTable({ runs }: { runs: RunSummary[] }) {
  return runs.length ? (
    <div className="factory-table-wrap">
      <table>
        <thead>
          <tr>
            {["issue", "stage", "execution", "duration", "provider", "pr"].map((key) => (
              <th key={key} scope="col">
                {t(key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id}>
              <td>
                <a href={runLink(run)}>{t("issueNumber", { number: run.issue })}</a>
                <small>{run.worktree}</small>
                {run.retryOf && <small>{t("retryAttempt")}</small>}
              </td>
              <td>
                {t(run.stage)}
                <small>{time(run.startedAt)}</small>
              </td>
              <td>
                <Status value={run.status} />
              </td>
              <td>{duration(run)}</td>
              <td>
                {run.provider}
                <small>{run.model}</small>
              </td>
              <td>
                {run.pr ? (
                  <a href={run.pr} target="_blank" rel="noreferrer">
                    {t("openPR")}
                  </a>
                ) : (
                  t("unavailable")
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p className="factory-muted">{t("noRuns")}</p>
  );
}
type Ask = (request: ActionRequest) => void;
function RunControls({
  run,
  ask,
  active = false
}: {
  run: RunSummary;
  ask: Ask;
  active?: boolean;
}) {
  return (
    <div className="factory-row">
      {(active || ["running", "interrupted"].includes(run.status)) && (
        <Button
          appearance="danger"
          onClick={() =>
            ask({
              key: crypto.randomUUID(),
              kind: "cancel",
              run: run.id,
              worktreeId: run.worktreeId
            })
          }
        >
          {t("cancel")}
        </Button>
      )}
      {["failed", "cancelled"].includes(run.status) && !run.pilot && (
        <Button
          disabled={active || run.cleanup?.status === "cleanup-unverified"}
          onClick={() =>
            ask({
              key: crypto.randomUUID(),
              kind: "retry",
              run: run.id,
              worktreeId: run.worktreeId
            })
          }
        >
          {t("retry")}
        </Button>
      )}
    </div>
  );
}
function Board({ state, ask }: { state: DashboardState; ask: Ask }) {
  const [issue, setIssue] = useState("");
  const [stage, setStage] = useState<RunSummary["stage"]>("implement");
  const [provider, setProvider] = useState<RunSummary["provider"]>(state.stages.implement.provider);
  const busy =
    !!state.active ||
    state.actions.some((action) => action.state === "running" && action.request.kind !== "refresh");
  const attention = (state.attention.length ? state.attention : state.runs).filter(
    (run) =>
      ["failed", "blocked", "interrupted"].includes(run.status) &&
      (run.cleanup?.status === "cleanup-unverified" ||
        !state.runs.some(
          (later) =>
            later.issue === run.issue &&
            later.stage === run.stage &&
            later.status === "completed" &&
            later.startedAt > run.startedAt
        ))
  );
  return (
    <>
      <Panel headingKey="attention">
        {!attention.length && !state.warnings.length && !state.github.failures.length && (
          <p className="factory-muted">{t("noAttention")}</p>
        )}
        {state.warnings.map((warning) => (
          <p role="status" key={warning}>
            {warning}
          </p>
        ))}
        {state.github.failures.map((failure) => (
          <p key={failure}>{failure}</p>
        ))}
        {state.actions
          .filter((action) =>
            ["failed", "cleanup-unverified", "interrupted"].includes(action.state)
          )
          .slice(0, 3)
          .map((action) => (
            <div className="factory-item" key={action.id}>
              <p>{action.detail}</p>
              <a
                href={
                  action.runId
                    ? `?run=${action.runId}&worktree=${action.request.worktreeId ?? ""}`
                    : `?view=health&worktree=${action.request.worktreeId ?? ""}`
                }
              >
                {t(action.runId ? "viewRun" : "health")}
              </a>
            </div>
          ))}
        {attention.slice(0, 5).map((run) => (
          <div className="factory-item" key={run.id}>
            <div>
              <a href={runLink(run)}>{t("runTitle", { number: run.issue, stage: t(run.stage) })}</a>
              <p>{run.detail || t("cleanupRequired")}</p>
            </div>
            <Status value={run.status} />
          </div>
        ))}
      </Panel>
      <div className="factory-columns">
        <Panel headingKey="active">
          {state.activeRuns.length ? (
            state.activeRuns.map((activeRun) => (
              <section key={`${activeRun.worktreeId}:${activeRun.id}`} className="factory-item">
                <div>
                  <h3>{t("issueNumber", { number: activeRun.issue })}</h3>
                  <small>{activeRun.worktree}</small>
                  <p>
                    {activeRun.model} {t("separator")} {t(activeRun.phase ?? "unavailable")}{" "}
                    {t("separator")} {duration(activeRun)}
                  </p>
                  <p>
                    {activeRun.waiting
                      ? t("resourceWaiting", { resource: activeRun.waiting })
                      : activeRun.detail}
                  </p>
                  <small>
                    {t("lastActivity")} {time(activeRun.lastActivity)}
                  </small>
                  <a href={runLink(activeRun)}>{t("viewRun")}</a>
                  <RunControls run={activeRun} ask={ask} active />
                </div>
                <Status value={activeRun.status} />
              </section>
            ))
          ) : (
            <p>{t("idle")}</p>
          )}
          <h3>{t("startStage")}</h3>
          <label className="factory-field">
            <span>{t("issue")}</span>
            <Input
              type="number"
              min="1"
              value={issue}
              onChange={(event) => setIssue(event.target.value)}
            />
          </label>
          <Choice
            label="stage"
            value={stage}
            options={stageSchema.options}
            change={(value) => {
              const next = stageSchema.parse(value);
              setStage(next);
              setProvider(state.stages[next].provider);
            }}
          />
          <Choice
            label="provider"
            value={provider}
            options={providerSchema.options}
            change={(value) => setProvider(providerSchema.parse(value))}
          />
          <p className="factory-muted">{state.models[provider]}</p>
          <Button
            disabled={
              !state.enabled || busy || !Number.isInteger(Number(issue)) || Number(issue) < 1
            }
            onClick={() =>
              ask({
                key: crypto.randomUUID(),
                kind: "start",
                issue: Number(issue),
                stage,
                provider
              })
            }
          >
            {t("startStage")}
          </Button>
          {state.selectedWorktree && !state.enabled && <p>{t("disabledHelp")}</p>}
          {busy && <p>{t("busyHelp")}</p>}
        </Panel>
        <Panel headingKey="queue">
          {["ready", "spec", "waiting"].map((group) => (
            <section key={group}>
              <h3>{t(`queue-${group}`)}</h3>
              {state.github.issues
                .filter((entry) => entry.group === group)
                .map((entry) => (
                  <div className="factory-item" key={entry.number}>
                    <div>
                      <a
                        href={`https://github.com/${state.repository}/issues/${entry.number}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t("issueTitle", { number: entry.number, title: entry.title })}
                      </a>
                      <small>{entry.reason}</small>
                    </div>
                    <Button
                      appearance="subtle"
                      onClick={() => {
                        setIssue(String(entry.number));
                        setStage(group === "spec" ? "spec" : "implement");
                        setProvider(state.stages[group === "spec" ? "spec" : "implement"].provider);
                      }}
                    >
                      {t("select")}
                    </Button>
                  </div>
                ))}
            </section>
          ))}
          <p className="factory-muted">{t("queueHelp")}</p>
        </Panel>
      </div>
      <Panel headingKey="recent">
        <RunTable runs={state.runs.slice(0, 8)} />
      </Panel>
    </>
  );
}
function loginCommand(provider: string): string {
  return `pnpm factory login --provider ${provider}`;
}
function Health({ state, ask }: { state: DashboardState; ask: Ask }) {
  const [provider, setProvider] = useState("codex");
  const [tier, setTier] = useState<"docs" | "code" | "web">("docs");
  const busy =
    !state.worktrees.some((entry) => entry.id === state.selectedWorktree && entry.configured) ||
    !!state.active ||
    state.actions.some((item) => item.state === "running" && item.request.kind !== "refresh");
  return (
    <>
      <div className="factory-columns">
        <Panel headingKey="environment">
          <dl>
            <dt>{t("docker")}</dt>
            <dd>
              {state.health.docker === null
                ? t("unavailable")
                : t(state.health.docker ? "available" : "unavailable")}
            </dd>
            <dt>{t("checked")}</dt>
            <dd>{time(state.health.at)}</dd>
            <dt>{t("quotaCost")}</dt>
            <dd>{t("unavailable")}</dd>
          </dl>
          <Button disabled={busy} onClick={() => ask({ key: crypto.randomUUID(), kind: "doctor" })}>
            {t("doctor")}
          </Button>
          <p>{t("loginHelp")}</p>
          <code>{loginCommand(provider)}</code>
        </Panel>
        <Panel headingKey="providers">
          {providerSchema.options.map((name) => {
            const worker = state.health.workers.find((entry) => entry.provider === name);
            return (
              <section key={name}>
                <h3>{name}</h3>
                <p>
                  {state.models[name]} {t("separator")} {worker?.version ?? t("unavailable")}
                </p>
                <dl>
                  <dt>{t("credentials")}</dt>
                  <dd>
                    {worker ? t(worker.authenticated ? "detected" : "failed") : t("unavailable")}
                  </dd>
                  <dt>{t("isolation")}</dt>
                  <dd>{worker ? t(worker.isolation ? "passed" : "failed") : t("unavailable")}</dd>
                </dl>
                {worker?.error && <p>{worker.error}</p>}
              </section>
            );
          })}
        </Panel>
      </div>
      <Panel headingKey="pilots">
        <p>{t("liveHelp")}</p>
        {state.health.pilots.map((pilot) => (
          <div className="factory-item" key={`${pilot.provider}-${pilot.tier}`}>
            <span>
              {pilot.provider} {t("separator")} {t(pilot.tier)}
            </span>
            <Status value={pilot.current ? "passed" : "stale"} />
            <small>{time(pilot.at)}</small>
          </div>
        ))}
        <div className="factory-row">
          <Choice
            label="provider"
            value={provider}
            options={providerSchema.options}
            change={setProvider}
          />
          <Choice
            label="tier"
            value={tier}
            options={["docs", "code", "web"]}
            change={(value) => {
              if (value === "docs" || value === "code" || value === "web") setTier(value);
            }}
          />
          <Button
            disabled={busy}
            onClick={() =>
              ask({
                key: crypto.randomUUID(),
                kind: "pilot",
                provider: providerSchema.parse(provider),
                tier
              })
            }
          >
            {t("runPilot")}
          </Button>
        </div>
      </Panel>
      <Panel headingKey="rollout">
        {(!state.health.at || Date.now() - Date.parse(state.health.at) > 300000) && (
          <p>{t("stale")}</p>
        )}
        <p>{state.health.rollout ?? t("passed")}</p>
        <p>{t("ownerRule")}</p>
        <Button
          disabled={
            state.watcher !== "running" &&
            (!state.enabled ||
              !state.watchEnabled ||
              state.watcher === "external" ||
              !!state.health.rollout ||
              busy)
          }
          onClick={() =>
            ask({
              key: crypto.randomUUID(),
              kind: state.watcher === "running" ? "watch-stop" : "watch-start"
            })
          }
        >
          {t(state.watcher === "running" ? "stopWatcher" : "startWatcher")}
        </Button>
        <p>{t("watchHelp")}</p>
      </Panel>
    </>
  );
}
function Details({
  run,
  ask,
  repository,
  active
}: {
  run: RunDetail;
  ask: Ask;
  repository: string;
  active: boolean;
}) {
  const [tab, setTab] = useState("overview");
  const [log, setLog] = useState("");
  const [selected, setSelected] = useState("");
  const [follow, setFollow] = useState(true);
  const logElement = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (follow && logElement.current)
      logElement.current.scrollTop = logElement.current.scrollHeight;
  }, [follow, log]);
  useEffect(() => {
    if (!selected || tab !== "logs") return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const pollLog = async () => {
      try {
        const value = await api(artifactLink(run, selected), logSchema);
        if (live) setLog(`${value.truncated ? t("truncated") + "\n" : ""}${value.text}`);
      } catch (error) {
        if (live) setLog(error instanceof Error ? error.message : t("offline"));
      } finally {
        if (live && run.status === "running") timer = setTimeout(() => void pollLog(), 2000);
      }
    };
    void pollLog();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [selected, run, tab]);
  return (
    <>
      <a href={`?view=runs&worktree=${run.worktreeId ?? ""}`}>{t("backRuns")}</a>
      <div className="factory-row">
        <h1>{t("runTitle", { number: run.issue, stage: t(run.stage) })}</h1>
        <Status value={run.status} />
        <RunControls run={run} ask={ask} active={active} />
      </div>
      <p>{run.detail}</p>
      <p>{run.worktree}</p>
      {run.waiting && <p role="status">{t("resourceWaiting", { resource: run.waiting })}</p>}
      {run.cleanup?.status === "cleanup-unverified" && (
        <p role="alert">
          {t("cleanup-unverified")} {t("separator")} {run.cleanup.errors.join("; ")}
        </p>
      )}
      {run.currentCommand && (
        <div className="factory-item">
          <code>{run.currentCommand.command}</code>
          <span>{time(run.currentCommand.startedAt)}</span>
          <span>
            {t("lastActivity")} {t("separator")} {time(run.currentCommand.lastOutputAt)}
          </span>
          <Button
            onClick={() => {
              setSelected(run.currentCommand?.artifactId ?? "");
              setTab("logs");
            }}
          >
            {t("logs")}
          </Button>
        </div>
      )}
      <ol className="factory-timeline">
        {phaseSchema.options.map((phase) => {
          const event = run.events.filter((entry) => entry.phase === phase).at(-1);
          return (
            <li key={phase}>
              <Button
                appearance="subtle"
                onClick={() => {
                  setTab(phase === "review" ? "reviewTab" : "checks");
                  if (event?.artifactId) setSelected(event.artifactId);
                }}
              >
                {t(phase)}
              </Button>
              <Status
                value={
                  event?.state ??
                  (run.events.length
                    ? run.status === "running"
                      ? "pending"
                      : run.status === "completed"
                        ? "skipped"
                        : "untested"
                    : "unavailable")
                }
              />
              <small>{time(event?.at ?? null)}</small>
            </li>
          );
        })}
      </ol>
      <nav className="factory-tabs" aria-label={t("runTabs")}>
        {["overview", "checks", "evidence", "reviewTab", "logs"].map((key) => (
          <Button
            key={key}
            appearance={tab === key ? "default" : "subtle"}
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
          >
            {t(key)}
          </Button>
        ))}
      </nav>
      {run.warnings.map((warning) => (
        <p role="status" key={warning}>
          {warning}
        </p>
      ))}
      {tab === "overview" && (
        <Panel headingKey="overview">
          <dl>
            {[
              ["execution", t(run.status)],
              ["validation", t(run.validation)],
              ["acceptance", t(run.acceptance ?? "unavailable")],
              ["merge", t(run.merge)],
              ["duration", duration(run)],
              ["lastActivity", time(run.lastActivity)],
              ["revision", run.revision],
              ["candidate", run.candidate ?? t("unavailable")],
              ["reviewMinutes", run.reviewMinutes?.toString() ?? t("unavailable")]
            ].map(([key, value]) => (
              <div key={key}>
                <dt>{t(key ?? "unavailable")}</dt>
                <dd>
                  {value &&
                  (key === "revision" || (key === "candidate" && run.pr)) &&
                  /^[a-f0-9]{40}$/.test(value) ? (
                    <a
                      href={`https://github.com/${repository}/commit/${value}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {value}
                    </a>
                  ) : (
                    value
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <p>
            <a
              href={`https://github.com/${repository}/issues/${run.issue}`}
              target="_blank"
              rel="noreferrer"
            >
              {t("openIssue")}
            </a>
            {run.pr && (
              <>
                {" "}
                {t("separator")}{" "}
                <a href={run.pr} target="_blank" rel="noreferrer">
                  {t("openPR")}
                </a>
              </>
            )}
          </p>
          {run.retryOf && (
            <a href={`?run=${run.retryOf}&worktree=${run.worktreeId ?? ""}`}>
              {t("previousAttempt")}
            </a>
          )}
          <h3>{t("invocations")}</h3>
          {run.invocations.map((invocation, index) => (
            <section key={index}>
              <p>
                {invocation.provider} {t("separator")} {invocation.model} {t("separator")}{" "}
                {invocation.cliVersion}
              </p>
              <p>{t("milliseconds", { number: invocation.durationMs })}</p>
              <dl>
                <dt>{t("usage")}</dt>
                <dd>
                  {Object.keys(invocation.usage).length
                    ? JSON.stringify(invocation.usage)
                    : t("unavailable")}
                </dd>
                <dt>{t("quotaCost")}</dt>
                <dd>{t("unavailable")}</dd>
              </dl>
            </section>
          ))}
        </Panel>
      )}
      {tab === "checks" && (
        <Panel headingKey="checks">
          {run.checks.length ? (
            run.checks.map((check, index) => (
              <div key={index} className="factory-item">
                <code>{check.command}</code>
                <Status value={check.passed ? "passed" : "failed"} />
                {check.artifactId && (
                  <Button
                    appearance="subtle"
                    onClick={() => {
                      setSelected(check.artifactId ?? "");
                      setTab("logs");
                    }}
                  >
                    {t("logs")}
                  </Button>
                )}
              </div>
            ))
          ) : (
            <p>{t("untested")}</p>
          )}
        </Panel>
      )}
      {tab === "evidence" && (
        <Panel headingKey="evidence">
          {run.evidence.map((entry) => (
            <section key={entry.criterion}>
              <h3>{entry.criterion}</h3>
              <Status value={entry.status} />
              <p>{entry.detail}</p>
            </section>
          ))}
          {!run.evidence.length && <p>{t("untested")}</p>}
          <div className="factory-artifacts">
            {run.artifacts
              .filter((entry) => entry.kind !== "log")
              .map((entry) => (
                <figure key={entry.id}>
                  {entry.kind === "image" && (
                    <img loading="lazy" src={artifactLink(run, entry.id)} alt={entry.name} />
                  )}
                  {entry.kind === "video" && (
                    <video
                      controls
                      preload="metadata"
                      aria-label={entry.name}
                      src={artifactLink(run, entry.id)}
                    />
                  )}
                  <figcaption>
                    <a href={artifactLink(run, entry.id)} download>
                      {entry.name}
                    </a>
                  </figcaption>
                </figure>
              ))}
          </div>
          <p>{t("localEvidence")}</p>
        </Panel>
      )}
      {tab === "reviewTab" && (
        <Panel headingKey="reviewTab">
          {run.findings.map((finding, index) => (
            <section key={index}>
              <code>{t("sourceLocation", { path: finding.path, line: finding.line })}</code>
              <Status value={finding.blocking ? "blocked" : "information"} />
              <p>{finding.body}</p>
            </section>
          ))}
          {!run.findings.length && <p>{t("noFindings")}</p>}
          <p>{t("ownerRule")}</p>
        </Panel>
      )}
      {tab === "logs" && (
        <Panel headingKey="logs">
          <div className="factory-row">
            {run.artifacts
              .filter((entry) => entry.kind === "log")
              .map((entry) => (
                <Button key={entry.id} appearance="subtle" onClick={() => setSelected(entry.id)}>
                  {entry.name}
                </Button>
              ))}
          </div>
          <label>
            <input
              type="checkbox"
              checked={follow}
              onChange={(event) => setFollow(event.target.checked)}
            />{" "}
            {t("followOutput")}
          </label>
          <pre ref={logElement} tabIndex={0}>
            {log || t("selectLog")}
          </pre>
          <p>{t("logHelp")}</p>
        </Panel>
      )}
    </>
  );
}
function App() {
  const params = new URLSearchParams(location.search);
  const view = params.get("view") ?? "board";
  const runId = params.get("run");
  const [worktree, setWorktree] = useState(params.get("worktree") ?? "");
  const [state, setState] = useState<DashboardState>();
  const [run, setRun] = useState<RunDetail>();
  const [error, setError] = useState("");
  const [pending, setPending] = useState<ActionRequest>();
  const [sending, setSending] = useState(false);
  const [language, setLanguage] = useState(translationInstance.language);
  const [theme, setTheme] = useState(
    matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  );
  const [filters, setFilters] = useState({
    search: "",
    provider: "",
    stage: "",
    status: "",
    date: "",
    pilots: "false",
    page: "0"
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  const query = new URLSearchParams({
    ...(view === "runs" ? filters : {}),
    ...(worktree ? { worktree } : {})
  }).toString();
  const ask: Ask = (request) =>
    setPending({ ...request, worktreeId: request.worktreeId ?? worktree });
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      let delay = 10000;
      try {
        await bootstrap();
        const next = await api(`/api/state?${query}`, stateSchema);
        if (!live) return;
        setState(next);
        setError("");
        delay =
          next.active || next.actions.some((action) => action.state === "running") ? 2000 : 10000;
        if (runId) {
          const detail = await api(`/api/worktrees/${worktree}/runs/${runId}`, detailSchema);
          if (live) setRun(detail);
        }
      } catch (failure) {
        if (live) setError(failure instanceof Error ? failure.message : t("offline"));
      } finally {
        if (live) timer = setTimeout(() => void poll(), delay);
      }
    };
    void poll();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, runId, worktree]);
  const send = async () => {
    if (!pending || sending) return;
    setSending(true);
    try {
      await act(pending);
      setPending(undefined);
      setState(await api(`/api/state?${query}`, stateSchema));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("offline"));
    } finally {
      setSending(false);
    }
  };
  const writes =
    pending && ["start", "retry", "watch-start"].includes(pending.kind)
      ? t("githubWrites")
      : t("localAction");
  const actionModel =
    pending?.kind === "start"
      ? state?.models[pending.provider]
      : pending?.kind === "pilot"
        ? state?.models[pending.provider]
        : pending?.kind === "retry"
          ? state?.runs.find((entry) => entry.id === pending.run)?.model
          : "";
  return (
    <div className="factory-shell">
      <a className="factory-skip" href="#main">
        {t("skip")}
      </a>
      <aside>
        <div className="factory-brand">
          <span aria-hidden="true">{t("mark")}</span>
          <div>
            <strong>{t("brand")}</strong>
            <small>{t("subtitle")}</small>
          </div>
        </div>
        <nav aria-label={t("navigation")}>
          {["board", "runs", "health"].map((item) => (
            <a
              key={item}
              aria-current={!runId && item === view ? "page" : undefined}
              href={`?view=${item}&worktree=${worktree}`}
            >
              {t(item)}
            </a>
          ))}
        </nav>
        <div className="factory-preferences">
          <Choice label="theme" value={theme} options={["light", "dark"]} change={setTheme} />
          <Choice
            label="language"
            value={language}
            options={[...SUPPORTED_LANGUAGES]}
            change={(value) => {
              void translationInstance.changeLanguage(value).then(() => setLanguage(value));
            }}
          />
          <small>{t("localOnly")}</small>
        </div>
      </aside>
      <div className="factory-content">
        <header>
          <div>
            <strong>{state?.repository ?? t("brand")}</strong>
            <small>
              {state ? t(state.enabled ? "enabled" : "disabled") : t("loading")} {t("separator")}{" "}
              {t("watcher")} {t(state?.watcher ?? "unavailable")}
            </small>
          </div>
          <div>
            <Button
              appearance="subtle"
              disabled={!worktree}
              onClick={() => ask({ key: crypto.randomUUID(), kind: "refresh" })}
            >
              {t("refresh")}
            </Button>
            <small>
              {t("githubUpdated")} {time(state?.github.at ?? null)}
            </small>
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          <label className="factory-field">
            <span>{t("worktree")}</span>
            <Select
              value={worktree || "all"}
              onValueChange={(value) => {
                const next = value === "all" ? "" : value;
                if (runId) location.assign(`?view=board&worktree=${next}`);
                else setWorktree(next);
              }}
            >
              <SelectTrigger aria-label={t("worktree")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allWorktrees")}</SelectItem>
                {state?.worktrees.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id} disabled={!entry.available}>
                    {entry.branch} {t("separator")} {entry.path}
                    {!entry.configured ? ` · ${t("notConfigured")}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          {!worktree && <p>{t("selectWorktreeHelp")}</p>}
          {error && (
            <p role="alert" className="factory-alert">
              {error}
            </p>
          )}
          {state?.github.error && (
            <p role="status" className="factory-alert">
              {t("stale")} {t("separator")} {state.github.error}
            </p>
          )}
          {state?.github.at && Date.now() - Date.parse(state.github.at) > 90000 && (
            <p role="status">{t("stale")}</p>
          )}
          {state ? (
            runId ? (
              run ? (
                <Details
                  run={run}
                  ask={ask}
                  repository={state.repository}
                  active={state.activeRuns.some(
                    (entry) => entry.id === run.id && entry.worktreeId === run.worktreeId
                  )}
                />
              ) : (
                <p>{t("loading")}</p>
              )
            ) : (
              <>
                <div className="factory-heading">
                  <div>
                    <h1>{t(view)}</h1>
                    <p>{t(`${view}Intro`)}</p>
                  </div>
                  <small>
                    {t("updated")} {time(state.at)}
                  </small>
                </div>
                {view === "board" && <Board state={state} ask={ask} />}
                {view === "health" && <Health state={state} ask={ask} />}
                {view === "runs" && (
                  <>
                    <div className="factory-filters">
                      <label className="factory-field">
                        <span>{t("search")}</span>
                        <Input
                          value={filters.search}
                          onChange={(event) =>
                            setFilters({ ...filters, search: event.target.value, page: "0" })
                          }
                        />
                      </label>
                      {["provider", "stage", "status"].map((key) => (
                        <Choice
                          key={key}
                          label={key}
                          value={
                            key === "provider"
                              ? filters.provider
                              : key === "stage"
                                ? filters.stage
                                : filters.status
                          }
                          options={[
                            "",
                            ...(key === "provider"
                              ? providerSchema.options
                              : key === "stage"
                                ? stageSchema.options
                                : [
                                    "running",
                                    "completed",
                                    "failed",
                                    "blocked",
                                    "cancelled",
                                    "interrupted"
                                  ])
                          ]}
                          change={(value) => setFilters({ ...filters, [key]: value, page: "0" })}
                        />
                      ))}
                      <label className="factory-field">
                        <span>{t("date")}</span>
                        <Input
                          type="date"
                          value={filters.date}
                          onChange={(event) =>
                            setFilters({ ...filters, date: event.target.value, page: "0" })
                          }
                        />
                      </label>
                      <Button
                        appearance="subtle"
                        aria-pressed={filters.pilots === "true"}
                        onClick={() =>
                          setFilters({
                            ...filters,
                            pilots: filters.pilots === "true" ? "false" : "true",
                            page: "0"
                          })
                        }
                      >
                        {t("showPilots")}
                      </Button>
                    </div>
                    {[...new Set(state.runs.map((entry) => entry.issue))].map((issue) => (
                      <Panel key={issue} headingKey="attempts">
                        <h3>{t("issueNumber", { number: issue })}</h3>
                        <RunTable runs={state.runs.filter((entry) => entry.issue === issue)} />
                      </Panel>
                    ))}
                    <div className="factory-row">
                      <Button
                        disabled={state.page === 0}
                        onClick={() => setFilters({ ...filters, page: String(state.page - 1) })}
                      >
                        {t("previous")}
                      </Button>
                      <span>
                        {state.total} {t("results")}
                      </span>
                      <Button
                        disabled={(state.page + 1) * 25 >= state.total}
                        onClick={() => setFilters({ ...filters, page: String(state.page + 1) })}
                      >
                        {t("next")}
                      </Button>
                    </div>
                  </>
                )}
                {state.actions
                  .filter((action) => action.request.kind !== "refresh")
                  .slice(0, 5)
                  .map((action) => (
                    <div className="factory-item" key={action.id}>
                      <div>
                        <strong>{t(action.request.kind)}</strong>
                        <small>{action.detail}</small>
                        {action.runId && <a href={`?run=${action.runId}`}>{t("viewRun")}</a>}
                      </div>
                      <Status value={action.state} />
                    </div>
                  ))}
              </>
            )
          ) : (
            <p>{t("loading")}</p>
          )}
        </main>
      </div>
      <ConfirmModal
        title={t("confirmAction")}
        description={`${pending ? t(pending.kind) : ""} ${actionModel ?? ""}. ${writes} ${t("ownerRule")}`}
        open={!!pending}
        onOpenChange={(open) => {
          if (!open) setPending(undefined);
        }}
        onConfirm={() => void send()}
        isConfirming={sending}
        confirmLabel={t("continue")}
        cancelLabel={t("back")}
        closeButtonLabel={t("close")}
      />
    </div>
  );
}
const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
