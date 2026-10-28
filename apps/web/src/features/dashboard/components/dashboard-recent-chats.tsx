import { createActiveOrganizationQueryKey } from "@repo/query";
import { Button, EmptyState, QueryError, SettingsSection } from "@repo/ui";
import { Link } from "react-router-dom";

import { LoadingRows } from "../../../components/loading-rows";
import { useGetConversationsQuery } from "../../../graphql/generated/react-query";
import { useTranslation } from "../../../hooks/use-translation";
import { formatRelativeTime } from "../../../lib/relative-time";
import { CONVERSATIONS_VARIABLES } from "../../assistant/assistant.definition";

const RECENT_CHATS = 3;

/** The latest chats. The Assistant keeps the open chat in memory, so rows link to the Assistant. */
export function DashboardRecentChats({
  organizationId,
  enabled
}: {
  organizationId: string | null;
  enabled: boolean;
}) {
  const { language, t } = useTranslation();
  // The Assistant's own key, so both share one cached conversation list.
  const chats = useGetConversationsQuery(CONVERSATIONS_VARIABLES, {
    enabled,
    queryKey: createActiveOrganizationQueryKey(
      useGetConversationsQuery.getKey(CONVERSATIONS_VARIABLES),
      organizationId
    )
  });
  const items = chats.data?.conversations.items.slice(0, RECENT_CHATS) ?? [];

  return (
    <SettingsSection
      title={t("dashboard.chats.title")}
      actions={
        <Button asChild appearance="link">
          <Link to="/assistant">{t("dashboard.chats.viewAll")}</Link>
        </Button>
      }
    >
      {chats.isPending ? <LoadingRows label={t("dashboard.chats.loading")} /> : null}
      {chats.isError ? (
        <QueryError
          message={t("dashboard.chats.error")}
          retryLabel={t("common.retry")}
          onRetry={() => void chats.refetch()}
        />
      ) : null}
      {chats.isSuccess && items.length === 0 ? (
        <EmptyState
          title={t("dashboard.chats.empty")}
          action={
            <Button asChild>
              <Link to="/assistant">{t("dashboard.chats.emptyAction")}</Link>
            </Button>
          }
        />
      ) : null}
      {items.length > 0 ? (
        <ul className="ui-work-list">
          {items.map((chat) => (
            <li key={chat.id} className="ui-work-row ui-dashboard__row">
              <Link className="ui-dashboard__row-title" to="/assistant">
                {chat.title || t("assistant.untitled")}
              </Link>
              <time className="ui-dashboard__row-meta" dateTime={String(chat.updatedAt)}>
                {formatRelativeTime(String(chat.updatedAt), language)}
              </time>
            </li>
          ))}
        </ul>
      ) : null}
    </SettingsSection>
  );
}
