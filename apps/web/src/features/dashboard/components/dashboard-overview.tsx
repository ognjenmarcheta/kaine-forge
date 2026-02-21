import { t } from "@repo/translation";
import { Card, CardDescription, CardHeader, CardTitle } from "@repo/ui";

import { DASHBOARD_DEFINITION } from "../dashboard.definition";

export function DashboardOverview() {
  return (
    <section className="grid gap-ds-200">
      <header>
        <h1>{t("dashboard.title")}</h1>
        <p className="text-ds-text-subtle">{t("dashboard.summary")}</p>
      </header>

      <div className="grid gap-ds-150 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
        {DASHBOARD_DEFINITION.cards.map((card) => (
          <Card key={card.titleKey}>
            <CardHeader>
              <CardTitle>{t(card.titleKey)}</CardTitle>
              <CardDescription>{t(card.descriptionKey)}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </section>
  );
}
