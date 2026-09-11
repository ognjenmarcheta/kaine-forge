import { ArrowRight } from "@repo/ui";
import { NavLink } from "react-router-dom";

import { useOrganization } from "../../../hooks/use-organization";
import { useTranslation } from "../../../hooks/use-translation";
import { DASHBOARD_LINKS } from "../dashboard.definition";

export function DashboardOverview() {
  const { t } = useTranslation();
  const { organizations, activeOrganizationId, organizationsVisible } = useOrganization();
  const organization = organizations.find((item) => item.id === activeOrganizationId);
  const links = DASHBOARD_LINKS.filter((link) => organizationsVisible || link.href !== "/members");
  return (
    <section className="grid gap-[var(--ds-space-400)]">
      <header>
        {organizationsVisible && organization ? (
          <p className="text-[color:var(--ds-text-subtle)]">{organization.name}</p>
        ) : null}
        <h1>{t("dashboard.title")}</h1>
        <p className="text-[color:var(--ds-text-subtle)]">{t("dashboard.summary")}</p>
      </header>
      <nav aria-label={t("navigation.dashboard")} className="ui-feature-links">
        {links.map((link) => (
          <NavLink
            key={link.href}
            to={link.href}
            className={
              link.href === "/todos"
                ? "ui-feature-link ui-feature-link--primary"
                : "ui-feature-link"
            }
          >
            <div>
              <strong>{t(link.title)}</strong>
              <p>{t(link.description)}</p>
            </div>
            <ArrowRight aria-hidden="true" className="size-[var(--ds-space-200)] shrink-0" />
          </NavLink>
        ))}
      </nav>
    </section>
  );
}
