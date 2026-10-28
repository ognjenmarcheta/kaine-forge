import {
  LESSON_NOTE_LIMIT,
  type LessonCandidate,
  type LessonIssueDraft,
  type LessonReport,
  type PromotedLesson
} from "@repo/desk/contracts";
import { Button, Card, Check, Label, Modal, Textarea } from "@repo/ui";
import { useId, useState } from "react";
import { toast } from "sonner";

import {
  HIGH_RANK_ISSUES,
  LESSON_RANKS,
  issueUrlFrom,
  lessonRank,
  type LessonRank
} from "./stats.model";
import { toApiError } from "../api/api.client";
import { failureMessageKey } from "../api/api.errors";
import { useLanguage, useT } from "../i18n/i18n.t";
import { formatCount, relativeTime, safeHttpUrl } from "../shell/shell.format";
import { useNow } from "../shell/shell.now";
import { RouteLink } from "../shell/shell.router";
import { Muted, Pre, Section } from "../shell/shell.ui";
import { useDesk } from "../state/desk.provider";
import { toneClass, type Tone } from "../status/status.model";

const RANK_TONE = {
  high: "success",
  medium: "warning",
  low: "neutral"
} as const satisfies Readonly<Record<LessonRank, Tone>>;

/** A refusal or a failure stays until the owner closes it: its reason must be read. */
const toastFailure = (t: ReturnType<typeof useT>, failure: unknown): void => {
  const converted = toApiError(failure);
  toast.error(t(failureMessageKey(converted.code)), {
    ...(converted.detail === null ? {} : { description: converted.detail }),
    duration: Number.POSITIVE_INFINITY
  });
};

function Rank({ rank }: { readonly rank: LessonRank }) {
  const t = useT();
  return (
    <span className={`desk-rank ${toneClass(RANK_TONE[rank])}`}>
      <span className="desk-rank__dot" aria-hidden="true" />
      {t(`desk.lessons.rank.${rank}`)}
    </span>
  );
}

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

interface RowActions {
  /** The key whose request runs now. Every lesson button waits for it. */
  readonly busy: string | null;
  readonly onPromote: (candidate: LessonCandidate) => void;
  readonly onIssue: (candidate: LessonCandidate) => void;
}

