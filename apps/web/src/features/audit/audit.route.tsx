import { Button } from "@repo/ui";
import { Navigate } from "react-router-dom";

import { useAuditEvents, useAuditLogAccess } from "./audit.hook";
import { LoadingRows } from "../../components/loading-rows";
import { useOrganization } from "../../hooks/use-organization";
import { useTranslation } from "../../hooks/use-translation";

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
    <section className="grid gap-[var(--ds-space-300)]">
      <header>
        <h1 className="text-heading-lg font-semibold text-[color:var(--ds-text)]">
          {t("organizations.audit.title")}
        </h1>
        <p className="mt-[var(--ds-space-050)] text-body text-[color:var(--ds-text-subtle)]">
          {t("organizations.audit.description")}
        </p>
      </header>

      {canRead === null || eventsQuery.status === "pending" ? (
        <LoadingRows label={t("organizations.audit.loading")} />
      ) : null}

      {eventsQuery.status === "error" ? (
        <p role="alert" className="text-body text-[color:var(--ds-text-danger)]">
          {t("organizations.audit.error")}{" "}
          <Button appearance="subtle" onClick={() => void eventsQuery.refetch()}>
            {t("common.retry")}
          </Button>
        </p>
      ) : null}

      {eventsQuery.status === "success" && events.length === 0 ? (
        <p className="text-body text-[color:var(--ds-text-subtle)]">
          {t("organizations.audit.empty")}
        </p>
      ) : null}

      {events.length > 0 ? (
        <ul aria-label={t("organizations.audit.title")} className="ui-work-list">
          {events.map((event) => (
            <li key={event.id} className="ui-work-row grid gap-[var(--ds-space-050)]">
              <p className="text-body font-semibold text-[color:var(--ds-text)]">
                {t(`organizations.audit.action.${event.action}`)}
              </p>
              <dl className="grid gap-x-[var(--ds-space-150)] gap-y-[var(--ds-space-025)] text-body-sm text-[color:var(--ds-text-subtle)] md:grid-cols-[auto_1fr]">
                <dt>{t("organizations.audit.actor")}</dt>
                <dd className="min-w-0 break-words">
                  {event.actor
                    ? `${event.actor.name} (${event.actor.email})`
                    : t("organizations.audit.unknownActor")}
                </dd>
                {event.targetLabel ? (
                  <>
                    <dt>{t("organizations.audit.target")}</dt>
                    <dd className="min-w-0 break-words">{event.targetLabel}</dd>
                  </>
                ) : null}
                <dt>{t("organizations.audit.time")}</dt>
                <dd>
                  <time dateTime={String(event.createdAt)}>
                    {new Date(String(event.createdAt)).toLocaleString(language)}
                  </time>
                </dd>
                {event.ipAddress ? (
                  <>
                    <dt>{t("organizations.audit.ipAddress")}</dt>
                    <dd>{event.ipAddress}</dd>
                  </>
                ) : null}
              </dl>
            </li>
          ))}
        </ul>
      ) : null}

      {eventsQuery.hasNextPage ? (
        <Button
          appearance="subtle"
          className="justify-self-start"
          disabled={eventsQuery.isFetchingNextPage}
          onClick={() => void eventsQuery.fetchNextPage()}
        >
          {t("organizations.audit.loadMore")}
        </Button>
      ) : null}
    </section>
  );
}
