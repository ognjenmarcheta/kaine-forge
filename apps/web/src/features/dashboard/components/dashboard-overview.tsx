import { t } from "@repo/translation";

import { DASHBOARD_DEFINITION } from "../dashboard.definition";

export function DashboardOverview() {
  return (
    <section className="web-dashboard">
      <header>
        <h1>{t("dashboard.title")}</h1>
        <p className="web-muted">{t("dashboard.summary")}</p>
      </header>

      <div className="web-dashboard__grid">
        {DASHBOARD_DEFINITION.cards.map((card) => (
          <article key={card.titleKey} className="web-dashboard__card">
            <h2>{t(card.titleKey)}</h2>
            <p>{t(card.descriptionKey)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
