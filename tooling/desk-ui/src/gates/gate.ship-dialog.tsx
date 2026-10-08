import { shipPlanViewSchema, type ShipPlanView } from "@repo/desk/contracts";
import { Modal, Spinner } from "@repo/ui";
import { useCallback, useEffect, useRef, useState } from "react";

import type { IssueActions } from "./gate.actions";
import { toApiError, type FailureCode } from "../api/api.client";
import { useT } from "../i18n/i18n.t";
import { FailureText, ItemList, List, Muted, Pre, Section } from "../shell/shell.ui";
import { useDesk } from "../state/desk.provider";

export type ShipPhase =
  | { readonly kind: "checking" }
  | { readonly kind: "review"; readonly plan: ShipPlanView; readonly prBody: string | null }
  | { readonly kind: "confirm"; readonly plan: ShipPlanView }
  | { readonly kind: "shipping" }
  | { readonly kind: "shipped" }
  | { readonly kind: "failed"; readonly code: FailureCode; readonly detail: string | null };

export interface ShipDialogProps {
  readonly issueNumber: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly actions: IssueActions;
}

const DRY_RUN = { action: "ship", confirm: false, dryRun: true } as const;
const SHIP = { action: "ship", confirm: true, dryRun: false } as const;

/**
 * Two steps before a ship. The dry run changes nothing and shows what the ship would do
 * and which gate rules fail. A second screen asks for the final yes. Only that yes sends `confirm: true`.
 */
export function ShipDialog({ issueNumber, open, onOpenChange, actions }: ShipDialogProps) {
  const t = useT();
  const { api } = useDesk();
  const [phase, setPhase] = useState<ShipPhase>({ kind: "checking" });
  const run = useRef(actions.run);
  useEffect(() => {
    run.current = actions.run;
  });

  const dryRun = useCallback(async (): Promise<void> => {
    setPhase({ kind: "checking" });
    const settled = await run.current(DRY_RUN);
    if (settled.kind === "error") {
      setPhase({ kind: "failed", code: settled.code, detail: settled.detail });
      return;
    }
    try {
      const plan = await api.artifactJson(issueNumber, "ship-plan", shipPlanViewSchema);
      const prBody = await api.artifactText(issueNumber, "pr-body").catch(() => null);
      setPhase({ kind: "review", plan, prBody });
    } catch (error) {
      const failure = toApiError(error);
      setPhase({ kind: "failed", code: failure.code, detail: failure.detail });
    }
  }, [api, issueNumber]);

  useEffect(() => {
    if (open) void dryRun();
  }, [open, dryRun]);

  const ship = async (): Promise<void> => {
    setPhase({ kind: "shipping" });
    const settled = await run.current(SHIP);
    if (settled.kind === "error") {
      setPhase({ kind: "failed", code: settled.code, detail: settled.detail });
    } else if (settled.kind === "done" && settled.outcome.stop !== "shipped") {
      // The ship stopped before the PR (a hook failed): the issue is in needs-you.
      setPhase({ kind: "failed", code: "ship-refused", detail: settled.outcome.message });
    } else {
      setPhase({ kind: "shipped" });
    }
  };

  const close = (): void => onOpenChange(false);
  const locked = phase.kind === "shipping";
  const closeAction = {
    appearance: "subtle",
    label: t("desk.common.close"),
    onClick: close
  } as const;

  const actionsFor = () => {
    switch (phase.kind) {
      case "checking":
      case "shipped":
        return [closeAction];
      case "review":
        return [
          closeAction,
          {
            appearance: "default",
            label: t("desk.ship.next"),
            disabled: !phase.plan.gate.ok,
            onClick: () => setPhase({ kind: "confirm", plan: phase.plan })
          }
        ] as const;
      case "confirm":
        return [
          {
            appearance: "subtle",
            label: t("desk.common.back"),
            onClick: () => void dryRun()
          },
          {
            appearance: "danger",
            label: t("desk.ship.confirm"),
            onClick: () => void ship()
          }
        ] as const;
      case "shipping":
        return [];
      case "failed":
        return [
          closeAction,
          { appearance: "secondary", label: t("desk.ship.retry"), onClick: () => void dryRun() }
        ] as const;
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!locked) onOpenChange(next);
      }}
      title={t("desk.ship.title")}
      description={t(`desk.ship.step.${phase.kind}`)}
      closeButtonLabel={t("desk.common.close")}
      showCloseButton={!locked}
      closeOnEscape={!locked}
      closeOnOverlayClick={false}
      size="lg"
      actions={[...actionsFor()]}
    >
      <div className="desk-ship" aria-live="polite">
        {phase.kind === "checking" && (
          <p className="desk-loading">
            <Spinner size="sm" label={t("desk.ship.checking")} aria-hidden="true" />
            <span>{t("desk.ship.checking")}</span>
          </p>
        )}
        {phase.kind === "review" && <ShipReview plan={phase.plan} prBody={phase.prBody} />}
        {phase.kind === "confirm" && (
          <>
            <p>
              {t("desk.ship.confirmText", {
                count: phase.plan.files.length,
                branch: phase.plan.branch ?? t("desk.common.unknown")
              })}
            </p>
            <p className="desk-note">{t("desk.ship.youMerge")}</p>
          </>
        )}
        {phase.kind === "shipping" && (
          <p className="desk-loading">
            <Spinner size="sm" label={t("desk.ship.shipping")} aria-hidden="true" />
            <span>{t("desk.ship.shipping")}</span>
          </p>
        )}
        {phase.kind === "shipped" && (
          <>
            <p className="desk-note">{t("desk.ship.done")}</p>
            <p className="desk-muted">{t("desk.ship.youMerge")}</p>
          </>
        )}
        {phase.kind === "failed" && <FailureText code={phase.code} detail={phase.detail} />}
      </div>
    </Modal>
  );
}

