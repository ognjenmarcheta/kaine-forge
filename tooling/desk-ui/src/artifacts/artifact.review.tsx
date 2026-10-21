import type { ReviewSummary } from "@repo/desk/contracts";
import { Badge, Button, Tag } from "@repo/ui";

import { useT } from "../i18n/i18n.t";
import { Muted, Section } from "../shell/shell.ui";
import { SEVERITY_TONE, appearanceOf, passTone } from "../status/status.model";

type Finding = ReviewSummary["findings"][number];

function FindingItem({ finding }: { readonly finding: Finding }) {
  const t = useT();
  const location = `${finding.file}:${String(finding.line)}`;
  return (
    <li className="desk-finding" data-blocking={finding.blocking ? "true" : undefined}>
      <p>
        <Tag appearance={appearanceOf(SEVERITY_TONE[finding.severity])}>
          {t(`desk.review.severity.${finding.severity}`)}
        </Tag>{" "}
        {finding.blocking && <Tag appearance="danger">{t("desk.review.blocking")}</Tag>}{" "}
        <code>{location}</code>
      </p>
      <p>{finding.summary}</p>
      <p className="desk-muted">{finding.section}</p>
      {finding.fix.trim() !== "" && (
        <p>
          <strong>{t("desk.review.fix")}</strong> {finding.fix}
        </p>
      )}
    </li>
  );
}

const SEVERITIES = ["Critical", "Consider", "Nit", "FYI"] as const;

/** The verdict and the counts in one line: "Approved · Blocking findings: 0 · Consider: 1". */
export function ReviewVerdictLine({ review }: { readonly review: ReviewSummary }) {
  const t = useT();
  const counts = [
    t("desk.review.blockingCount", { count: review.blocking }),
    ...SEVERITIES.filter((severity) => review.bySeverity[severity] > 0).map(
      (severity) =>
        `${t(`desk.review.severity.${severity}`)}: ${String(review.bySeverity[severity])}`
    )
  ];
  return (
    <p className="desk-verdict">
      <Badge appearance={appearanceOf(passTone(review.verdict === "approve"))}>
        {t(`desk.review.verdict.${review.verdict}`)}
      </Badge>
      <span>{counts.join(" · ")}</span>
    </p>
  );
}

/** The findings as buttons: each opens its file in the diff at its line. */
export function FindingLinks({
  findings,
  onGo
}: {
  readonly findings: ReviewSummary["findings"];
  readonly onGo: (finding: Finding) => void;
}) {
  const t = useT();
  if (findings.length === 0) return <Muted>{t("desk.review.noFindings")}</Muted>;
  return (
    <ul className="desk-finding-links">
      {findings.map((finding, index) => {
        const location = `${finding.file}:${String(finding.line)}`;
        return (
          <li key={index}>
            <Button appearance="ghost" className="desk-finding-link" onClick={() => onGo(finding)}>
              <Tag appearance={appearanceOf(SEVERITY_TONE[finding.severity])}>
                {t(`desk.review.severity.${finding.severity}`)}
              </Tag>
              <span className="desk-finding-link__where">
                <code>{location}</code>{" "}
                <span className="desk-finding-link__section">{finding.section}</span>
              </span>
              <span className="desk-finding-link__text">{finding.summary}</span>
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

/** The reviewer's verdict and findings. Each finding has a severity label, a file, and a line. */
export function ReviewView({ review }: { readonly review: ReviewSummary }) {
  const t = useT();
  return (
    <div className="desk-artifact">
      <p>
        <Badge appearance={appearanceOf(passTone(review.verdict === "approve"))}>
          {t(`desk.review.verdict.${review.verdict}`)}
        </Badge>{" "}
        <span className="desk-muted">
          {t("desk.review.blockingCount", { count: review.blocking })}
        </span>
      </p>
      <p className="desk-muted">
        {SEVERITIES.map(
          (severity) =>
            `${t(`desk.review.severity.${severity}`)}: ${String(review.bySeverity[severity])}`
        ).join(" · ")}
      </p>
      <Section title={t("desk.review.findings")}>
        {review.findings.length === 0 ? (
          <Muted>{t("desk.review.noFindings")}</Muted>
        ) : (
          <ul className="desk-findings">
            {review.findings.map((finding, index) => (
              <FindingItem key={index} finding={finding} />
            ))}
          </ul>
        )}
        {review.rejected > 0 && (
          <Muted>{t("desk.review.rejected", { count: review.rejected })}</Muted>
        )}
      </Section>
      <Section title={t("desk.common.plainLanguage")}>
        <p>{review.plainLanguage}</p>
      </Section>
    </div>
  );
}
