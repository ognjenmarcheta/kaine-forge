import type {
  IssueRollup,
  IssueSummary,
  LessonReport,
  RunGroup,
  RunStats,
  StatsDay
} from "@repo/desk/contracts";
import { Button, Card } from "@repo/ui";
import { useCallback, useEffect, useId, useState, type ReactNode } from "react";

import { LessonsPanel } from "./stats.lessons";
import { costByAgent, sparkPoints, weekOf, type WeekSeries } from "./stats.model";
import { toApiError, type FailureCode } from "../api/api.client";
import { agentName, issueFlowOf, loopsText, stageName, type IssueFlow } from "../flow/flow.steps";
import { useLanguage, useT, type Translate } from "../i18n/i18n.t";
import { formatCount, formatDuration, formatUsd } from "../shell/shell.format";
import { usePaletteActions } from "../shell/shell.palette";
import { RouteLink } from "../shell/shell.router";
import { FailureText, LoadingLines, Muted } from "../shell/shell.ui";
import { useDesk } from "../state/desk.provider";
import { issueStatusOf, type BoardGroup } from "../status/status.model";

/** A dash for a value no run reports, read as "none". */
function Empty() {
  const t = useT();
  return (
    <>
      <span aria-hidden="true">{t("desk.inspector.kpi.empty")}</span>
      <span className="desk-sr-only">{t("desk.common.none")}</span>
    </>
  );
}

const orEmpty = (value: number | null, format: (value: number) => string): ReactNode =>
  value === null ? <Empty /> : format(value);

function Num({ children }: { readonly children: ReactNode }) {
  return <td className="desk-table__number">{children}</td>;
}

/** An agent in words: a built-in agent by its role, any other by its id. */
const agentText = (t: Translate, agentId: string): string =>
  agentName(t, { id: agentId }, null) ?? agentId;

const GROUP_COLUMNS = [
  "agent",
  "provider",
  "model",
  "runs",
  "accepted",
  "stuck",
  "timeouts",
  "median",
  "tokensIn",
  "tokensOut",
  "turns",
  "edits",
  "costPerRun",
  "cost"
] as const;
const TEXT_COLUMNS: ReadonlySet<string> = new Set(["agent", "provider", "model"]);

