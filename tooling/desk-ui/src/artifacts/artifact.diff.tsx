import { Button, Checkbox, Label, ProgressBar, Tag } from "@repo/ui";
import { Fragment, useEffect, useId, useMemo, useRef } from "react";

import { clipLines, parseDiffStat, type DiffLine } from "./artifact.diffstat";
import { FilePath } from "./artifact.plan";
import { useTextArtifact } from "./artifact.use";
import type { ReviewFile } from "../gates/gate.model";
import { useT } from "../i18n/i18n.t";
import { FailureText, Loading, Muted, Pre, Section } from "../shell/shell.ui";
import { SEVERITY_TONE, appearanceOf } from "../status/status.model";

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

const SIGN: Readonly<Record<DiffLine["kind"], string>> = {
  hunk: "",
  add: "+",
  del: "−",
  context: ""
};

/** The added and removed line counts of a file, as the diff shows them. */
function Counts({ added, removed }: { readonly added: number; readonly removed: number }) {
  const t = useT();
  return (
    <span className="desk-diffstat">
      <span className="desk-sr-only">{t("desk.diff.lines", { added, removed })}</span>
      <span aria-hidden="true">
        <span className="desk-diffstat__add">{added}</span>{" "}
        <span className="desk-diffstat__del">{removed}</span>
      </span>
    </span>
  );
}

function ViewedBox({
  path,
  viewed,
  onViewed
}: {
  readonly path: string;
  readonly viewed: boolean;
  readonly onViewed: (path: string, viewed: boolean) => void;
}) {
  const t = useT();
  const id = useId();
  return (
    <span className="desk-viewed">
      <Checkbox
        id={id}
        checked={viewed}
        onCheckedChange={(next) => onViewed(path, next === true)}
      />
      <Label htmlFor={id}>
        {t("desk.diff.viewed")}
        <span className="desk-sr-only"> {path}</span>
      </Label>
    </span>
  );
}

/** The lines of one file, with each review finding under the line it names. */
function Patch({
  entry,
  highlight
}: {
  readonly entry: ReviewFile;
  readonly highlight: number | null;
}) {
  const t = useT();
  const marked = useRef<HTMLDivElement>(null);
  const { file, findings } = entry;
  const lines = file.lines.slice(0, DIFF_LINE_LIMIT);
  const placed = new Set(lines.flatMap((line) => (line.newLine === null ? [] : [line.newLine])));
  const loose = findings.filter((finding) => !placed.has(finding.line));

  useEffect(() => {
    marked.current?.scrollIntoView({ block: "center" });
  }, [highlight]);

  if (file.binary) return <Muted>{t("desk.diff.binary")}</Muted>;
  return (
    <div
      className="desk-patch__lines"
      tabIndex={0}
      aria-label={t("desk.diff.patchOf", { path: file.path })}
    >
      {loose.map((finding, index) => (
        <InlineFinding key={`loose-${String(index)}`} finding={finding} />
      ))}
      {lines.map((line, index) => {
        const here =
          line.kind === "del" ? [] : findings.filter((finding) => finding.line === line.newLine);
        const lit = highlight !== null && line.newLine === highlight && line.kind !== "del";
        return (
          <Fragment key={index}>
            <div
              ref={lit ? marked : undefined}
              className={`desk-ln desk-ln--${line.kind}${lit ? " desk-ln--lit" : ""}`}
            >
              <span className="desk-ln__no" aria-hidden="true">
                {line.newLine ?? line.oldLine ?? ""}
              </span>
              <span className="desk-ln__sign" aria-hidden="true">
                {SIGN[line.kind]}
              </span>
              <span className="desk-ln__text">{line.text}</span>
            </div>
            {here.map((finding, at) => (
              <InlineFinding key={`${String(index)}-${String(at)}`} finding={finding} />
            ))}
          </Fragment>
        );
      })}
      {file.lines.length > DIFF_LINE_LIMIT && (
        <Muted>{t("desk.diff.clipped", { lines: DIFF_LINE_LIMIT })}</Muted>
      )}
    </div>
  );
}

