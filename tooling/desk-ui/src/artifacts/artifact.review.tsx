import type { ReviewSummary } from "@repo/desk/contracts";
import { Badge, Tag } from "@repo/ui";

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
        {(["Critical", "Consider", "Nit", "FYI"] as const)
          .map(
            (severity) =>
              `${t(`desk.review.severity.${severity}`)}: ${String(review.bySeverity[severity])}`
          )
          .join(" · ")}
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
