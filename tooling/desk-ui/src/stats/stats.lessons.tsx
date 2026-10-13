import type { LessonCandidate, LessonReport } from "@repo/desk/contracts";
import { Card } from "@repo/ui";

import { useLanguage, useT } from "../i18n/i18n.t";
import { formatCount } from "../shell/shell.format";
import { RouteLink } from "../shell/shell.router";
import { Muted } from "../shell/shell.ui";

function Samples({ candidate }: { readonly candidate: LessonCandidate }) {
  const t = useT();
  return (
    <ul className="desk-lesson__samples">
      {candidate.samples.map((sample, index) => (
        // Agent and issue text: rendered as text, never as markup.
        <li key={`${sample.issue}:${index}`}>
          <span className="desk-muted">{t("desk.issue.number", { number: sample.issue })}</span>{" "}
          {sample.file !== null && <code>{sample.file}</code>} {sample.detail}
        </li>
      ))}
    </ul>
  );
}

function LessonsTable({ candidates }: { readonly candidates: readonly LessonCandidate[] }) {
  const t = useT();
  const { language } = useLanguage();
  return (
    <div className="desk-table-scroll" tabIndex={0} aria-label={t("desk.lessons.title")}>
      <table className="desk-table" aria-label={t("desk.lessons.title")}>
        <thead>
          <tr>
            <th scope="col">{t("desk.lessons.column.problem")}</th>
            <th scope="col">{t("desk.lessons.column.issues")}</th>
            <th scope="col" className="desk-table__number">
              {t("desk.lessons.column.times")}
            </th>
            <th scope="col" className="desk-table__number">
              {t("desk.lessons.column.now")}
            </th>
            <th scope="col">{t("desk.lessons.column.samples")}</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((candidate) => (
            <tr key={candidate.key}>
              <th scope="row">
                <code>{candidate.key}</code>
                <div className="desk-muted">{t(`desk.lessons.source.${candidate.source}`)}</div>
              </th>
              <td>
                <span className="desk-lesson__issues">
                  {candidate.issues.map((issue) => (
                    <RouteLink key={issue} to={{ view: "issue", issueNumber: issue }}>
                      {t("desk.issue.number", { number: issue })}
                    </RouteLink>
                  ))}
                </span>
              </td>
              <td className="desk-table__number">{formatCount(candidate.occurrences, language)}</td>
              <td className="desk-table__number">
                {formatCount(candidate.currentOccurrences, language)}
              </td>
              <td>
                <Samples candidate={candidate} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Problems seen in several issues. The desk only lists them: the owner decides what to encode. */
export function LessonsPanel({ report }: { readonly report: LessonReport }) {
  const t = useT();
  return (
    <Card className="desk-panel">
      <h2>{t("desk.lessons.title")}</h2>
      {report.candidates.length === 0 ? (
        <Muted>{t("desk.lessons.empty", { count: report.minIssues })}</Muted>
      ) : (
        <>
          <LessonsTable candidates={report.candidates} />
          <Muted>{t("desk.lessons.hint", { count: report.minIssues })}</Muted>
        </>
      )}
      {report.belowThreshold > 0 && (
        <Muted>{t("desk.lessons.belowThreshold", { count: report.belowThreshold })}</Muted>
      )}
      {report.invalidLines > 0 && (
        <Muted>{t("desk.lessons.invalidLines", { count: report.invalidLines })}</Muted>
      )}
    </Card>
  );
}
