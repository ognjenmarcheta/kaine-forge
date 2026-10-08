import { plannerOutputSchema, type PlannerOutput } from "@repo/desk/contracts";
import { Tag } from "@repo/ui";

import { useJsonArtifact } from "./artifact.use";
import { useT } from "../i18n/i18n.t";
import { FailureText, ItemList, List, Loading, Muted, Section } from "../shell/shell.ui";

/** The planner's structured result, as components. No Markdown is rendered. */
export function PlanView({ plan }: { readonly plan: PlannerOutput }) {
  const t = useT();
  return (
    <div className="desk-artifact">
      <p>{plan.summary}</p>
      <Section title={t("desk.plan.criteria")}>
        <ItemList
          empty={t("desk.common.none")}
          items={plan.acceptanceCriteria}
          render={(entry) => (
            <>
              <strong>{entry.criterion}</strong>
              <span className="desk-muted">{entry.change}</span>
            </>
          )}
        />
      </Section>
      <Section title={t("desk.plan.files")}>
        <ItemList
          empty={t("desk.common.none")}
          items={plan.files}
          render={(file) => (
            <>
              <Tag>{t(`desk.plan.action.${file.action}`)}</Tag> <code>{file.path}</code>
              <span className="desk-muted">{file.purpose}</span>
            </>
          )}
        />
      </Section>
      <Section title={t("desk.plan.tests")}>
        <ItemList
          empty={t("desk.common.none")}
          items={plan.tests}
          render={(test) => (
            <>
              <Tag>{t(`desk.plan.action.${test.action}`)}</Tag> <code>{test.path}</code>
              <span className="desk-muted">{test.reason}</span>
            </>
          )}
        />
      </Section>
      <Section title={t("desk.plan.risks")}>
        <List empty={t("desk.common.none")} items={plan.risks} />
      </Section>
      <Section title={t("desk.plan.questions")}>
        <List empty={t("desk.common.none")} items={plan.openQuestions} />
      </Section>
      <Section title={t("desk.plan.changeset")}>
        {plan.changeset.required ? (
          <p>
            {t("desk.plan.changesetRequired", { bump: plan.changeset.bump })}{" "}
            <code>{plan.changeset.packages.join(", ")}</code>
          </p>
        ) : (
          <Muted>{t("desk.plan.changesetNone")}</Muted>
        )}
      </Section>
      <Section title={t("desk.plan.pullRequest")}>
        <p>
          <Tag>{plan.pr.type}</Tag> <code>{plan.pr.slug}</code>
        </p>
      </Section>
      <Section title={t("desk.common.plainLanguage")}>
        <p>{plan.plainLanguage}</p>
      </Section>
    </div>
  );
}

export function PlanArtifact({
  issueNumber,
  revision
}: {
  readonly issueNumber: number;
  readonly revision: string;
}) {
  const t = useT();
  const state = useJsonArtifact(issueNumber, "plan", plannerOutputSchema, revision);
  switch (state.status) {
    case "loading":
      return <Loading />;
    case "missing":
      return <Muted>{t("desk.artifact.missing")}</Muted>;
    case "error":
      return <FailureText code={state.code} detail={state.detail} />;
    case "ok":
      return <PlanView plan={state.value} />;
  }
}
