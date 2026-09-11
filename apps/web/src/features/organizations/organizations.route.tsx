import { createActiveOrganizationQueryKey, queryKeys } from "@repo/query";
import { Button } from "@repo/ui";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";

import { LoadingRows } from "../../components/loading-rows";
import { useOrganization } from "../../hooks/use-organization";
import { useTranslation } from "../../hooks/use-translation";
import { listOrganizationMembersRequest } from "../../lib/auth-api";

export function OrganizationsRoute() {
  const { t } = useTranslation();
  const {
    activeOrganizationId,
    isLoading: isOrganizationLoading,
    organizationsVisible
  } = useOrganization();
  const membersQuery = useQuery({
    queryKey: createActiveOrganizationQueryKey(
      queryKeys.organizationMembersScope(),
      activeOrganizationId
    ),
    queryFn: listOrganizationMembersRequest,
    enabled: organizationsVisible && Boolean(activeOrganizationId) && !isOrganizationLoading
  });

  const members = membersQuery.data?.members ?? [];
  if (!organizationsVisible) return <Navigate replace to="/dashboard" />;

  return (
    <section className="grid gap-[var(--ds-space-200)]">
      <header>
        <h1 className="text-heading-lg font-semibold text-[color:var(--ds-text)]">
          {t("organizations.members.title")}
        </h1>
        <p className="mt-[var(--ds-space-050)] text-body text-[color:var(--ds-text-subtle)]">
          {t("organizations.members.description")}
        </p>
      </header>

      {membersQuery.status === "pending" || isOrganizationLoading ? (
        <LoadingRows label={t("organizations.members.loading")} />
      ) : null}

      {membersQuery.status === "error" ? (
        <p role="alert" className="text-body text-[color:var(--ds-text-danger)]">
          {t("organizations.members.error")}{" "}
          <Button appearance="subtle" onClick={() => void membersQuery.refetch()}>
            {t("common.retry")}
          </Button>
        </p>
      ) : null}

      {membersQuery.status === "success" && members.length === 0 ? (
        <p className="text-body text-[color:var(--ds-text-subtle)]">
          {t("organizations.members.empty")}
        </p>
      ) : null}

      {members.length > 0 ? (
        <div className="ui-work-list">
          {members.map((member) => (
            <article key={member.id} className="ui-work-row">
              <div className="flex flex-wrap items-start justify-between gap-[var(--ds-space-150)]">
                <div>
                  <h2 className="text-heading-xs font-semibold text-[color:var(--ds-text)]">
                    {member.name}
                  </h2>
                  <p className="text-body-sm text-[color:var(--ds-text-subtle)]">{member.email}</p>
                </div>
                <span className="rounded-[var(--ds-radius-100)] bg-[var(--ds-background-neutral)] px-[var(--ds-space-100)] py-[var(--ds-space-050)] text-body-sm text-[color:var(--ds-text-subtle)]">
                  {member.role}
                </span>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
