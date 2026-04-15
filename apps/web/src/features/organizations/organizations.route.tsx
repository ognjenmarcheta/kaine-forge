import { queryKeys } from "@repo/query";
import { useQuery } from "@tanstack/react-query";

import { useOrganization } from "../../hooks/use-organization";
import { useTranslation } from "../../hooks/use-translation";
import { listOrganizationMembersRequest } from "../../lib/auth-api";

export function OrganizationsRoute() {
  const { t } = useTranslation();
  const { activeOrganizationId, isLoading: isOrganizationLoading } = useOrganization();
  const membersQuery = useQuery({
    queryKey: activeOrganizationId
      ? queryKeys.organizationMembers(activeOrganizationId)
      : ["organizations", "members", "inactive"],
    queryFn: () => listOrganizationMembersRequest(activeOrganizationId ?? ""),
    enabled: Boolean(activeOrganizationId) && !isOrganizationLoading
  });

  const members = membersQuery.data?.members ?? [];

  return (
    <section className="grid gap-[var(--ds-space-200)] p-[var(--ds-space-300)]">
      <header>
        <h1 className="text-heading-lg font-semibold text-[color:var(--ds-text)]">
          {t("organizations.members.title")}
        </h1>
        <p className="mt-[var(--ds-space-050)] text-body text-[color:var(--ds-text-subtle)]">
          {t("organizations.members.description")}
        </p>
      </header>

      {membersQuery.status === "pending" || isOrganizationLoading ? (
        <p className="text-body text-[color:var(--ds-text-subtle)]">
          {t("organizations.members.loading")}
        </p>
      ) : null}

      {membersQuery.status === "error" ? (
        <p className="text-body text-[color:var(--ds-text-danger)]">
          {t("organizations.members.error")}
        </p>
      ) : null}

      {membersQuery.status === "success" && members.length === 0 ? (
        <p className="text-body text-[color:var(--ds-text-subtle)]">
          {t("organizations.members.empty")}
        </p>
      ) : null}

      {members.length > 0 ? (
        <div className="grid gap-[var(--ds-space-100)]">
          {members.map((member) => (
            <article
              key={member.id}
              className="rounded-[var(--ds-radius-200)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-[var(--ds-space-200)] shadow-raised"
            >
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
