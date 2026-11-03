import { Button } from "@repo/ui";
import { useId } from "react";
import { toast } from "sonner";

import { nodeIdsOf, issueFlowOf } from "../flow/flow.steps";
import { useT } from "../i18n/i18n.t";
import { useNewWork } from "../shell/shell.newwork";
import { useRouter } from "../shell/shell.router";
import { useDesk } from "../state/desk.provider";
import { gateModeOf, type ReadableSummary } from "../status/status.model";
import type { WorkItem } from "../work/work.model";

/** The issue got past its plan: the plan gate of its flow passed, or the issue ended. */
const passedPlan = (summary: ReadableSummary): boolean => {
  const flow = issueFlowOf(summary);
  const gate = flow.steps.find((step) => step.role === "plan-gate");
  if (gate === undefined) return summary.status === "done";
  const index = nodeIdsOf(flow).indexOf(gate.id);
  return summary.progress[index] === "passed" || summary.status === "done";
};

/** First run: no issue on the desk has got past its plan yet. The guide goes away after that. */
export const isFirstRun = (items: readonly WorkItem[]): boolean =>
  !items.some((item) => item.kind === "issue" && item.summary.readable && passedPlan(item.summary));

/** Three steps to the first plan: fix the setup, start an issue, approve its plan. */
export function FirstRunGuide({ items }: { readonly items: readonly WorkItem[] }) {
  const t = useT();
  const heading = useId();
  const { state } = useDesk();
  const { navigate } = useRouter();
  const newWork = useNewWork();
  const errors = state.health?.checks.filter((check) => check.status === "error") ?? [];
  const issues = items.flatMap((item) =>
    item.kind === "issue" && item.summary.readable ? [item.summary] : []
  );
  const plan = issues.find((summary) => gateModeOf(summary) === "plan-gate");

  const steps = [
    {
      title: t("desk.inbox.guide.setup"),
      text:
        errors.length === 0
          ? t("desk.inbox.guide.setupOk")
          : t("desk.inbox.guide.setupBad", {
              count: errors.length,
              checks: errors.map((check) => check.label).join(", ")
            }),
      done: errors.length === 0,
      cta: t("desk.inbox.setup.open"),
      run: () => navigate({ view: "setup" })
    },
    {
      title: t("desk.inbox.guide.start"),
      text: t("desk.inbox.guide.startText"),
      done: items.some((item) => item.kind === "issue"),
      cta: t("desk.inbox.guide.startCta"),
      run: () => newWork.open()
    },
    {
      title: t("desk.inbox.guide.approve"),
      text: t("desk.inbox.guide.approveText"),
      done: false,
      cta: t("desk.inbox.guide.approveCta"),
      run: () => {
        if (plan === undefined) toast(t("desk.inbox.guide.notReady"));
        else navigate({ view: "issue", issueNumber: plan.issueNumber });
      }
    }
  ];
  // The step to do now: the first one not done.
  const on = steps.findIndex((step) => !step.done);

  return (
    <section className="dk-card dk-mb-250" aria-labelledby={heading}>
      <div className="dk-card-h">
        <div className="dk-grow">
          <h2 id={heading} className="dk-h-card">
            {t("desk.inbox.guide.title")}
          </h2>
          <p className="dk-t-sub">{t("desk.inbox.guide.intro")}</p>
        </div>
      </div>
      <ol className="dk-guide">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className={`dk-gstep${index === on ? " dk-on" : ""}${step.done ? " dk-done" : ""}`}
          >
            <span className="dk-gnum" aria-hidden="true">
              {step.done ? "✓" : String(index + 1)}
            </span>
            <div>
              <b>{step.title}</b>
              {step.done && <span className="dk-sr"> {t("desk.inbox.guide.done")}</span>}
              <p className="dk-t-sub dk-t-small">{step.text}</p>
            </div>
            {!step.done && (
              <Button
                appearance={index === on ? "default" : "outline"}
                spacing="compact"
                onClick={step.run}
              >
                {step.cta}
              </Button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
