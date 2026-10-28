import { createActiveOrganizationQueryKey } from "@repo/query";
import { Button, EmptyState, QueryError, SettingsSection } from "@repo/ui";
import { Link } from "react-router-dom";

import { LoadingRows } from "../../../components/loading-rows";
import { useGetNotesQuery } from "../../../graphql/generated/react-query";
import { useTranslation } from "../../../hooks/use-translation";
import { formatRelativeTime } from "../../../lib/relative-time";
import { NEW_NOTE } from "../../notes/notes.util";

const RECENT_NOTES = { first: 5 };

export function DashboardRecentNotes({
  organizationId,
  enabled
}: {
  organizationId: string | null;
  enabled: boolean;
}) {
  const { language, t } = useTranslation();
  const notes = useGetNotesQuery(RECENT_NOTES, {
    enabled,
    queryKey: createActiveOrganizationQueryKey(
      useGetNotesQuery.getKey(RECENT_NOTES),
      organizationId
    )
  });
  const items = notes.data?.notes.items ?? [];

  return (
    <SettingsSection
      title={t("dashboard.notes.title")}
      actions={
        <Button asChild appearance="link">
          <Link to="/notes">{t("dashboard.notes.viewAll")}</Link>
        </Button>
      }
    >
      {notes.isPending ? <LoadingRows label={t("dashboard.notes.loading")} /> : null}
      {notes.isError ? (
        <QueryError
          message={t("dashboard.notes.error")}
          retryLabel={t("common.retry")}
          onRetry={() => void notes.refetch()}
        />
      ) : null}
      {notes.isSuccess && items.length === 0 ? (
        <EmptyState
          title={t("dashboard.notes.empty")}
          action={
            <Button asChild>
              <Link to={`/notes/${NEW_NOTE}`}>{t("dashboard.notes.emptyAction")}</Link>
            </Button>
          }
        />
      ) : null}
      {items.length > 0 ? (
        <ul className="ui-work-list">
          {items.map((note) => (
            <li key={note.id} className="ui-work-row ui-dashboard__row">
              <Link className="ui-dashboard__row-title" to={`/notes/${note.id}`}>
                {note.title || t("notes.untitled")}
              </Link>
              <time className="ui-dashboard__row-meta" dateTime={String(note.updatedAt)}>
                {formatRelativeTime(String(note.updatedAt), language)}
              </time>
            </li>
          ))}
        </ul>
      ) : null}
    </SettingsSection>
  );
}
