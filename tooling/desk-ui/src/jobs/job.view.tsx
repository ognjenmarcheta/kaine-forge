import type { JobActionRequest, JobState, ProposedIssue } from "@repo/desk/contracts";
import { Button, Card, Checkbox, Label, Modal, Textarea } from "@repo/ui";
import { useEffect, useId, useState } from "react";

import { JOB_STEPS, JOB_TONE, previewUrlOf, stepStates } from "./job.model";
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
      if (job === null) navigate({ view: "inbox" });
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
  detail,
  checked,
  onChange
}: {
  readonly issue: ProposedIssue;
  /** The line under the title. Default: the slug and the labels. */
  readonly detail?: string;
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
        {detail ?? (
          <>
            <code>{issue.slug}</code> {issue.labels.join(", ")}
          </>
        )}
      </p>
      <details>
        <summary>{t("desk.job.review.body")}</summary>
        <Pre>{issue.body}</Pre>
      </details>
    </li>
  );
}

/** A titled list, left out when it has no items. */
function TextList({ title, items }: { readonly title: string; readonly items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <>
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </>
  );
}

/** The live page in the job's lab server, or why it is not there. */
function PreviewLink({ job, label }: { readonly job: JobState; readonly label: string }) {
  const t = useT();
  const url = previewUrlOf(job);
  return (
    <p>
      {url === null ? (
        <span className="desk-muted">{t("desk.job.screenReview.noServer")}</span>
      ) : (
        <a href={url} target="_blank" rel="noreferrer">
          {label}
        </a>
      )}
    </p>
  );
}

/**
 * A gate's actions: approve (after a confirmation, when it pushes or files), or send back with
 * a note.
 */
function GateActions({
  job,
  approveLabel,
  issues = [],
  confirm,
  sendBackLabel
}: {
  readonly job: JobState;
  readonly approveLabel: string;
  /** The ticked issues to file. */
  readonly issues?: readonly string[];
  /** The confirmation's words, or `null` when approving starts only the next step. */
  readonly confirm: {
    readonly title: string;
    readonly text: string;
    readonly label: string;
  } | null;
  readonly sendBackLabel: string;
}) {
  const t = useT();
  const id = useId();
  const action = useJobAction(job.id);
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const approve = (): void =>
    void action.run({ action: "approve", issues: [...issues], confirm: true });
  return (
    <>
      <div className="desk-job-actions">
        <Button
          disabled={action.pending}
          onClick={() => (confirm === null ? approve() : setConfirming(true))}
        >
          {approveLabel}
        </Button>
      </div>
      <div className="desk-field">
        <Label htmlFor={`${id}-note`}>{sendBackLabel}</Label>
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
      {confirm !== null && (
        <Modal
          open={confirming}
          onOpenChange={setConfirming}
          title={confirm.title}
          description={confirm.text}
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
              label: confirm.label,
              onClick: () => {
                setConfirming(false);
                approve();
              }
            }
          ]}
        />
      )}
    </>
  );
}

/** Tick issues by slug. */
function useTicked() {
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const toggle = (slug: string, on: boolean): void =>
    setTicked((was) => {
      const next = new Set(was);
      if (on) next.add(slug);
      else next.delete(slug);
      return next;
    });
  return { ticked, toggle };
}

/** The gate: the preview, the open questions, the issues to tick, and approve or send back. */
function Review({ job }: { readonly job: JobState }) {
  const t = useT();
  const result = job.result;
  const { ticked, toggle } = useTicked();
  if (result === null) return null;
  return (
    <Card className="desk-panel">
      <h2>{t("desk.job.review.title")}</h2>
      <p className="desk-job-text">{result.summary}</p>
      <p>
        <RouteLink to={{ view: "scorecard", jobId: job.id }}>
          {t("desk.job.review.preview")}
        </RouteLink>
      </p>
      <TextList title={t("desk.job.review.questions")} items={result.openQuestions} />
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
      <GateActions
        job={job}
        approveLabel={t("desk.job.review.approve")}
        issues={[...ticked]}
        confirm={{
          title: t("desk.job.review.confirmTitle"),
          text: t("desk.job.review.confirmText", { count: ticked.size }),
          label: t("desk.job.review.confirm")
        }}
        sendBackLabel={t("desk.job.review.sendBackNote")}
      />
    </Card>
  );
}

