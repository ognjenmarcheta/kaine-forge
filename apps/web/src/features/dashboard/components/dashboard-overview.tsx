import { t } from "@repo/translation";

import { DASHBOARD_DEFINITION } from "../dashboard.definition";

export function DashboardOverview() {
  return (
    <section className="web-dashboard">
      <header>
        <h1>{t("dashboard.title")}</h1>
        <p className="web-muted">Operational summary for your personal workspace.</p>
      </header>

      <div className="web-dashboard__grid">
        {DASHBOARD_DEFINITION.cards.map((card) => (
          <article key={card.title} className="web-dashboard__card">
            <h2>{card.title}</h2>
            <p>{card.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
