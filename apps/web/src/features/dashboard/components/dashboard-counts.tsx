import { QueryError, StatCard } from "@repo/ui";
import { useId, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { useTranslation } from "../../../hooks/use-translation";
import { useNoteCount } from "../../notes/notes.hook";
import { useNotificationInbox } from "../../notifications/notifications.hook";
import { useTodoCounts } from "../../todos/todos.hook";

const renderLink = (href: string, content: ReactNode) => <Link to={href}>{content}</Link>;

export function DashboardCounts({
  todoCounts,
  noteCount
}: {
  todoCounts: ReturnType<typeof useTodoCounts>;
  noteCount: ReturnType<typeof useNoteCount>;
}) {
  const { t } = useTranslation();
  const headingId = useId();
  const { inbox, unreadCount } = useNotificationInbox();
  const failed = [todoCounts, noteCount, inbox].filter((query) => query.isError);

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="sr-only">
        {t("dashboard.counts.title")}
      </h2>
      {failed.length > 0 ? (
        <QueryError
          message={t("dashboard.counts.error")}
          retryLabel={t("common.retry")}
          onRetry={() => failed.forEach((query) => void query.refetch())}
        />
      ) : (
        <div className="ui-dashboard__counts">
          <StatCard
            label={t("dashboard.counts.openTodos")}
            value={todoCounts.data?.todoCounts.open}
            href="/todos"
            renderLink={renderLink}
          />
          <StatCard
            label={t("dashboard.counts.notes")}
            value={noteCount.data?.noteCount}
            href="/notes"
            renderLink={renderLink}
          />
          <StatCard
            label={t("dashboard.counts.unread")}
            value={inbox.data ? unreadCount : undefined}
          />
        </div>
      )}
    </section>
  );
}
