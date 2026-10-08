import type { FlowModel, HistoryEvent, NodeKind } from "@repo/desk/contracts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui";

import {
  OUTCOME_TONE,
  activityGroups,
  isKnownEvent,
  type ActivityGroup,
  type ActivityRow
} from "./issue.activity";
import { LogPanel } from "./issue.log";
import { StageIcon } from "../flow/flow.icon";
import { useLanguage, useT } from "../i18n/i18n.t";
import { formatClock, formatDuration } from "../shell/shell.format";
import { useNow } from "../shell/shell.now";
import { OverflowTooltip, useOverflow } from "../shell/shell.overflow";
import { StatusChip } from "../status/status.chip";

function Row({ row }: { readonly row: ActivityRow }) {
  const t = useT();
  const { language } = useLanguage();
  const [noteRef, noteCut] = useOverflow<HTMLSpanElement>(row.note ?? "");
  return (
    <li className="desk-activity__row" data-outcome={row.outcome}>
      <time dateTime={row.at} className="desk-activity__time">
        {formatClock(row.at, language)}
      </time>
      <span className="desk-activity__event">
        {isKnownEvent(row.event) ? t(`desk.activity.event.${row.event}`) : row.event}
      </span>
      {row.note === null ? (
        <span className="desk-activity__note" />
      ) : (
        <OverflowTooltip text={row.note} overflowing={noteCut}>
          <span ref={noteRef} className="desk-activity__note">
            {row.note}
          </span>
        </OverflowTooltip>
      )}
      <span className="desk-activity__duration">
        {row.durationMs === null
          ? ""
          : row.ongoing
            ? t("desk.activity.ongoing", { duration: formatDuration(row.durationMs, language) })
            : formatDuration(row.durationMs, language)}
      </span>
      <span className="desk-activity__pill">
        <StatusChip tone={OUTCOME_TONE[row.outcome]}>
          {t(`desk.activity.outcome.${row.outcome}`)}
        </StatusChip>
      </span>
    </li>
  );
}

function Group({
  group,
  kind
}: {
  readonly group: ActivityGroup;
  readonly kind: NodeKind | undefined;
}) {
  const t = useT();
  const name =
    group.node === null ? t(`desk.stage.${group.stage}`) : t(`desk.flow.node.${group.node}`);
  return (
    <li className="desk-activity__group">
      <h3 className="desk-activity__head">
        {kind !== undefined && <StageIcon kind={kind} />}
        <span>
          {group.round > 1 ? t("desk.activity.round", { stage: name, round: group.round }) : name}
        </span>
      </h3>
      <ol className="desk-activity__rows">
        {group.rows.map((row) => (
          <Row key={row.id} row={row} />
        ))}
      </ol>
    </li>
  );
}

/** The history as runs of a stage, newest first: what happened, how long it took, how it ended. */
function Activity({
  history,
  flow,
  running
}: {
  readonly history: readonly HistoryEvent[];
  readonly flow: FlowModel;
  readonly running: boolean;
}) {
  const t = useT();
  const now = useNow();
  const groups = activityGroups(history, now, running);
  if (groups.length === 0) return <p className="desk-muted">{t("desk.activity.empty")}</p>;
  return (
    <ol className="desk-activity" aria-label={t("desk.activity.label")}>
      {groups.map((group) => (
        <Group
          key={group.id}
          group={group}
          kind={flow.nodes.find((node) => node.id === group.node)?.kind}
        />
      ))}
    </ol>
  );
}

/** Activity and the live log, below the pipeline. */
export function IssueTabs({
  issueNumber,
  history,
  flow,
  running
}: {
  readonly issueNumber: number;
  readonly history: readonly HistoryEvent[];
  readonly flow: FlowModel;
  readonly running: boolean;
}) {
  const t = useT();
  return (
    <Tabs defaultValue="activity" className="desk-tabs">
      <TabsList className="desk-tabs__list">
        <TabsTrigger value="activity">{t("desk.activity.title")}</TabsTrigger>
        <TabsTrigger value="log">{t("desk.log.title")}</TabsTrigger>
      </TabsList>
      <TabsContent value="activity" className="desk-tabs__panel">
        <Activity history={history} flow={flow} running={running} />
      </TabsContent>
      <TabsContent value="log" className="desk-tabs__panel">
        <LogPanel issueNumber={issueNumber} />
      </TabsContent>
    </Tabs>
  );
}