/** The screen gate: the compare view in the job's lab server, the diff, and approve or send back. */
function ScreenReview({ job }: { readonly job: JobState }) {
  const t = useT();
  const result = job.screen?.result ?? null;
  if (result === null) return null;
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
      <PreviewLink job={job} label={t("desk.job.screenReview.compare")} />
      <TextList title={t("desk.job.screenReview.deviations")} items={result.deviations} />
      <TextList title={t("desk.job.review.questions")} items={result.openQuestions} />
      <GateActions
        job={job}
        approveLabel={t("desk.job.review.approve")}
        confirm={{
          title: t("desk.job.screenReview.confirmTitle"),
          text: t("desk.job.screenReview.confirmText"),
          label: t("desk.job.screenReview.confirm")
        }}
        sendBackLabel={t("desk.job.screenReview.sendBackNote")}
      />
    </Card>
  );
}

/** The plan gate: what the component will export and build on. Approve starts the build. */
function PlanReview({ job }: { readonly job: JobState }) {
  const t = useT();
  const plan = job.component?.plan ?? null;
  if (plan === null) return null;
  return (
    <Card className="desk-panel">
      <h2>{t("desk.job.planReview.title")}</h2>
      <p className="desk-job-text">{plan.summary}</p>
      <TextList title={t("desk.job.planReview.api")} items={plan.api} />
      <TextList title={t("desk.job.planReview.reuse")} items={plan.reuse} />
      <TextList title={t("desk.job.planReview.tests")} items={plan.tests} />
      <TextList title={t("desk.job.review.questions")} items={plan.openQuestions} />
      <GateActions
        job={job}
        approveLabel={t("desk.job.planReview.approve")}
        confirm={null}
        sendBackLabel={t("desk.job.planReview.sendBackNote")}
      />
    </Card>
  );
}

/** The component gate: the specimen in the job's lab server, and approve or send back. */
function ComponentReview({ job }: { readonly job: JobState }) {
  const t = useT();
  const result = job.component?.result ?? null;
  if (result === null) return null;
  return (
    <Card className="desk-panel">
      <h2>{t("desk.job.componentReview.title")}</h2>
      <p className="desk-job-text">{result.summary}</p>
      <PreviewLink job={job} label={t("desk.job.componentReview.preview")} />
      <TextList title={t("desk.job.componentReview.deviations")} items={result.deviations} />
      <TextList title={t("desk.job.review.questions")} items={result.openQuestions} />
      <GateActions
        job={job}
        approveLabel={t("desk.job.review.approve")}
        confirm={{
          title: t("desk.job.componentReview.confirmTitle"),
          text: t("desk.job.componentReview.confirmText"),
          label: t("desk.job.screenReview.confirm")
        }}
        sendBackLabel={t("desk.job.screenReview.sendBackNote")}
      />
    </Card>
  );
}

/** The audit gate: the findings to tick, the audited screen, and file or send back. */
function AuditReview({ job }: { readonly job: JobState }) {
  const t = useT();
  const result = job.audit?.result ?? null;
  const { ticked, toggle } = useTicked();
  if (result === null) return null;
  return (
    <Card className="desk-panel">
      <h2>{t("desk.job.auditReview.title")}</h2>
      <p className="desk-job-text">{result.summary}</p>
      <p>
        {result.matchPercent === null
          ? t("desk.job.auditReview.noReference")
          : t("desk.job.auditReview.match", { value: result.matchPercent })}
      </p>
      <PreviewLink job={job} label={t("desk.job.auditReview.preview")} />
      <TextList title={t("desk.job.review.questions")} items={result.openQuestions} />
      <h3>{t("desk.job.auditReview.findings", { count: result.findings.length })}</h3>
      {result.findings.length === 0 ? (
        <Muted>{t("desk.job.auditReview.noFindings")}</Muted>
      ) : (
        <ul className="desk-job-issues">
          {result.findings.map((finding) => (
            <IssueChoice
              key={finding.slug}
              issue={finding}
              detail={`${finding.ruleId} · ${t(`desk.job.auditReview.severity.${finding.severity}`)}`}
              checked={ticked.has(finding.slug)}
              onChange={(on) => toggle(finding.slug, on)}
            />
          ))}
        </ul>
      )}
      <GateActions
        job={job}
        approveLabel={t("desk.job.review.approve")}
        issues={[...ticked]}
        confirm={{
          title: t("desk.job.auditReview.confirmTitle"),
          text: t("desk.job.auditReview.confirmText", { count: ticked.size }),
          label: t("desk.job.auditReview.confirm")
        }}
        sendBackLabel={t("desk.job.auditReview.sendBackNote")}
      />
    </Card>
  );
}

/** The gate the job waits at. */
function Gate({ job }: { readonly job: JobState }) {
  if (job.kind === "screen") return <ScreenReview job={job} />;
  if (job.kind === "component") {
    return job.stage === "plan" ? <PlanReview job={job} /> : <ComponentReview job={job} />;
  }
  if (job.kind === "audit") return <AuditReview job={job} />;
  return <Review job={job} />;
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
      {job.status === "waiting" && <Gate job={job} />}
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
