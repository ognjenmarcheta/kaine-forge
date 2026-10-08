import { checkReportViewSchema, type CheckReportView } from "@repo/desk/contracts";
import { Badge } from "@repo/ui";

import { useJsonArtifact } from "./artifact.use";
import { useLanguage, useT } from "../i18n/i18n.t";
import { formatDuration } from "../shell/shell.format";
import { FailureText, Loading, Muted, Pre, Section } from "../shell/shell.ui";
import { appearanceOf, passTone } from "../status/status.model";

/** The engine's own check verdict, with the tail of each step. Agent claims never replace it. */
export function CheckView({ report }: { readonly report: CheckReportView }) {
  const t = useT();
  const { language } = useLanguage();
  return (
    <div className="desk-artifact">
      <p>
        <Badge appearance={appearanceOf(passTone(report.passed))}>
          {t(report.passed ? "desk.check.passed" : "desk.check.failed")}
        </Badge>{" "}
        <span className="desk-muted">{t(`desk.check.kind.${report.kind}`)}</span>
      </p>
      {report.generatedDrift && <p className="desk-warning">{t("desk.check.drift")}</p>}
      <Section title={t("desk.check.steps")}>
        {report.steps.length === 0 ? (
          <Muted>{t("desk.common.none")}</Muted>
        ) : (
          <ol className="desk-steps">
            {report.steps.map((step, index) => {
              const ok = step.code === 0 && !step.timedOut;
              return (
                <li key={index}>
                  <p>
                    <code>{step.argv.join(" ")}</code>{" "}
                    <Badge appearance={appearanceOf(passTone(ok))}>
                      {step.timedOut
                        ? t("desk.check.timedOut")
                        : t("desk.check.exit", { code: step.code ?? "-" })}
                    </Badge>{" "}
                    <span className="desk-muted">{formatDuration(step.durationMs, language)}</span>
                  </p>
                  {step.tail.trim() !== "" && (
                    <details open={!ok}>
                      <summary>{t("desk.check.output")}</summary>
                      <Pre label={t("desk.check.output")}>{step.tail}</Pre>
                    </details>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </Section>
    </div>
  );
}

export function CheckArtifact({
  issueNumber,
  revision
}: {
  readonly issueNumber: number;
  readonly revision: string;
}) {
  const t = useT();
  const state = useJsonArtifact(issueNumber, "check-report", checkReportViewSchema, revision);
  switch (state.status) {
    case "loading":
      return <Loading />;
    case "missing":
      return <Muted>{t("desk.artifact.missing")}</Muted>;
    case "error":
      return <FailureText code={state.code} detail={state.detail} />;
    case "ok":
      return <CheckView report={state.value} />;
  }
}
