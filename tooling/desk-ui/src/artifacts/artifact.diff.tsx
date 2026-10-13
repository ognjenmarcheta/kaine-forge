import { useMemo } from "react";

import { clipLines, parseDiffStat } from "./artifact.diffstat";
import { useTextArtifact } from "./artifact.use";
import { useT } from "../i18n/i18n.t";
import { FailureText, Loading, Muted, Pre, Section } from "../shell/shell.ui";

/** Lines of the diff shown on the page. The full file stays in the worktree. */
const DIFF_LINE_LIMIT = 400;

/** The diff stat of the work so far, and the patch as plain text. */
export function DiffArtifact({
  issueNumber,
  revision
}: {
  readonly issueNumber: number;
  readonly revision: string;
}) {
  const t = useT();
  const state = useTextArtifact(issueNumber, "diff", revision);
  const stat = useMemo(() => (state.status === "ok" ? parseDiffStat(state.value) : null), [state]);
  if (state.status === "loading") return <Loading />;
  if (state.status === "missing") return <Muted>{t("desk.artifact.missing")}</Muted>;
  if (state.status === "error") return <FailureText code={state.code} detail={state.detail} />;
  if (stat === null) return null;
  const clipped = clipLines(state.value, DIFF_LINE_LIMIT);
  return (
    <Section title={t("desk.diff.title")}>
      <p>
        {t("desk.diff.summary", {
          files: stat.files.length,
          added: stat.added,
          removed: stat.removed
        })}
      </p>
      <ul className="desk-list">
        {stat.files.map((file) => (
          <li key={file.path}>
            <code>{file.path}</code>{" "}
            <span className="desk-muted">
              {file.binary
                ? t("desk.diff.binary")
                : t("desk.diff.lines", { added: file.added, removed: file.removed })}
            </span>
          </li>
        ))}
      </ul>
      <details>
        <summary>{t("desk.diff.show")}</summary>
        <Pre label={t("desk.diff.title")}>{clipped.text}</Pre>
        {clipped.clipped && <Muted>{t("desk.diff.clipped", { lines: DIFF_LINE_LIMIT })}</Muted>}
      </details>
    </Section>
  );
}
