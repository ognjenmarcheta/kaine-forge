import { reportArtifactId, reportViewSchema, type ReportView } from "@repo/desk/contracts";
import type { ReactNode } from "react";

import { useJsonArtifact } from "./artifact.use";
import { useT } from "../i18n/i18n.t";
import { FailureText, Loading, Muted, Section } from "../shell/shell.ui";

const NAME = String.raw`[\w@-]+(?:\.[\w@-]+)*`;
const FILE = String.raw`[\w@-]+(?:\.[\w@-]+)+`;
const LINE = String.raw`:\d+(?:-\d+)?`;
/**
 * Code in a finding: a `quoted` span, a path with a folder (`docs/a.md`, `src/a.ts:3`), a file
 * with a line (`a.tsx:3`), or a bare line after a space (`:213-233`).
 */
const CODE = new RegExp(
  ["`[^`]+`", `(?:${NAME}/)+${FILE}(?:${LINE})?`, `${FILE}${LINE}`, `(?<=^|\\s)${LINE}`].join("|"),
  "g"
);

/** Agent text as it is, with its paths, lines, and quoted code as code. No Markdown is rendered. */
function ReportText({ text }: { readonly text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(CODE)) {
    const start = match.index;
    if (start > last) parts.push(text.slice(last, start));
    const code = match[0].startsWith("`") ? match[0].slice(1, -1) : match[0];
    parts.push(<code key={start}>{code}</code>);
    last = start + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

/** What a report agent wrote: its summary, its findings, and the plain-language version. */
function ReportResult({ report }: { readonly report: ReportView }) {
  const t = useT();
  return (
    <div className="desk-artifact">
      <p>{report.summary}</p>
      <Section title={t("desk.report.findings")}>
        {report.findings.length === 0 ? (
          <Muted>{t("desk.report.noFindings")}</Muted>
        ) : (
          <ul className="desk-findings">
            {report.findings.map((finding, index) => (
              <li key={index} className="desk-finding">
                <ReportText text={finding} />
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title={t("desk.common.plainLanguage")}>
        <p>{report.plainLanguage}</p>
      </Section>
    </div>
  );
}

/** The report of one agent of the issue, `report-<agent id>.json`. */
export function ReportArtifact({
  issueNumber,
  agentId,
  revision
}: {
  readonly issueNumber: number;
  readonly agentId: string;
  readonly revision: string;
}) {
  const t = useT();
  const state = useJsonArtifact(issueNumber, reportArtifactId(agentId), reportViewSchema, revision);
  switch (state.status) {
    case "loading":
      return <Loading />;
    case "missing":
      return <Muted>{t("desk.artifact.missing")}</Muted>;
    case "error":
      return <FailureText code={state.code} detail={state.detail} />;
    case "ok":
      return <ReportResult report={state.value} />;
  }
}