function ShipReview({
  plan,
  prBody
}: {
  readonly plan: ShipPlanView;
  readonly prBody: string | null;
}) {
  const t = useT();
  return (
    <div className="desk-artifact">
      <Section title={t("desk.ship.gate")}>
        {plan.gate.ok ? (
          <p className="desk-note">{t("desk.ship.gateOk")}</p>
        ) : (
          <div className="desk-failure" role="alert">
            <p>{t("desk.ship.gateFailed")}</p>
            <ItemList
              empty=""
              items={plan.gate.failures}
              render={(failure) => (
                <>
                  <code>{failure.kind}</code> <span>{failure.message}</span>
                </>
              )}
            />
          </div>
        )}
      </Section>
      <Section title={t("desk.ship.commit")}>
        <p>
          <code>{plan.commitHeader}</code>
        </p>
        <p className="desk-muted">
          {t("desk.ship.branch")} <code>{plan.branch ?? t("desk.common.unknown")}</code>
        </p>
      </Section>
      <Section title={t("desk.ship.pullRequest")}>
        <p>{plan.pullRequest.title}</p>
        <p className="desk-muted">{t("desk.ship.draft")}</p>
      </Section>
      <Section title={t("desk.ship.changeset")}>
        <p>
          <strong>{t(`desk.ship.changesetKind.${plan.changeset.kind}`)}</strong>{" "}
          <span className="desk-muted">{plan.changeset.reason}</span>
        </p>
        {plan.changesetText !== null && (
          <Pre label={t("desk.ship.changeset")}>{plan.changesetText}</Pre>
        )}
      </Section>
      <Section title={t("desk.ship.files", { count: plan.files.length })}>
        <ItemList
          empty={t("desk.common.none")}
          items={plan.files}
          render={(file) => <code>{file}</code>}
        />
      </Section>
      {plan.unfilledHeadings.length > 0 && (
        <Section title={t("desk.ship.unfilled")}>
          <List empty="" items={plan.unfilledHeadings} />
        </Section>
      )}
      {prBody !== null && (
        <details>
          <summary>{t("desk.ship.prBody")}</summary>
          <Pre label={t("desk.ship.prBody")}>{prBody}</Pre>
        </details>
      )}
      {plan.files.length === 0 && <Muted>{t("desk.ship.noFiles")}</Muted>}
    </div>
  );
}