function GroupsTable({ groups }: { readonly groups: readonly RunGroup[] }) {
  const t = useT();
  const { language } = useLanguage();
  const count = (value: number): string => formatCount(value, language);
  const usd = (value: number): string => formatUsd(value, language);
  return (
    <div className="desk-table-scroll" tabIndex={0} aria-label={t("desk.stats.groups")}>
      <table className="desk-table" aria-label={t("desk.stats.groups")}>
        <thead>
          <tr>
            {GROUP_COLUMNS.map((column) => (
              <th
                key={column}
                scope="col"
                className={TEXT_COLUMNS.has(column) ? undefined : "desk-table__number"}
              >
                {t(`desk.stats.column.${column}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr key={`${group.role}:${group.agentId}:${group.provider}:${group.model ?? ""}`}>
              <th scope="row">{agentText(t, group.agentId)}</th>
              <td>{group.provider}</td>
              <td>
                {group.model ?? <span className="desk-muted">{t("desk.stats.defaultModel")}</span>}
              </td>
              <Num>{group.runs}</Num>
              <Num>{group.accepted}</Num>
              <Num>{group.stuck}</Num>
              <Num>{group.timeouts}</Num>
              <Num>{formatDuration(group.medianDurationMs, language)}</Num>
              <Num>{orEmpty(group.meanInputTokens, count)}</Num>
              <Num>{orEmpty(group.meanOutputTokens, count)}</Num>
              <Num>{orEmpty(group.meanTurns, (value) => String(Math.round(value)))}</Num>
              <Num>{group.meanEditCalls.toFixed(1)}</Num>
              <Num>{orEmpty(group.meanCostUsd, usd)}</Num>
              <Num>{orEmpty(group.totalCostUsd, usd)}</Num>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IssuesTable({ issues }: { readonly issues: readonly IssueRollup[] }) {
  const t = useT();
  const { language } = useLanguage();
  const { state } = useDesk();
  /** An issue on the board names its stages from its flow; a removed one by their ids. */
  const flowOf = (issue: number): IssueFlow | null => {
    const summary = state.issues[issue];
    return summary?.readable === true ? issueFlowOf(summary) : null;
  };
  return (
    <div className="desk-table-scroll" tabIndex={0} aria-label={t("desk.stats.issues")}>
      <table className="desk-table" aria-label={t("desk.stats.issues")}>
        <thead>
          <tr>
            <th scope="col">{t("desk.stats.column.issue")}</th>
            <th scope="col">{t("desk.stats.column.stage")}</th>
            <th scope="col">{t("desk.stats.column.loops")}</th>
            <th scope="col" className="desk-table__number">
              {t("desk.stats.column.runs")}
            </th>
            <th scope="col" className="desk-table__number">
              {t("desk.stats.column.cost")}
            </th>
          </tr>
        </thead>
        <tbody>
          {issues.map((issue) => (
            <tr key={issue.issue}>
              <th scope="row">
                {issue.stage === null ? (
                  t("desk.issue.number", { number: issue.issue })
                ) : (
                  <RouteLink to={{ view: "issue", issueNumber: issue.issue }}>
                    {t("desk.issue.number", { number: issue.issue })}
                  </RouteLink>
                )}
              </th>
              <td>
                {issue.stage === null ? (
                  <span className="desk-muted">{t("desk.stats.removed")}</span>
                ) : (
                  stageName(t, flowOf(issue.issue), issue.stage)
                )}
              </td>
              <td>
                {(issue.loops === null
                  ? null
                  : loopsText(t, flowOf(issue.issue), issue.loops, "desk.stats.loops")) ?? (
                  <Empty />
                )}
              </td>
              <Num>{issue.runs}</Num>
              <Num>{orEmpty(issue.totalCostUsd, (value) => formatUsd(value, language))}</Num>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Today in one line: the runs and cost of the day, and what waits on the owner now. */
function TodayDigest({
  today,
  issues
}: {
  readonly today: StatsDay | null;
  readonly issues: readonly IssueSummary[];
}) {
  const t = useT();
  const { language } = useLanguage();
  const id = useId();
  const groups = issues.map((summary) => issueStatusOf(summary).group);
  const count = (group: BoardGroup): number => groups.filter((entry) => entry === group).length;
  const cost = today?.costUsd ?? null;
  return (
    <section className="desk-digest" aria-labelledby={id}>
      <h2 id={id} className="desk-digest__title">
        {t("desk.stats.today.title")}
      </h2>
      <ul className="desk-digest__items">
        <li>{t("desk.stats.today.runs", { count: today?.runs ?? 0 })}</li>
        <li>{t("desk.stats.today.shipped", { count: today?.shipped ?? 0 })}</li>
        <li>{t("desk.stats.today.needsYou", { count: count("needs-you") })}</li>
        <li>{t("desk.stats.today.waiting", { count: count("waiting") })}</li>
        <li>
          {cost === null
            ? t("desk.stats.today.noCost")
            : t("desk.stats.today.cost", { cost: formatUsd(cost, language) })}
        </li>
      </ul>
    </section>
  );
}

/** One card of "Last 7 days": the total, a line of the seven days, and today's value. */
function WeekCard({
  label,
  series,
  format
}: {
  readonly label: string;
  readonly series: WeekSeries;
  readonly format: (value: number) => string;
}) {
  const t = useT();
  const id = useId();
  const text = (value: number | null): string =>
    value === null ? t("desk.common.none") : format(value);
  return (
    <div className="desk-stat" role="group" aria-labelledby={id}>
      <span id={id} className="desk-stat__label">
        {label}
      </span>
      <strong className="desk-stat__value">
        {series.total === null ? <Empty /> : format(series.total)}
      </strong>
      {/* SVG attributes, not a style: the CSP blocks those. The text below says the same. */}
      <svg
        className="desk-stat__spark"
        viewBox="0 0 100 36"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <polyline points={sparkPoints(series.values)} />
      </svg>
      <span className="desk-stat__note">
        {t("desk.stats.week.today", { value: text(series.values.at(-1) ?? null) })}
      </span>
      <span className="desk-sr-only">
        {t("desk.stats.week.series", { values: series.values.map(text).join(", ") })}
      </span>
    </div>
  );
}

function WeekCards({ days }: { readonly days: readonly StatsDay[] }) {
  const t = useT();
  const { language } = useLanguage();
  const id = useId();
  const week = weekOf(days);
  const count = (value: number): string => formatCount(value, language);
  return (
    <section className="desk-week" aria-labelledby={id}>
      <h2 id={id} className="desk-week__title">
        {t("desk.stats.week.title")}
      </h2>
      <div className="desk-week__grid">
        <WeekCard label={t("desk.stats.week.runs")} series={week.runs} format={count} />
        <WeekCard
          label={t("desk.stats.week.cost")}
          series={week.costUsd}
          format={(value) => formatUsd(value, language)}
        />
        <WeekCard label={t("desk.stats.week.shipped")} series={week.shipped} format={count} />
      </div>
    </section>
  );
}

/** The cost of each agent as a bar. The value is written beside it, so the bar only repeats it. */
function CostByAgent({ groups }: { readonly groups: readonly RunGroup[] }) {
  const t = useT();
  const { language } = useLanguage();
  return (
    <Card className="desk-panel">
      <h2>{t("desk.stats.costByAgent")}</h2>
      <ul className="desk-bars">
        {costByAgent(groups).map((entry) => (
          <li key={entry.agentId} className="desk-bars__row">
            <span>{agentText(t, entry.agentId)}</span>
            <svg className="desk-bars__track" aria-hidden="true" focusable="false">
              <rect className="desk-bars__rail" width="100%" height="100%" rx="4" />
              {entry.share > 0 && (
                <rect
                  className="desk-bars__fill"
                  width={`${(entry.share * 100).toFixed(2)}%`}
                  height="100%"
                  rx="4"
                />
              )}
            </svg>
            <span className="desk-bars__value">
              {entry.costUsd === null ? t("desk.stats.noCost") : formatUsd(entry.costUsd, language)}
            </span>
          </li>
        ))}
      </ul>
      <Muted>{t("desk.stats.costByAgentHint")}</Muted>
    </Card>
  );
}

function Report({ stats }: { readonly stats: RunStats }) {
  const t = useT();
  if (stats.groups.length === 0) return <Muted>{t("desk.stats.empty")}</Muted>;
  return (
    <>
      <Card className="desk-panel">
        <h2>{t("desk.stats.groups")}</h2>
        <GroupsTable groups={stats.groups} />
        <Muted>{t("desk.stats.groupsHint")}</Muted>
      </Card>
      <div className="desk-split">
        <Card className="desk-panel">
          <h2>{t("desk.stats.issues")}</h2>
          <IssuesTable issues={stats.issues} />
        </Card>
        <CostByAgent groups={stats.groups} />
      </div>
      {stats.invalidLines > 0 && (
        <Muted>{t("desk.stats.invalidLines", { count: stats.invalidLines })}</Muted>
      )}
    </>
  );
}

interface Failure {
  readonly code: FailureCode;
  readonly detail: string | null;
}

const failureOf = (failure: unknown): Failure => {
  const converted = toApiError(failure);
  return { code: converted.code, detail: converted.detail };
};

/**
 * Agent runs compared by agent, provider, and model, from `runs.jsonl`, and the problems seen
 * in several issues, from `lessons.jsonl`. It reloads when an issue changes.
 */
export function StatsView() {
  const t = useT();
  const { api, state } = useDesk();
  const [stats, setStats] = useState<RunStats | null>(null);
  const [error, setError] = useState<Failure | null>(null);
  const [lessons, setLessons] = useState<LessonReport | null>(null);
  const [lessonsError, setLessonsError] = useState<Failure | null>(null);
  const [loading, setLoading] = useState(false);
  // The placeholder shows for a load the owner asked for, not for each quiet update.
  const [asked, setAsked] = useState(false);

  const load = useCallback(
    (byOwner: boolean): void => {
      setLoading(true);
      if (byOwner) setAsked(true);
      api
        .stats()
        .then((loaded) => {
          setStats(loaded);
          setError(null);
        })
        .catch((failure: unknown) => setError(failureOf(failure)))
        .finally(() => {
          setLoading(false);
          setAsked(false);
        });
      // Apart from the runs: a lessons failure must not hide the run tables.
      Promise.resolve()
        .then(() => api.lessons())
        .then((loaded) => {
          setLessons(loaded);
          setLessonsError(null);
        })
        .catch((failure: unknown) => setLessonsError(failureOf(failure)));
    },
    [api]
  );
  const refresh = useCallback((): void => load(true), [load]);

  // A finished run changes its issue, so a changed issue list means new numbers.
  useEffect(() => load(false), [load, state.issues]);
  usePaletteActions([{ id: "stats-refresh", label: t("desk.stats.refresh"), run: refresh }]);

  return (
    <>
      <div className="desk-heading">
        <div>
          <h1>{t("desk.stats.title")}</h1>
          <p className="desk-muted">{t("desk.stats.intro")}</p>
        </div>
        <Button appearance="subtle" onClick={refresh} disabled={loading}>
          {t("desk.stats.refresh")}
        </Button>
      </div>
      {error !== null && <FailureText code={error.code} detail={error.detail} />}
      {stats !== null && (
        <>
          <TodayDigest today={stats.days.at(-1) ?? null} issues={Object.values(state.issues)} />
          <WeekCards days={stats.days} />
        </>
      )}
      {loading && (asked || stats === null) && (
        <Card className="desk-panel">
          <LoadingLines label={t("desk.stats.loading")} lines={3} />
        </Card>
      )}
      {stats !== null && <Report stats={stats} />}
      {lessonsError !== null && (
        <FailureText code={lessonsError.code} detail={lessonsError.detail} />
      )}
      {lessons !== null && <LessonsPanel report={lessons} onReport={setLessons} />}
    </>
  );
}
