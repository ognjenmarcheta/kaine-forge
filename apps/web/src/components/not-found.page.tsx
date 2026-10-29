import { Button } from "@repo/ui";
import { Link } from "react-router-dom";

import { useTranslation } from "../hooks/use-translation";

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <section className="grid content-start gap-ds-200 p-ds-600">
      <h1>{t("notFound.title")}</h1>
      <p className="text-ds-text-subtle">{t("notFound.summary")}</p>
      <div className="flex flex-wrap gap-ds-100">
        <Button asChild>
          <Link to="/dashboard">{t("common.goToDashboard")}</Link>
        </Button>
      </div>
    </section>
  );
}
