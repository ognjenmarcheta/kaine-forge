import {
  SEVERITY_LABELS,
  type ArtifactId,
  builderOutputSchema,
  checkReportViewSchema,
  plannerOutputSchema,
  reviewArtifactViewSchema,
  type FlowModel,
  type FlowNode,
  type IssueDetail
} from "@repo/desk/contracts";
import { Collapsible, CollapsibleContent, CollapsibleTrigger, Tag } from "@repo/ui";
import type { ReactNode } from "react";
import type { z } from "zod";

import {
  buildChecklist,
  checkChecklist,
  contractChecklist,
  planChecklist,
  reviewChecklist,
  shipChecklist,
  stageKpis,
  type CheckItem,
  type StageArtifacts
} from "./inspector.model";
import { Checklist, KpiGrid } from "./inspector.parts";
import { useJsonArtifact, type ArtifactState } from "../artifacts/artifact.use";
import { useT } from "../i18n/i18n.t";
import { FailureText, List, Muted, Pre } from "../shell/shell.ui";
import { StatusChip } from "../status/status.chip";
import { SEVERITY_TONE, appearanceOf, passTone } from "../status/status.model";

interface SectionProps {
  readonly node: FlowNode;
  readonly detail: IssueDetail;
  readonly flow: FlowModel;
  readonly revision: string;
}

const MISSING = { status: "missing" } as const;

/**
 * A stage's artifact, read only when the detail lists it as present: a stage that has not
 * written it yet costs no request and reads as missing at once.
 */
function useStageArtifact<T>(
  section: SectionProps,
  id: ArtifactId,
  schema: z.ZodType<T>
): ArtifactState<T> {
  const present = section.detail.artifacts.some((entry) => entry.id === id && entry.present);
  const state = useJsonArtifact(
    section.detail.summary.issueNumber,
    id,
    schema,
    section.revision,
    present
  );
  return present ? state : MISSING;
}

function Block({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="desk-inspector__section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

/** The state of an artifact that has no value yet: a short line, never a guess. */
function ArtifactNote<T>({ state }: { readonly state: ArtifactState<T> }) {
  const t = useT();
  if (state.status === "missing") return <Muted>{t("desk.artifact.missing")}</Muted>;
  if (state.status === "error") return <FailureText code={state.code} detail={state.detail} />;
  return null;
}

function Frame({
  section,
  artifacts,
  children
}: {
  readonly section: SectionProps;
  readonly artifacts?: StageArtifacts;
  readonly children: ReactNode;
}) {
  return (
    <>
      <KpiGrid kpis={stageKpis(section.node, section.detail, section.flow, artifacts)} />
      {children}
    </>
  );
}

function TicketSection(props: SectionProps) {
  const t = useT();
  const items = contractChecklist(props.detail.contract);
  return (
    <Frame section={props}>
      <Block title={t("desk.ticket.contract")}>
        {items.length === 0 ? (
          <Muted>{t("desk.artifact.missing")}</Muted>
        ) : (
          <Checklist label={t("desk.ticket.contract")} items={items} />
        )}
      </Block>
    </Frame>
  );
}

function PlanSection(props: SectionProps) {
  const t = useT();
  const plan = useStageArtifact(props, "plan", plannerOutputSchema);
  return (
    <Frame section={props} artifacts={{ plan }}>
      <Block title={t("desk.plan.criteria")}>
        {plan.status === "ok" ? (
          <Checklist label={t("desk.plan.criteria")} items={planChecklist(plan.value)} />
        ) : (
          <ArtifactNote state={plan} />
        )}
      </Block>
      {plan.status === "ok" && plan.value.openQuestions.length > 0 && (
        <Block title={t("desk.plan.questions")}>
          <List empty="" items={plan.value.openQuestions} />
        </Block>
      )}
    </Frame>
  );
}

function BuildSection(props: SectionProps) {
  const t = useT();
  const build = useStageArtifact(props, "build", builderOutputSchema);
  return (
    <Frame section={props} artifacts={{ build }}>
      <Block title={t("desk.build.claimed")}>
        {build.status === "ok" ? (
          <>
            <Checklist label={t("desk.build.claimed")} items={buildChecklist(build.value)} />
            <Muted>{t("desk.build.claimedHint")}</Muted>
          </>
        ) : (
          <ArtifactNote state={build} />
        )}
      </Block>
    </Frame>
  );
}

function CheckSection(props: SectionProps) {
  const t = useT();
  const check = props.detail.check;
  const report = useStageArtifact(props, "check-report", checkReportViewSchema);
  const tailOf = (item: CheckItem): ReactNode => {
    if (item.state !== "fail" || report.status !== "ok") return null;
    const index = Number(item.id.replace("step-", ""));
    const tail = report.value.steps[index]?.tail ?? "";
    if (tail.trim() === "") return null;
    return (
      <Collapsible className="desk-checklist__more">
        <CollapsibleTrigger className="desk-link-button">
          {t("desk.check.output")}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Pre label={t("desk.check.output")}>{tail}</Pre>
        </CollapsibleContent>
      </Collapsible>
    );
  };
  return (
    <Frame section={props}>
      <Block title={t("desk.check.steps")}>
        {check === null ? (
          <Muted>{t("desk.artifact.missing")}</Muted>
        ) : (
          <Checklist label={t("desk.check.steps")} items={checkChecklist(check)} extra={tailOf} />
        )}
      </Block>
    </Frame>
  );
}

function ReviewSection(props: SectionProps) {
  const t = useT();
  const review = props.detail.review;
  const view = useStageArtifact(props, "review", reviewArtifactViewSchema);
  return (
    <Frame section={props}>
      <Block title={t("desk.review.findings")}>
        {review === null ? (
          <Muted>{t("desk.artifact.missing")}</Muted>
        ) : (
          <div className="desk-inspector__chips">
            <StatusChip tone={passTone(review.verdict === "approve")}>
              {t(`desk.review.verdict.${review.verdict}`)}
            </StatusChip>
            {SEVERITY_LABELS.filter((severity) => review.bySeverity[severity] > 0).map(
              (severity) => (
                <Tag key={severity} appearance={appearanceOf(SEVERITY_TONE[severity])}>
                  {t("desk.inspector.severityCount", {
                    severity: t(`desk.review.severity.${severity}`),
                    count: review.bySeverity[severity]
                  })}
                </Tag>
              )
            )}
          </div>
        )}
      </Block>
      {view.status === "ok" && view.value.review.acceptanceStatus.length > 0 && (
        <Block title={t("desk.inspector.acceptance")}>
          <Checklist label={t("desk.inspector.acceptance")} items={reviewChecklist(view.value)} />
        </Block>
      )}
    </Frame>
  );
}

function ShipSection(props: SectionProps) {
  const t = useT();
  return (
    <Frame section={props}>
      <Block title={t("desk.gate.ready.title")}>
        <Checklist label={t("desk.gate.ready.title")} items={shipChecklist(props.detail.ship)} />
      </Block>
    </Frame>
  );
}

/** The tiles and checklists of one stage. Each stage reads only the artifact it needs. */
export function StageSection(props: SectionProps) {
  switch (props.node.id) {
    case "ticket":
      return <TicketSection {...props} />;
    case "plan":
    case "plan-gate":
      return <PlanSection {...props} />;
    case "build":
      return <BuildSection {...props} />;
    case "check":
      return <CheckSection {...props} />;
    case "review":
      return <ReviewSection {...props} />;
    case "pr-review":
    case "ship":
      return <ShipSection {...props} />;
  }
}