function InlineFinding({ finding }: { readonly finding: ReviewFile["findings"][number] }) {
  const t = useT();
  return (
    <div className="desk-inline-finding" role="note">
      <span>
        <Tag appearance={appearanceOf(SEVERITY_TONE[finding.severity])}>
          {t(`desk.review.severity.${finding.severity}`)}
        </Tag>
      </span>
      <span>{finding.summary}</span>
      {finding.fix.trim() !== "" && (
        <span className="desk-muted">
          {t("desk.review.fix")} {finding.fix}
        </span>
      )}
    </div>
  );
}

export interface DiffReviewProps {
  /** In reading order, from `orderReviewFiles`. */
  readonly files: readonly ReviewFile[];
  readonly viewed: ReadonlySet<string>;
  readonly onViewed: (path: string, viewed: boolean) => void;
  readonly current: string | null;
  readonly onSelect: (path: string) => void;
  /** The new-file line a finding names, outlined in the current file. */
  readonly highlight: number | null;
}

/**
 * The changes as the owner reviews them: files in risk order under group headings, each with
 * its finding count and a Viewed box, and the patch of one file with the findings inline. A
 * viewed file folds away.
 */
export function DiffReview({
  files,
  viewed,
  onViewed,
  current,
  onSelect,
  highlight
}: DiffReviewProps) {
  const t = useT();
  const seen = files.filter((entry) => viewed.has(entry.file.path)).length;
  const open = files.find((entry) => entry.file.path === current) ?? files[0];
  return (
    <div className="desk-diff">
      <nav className="desk-diff__tree" aria-label={t("desk.diff.files")}>
        <span className="desk-diff__progress">
          {t("desk.diff.viewedCount", { viewed: seen, total: files.length })}
        </span>
        <ProgressBar
          value={seen}
          max={Math.max(files.length, 1)}
          appearance="success"
          className="desk-diff__bar"
          aria-hidden="true"
        />
        <ul className="desk-diff__files">
          {files.map((entry, index) => {
            const { path } = entry.file;
            const head = index === 0 || files[index - 1]?.group !== entry.group;
            const isOn = entry === open;
            return (
              <Fragment key={path}>
                {head && (
                  <li className="desk-diff__group">{t(`desk.diff.group.${entry.group}`)}</li>
                )}
                <li
                  className="desk-diff__file"
                  data-current={isOn ? "true" : undefined}
                  data-viewed={viewed.has(path) ? "true" : undefined}
                >
                  <Button
                    appearance="ghost"
                    spacing="compact"
                    className="desk-diff__name"
                    aria-current={isOn ? "true" : undefined}
                    onClick={() => onSelect(path)}
                  >
                    {path}
                  </Button>
                  <span className="desk-diff__facts">
                    <Counts added={entry.file.added} removed={entry.file.removed} />
                    {entry.findings.length > 0 && (
                      <span className="desk-diff__badge">
                        {t("desk.diff.findings", { count: entry.findings.length })}
                      </span>
                    )}
                  </span>
                  <ViewedBox path={path} viewed={viewed.has(path)} onViewed={onViewed} />
                </li>
              </Fragment>
            );
          })}
        </ul>
      </nav>
      {open !== undefined && (
        <div className="desk-patch">
          <div className="desk-patch__head">
            <FilePath path={open.file.path} />
            <Counts added={open.file.added} removed={open.file.removed} />
          </div>
          {viewed.has(open.file.path) ? (
            <p className="desk-patch__folded">
              {t("desk.diff.folded")}{" "}
              <Button
                appearance="link"
                spacing="compact"
                onClick={() => onViewed(open.file.path, false)}
              >
                {t("desk.diff.showAgain")}
              </Button>
            </p>
          ) : (
            <Patch entry={open} highlight={highlight} />
          )}
        </div>
      )}
    </div>
  );
}
