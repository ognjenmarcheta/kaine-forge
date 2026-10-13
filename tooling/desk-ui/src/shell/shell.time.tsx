import { formatElapsed, relativeTime } from "./shell.format";
import { useLanguage, useT } from "../i18n/i18n.t";
import type { ReadableSummary } from "../status/status.model";

/** "12m in this stage", or when the issue last changed when the stage start is unknown. */
export function TimeInStage({
  summary,
  now
}: {
  readonly summary: ReadableSummary;
  readonly now: number;
}) {
  const t = useT();
  const { language } = useLanguage();
  if (summary.stageEnteredAt === null) {
    return (
      <time dateTime={summary.updatedAt}>
        {t("desk.card.updated", { when: relativeTime(summary.updatedAt, now, language) })}
      </time>
    );
  }
  const elapsed = now - Date.parse(summary.stageEnteredAt);
  return (
    <time dateTime={summary.stageEnteredAt}>
      {t("desk.card.inStage", { duration: formatElapsed(elapsed, language) })}
    </time>
  );
}
