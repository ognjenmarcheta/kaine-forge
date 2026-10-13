import type { IssueRollup, RunGroup, RunStats } from "@repo/desk/contracts";
import { Button, Card } from "@repo/ui";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { toApiError, type FailureCode } from "../api/api.client";
import { useLanguage, useT } from "../i18n/i18n.t";
import { formatCount, formatDuration, formatUsd } from "../shell/shell.format";
import { RouteLink } from "../shell/shell.router";
import { FailureText, Loading, Muted } from "../shell/shell.ui";
import { useDesk } from "../state/desk.provider";

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

const GROUP_COLUMNS = [
  "role",
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
const TEXT_COLUMNS: ReadonlySet<string> = new Set(["role", "provider", "model"]);

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
            <tr key={`${group.role}:${group.provider}:${group.model ?? ""}`}>
              <th scope="row">{t(`desk.inspector.role.${group.role}`)}</th>
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
                  t(`desk.stage.${issue.stage}`)
                )}
              </td>
              <td>{issue.loops === null ? <Empty /> : t("desk.stats.loops", issue.loops)}</td>
              <Num>{issue.runs}</Num>
              <Num>{orEmpty(issue.totalCostUsd, (value) => formatUsd(value, language))}</Num>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
      <Card className="desk-panel">
        <h2>{t("desk.stats.issues")}</h2>
        <IssuesTable issues={stats.issues} />
      </Card>
      {stats.invalidLines > 0 && (
        <Muted>{t("desk.stats.invalidLines", { count: stats.invalidLines })}</Muted>
      )}
    </>
  );
}

/** Agent runs compared by role, provider, and model, from `runs.jsonl`. It reloads when an issue changes. */
export function StatsView() {
  const t = useT();
  const { api, state } = useDesk();
  const [stats, setStats] = useState<RunStats | null>(null);
  const [error, setError] = useState<{ code: FailureCode; detail: string | null } | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback((): void => {
    setLoading(true);
    api
      .stats()
      .then((loaded) => {
        setStats(loaded);
        setError(null);
      })
      .catch((failure: unknown) => {
        const converted = toApiError(failure);
        setError({ code: converted.code, detail: converted.detail });
      })
      .finally(() => setLoading(false));
  }, [api]);

  // A finished run changes its issue, so a changed issue list means new numbers.
  useEffect(refresh, [refresh, state.issues]);

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
      {stats !== null ? <Report stats={stats} /> : error === null && <Loading />}
    </>
  );
}
