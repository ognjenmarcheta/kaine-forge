import type { HealthFix, HealthReport } from "@repo/desk/contracts";
import { Badge, Button, Card, Modal, Spinner } from "@repo/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { toApiError, type FailureCode } from "../api/api.client";
import { failureMessageKey } from "../api/api.errors";
import { useLanguage, useT } from "../i18n/i18n.t";
import { relativeTime } from "../shell/shell.format";
import { useNow } from "../shell/shell.now";
import { FailureText, Loading } from "../shell/shell.ui";
import { useDesk } from "../state/desk.provider";
import { HEALTH_TONE, appearanceOf, passTone } from "../status/status.model";

type Check = HealthReport["checks"][number];

/** Copies a command for the engineer to run. A login or an install stays in their hands. */
function CopyCommand({ command }: { readonly command: string }) {
  const t = useT();
  const copy = (): void => {
    const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
    if (clipboard === undefined) {
      toast.error(t("desk.health.copyFailed"));
      return;
    }
    clipboard.writeText(command).then(
      () => toast.success(t("desk.health.copied")),
      () => toast.error(t("desk.health.copyFailed"))
    );
  };
  return (
    <>
      <code>{command}</code>
      <Button
        appearance="subtle"
        spacing="compact"
        onClick={copy}
        aria-label={t("desk.health.copyLabel", { command })}
      >
        {t("desk.health.copy")}
      </Button>
    </>
  );
}

interface RemedyProps {
  readonly check: Check;
  /** The repair that runs now, on this page. */
  readonly running: HealthFix | null;
  readonly onFix: (fix: HealthFix) => void;
}

function Remedy({ check, running, onFix }: RemedyProps) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const { fix, command } = check;
  if (check.status === "ok" || (command === null && fix === null)) return null;
  return (
    <div className="desk-remedy">
      {command !== null && <CopyCommand command={command} />}
      {fix !== null && (
        <>
          <Button
            appearance="default"
            spacing="compact"
            disabled={running !== null}
            onClick={() => setConfirming(true)}
          >
            {running === fix ? (
              <>
                <Spinner size="sm" label={t("desk.health.fixing")} aria-hidden="true" />
                {t("desk.health.fixing")}
              </>
            ) : (
              t("desk.health.fix")
            )}
          </Button>
          <Modal
            open={confirming}
            onOpenChange={setConfirming}
            title={t(`desk.health.fix.title.${fix}`)}
            description={t(`desk.health.fix.description.${fix}`)}
            closeButtonLabel={t("desk.common.close")}
            size="sm"
            actions={[
              {
                appearance: "subtle",
                label: t("desk.common.back"),
                onClick: () => setConfirming(false)
              },
              {
                appearance: "default",
                label: t(`desk.health.fix.confirm.${fix}`),
                onClick: () => {
                  setConfirming(false);
                  onFix(fix);
                }
              }
            ]}
          />
        </>
      )}
    </div>
  );
}

function Report({
  report,
  running,
  onFix
}: {
  readonly report: HealthReport;
  readonly running: HealthFix | null;
  readonly onFix: (fix: HealthFix) => void;
}) {
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
            <Remedy check={check} running={running} onFix={onFix} />
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * The doctor, mirrored: what the desk needs and whether each part works. Text is the engine's
 * own. A failed check offers its command to copy, and the desk's own repair when one exists.
 */
export function HealthView() {
  const t = useT();
  const { state, api, loadHealth } = useDesk();
  const [error, setError] = useState<{ code: FailureCode; detail: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState<HealthFix | null>(null);

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

  const fix = (repair: HealthFix): void => {
    setRunning(repair);
    api.healthFix(repair).then(
      () => toast.info(t("desk.health.fix.started")),
      (failure: unknown) => {
        setRunning(null);
        const converted = toApiError(failure);
        toast.error(t(failureMessageKey(converted.code)), {
          ...(converted.detail === null ? {} : { description: converted.detail }),
          duration: Number.POSITIVE_INFINITY
        });
      }
    );
  };

  // The server reports the end of a repair as an event. A repeat of the same result is new too.
  const seen = useRef(state.repair?.seq ?? 0);
  useEffect(() => {
    const repair = state.repair;
    if (repair === null || repair.seq === seen.current) return;
    seen.current = repair.seq;
    setRunning(null);
    const label = t(`desk.health.fix.name.${repair.result.fix}`);
    if (repair.result.ok) {
      toast.success(t("desk.health.fix.done", { label }), { description: repair.result.detail });
    } else {
      toast.error(t("desk.health.fix.failed", { label }), {
        description: repair.result.detail,
        duration: Number.POSITIVE_INFINITY
      });
    }
  }, [state.repair, t]);

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
      {state.health !== null ? (
        <Report report={state.health} running={running} onFix={fix} />
      ) : (
        error === null && <Loading />
      )}
    </>
  );
}
