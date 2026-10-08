import type { HealthReport } from "@repo/desk/contracts";
import { Badge, Button, Card } from "@repo/ui";
import { useCallback, useEffect, useState } from "react";

import { toApiError, type FailureCode } from "../api/api.client";
import { useLanguage, useT } from "../i18n/i18n.t";
import { relativeTime } from "../shell/shell.format";
import { useNow } from "../shell/shell.now";
import { FailureText, Loading } from "../shell/shell.ui";
import { useDesk } from "../state/desk.provider";
import { HEALTH_TONE, appearanceOf, passTone } from "../status/status.model";

function Report({ report }: { readonly report: HealthReport }) {
  const t = useT();
  const { language } = useLanguage();
  const now = useNow();
  return (
    <Card className="desk-panel">
      <p>
        <Badge appearance={appearanceOf(passTone(report.ok))}>
          {t(report.ok ? "desk.health.ok" : "desk.health.problems")}
        </Badge>{" "}
        <span className="desk-muted">
          {t("desk.health.checked", { when: relativeTime(report.generatedAt, now, language) })}
        </span>
      </p>
      <ul className="desk-checks">
        {report.checks.map((check) => (
          <li key={check.id}>
            <Badge appearance={appearanceOf(HEALTH_TONE[check.status])}>
              {t(`desk.health.status.${check.status}`)}
            </Badge>
            <strong>{check.label}</strong>
            <span className="desk-muted">{check.detail}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The doctor, mirrored: what the desk needs and whether each part works. Text is the engine's own. */
export function HealthView() {
  const t = useT();
  const { state, loadHealth } = useDesk();
  const [error, setError] = useState<{ code: FailureCode; detail: string | null } | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback((): void => {
    setLoading(true);
    loadHealth()
      .then(() => setError(null))
      .catch((failure: unknown) => {
        const converted = toApiError(failure);
        setError({ code: converted.code, detail: converted.detail });
      })
      .finally(() => setLoading(false));
  }, [loadHealth]);

  useEffect(refresh, [refresh]);

  return (
    <>
      <div className="desk-heading">
        <div>
          <h1>{t("desk.health.title")}</h1>
          <p className="desk-muted">{t("desk.health.intro")}</p>
        </div>
        <Button appearance="subtle" onClick={refresh} disabled={loading}>
          {t("desk.health.refresh")}
        </Button>
      </div>
      {error !== null && <FailureText code={error.code} detail={error.detail} />}
      {state.health !== null ? <Report report={state.health} /> : error === null && <Loading />}
    </>
  );
}
