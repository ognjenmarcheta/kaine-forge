import type { JobActionRequest, JobState, ProposedIssue } from "@repo/desk/contracts";
import { Button, Card, Checkbox, Label, Modal, Textarea } from "@repo/ui";
import { useEffect, useId, useState } from "react";

import { JOB_STEPS, JOB_TONE, compareUrlOf, stepStates } from "./job.model";
import { toApiError } from "../api/api.client";
import { failureMessageKey } from "../api/api.errors";
import { useLanguage, useT } from "../i18n/i18n.t";
import { formatUsd } from "../shell/shell.format";
import { RouteLink, useRouter } from "../shell/shell.router";
import { Loading, Muted, Pre } from "../shell/shell.ui";
import { useDesk } from "../state/desk.provider";
import { StatusChip } from "../status/status.chip";

/** Send an action; the page shows the job from the live events, so only a refusal matters here. */
function useJobAction(jobId: number) {
  const t = useT();
  const { api, reloadJobs } = useDesk();
  const { navigate } = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const run = async (action: JobActionRequest): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      const job = await api.jobAction(jobId, action);
      await reloadJobs();
      if (job === null) navigate({ view: "board" });
    } catch (failure) {
      const converted = toApiError(failure);
      setError(converted.detail ?? t(failureMessageKey(converted.code)));
    } finally {
      setPending(false);
    }
  };
  return { run, error, pending };
}

function Steps({ job }: { readonly job: JobState }) {
  const t = useT();
  const states = stepStates(job);
  return (
    <ol className="desk-job-steps" aria-label={t("desk.job.steps")}>
      {JOB_STEPS[job.kind].map((step, index) => (
        <li
          key={step}
          data-state={states[index]}
          aria-current={states[index] === "current" ? "step" : undefined}
        >
          <span className="desk-job-steps__dot" aria-hidden="true" />
          {t(`desk.job.stage.${step}`)}
          <span className="desk-sr-only">{t(`desk.job.stepState.${states[index] ?? "todo"}`)}</span>
        </li>
      ))}
    </ol>
  );
}