function LessonsTable({
  report,
  actions
}: {
  readonly report: LessonReport;
  readonly actions: RowActions;
}) {
  const t = useT();
  const { language } = useLanguage();
  return (
    <div
      className="desk-table-scroll"
      role="region"
      tabIndex={0}
      aria-label={t("desk.lessons.title")}
    >
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
            <th scope="col">{t("desk.lessons.column.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {report.candidates.map((candidate) => (
            <tr key={candidate.key}>
              <th scope="row">
                <code>{candidate.key}</code>
                <div className="desk-lesson__meta">
                  <span className="desk-muted">{t(`desk.lessons.source.${candidate.source}`)}</span>
                  <Rank rank={lessonRank(candidate, report.currentRepo !== null)} />
                </div>
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
              <td>
                <span className="desk-lesson__actions">
                  <Button
                    appearance="subtle"
                    spacing="compact"
                    disabled={actions.busy !== null}
                    aria-label={t("desk.lessons.promoteLabel", { key: candidate.key })}
                    onClick={() => actions.onPromote(candidate)}
                  >
                    {t("desk.lessons.promote")}
                  </Button>
                  <Button
                    appearance="subtle"
                    spacing="compact"
                    disabled={actions.busy !== null}
                    aria-label={t("desk.lessons.issueLabel", { key: candidate.key })}
                    onClick={() => actions.onIssue(candidate)}
                  >
                    {actions.busy === candidate.key
                      ? t("desk.lessons.previewing")
                      : t("desk.lessons.issue")}
                  </Button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The levels of the rank column, in the order the engine lists lessons. */
function RankHelp({ minIssues }: { readonly minIssues: number }) {
  const t = useT();
  return (
    <section className="desk-subpanel">
      <h3>{t("desk.lessons.rankTitle")}</h3>
      <p className="desk-muted">{t("desk.lessons.rankIntro")}</p>
      <ul className="desk-rank-help">
        {LESSON_RANKS.map((rank) => (
          <li key={rank}>
            <Rank rank={rank} />
            <span className="desk-muted">
              {t(`desk.lessons.rankDetail.${rank}`, {
                count: rank === "high" ? HIGH_RANK_ISSUES : minIssues
              })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PromotedList({
  promoted,
  issueUrl,
  busy,
  onUnpromote
}: {
  readonly promoted: readonly PromotedLesson[];
  readonly issueUrl: (issue: number) => string | null;
  readonly busy: string | null;
  readonly onUnpromote: (key: string) => void;
}) {
  const t = useT();
  const { language } = useLanguage();
  const now = useNow();
  return (
    <section className="desk-subpanel">
      <h3>{t("desk.lessons.promotedTitle")}</h3>
      {promoted.length === 0 ? (
        <Muted>{t("desk.lessons.promotedEmpty")}</Muted>
      ) : (
        <ul className="desk-promoted">
          {promoted.map((lesson) => {
            const url = lesson.issue === null ? null : issueUrl(lesson.issue);
            return (
              <li key={lesson.key}>
                <span className="desk-promoted__icon" aria-hidden="true">
                  <Check />
                </span>
                <div className="desk-promoted__body">
                  <code>{lesson.key}</code>
                  {/* The owner's own note: shown as text. */}
                  {lesson.note !== null && <p className="desk-promoted__note">{lesson.note}</p>}
                  <p className="desk-promoted__meta">
                    <span>
                      {t("desk.lessons.promotedAt", {
                        when: relativeTime(lesson.at, now, language)
                      })}
                    </span>
                    {lesson.issue !== null &&
                      (url === null ? (
                        <span>{t("desk.issue.number", { number: lesson.issue })}</span>
                      ) : (
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          {t("desk.lessons.issueLink", { number: lesson.issue })}
                        </a>
                      ))}
                  </p>
                </div>
                <Button
                  appearance="subtle"
                  spacing="compact"
                  disabled={busy !== null}
                  aria-label={t("desk.lessons.unpromoteLabel", { key: lesson.key })}
                  onClick={() => onUnpromote(lesson.key)}
                >
                  {t("desk.lessons.unpromote")}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function PromoteDialog({
  candidate,
  onClose,
  onConfirm
}: {
  readonly candidate: LessonCandidate | null;
  readonly onClose: () => void;
  readonly onConfirm: (key: string, note: string | null) => void;
}) {
  const t = useT();
  const id = useId();
  const [note, setNote] = useState("");
  const close = (): void => {
    setNote("");
    onClose();
  };
  return (
    <Modal
      open={candidate !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={t("desk.lessons.promoteTitle")}
      description={t("desk.lessons.promoteDescription")}
      closeButtonLabel={t("desk.common.close")}
      size="sm"
      actions={[
        { appearance: "subtle", label: t("desk.common.back"), onClick: close },
        {
          label: t("desk.lessons.promoteConfirm"),
          onClick: () => {
            if (candidate === null) return;
            const trimmed = note.trim();
            onConfirm(candidate.key, trimmed === "" ? null : trimmed);
            close();
          }
        }
      ]}
    >
      {candidate !== null && <code className="desk-lesson__key">{candidate.key}</code>}
      <Label htmlFor={`${id}-note`}>{t("desk.lessons.promoteNote")}</Label>
      <Textarea
        id={`${id}-note`}
        value={note}
        rows={3}
        maxLength={LESSON_NOTE_LIMIT}
        aria-describedby={`${id}-help`}
        onChange={(event) => setNote(event.target.value)}
      />
      <p id={`${id}-help`} className="desk-muted">
        {t("desk.lessons.promoteNoteHelp")}
      </p>
    </Modal>
  );
}

/**
 * The exact title and body the desk sends to GitHub. Opening an issue reaches outside the
 * machine, so it waits for an explicit yes, and the request names the preview the owner saw.
 */
function IssueDialog({
  draft,
  sending,
  onClose,
  onConfirm
}: {
  readonly draft: LessonIssueDraft | null;
  readonly sending: boolean;
  readonly onClose: () => void;
  readonly onConfirm: (draft: LessonIssueDraft) => void;
}) {
  const t = useT();
  return (
    <Modal
      open={draft !== null}
      onOpenChange={(open) => {
        if (!open && !sending) onClose();
      }}
      title={t("desk.lessons.issueTitle")}
      description={t("desk.lessons.issueDescription")}
      closeButtonLabel={t("desk.common.close")}
      size="lg"
      actions={[
        { appearance: "subtle", label: t("desk.common.back"), onClick: onClose, disabled: sending },
        {
          label: t("desk.lessons.issueConfirm"),
          loading: sending,
          loadingLabel: t("desk.lessons.issueSending"),
          onClick: () => {
            if (draft !== null) onConfirm(draft);
          }
        }
      ]}
    >
      {draft !== null && (
        <>
          <Section title={t("desk.lessons.issueFieldTitle")}>
            <Pre label={t("desk.lessons.issueFieldTitle")}>{draft.title}</Pre>
          </Section>
          <Section title={t("desk.lessons.issueFieldBody")}>
            <Pre label={t("desk.lessons.issueFieldBody")}>{draft.body}</Pre>
          </Section>
        </>
      )}
    </Modal>
  );
}

/**
 * Problems seen in several issues. The owner promotes a lesson once it is handled, or turns it
 * into a GitHub issue. These are owner actions on the desk's own files and on GitHub: they act
 * at once, with no undo window.
 */
export function LessonsPanel({
  report,
  onReport
}: {
  readonly report: LessonReport;
  readonly onReport: (report: LessonReport) => void;
}) {
  const t = useT();
  const { api, state } = useDesk();
  const [busy, setBusy] = useState<string | null>(null);
  const [promoting, setPromoting] = useState<LessonCandidate | null>(null);
  const [draft, setDraft] = useState<LessonIssueDraft | null>(null);
  const [sending, setSending] = useState(false);
  const [created, setCreated] = useState<{
    readonly key: string;
    readonly issue: number;
    readonly url: string;
  } | null>(null);

  // A GitHub issue link of this repository, to build the link of a promoted lesson's issue.
  const known =
    created?.url ?? Object.values(state.issues).find((summary) => summary.readable)?.url ?? null;
  const issueUrl = (issue: number): string | null =>
    created?.issue === issue ? safeHttpUrl(created.url) : issueUrlFrom(known, issue);

  const run = (key: string, request: () => Promise<LessonReport>, done: string): void => {
    setBusy(key);
    request()
      .then((next) => {
        onReport(next);
        toast.success(done);
      })
      .catch((failure: unknown) => toastFailure(t, failure))
      .finally(() => setBusy(null));
  };

  const preview = (candidate: LessonCandidate): void => {
    setBusy(candidate.key);
    api
      .lessonIssuePreview(candidate.key)
      .then(setDraft)
      .catch((failure: unknown) => toastFailure(t, failure))
      .finally(() => setBusy(null));
  };

  const openIssue = (confirmed: LessonIssueDraft): void => {
    setSending(true);
    api
      .lessonIssue(confirmed.key, confirmed.digest)
      .then((result) => {
        onReport(result.report);
        setCreated({ key: confirmed.key, issue: result.issue, url: result.url });
        setDraft(null);
      })
      .catch((failure: unknown) => {
        setDraft(null);
        toastFailure(t, failure);
      })
      .finally(() => setSending(false));
  };

  const createdUrl = created === null ? null : safeHttpUrl(created.url);
  return (
    <Card className="desk-panel">
      <h2>{t("desk.lessons.title")}</h2>
      {created !== null && (
        <p className="desk-note" role="status">
          {t("desk.lessons.issueCreated", { number: created.issue, key: created.key })}{" "}
          {createdUrl !== null && (
            <a href={createdUrl} target="_blank" rel="noopener noreferrer">
              {t("desk.lessons.issueLink", { number: created.issue })}
            </a>
          )}
        </p>
      )}
      {report.candidates.length === 0 ? (
        <Muted>{t("desk.lessons.empty", { count: report.minIssues })}</Muted>
      ) : (
        <>
          <LessonsTable
            report={report}
            actions={{ busy, onPromote: setPromoting, onIssue: preview }}
          />
          <Muted>{t("desk.lessons.hint", { count: report.minIssues })}</Muted>
        </>
      )}
      {report.belowThreshold > 0 && (
        <Muted>{t("desk.lessons.belowThreshold", { count: report.belowThreshold })}</Muted>
      )}
      {report.invalidLines > 0 && (
        <Muted>{t("desk.lessons.invalidLines", { count: report.invalidLines })}</Muted>
      )}
      <div className="desk-split desk-split--inner">
        <RankHelp minIssues={report.minIssues} />
        <PromotedList
          promoted={report.promoted}
          issueUrl={issueUrl}
          busy={busy}
          onUnpromote={(key) =>
            run(key, () => api.lessonUnpromote(key), t("desk.lessons.unpromoted", { key }))
          }
        />
      </div>
      <PromoteDialog
        candidate={promoting}
        onClose={() => setPromoting(null)}
        onConfirm={(key, note) =>
          run(key, () => api.lessonPromote(key, note), t("desk.lessons.promoted", { key }))
        }
      />
      <IssueDialog
        draft={draft}
        sending={sending}
        onClose={() => setDraft(null)}
        onConfirm={openIssue}
      />
    </Card>
  );
}
