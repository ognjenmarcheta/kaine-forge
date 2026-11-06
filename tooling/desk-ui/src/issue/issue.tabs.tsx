import type { FlowModel, FlowSnapshot, HistoryEvent, NodeKind } from "@repo/desk/contracts";

import {
  OUTCOME_TONE,
  activityGroups,
  isKnownEvent,
  type ActivityGroup,
  type ActivityRow
} from "./issue.activity";
import { StageIcon } from "../flow/flow.icon";
import { useStageNames } from "../flow/flow.names";
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
    <li className="dk-actr" data-outcome={row.outcome}>
      <time dateTime={row.at} className="dk-t-small dk-t-subtlest dk-num">
        {formatClock(row.at, language)}
      </time>
      <span className="dk-t-small dk-strong">
        {isKnownEvent(row.event) ? t(`desk.activity.event.${row.event}`) : row.event}
      </span>
      {row.note === null ? (
        <span className="dk-t-small dk-t-sub dk-actn" />
      ) : (
        <OverflowTooltip text={row.note} overflowing={noteCut}>
          <span ref={noteRef} className="dk-t-small dk-t-sub dk-actn">
            {row.note}
          </span>
        </OverflowTooltip>
      )}
      <span className="dk-t-small dk-t-sub dk-num">
        {row.durationMs === null
          ? ""
          : row.ongoing
            ? t("desk.activity.ongoing", { duration: formatDuration(row.durationMs, language) })
            : formatDuration(row.durationMs, language)}
      </span>
      <span className="dk-actp">
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
  const names = useStageNames();
  const name = group.node === null ? names.stage(group.stage) : names.node(group.node);
  return (
    <li className="dk-tli">
      <h3 className="dk-acth">
        {kind !== undefined && <StageIcon kind={kind} />}
        <span>
          {group.round > 1 ? t("desk.activity.round", { stage: name, round: group.round }) : name}
        </span>
      </h3>
      <ol className="dk-actrs">
        {group.rows.map((row) => (
          <Row key={row.id} row={row} />
        ))}
      </ol>
    </li>
  );
}

/** The history as runs of a step: what happened, how long it took, how it ended. */
export function Activity({
  history,
  flow,
  snapshot,
  running,
  newestFirst
}: {
  readonly history: readonly HistoryEvent[];
  readonly flow: FlowModel;
  readonly snapshot: FlowSnapshot;
  readonly running: boolean;
  readonly newestFirst: boolean;
}) {
  const t = useT();
  const now = useNow();
  const newest = activityGroups(history, now, running, snapshot);
  const groups = newestFirst ? newest : [...newest].reverse();
  if (groups.length === 0) return <p className="dk-t-sub">{t("desk.activity.empty")}</p>;
  return (
    <ol className="dk-tl" aria-label={t("desk.activity.label")}>
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
