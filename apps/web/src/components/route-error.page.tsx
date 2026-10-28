import { Button } from "@repo/ui";
import { useEffect } from "react";
import { Link, useLocation, useNavigate, useRouteError } from "react-router-dom";

import { useTranslation } from "../hooks/use-translation";

// The web app has no error reporting seam, so the console is the only sink.
// The raw error never reaches the page: it can carry internals. Try again
// replaces the current entry, which gives the route boundary a new location:
// the boundary resets and the route renders and loads again.
export function RouteErrorPage() {
  const error = useRouteError();
  const { hash, pathname, search } = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="grid content-start gap-ds-200 p-ds-600">
      <h1>{t("error.generic")}</h1>
      <p className="text-ds-text-subtle">{t("error.routeSummary")}</p>
      <div className="flex flex-wrap gap-ds-100">
        <Button
          onClick={() => void navigate({ hash, pathname, search }, { replace: true })}
          type="button"
        >
          {t("common.retry")}
        </Button>
        <Button appearance="secondary" asChild>
          <Link to="/dashboard">{t("common.goToDashboard")}</Link>
        </Button>
      </div>
    </section>
  );
}
