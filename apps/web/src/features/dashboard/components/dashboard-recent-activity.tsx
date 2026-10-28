import { Button, EmptyState, QueryError, SettingsSection } from "@repo/ui";
import { Link } from "react-router-dom";

import { LoadingRows } from "../../../components/loading-rows";
import { useTranslation } from "../../../hooks/use-translation";
import { formatRelativeTime } from "../../../lib/relative-time";
import { useAuditEvents, useAuditLogAccess } from "../../audit/audit.hook";

const RECENT_EVENTS = 5;

/** The latest Audit Events, shown only to a session with the `audit:read` Permission. */
export function DashboardRecentActivity({ organizationId }: { organizationId: string | null }) {
  const { language, t } = useTranslation();
  const canRead = useAuditLogAccess(organizationId);
  // The audit page's own query, so both share one cached first page.
  const events = useAuditEvents(organizationId, canRead === true);

  if (canRead !== true) return null;

  const items = events.data?.pages[0]?.auditEvents.items.slice(0, RECENT_EVENTS) ?? [];

  return (
    <SettingsSection
      title={t("dashboard.activity.title")}
      actions={
        <Button asChild appearance="link">
          <Link to="/audit-log">{t("dashboard.activity.viewAll")}</Link>
        </Button>
      }
    >
      {events.isPending ? <LoadingRows label={t("dashboard.activity.loading")} /> : null}
      {events.isError ? (
        <QueryError
          message={t("dashboard.activity.error")}
          retryLabel={t("common.retry")}
          onRetry={() => void events.refetch()}
        />
      ) : null}
      {events.isSuccess && items.length === 0 ? (
        <EmptyState title={t("dashboard.activity.empty")} />
      ) : null}
      {items.length > 0 ? (
        <ul className="ui-work-list">
          {items.map((event) => (
            <li key={event.id} className="ui-work-row ui-dashboard__row">
              <span className="font-semibold">
                {event.actor?.name ?? t("organizations.audit.unknownActor")}
              </span>
              <span className="ui-dashboard__row-title">
                {t(`organizations.audit.action.${event.action}`)}
              </span>
              <time className="ui-dashboard__row-meta" dateTime={String(event.createdAt)}>
                {formatRelativeTime(String(event.createdAt), language)}
              </time>
            </li>
          ))}
        </ul>
      ) : null}
    </SettingsSection>
  );
}
