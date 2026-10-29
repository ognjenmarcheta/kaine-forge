import { Button, EmptyState, PageHeader, QueryError, ShieldCheck } from "@repo/ui";
import { Navigate } from "react-router-dom";

import { useAuditEvents, useAuditLogAccess } from "./audit.hook";
import { LoadingRows } from "../../components/loading-rows";
import { useOrganization } from "../../hooks/use-organization";
import { useTranslation } from "../../hooks/use-translation";
import { formatRelativeTime } from "../../lib/relative-time";
import "./audit.styles.css";

export function AuditLogRoute() {
  const { language, t } = useTranslation();
  const { activeOrganizationId } = useOrganization();
  const canRead = useAuditLogAccess(activeOrganizationId);
  const eventsQuery = useAuditEvents(activeOrganizationId, canRead === true);

  if (canRead === false) {
    return <Navigate replace to="/dashboard" />;
  }

  const events = eventsQuery.data?.pages.flatMap((page) => page.auditEvents.items) ?? [];

  return (
    <section className="ui-audit">
      <PageHeader
        title={t("organizations.audit.title")}
        description={t("organizations.audit.description")}
      />

      {canRead === null || eventsQuery.status === "pending" ? (
        <LoadingRows label={t("organizations.audit.loading")} />
      ) : null}

      {eventsQuery.status === "error" ? (
        <QueryError
          message={t("organizations.audit.error")}
          retryLabel={t("common.retry")}
          onRetry={() => void eventsQuery.refetch()}
        />
      ) : null}

      {eventsQuery.status === "success" && events.length === 0 ? (
        <EmptyState icon={ShieldCheck} title={t("organizations.audit.empty")} />
      ) : null}

      {events.length > 0 ? (
        <ul aria-label={t("organizations.audit.title")} className="ui-work-list">
          {events.map((event) => {
            const createdAt = String(event.createdAt);
            return (
              <li key={event.id} className="ui-work-row ui-audit__row">
                <p className="ui-audit__summary">
                  <span className="ui-audit__part ui-audit__actor">
                    <span className="sr-only">{t("organizations.audit.actor")} </span>
                    {event.actor
                      ? `${event.actor.name} (${event.actor.email})`
                      : t("organizations.audit.unknownActor")}
                  </span>{" "}
                  <span className="ui-audit__part">
                    {t(`organizations.audit.action.${event.action}`)}
                  </span>{" "}
                  {event.targetLabel ? (
                    <span className="ui-audit__part">
                      <span className="sr-only">{t("organizations.audit.target")} </span>
                      {event.targetLabel}
                    </span>
                  ) : null}{" "}
                  {event.ipAddress ? (
                    <span className="ui-audit__part">
                      <span className="sr-only">{t("organizations.audit.ipAddress")} </span>
                      {event.ipAddress}
                    </span>
                  ) : null}
                </p>
                <time
                  className="ui-audit__time"
                  dateTime={createdAt}
                  title={new Date(createdAt).toLocaleString(language)}
                >
                  <span className="sr-only">{t("organizations.audit.time")} </span>
                  {formatRelativeTime(createdAt, language)}
                </time>
              </li>
            );
          })}
        </ul>
      ) : null}

      {eventsQuery.hasNextPage ? (
        <Button
          appearance="subtle"
          className="justify-self-start"
          disabled={eventsQuery.isFetchingNextPage}
          onClick={() => void eventsQuery.fetchNextPage()}
        >
          {t(
            eventsQuery.isFetchingNextPage
              ? "organizations.audit.loading"
              : "organizations.audit.loadMore"
          )}
        </Button>
      ) : null}
    </section>
  );
}
