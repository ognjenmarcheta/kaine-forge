import { Button } from "@repo/ui";
import { Link } from "react-router-dom";

import { useTranslation } from "../hooks/use-translation";

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <section className="grid content-start gap-[var(--ds-space-200)] p-[var(--ds-space-600)]">
      <h1>{t("notFound.title")}</h1>
      <p className="text-[color:var(--ds-text-subtle)]">{t("notFound.summary")}</p>
      <div className="flex flex-wrap gap-[var(--ds-space-100)]">
        <Button asChild>
          <Link to="/dashboard">{t("common.goToDashboard")}</Link>
        </Button>
      </div>
    </section>
  );
}
