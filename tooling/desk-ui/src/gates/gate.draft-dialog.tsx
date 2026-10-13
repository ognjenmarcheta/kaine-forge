import { issueDraftSchema, type IssueDraft } from "@repo/desk/contracts";
import { Badge, Modal, Spinner, Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { IssueActions } from "./gate.actions";
import { toApiError, type FailureCode } from "../api/api.client";
import { useT } from "../i18n/i18n.t";
import { FailureText, ItemList, List, Muted, Pre, Section } from "../shell/shell.ui";
import { useDesk } from "../state/desk.provider";
import { appearanceOf, passTone } from "../status/status.model";

type DraftPhase =
  | { readonly kind: "loading" }
  | { readonly kind: "review"; readonly draft: IssueDraft; readonly current: string | null }
  | { readonly kind: "confirm"; readonly draft: IssueDraft; readonly current: string | null }
  | { readonly kind: "applying" }
  | { readonly kind: "failed"; readonly code: FailureCode; readonly detail: string | null };

export interface DraftDialogProps {
  readonly issueNumber: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly actions: IssueActions;
}

const APPLY = { action: "apply-draft", confirm: true } as const;

function DraftReview({
  draft,
  current
}: {
  readonly draft: IssueDraft;
  readonly current: string | null;
}) {
  const t = useT();
  const full = draft.contract.found === draft.contract.total;
  return (
    <>
      <p className="desk-draft__facts">
        <Badge appearance={appearanceOf(passTone(full))}>
          {t("desk.draft.contract", { found: draft.contract.found, total: draft.contract.total })}
        </Badge>
        <Badge appearance="default">{t(`desk.draft.recommendation.${draft.recommendation}`)}</Badge>
      </p>
      <Section title={t("desk.draft.reasons")}>
        <List items={draft.reasons} empty={t("desk.common.none")} />
      </Section>
      <Section title={t("desk.draft.unknowns")}>
        <ItemList
          items={draft.unknowns}
          empty={t("desk.draft.noUnknowns")}
          render={(unknown) => (
            <>
              <strong>{t(`desk.draft.section.${unknown.section}`)}</strong> {unknown.question}
            </>
          )}
        />
      </Section>
      <Tabs defaultValue="proposed" className="desk-tabs">
        <TabsList className="desk-tabs__list">
          <TabsTrigger value="proposed">{t("desk.draft.proposed")}</TabsTrigger>
          <TabsTrigger value="current">{t("desk.draft.current")}</TabsTrigger>
        </TabsList>
        <TabsContent value="proposed" className="desk-tabs__panel">
          <Pre label={t("desk.draft.proposed")}>{draft.body}</Pre>
        </TabsContent>
        <TabsContent value="current" className="desk-tabs__panel">
          {current === null ? (
            <Muted>{t("desk.artifact.missing")}</Muted>
          ) : (
            <Pre label={t("desk.draft.current")}>{current}</Pre>
          )}
        </TabsContent>
      </Tabs>
      <Muted>{t("desk.draft.plainLanguage", { text: draft.plainLanguage })}</Muted>
    </>
  );
}

/**
 * The intake draft of an issue: the proposed body in the issue format next to what the issue
 * says now, the agent's recommendation and the open questions. Apply asks a second time, and
 * only that yes sends `confirm: true`. The text is shown as text: it comes from the issue.
 */
export function DraftDialog({ issueNumber, open, onOpenChange, actions }: DraftDialogProps) {
  const t = useT();
  const { api } = useDesk();
  const [phase, setPhase] = useState<DraftPhase>({ kind: "loading" });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPhase({ kind: "loading" });
    void (async () => {
      try {
        const draft = await api.artifactJson(issueNumber, "issue-draft", issueDraftSchema);
        const current = await api.artifactText(issueNumber, "ticket").catch(() => null);
        if (!cancelled) setPhase({ kind: "review", draft, current });
      } catch (error) {
        const failure = toApiError(error);
        if (!cancelled) setPhase({ kind: "failed", code: failure.code, detail: failure.detail });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, issueNumber, open]);

  const copy = (body: string): void => {
    const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
    if (clipboard === undefined) {
      toast.error(t("desk.health.copyFailed"));
      return;
    }
    clipboard.writeText(body).then(
      () => toast.success(t("desk.draft.copied")),
      () => toast.error(t("desk.health.copyFailed"))
    );
  };

  const apply = async (): Promise<void> => {
    setPhase({ kind: "applying" });
    const settled = await actions.run(APPLY);
    if (settled.kind === "error") {
      setPhase({ kind: "failed", code: settled.code, detail: settled.detail });
      return;
    }
    onOpenChange(false);
  };

  const close = {
    appearance: "subtle",
    label: t("desk.common.close"),
    onClick: () => onOpenChange(false)
  } as const;
  const modalActions = (() => {
    switch (phase.kind) {
      case "review":
        return [
          close,
          {
            appearance: "subtle",
            label: t("desk.draft.copy"),
            onClick: () => copy(phase.draft.body)
          },
          {
            appearance: "default",
            label: t("desk.draft.apply"),
            onClick: () => setPhase({ ...phase, kind: "confirm" })
          }
        ] as const;
      case "confirm":
        return [
          {
            appearance: "subtle",
            label: t("desk.common.back"),
            onClick: () => setPhase({ ...phase, kind: "review" })
          },
          { appearance: "danger", label: t("desk.draft.confirm"), onClick: () => void apply() }
        ] as const;
      case "applying":
        return [];
      default:
        return [close];
    }
  })();
  const locked = phase.kind === "applying";

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!locked) onOpenChange(next);
      }}
      title={t("desk.draft.title", { number: issueNumber })}
      description={t("desk.draft.intro")}
      closeButtonLabel={t("desk.common.close")}
      showCloseButton={!locked}
      closeOnEscape={!locked}
      closeOnOverlayClick={false}
      size="lg"
      actions={[...modalActions]}
    >
      <div className="desk-draft" aria-live="polite">
        {phase.kind === "loading" && (
          <p className="desk-loading">
            <Spinner size="sm" label={t("desk.common.loading")} aria-hidden="true" />
            <span>{t("desk.common.loading")}</span>
          </p>
        )}
        {phase.kind === "review" && <DraftReview draft={phase.draft} current={phase.current} />}
        {phase.kind === "confirm" && <p>{t("desk.draft.confirmText", { number: issueNumber })}</p>}
        {phase.kind === "applying" && (
          <p className="desk-loading">
            <Spinner size="sm" label={t("desk.draft.applying")} aria-hidden="true" />
            <span>{t("desk.draft.applying")}</span>
          </p>
        )}
        {phase.kind === "failed" && <FailureText code={phase.code} detail={phase.detail} />}
      </div>
    </Modal>
  );
}