function IssueChoice({
  issue,
  checked,
  onChange
}: {
  readonly issue: ProposedIssue;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  const t = useT();
  const id = useId();
  return (
    <li className="desk-job-issue">
      <div className="desk-check-row">
        <Checkbox id={id} checked={checked} onCheckedChange={(next) => onChange(next === true)} />
        <Label htmlFor={id}>{issue.title}</Label>
      </div>
      <p className="desk-muted">
        <code>{issue.slug}</code> {issue.labels.join(", ")}
      </p>
      <details>
        <summary>{t("desk.job.review.body")}</summary>
        <Pre>{issue.body}</Pre>
      </details>
    </li>
  );
}

/** The gate: the preview, the open questions, the issues to tick, and approve or send back. */
function Review({ job }: { readonly job: JobState }) {
  const t = useT();
  const id = useId();
  const action = useJobAction(job.id);
  const result = job.result;
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  if (result === null) return null;
  const toggle = (slug: string, on: boolean): void =>
    setTicked((was) => {
      const next = new Set(was);
      if (on) next.add(slug);
      else next.delete(slug);
      return next;
    });
  return (
    <Card className="desk-panel">
      <h2>{t("desk.job.review.title")}</h2>
      <p className="desk-job-text">{result.summary}</p>
      <p>
        <RouteLink to={{ view: "scorecard", jobId: job.id }}>
          {t("desk.job.review.preview")}
        </RouteLink>
      </p>
      {result.openQuestions.length > 0 && (
        <>
          <h3>{t("desk.job.review.questions")}</h3>
          <ul>
            {result.openQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </>
      )}
      <h3>{t("desk.job.review.issues", { count: result.proposedIssues.length })}</h3>
      {result.proposedIssues.length === 0 ? (
        <Muted>{t("desk.job.review.noIssues")}</Muted>
      ) : (
        <ul className="desk-job-issues">
          {result.proposedIssues.map((issue) => (
            <IssueChoice
              key={issue.slug}
              issue={issue}
              checked={ticked.has(issue.slug)}
              onChange={(on) => toggle(issue.slug, on)}
            />
          ))}
        </ul>
      )}
      <div className="desk-job-actions">
        <Button disabled={action.pending} onClick={() => setConfirming(true)}>
          {t("desk.job.review.approve")}
        </Button>
      </div>
      <div className="desk-field">
        <Label htmlFor={`${id}-note`}>{t("desk.job.review.sendBackNote")}</Label>
        <Textarea
          id={`${id}-note`}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      <Button
        appearance="subtle"
        disabled={action.pending || note.trim() === ""}
        onClick={() => {
          void action.run({ action: "send-back", note: note.trim() });
          setNote("");
        }}
      >
        {t("desk.job.review.sendBack")}
      </Button>
      {action.error !== null && (
        <p className="desk-field__error" role="alert">
          {action.error}
        </p>
      )}
      <Modal
        open={confirming}
        onOpenChange={setConfirming}
        title={t("desk.job.review.confirmTitle")}
        description={t("desk.job.review.confirmText", { count: ticked.size })}
        closeButtonLabel={t("desk.common.close")}
        size="sm"
        actions={[
          {
            appearance: "subtle",
            label: t("desk.common.back"),
            onClick: () => setConfirming(false)
          },
          {
            appearance: "default",
            label: t("desk.job.review.confirm"),
            onClick: () => {
              setConfirming(false);
              void action.run({ action: "approve", issues: [...ticked], confirm: true });
            }
          }
        ]}
      />
    </Card>
  );
}

/** The screen gate: the compare view in the job's lab server, the diff, and approve or send back. */
function ScreenReview({ job }: { readonly job: JobState }) {
  const t = useT();
  const id = useId();
  const action = useJobAction(job.id);
  const result = job.screen?.result ?? null;
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  if (result === null) return null;
  const compare = compareUrlOf(job);
  const diff = job.screen?.diffPercent ?? null;
  return (
    <Card className="desk-panel">
      <h2>{t("desk.job.screenReview.title")}</h2>
      <p className="desk-job-text">{result.summary}</p>
      <p>
        {diff === null
          ? t("desk.job.screenReview.noDiff")
          : t("desk.job.screenReview.diff", { value: diff })}
      </p>
      <p>
        {compare === null ? (
          <span className="desk-muted">{t("desk.job.screenReview.noServer")}</span>
        ) : (
          <a href={compare} target="_blank" rel="noreferrer">
            {t("desk.job.screenReview.compare")}
          </a>
        )}
      </p>
      {result.deviations.length > 0 && (
        <>
          <h3>{t("desk.job.screenReview.deviations")}</h3>
          <ul>
            {result.deviations.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </>
      )}
      {result.openQuestions.length > 0 && (
        <>
          <h3>{t("desk.job.review.questions")}</h3>
          <ul>
            {result.openQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </>
      )}
      <div className="desk-job-actions">
        <Button disabled={action.pending} onClick={() => setConfirming(true)}>
          {t("desk.job.review.approve")}
        </Button>
      </div>
      <div className="desk-field">
        <Label htmlFor={`${id}-note`}>{t("desk.job.screenReview.sendBackNote")}</Label>
        <Textarea
          id={`${id}-note`}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      <Button
        appearance="subtle"
        disabled={action.pending || note.trim() === ""}
        onClick={() => {
          void action.run({ action: "send-back", note: note.trim() });
          setNote("");
        }}
      >
        {t("desk.job.review.sendBack")}
      </Button>
      {action.error !== null && (
        <p className="desk-field__error" role="alert">
          {action.error}
        </p>
      )}
      <Modal
        open={confirming}
        onOpenChange={setConfirming}
        title={t("desk.job.screenReview.confirmTitle")}
        description={t("desk.job.screenReview.confirmText")}
        closeButtonLabel={t("desk.common.close")}
        size="sm"
        actions={[
          {
            appearance: "subtle",
            label: t("desk.common.back"),
            onClick: () => setConfirming(false)
          },
          {
            appearance: "default",
            label: t("desk.job.screenReview.confirm"),
            onClick: () => {
              setConfirming(false);
              void action.run({ action: "approve", issues: [], confirm: true });
            }
          }
        ]}
      />
    </Card>
  );
}

function Stopped({ job }: { readonly job: JobState }) {
  const t = useT();
  const action = useJobAction(job.id);
  if (job.stop === null) return null;
  return (
    <div className="desk-failure" role="alert">
      <p>{t(`desk.job.stop.${job.stop.reason}`)}</p>
      <Pre>{job.stop.detail}</Pre>
      <Button disabled={action.pending} onClick={() => void action.run({ action: "continue" })}>
        {t("desk.job.continue")}
      </Button>
      {action.error !== null && <p className="desk-field__error">{action.error}</p>}
    </div>
  );
}

function Done({ job }: { readonly job: JobState }) {
  const t = useT();
  return (
    <Card className="desk-panel">
      <h2>{t("desk.job.done.title")}</h2>
      {job.pr !== null && (
        <p>
          <a href={job.pr.url} target="_blank" rel="noreferrer">
            {t("desk.job.done.pr", { number: job.pr.number })}
          </a>
        </p>
      )}
      {job.filedIssues.length === 0 ? (
        <Muted>{t("desk.job.done.noIssues")}</Muted>
      ) : (
        <ul>
          {job.filedIssues.map((issue) => (
            <li key={issue.slug}>
              <a href={issue.url} target="_blank" rel="noreferrer">
                {t("desk.job.done.issue", { number: issue.number, slug: issue.slug })}
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** One desk job: its steps, its spend, the live activity, and the gate when it waits for you. */
export function JobView({ jobId }: { readonly jobId: number }) {
  const t = useT();
  const { language } = useLanguage();
  const { state, reloadJobs } = useDesk();
  const job = state.jobs[jobId];
  const action = useJobAction(jobId);
  const [loaded, setLoaded] = useState(job !== undefined);
  const [confirm, setConfirm] = useState<"cancel" | "remove" | null>(null);

  // The list loads with the issues; a job opened by its link may not be in it yet.
  useEffect(() => {
    if (job !== undefined) return;
    void reloadJobs().finally(() => setLoaded(true));
  }, [reloadJobs, job]);

  if (job === undefined)
    return loaded ? <Muted>{t("desk.job.missing", { id: jobId })}</Muted> : <Loading />;
  const open = job.status !== "done" && job.status !== "cancelled";
  const latest = job.history.at(-1);
  return (
    <>
      <div className="desk-heading">
        <div>
          <h1>{t(`desk.job.title.${job.kind}`, { id: job.id })}</h1>
          <p className="desk-muted">
            {t("desk.job.meta", {
              model: job.input.model,
              spent: formatUsd(job.spentUsd, language),
              budget: formatUsd(job.input.budgetUsd, language),
              minutes: job.input.minutes
            })}
          </p>
        </div>
        <StatusChip tone={JOB_TONE[job.status]}>{t(`desk.job.status.${job.status}`)}</StatusChip>
      </div>
      <Card className="desk-panel">
        <Steps job={job} />
        {latest !== undefined && (
          <p className="desk-job-activity" aria-live="polite">
            {latest.message}
          </p>
        )}
        {job.branch !== null && (
          <p className="desk-muted">
            <code>{job.branch}</code>
          </p>
        )}
      </Card>
      {job.status === "needs-you" && <Stopped job={job} />}
      {job.status === "waiting" &&
        (job.kind === "screen" ? <ScreenReview job={job} /> : <Review job={job} />)}
      {job.status === "done" && <Done job={job} />}
      <Card className="desk-panel">
        <h2>{t("desk.job.history")}</h2>
        <ol className="desk-job-history">
          {[...job.history].reverse().map((entry) => (
            <li key={`${entry.at}-${entry.message}`}>
              <time dateTime={entry.at}>{new Date(entry.at).toLocaleTimeString(language)}</time>
              <span>{t(`desk.job.stage.${entry.stage}`)}</span>
              <span>{entry.message}</span>
            </li>
          ))}
        </ol>
      </Card>
      <div className="desk-job-actions">
        {open && (
          <Button
            appearance="subtle"
            disabled={action.pending}
            onClick={() => setConfirm("cancel")}
          >
            {t("desk.job.cancel")}
          </Button>
        )}
        {job.status !== "running" && (
          <Button
            appearance="subtle"
            disabled={action.pending}
            onClick={() => setConfirm("remove")}
          >
            {t("desk.job.remove")}
          </Button>
        )}
      </div>
      {action.error !== null && (
        <p className="desk-field__error" role="alert">
          {action.error}
        </p>
      )}
      <Modal
        open={confirm !== null}
        onOpenChange={(next) => {
          if (!next) setConfirm(null);
        }}
        title={confirm === null ? "" : t(`desk.job.${confirm}Confirm.title`)}
        description={confirm === null ? "" : t(`desk.job.${confirm}Confirm.text`)}
        closeButtonLabel={t("desk.common.close")}
        size="sm"
        actions={[
          { appearance: "subtle", label: t("desk.common.back"), onClick: () => setConfirm(null) },
          {
            appearance: "danger",
            label: confirm === null ? "" : t(`desk.job.${confirm}`),
            onClick: () => {
              const chosen = confirm;
              setConfirm(null);
              if (chosen !== null) void action.run({ action: chosen });
            }
          }
        ]}
      />
    </>
  );
}
