import { MAX_FEEDBACK_CHARS, plannerOutputSchema, type PlannerOutput } from "@repo/desk/contracts";
import { Input, Label, Tag } from "@repo/ui";
import { useId } from "react";

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

/** "apps/web/src/" and "board.tsx": the folder quiet, the name bold. */
export function FilePath({ path }: { readonly path: string }) {
  const cut = path.lastIndexOf("/") + 1;
  return (
    <code className="desk-path">
      <span className="desk-path__dir">{path.slice(0, cut)}</span>
      <b>{path.slice(cut)}</b>
    </code>
  );
}

/**
 * The plan as the gate shows it: what it does, the planner's open questions with one answer
 * box, and the acceptance criteria. The files, tests, risks, and changeset are folded: they
 * matter less to the decision and stay one click away.
 */
export function PlanGateBody({
  plan,
  answer,
  onAnswer
}: {
  readonly plan: PlannerOutput;
  readonly answer: string;
  readonly onAnswer: (answer: string) => void;
}) {
  const t = useT();
  const id = useId();
  return (
    <>
      <p className="desk-plain">{plan.summary}</p>
      {plan.openQuestions.length > 0 && (
        <section className="desk-sec">
          <h3>{t("desk.plan.questionsCount", { count: plan.openQuestions.length })}</h3>
          <div className="desk-question">
            {plan.openQuestions.map((question, index) => (
              <p key={index} className="desk-question__text">
                {question}
              </p>
            ))}
            <Label htmlFor={`${id}-answer`}>{t("desk.plan.answer")}</Label>
            <Input
              id={`${id}-answer`}
              value={answer}
              maxLength={MAX_FEEDBACK_CHARS}
              onChange={(event) => onAnswer(event.target.value)}
            />
          </div>
        </section>
      )}
      <section className="desk-sec">
        <h3>{t("desk.plan.criteriaCount", { count: plan.acceptanceCriteria.length })}</h3>
        <ul className="desk-criteria">
          {plan.acceptanceCriteria.map((entry, index) => (
            <li key={index}>
              <strong>{entry.criterion}</strong>
              <span className="desk-muted">{entry.change}</span>
            </li>
          ))}
        </ul>
      </section>
      <details className="desk-fold">
        <summary>{t("desk.plan.more", { count: plan.files.length + plan.tests.length })}</summary>
        <section className="desk-sec">
          <h3>{t("desk.plan.filesCount", { count: plan.files.length + plan.tests.length })}</h3>
          <ul className="desk-files">
            {plan.files.map((file) => (
              <li key={file.path} className="desk-files__row">
                <Tag>{t(`desk.plan.action.${file.action}`)}</Tag>
                <FilePath path={file.path} />
                <span className="desk-muted">{file.purpose}</span>
              </li>
            ))}
            {plan.tests.map((test) => (
              <li key={test.path} className="desk-files__row">
                <Tag>{t(`desk.plan.action.${test.action}`)}</Tag>
                <FilePath path={test.path} />
                <span className="desk-muted">{test.reason}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="desk-sec">
          <h3>{t("desk.plan.risks")}</h3>
          <List empty={t("desk.common.none")} items={plan.risks} />
        </section>
        <section className="desk-sec">
          <dl className="desk-kv">
            <dt>{t("desk.plan.changeset")}</dt>
            <dd>
              {plan.changeset.required ? (
                <>
                  {t("desk.plan.changesetRequired", { bump: plan.changeset.bump })}{" "}
                  <code>{plan.changeset.packages.join(", ")}</code>
                </>
              ) : (
                t("desk.plan.changesetNone")
              )}
            </dd>
            <dt>{t("desk.plan.pullRequest")}</dt>
            <dd>
              <Tag>{plan.pr.type}</Tag> <code>{plan.pr.slug}</code>
            </dd>
            <dt>{t("desk.common.plainLanguage")}</dt>
            <dd>{plan.plainLanguage}</dd>
          </dl>
        </section>
      </details>
    </>
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
