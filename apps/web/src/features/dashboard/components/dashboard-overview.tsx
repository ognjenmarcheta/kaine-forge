import { t } from "@repo/translation";

import { DASHBOARD_DEFINITION } from "../dashboard.definition";

export function DashboardOverview() {
  return (
    <section className="grid gap-[var(--ds-space-200)]">
      <header>
        <h1>{t("dashboard.title")}</h1>
        <p className="text-[color:var(--ds-text-subtle)]">{t("dashboard.summary")}</p>
      </header>

      <div className="grid gap-[var(--ds-space-150)] [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
        {DASHBOARD_DEFINITION.cards.map((card) => (
          <article
            key={card.titleKey}
            className="rounded-[var(--ds-radius-300)] border border-[var(--ds-border)] bg-[var(--ds-surface-raised)] p-[var(--ds-space-200)] shadow-raised"
          >
            <h2 className="mt-0">{t(card.titleKey)}</h2>
            <p>{t(card.descriptionKey)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
