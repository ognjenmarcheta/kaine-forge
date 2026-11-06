import type { JobActionRequest, JobState, ProposedIssue, ScorecardRun } from "@repo/desk/contracts";
import {
  Button,
  Card,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Ellipsis,
  Label,
  Modal,
  Tag,
  Textarea
} from "@repo/ui";
import { useEffect, useId, useState, type ReactNode } from "react";

import { JOB_STEPS, previewUrlOf, stepStates } from "./job.model";
import { toApiError } from "../api/api.client";
import { failureMessageKey } from "../api/api.errors";
import { ReportResult, ReportText } from "../artifacts/artifact.report";
import { useLanguage, useT } from "../i18n/i18n.t";
import { useMarkSeen } from "../inbox/inbox.unread";
import { Crumb } from "../issue/issue.header";
import { dimensionRows } from "../scorecard/scorecard.model";
import { Delta, Summary, score } from "../scorecard/scorecard.view";
import { formatUsd } from "../shell/shell.format";
import { RouteLink, useRouter } from "../shell/shell.router";
import { Loading, Muted, Pre } from "../shell/shell.ui";
import { useDesk } from "../state/desk.provider";
import { StatusChip } from "../status/status.chip";
import { jobItem } from "../work/work.model";
import { chipOf } from "../work/work.present";

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

/** The job's steps as a rail, like an issue's: done, now, and to come, each with a glyph. */
function Steps({ job }: { readonly job: JobState }) {
  const t = useT();
  const states = stepStates(job);
  const glyph = {
    done: { g: "✓", tone: "dk-ok" },
    current: { g: "◷", tone: "dk-warn" },
    todo: { g: "", tone: "" }
  } as const;
  return (
    <aside className="dk-rail" aria-label={t("desk.job.steps")}>
      <section className="dk-card dk-rail-card">
        <h2 className="dk-h-sec dk-mb-100">{t("desk.rail.title")}</h2>
        <ol className="dk-steps">
          {JOB_STEPS[job.kind].map((step, index) => {
            const state = states[index] ?? "todo";
            return (
              <li
                key={step}
                className={`dk-step${state === "current" ? " dk-cur" : ""}${state === "todo" ? " dk-idle" : ""}`}
                aria-current={state === "current" ? "step" : undefined}
              >
                <span className={`dk-gl ${glyph[state].tone}`} aria-hidden="true">
                  {glyph[state].g}
                </span>
                <span className="dk-nm">{t(`desk.job.stage.${step}`)}</span>
                <span className="dk-du" />
                <span className="dk-wh">{t(`desk.job.stepState.${state}`)}</span>
              </li>
            );
          })}
        </ol>
      </section>
    </aside>
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
    <li className="desk-job-issue" data-checked={checked ? "true" : undefined}>
      <div className="dk-check">
        <Checkbox id={id} checked={checked} onCheckedChange={(next) => onChange(next === true)} />
        <Label htmlFor={id}>{issue.title}</Label>
      </div>
      <div className="desk-job-issue__meta">
        {detail === undefined ? (
          <>
            <code className="dk-mono">{issue.slug}</code>
            {issue.labels.map((label) => (
              <Tag key={label}>{label}</Tag>
            ))}
          </>
        ) : (
          <span className="dk-t-sub">{detail}</span>
        )}
      </div>
      <details className="desk-job-fold">
        <summary>{t("desk.job.review.body")}</summary>
        <Pre>{issue.body}</Pre>
      </details>
    </li>
  );
}

/** A titled section of a gate. */
function GateSection({
  title,
  children
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="desk-job-sec" aria-labelledby={id}>
      <h3 id={id} className="dk-h-sec">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** A titled list, left out when it has no items. Paths and quoted code show as code. */
function TextList({ title, items }: { readonly title: string; readonly items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <GateSection title={title}>
      <ul className="desk-job-list">
        {items.map((item) => (
          <li key={item}>
            <ReportText text={item} />
          </li>
        ))}
      </ul>
    </GateSection>
  );
}

/** What the agent could not decide alone: one numbered block per question. */
function Questions({ items }: { readonly items: readonly string[] }) {
  const t = useT();
  if (items.length === 0) return null;
  return (
    <GateSection title={t("desk.job.review.questions", { count: items.length })}>
      <ol className="desk-job-questions">
        {items.map((item) => (
          <li key={item} className="desk-job-question">
            <span>
              <ReportText text={item} />
            </span>
          </li>
        ))}
      </ol>
    </GateSection>
  );
}

/** The agent's plain-language result first; its technical summary folded under it. */
function Lead({ plain, summary }: { readonly plain: string; readonly summary: string }) {
  const t = useT();
  return (
    <>
      <p className="desk-job-lead">{plain}</p>
      <details className="desk-job-fold">
        <summary>{t("desk.job.review.technical")}</summary>
        <p className="desk-job-text">
          <ReportText text={summary} />
        </p>
      </details>
    </>
  );
}

/**
 * Every ledger run up to this job's, from the job's worktree, so the gate can compare the new
 * run with the last one. `null` until it loads, or when the ledger cannot be read.
 */
function useJobRuns(jobId: number): readonly ScorecardRun[] | null {
  const { api } = useDesk();
  const [runs, setRuns] = useState<readonly ScorecardRun[] | null>(null);
  useEffect(() => {
    let live = true;
    api
      .scorecard(jobId)
      .then((view) => {
        if (live && view.state === "ready" && view.runs.length > 0) setRuns(view.runs);
      })
      // The comparison is extra: without it the gate still shows the result and the preview link.
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [api, jobId]);
  return runs;
}

/** The dimensions whose score changed in the last run, with the evidence for the new score. */
function Moved({ runs }: { readonly runs: readonly ScorecardRun[] }) {
  const t = useT();
  const { language } = useLanguage();
  const rows = dimensionRows(runs, runs.length - 1).filter(
    (row) => row.delta !== null && row.delta !== 0
  );
  if (rows.length === 0) return <Muted>{t("desk.job.review.nothingMoved")}</Muted>;
  return (
    <ul className="desk-job-moved">
      {rows.map((row) => (
        <li key={row.number} className="desk-job-moved__row">
          <span className="desk-job-moved__name">
            <span className="dk-t-sub dk-num">{row.number}</span> {row.name}
          </span>
          <strong className="dk-num">{score(row.score, language)}</strong>
          <Delta value={row.delta} />
          {row.evidence.summary !== "" && (
            <details className="desk-job-fold desk-job-moved__why">
              <summary>{t("desk.job.review.evidence")}</summary>
              <p className="desk-job-text dk-t-sub">
                <ReportText text={row.evidence.summary} />
              </p>
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}

/** The live page in the job's lab server, or why it is not there. */
function PreviewLink({ job, label }: { readonly job: JobState; readonly label: string }) {
  const t = useT();
  const url = previewUrlOf(job);
  return (
    <p>
      {url === null ? (
        <span className="dk-t-sub">{t("desk.job.screenReview.noServer")}</span>
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
    <section className="desk-job-decide" aria-labelledby={`${id}-decide`}>
      <h3 id={`${id}-decide`} className="dk-h-sec">
        {t("desk.job.review.decide")}
      </h3>
      <div className="desk-job-actions">
        <Button
          type="button"
          disabled={action.pending}
          onClick={() => (confirm === null ? approve() : setConfirming(true))}
        >
          {approveLabel}
        </Button>
      </div>
      <div className="dk-field">
        <Label htmlFor={`${id}-note`}>{sendBackLabel}</Label>
        <Textarea
          id={`${id}-note`}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      <Button
        type="button"
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
        <p className="dk-hint dk-t-danger" role="alert">
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
    </section>
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

/**
 * The scorecard gate, in reading order: the result at a glance, the dimensions that moved, the
 * questions to answer, the issues to tick, and approve or send back.
 */
function Review({ job }: { readonly job: JobState }) {
  const t = useT();
  const result = job.result;
  const runs = useJobRuns(job.id);
  const { ticked, toggle } = useTicked();
  if (result === null) return null;
  return (
    <Card className="dk-card desk-job-gate">
      <h2>{t("desk.job.review.title")}</h2>
      {runs !== null && <Summary runs={runs} index={runs.length - 1} />}
      <Lead plain={result.plainLanguage} summary={result.summary} />
      <GateSection title={t("desk.job.review.moved")}>
        {runs === null ? null : <Moved runs={runs} />}
        <p>
          <RouteLink to={{ view: "scorecard", jobId: job.id }}>
            {t("desk.job.review.preview")}
          </RouteLink>
        </p>
      </GateSection>
      <Questions items={result.openQuestions} />
      <GateSection
        title={t("desk.job.review.issues", {
          ticked: ticked.size,
          count: result.proposedIssues.length
        })}
      >
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
      </GateSection>
      <GateActions
        job={job}
        approveLabel={
          ticked.size === 0
            ? t("desk.job.review.approveNone")
            : t("desk.job.review.approveFile", { count: ticked.size })
        }
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
    <Card className="dk-card desk-job-gate">
      <h2>{t("desk.job.screenReview.title")}</h2>
      <Lead plain={result.plainLanguage} summary={result.summary} />
      <p>
        {diff === null
          ? t("desk.job.screenReview.noDiff")
          : t("desk.job.screenReview.diff", { value: diff })}
      </p>
      <PreviewLink job={job} label={t("desk.job.screenReview.compare")} />
      <TextList title={t("desk.job.screenReview.deviations")} items={result.deviations} />
      <Questions items={result.openQuestions} />
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
    <Card className="dk-card desk-job-gate">
      <h2>{t("desk.job.planReview.title")}</h2>
      <Lead plain={plan.plainLanguage} summary={plan.summary} />
      <TextList title={t("desk.job.planReview.api")} items={plan.api} />
      <TextList title={t("desk.job.planReview.reuse")} items={plan.reuse} />
      <TextList title={t("desk.job.planReview.tests")} items={plan.tests} />
      <Questions items={plan.openQuestions} />
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
    <Card className="dk-card desk-job-gate">
      <h2>{t("desk.job.componentReview.title")}</h2>
      <Lead plain={result.plainLanguage} summary={result.summary} />
      <PreviewLink job={job} label={t("desk.job.componentReview.preview")} />
      <TextList title={t("desk.job.componentReview.deviations")} items={result.deviations} />
      <Questions items={result.openQuestions} />
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
    <Card className="dk-card desk-job-gate">
      <h2>{t("desk.job.auditReview.title")}</h2>
      <Lead plain={result.plainLanguage} summary={result.summary} />
      <p>
        {result.matchPercent === null
          ? t("desk.job.auditReview.noReference")
          : t("desk.job.auditReview.match", { value: result.matchPercent })}
      </p>
      <PreviewLink job={job} label={t("desk.job.auditReview.preview")} />
      <Questions items={result.openQuestions} />
      <GateSection title={t("desk.job.auditReview.findings", { count: result.findings.length })}>
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
      </GateSection>
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

/** The role gate: the agent's report. Approve closes the job; it pushes and files nothing. */
function RoleReview({ job }: { readonly job: JobState }) {
  const t = useT();
  const role = job.role;
  if (role === null || role.result === null) return null;
  return (
    <Card className="dk-card desk-job-gate">
      <h2>{t("desk.job.roleReview.title", { name: role.agent.name })}</h2>
      <ReportResult report={role.result} />
      <GateActions
        job={job}
        approveLabel={t("desk.job.roleReview.approve")}
        confirm={null}
        sendBackLabel={t("desk.job.roleReview.sendBackNote")}
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
  if (job.kind === "role") return <RoleReview job={job} />;
  return <Review job={job} />;
}

function Stopped({ job }: { readonly job: JobState }) {
  const t = useT();
  const action = useJobAction(job.id);
  if (job.stop === null) return null;
  return (
    <div className="dk-banner dk-banner-danger dk-stack" role="alert">
      <p>{t(`desk.job.stop.${job.stop.reason}`)}</p>
      <Pre>{job.stop.detail}</Pre>
      <Button
        type="button"
        disabled={action.pending}
        onClick={() => void action.run({ action: "continue" })}
      >
        {t("desk.job.continue")}
      </Button>
      {action.error !== null && <p className="dk-hint dk-t-danger">{action.error}</p>}
    </div>
  );
}

function Done({ job }: { readonly job: JobState }) {
  const t = useT();
  if (job.role !== null && job.role.result !== null) {
    // A role job files nothing: its report is what it leaves.
    return (
      <Card className="dk-card">
        <h2>{t("desk.job.roleReview.done", { name: job.role.agent.name })}</h2>
        <ReportResult report={job.role.result} />
      </Card>
    );
  }
  return (
    <Card className="dk-card">
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
  useMarkSeen(job === undefined ? null : jobItem(job));

  // The list loads with the issues; a job opened by its link may not be in it yet.
  useEffect(() => {
    if (job !== undefined) return;
    void reloadJobs().finally(() => setLoaded(true));
  }, [reloadJobs, job]);

  if (job === undefined)
    return loaded ? <Muted>{t("desk.job.missing", { id: jobId })}</Muted> : <Loading />;
  const open = job.status !== "done" && job.status !== "cancelled";
  const latest = job.history.at(-1);
  const item = jobItem(job);
  const chip = chipOf(t, item);
  return (
    <>
      <Crumb itemKey={item.key} label={t("desk.work.jobRef")} />
      <header className="dk-ihead">
        <div className="dk-grow">
          <h1>
            <span className="dk-idn">{t("desk.work.jobRef")}</span>{" "}
            {t(`desk.job.title.${job.kind}`, { id: job.id })}
          </h1>
          <p className="dk-meta">
            <StatusChip tone={chip.tone}>{chip.text}</StatusChip>
            <span>
              {t("desk.job.meta", {
                model: job.input.model,
                spent: formatUsd(job.spentUsd, language),
                budget: formatUsd(job.input.budgetUsd, language),
                minutes: job.input.minutes
              })}
            </span>
            {job.branch !== null && (
              <span className="dk-ihead-more">
                <code className="dk-mono">{job.branch}</code>
              </span>
            )}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              appearance="outline"
              spacing="icon"
              aria-label={t("desk.gate.more")}
            >
              <Ellipsis aria-hidden="true" className="dk-ic" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              destructive
              disabled={!open || action.pending}
              onSelect={() => setConfirm("cancel")}
            >
              {t("desk.job.cancel")}
            </DropdownMenuItem>
            <DropdownMenuItem
              destructive
              disabled={job.status === "running" || action.pending}
              onSelect={() => setConfirm("remove")}
            >
              {t("desk.job.remove")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <div className="dk-ilayout">
        <div className="dk-icol">
          {latest !== undefined && job.status === "running" && (
            <p className="dk-row" aria-live="polite">
              <span className="dk-spin" aria-hidden="true" />
              <span className="dk-t-sub">{latest.message}</span>
            </p>
          )}
          {job.status === "needs-you" && <Stopped job={job} />}
          {job.status === "waiting" && <Gate job={job} />}
          {job.status === "done" && <Done job={job} />}
          <section className="dk-card" aria-labelledby={`job-${String(job.id)}-history`}>
            <h2 id={`job-${String(job.id)}-history`} className="dk-h-sec dk-mb-100">
              {t("desk.job.history")}
            </h2>
            <ol className="dk-actrows">
              {[...job.history].reverse().map((entry) => (
                <li key={`${entry.at}-${entry.message}`} className="dk-actr dk-actr3">
                  <time className="dk-t-small dk-t-subtlest dk-num" dateTime={entry.at}>
                    {new Date(entry.at).toLocaleTimeString(language)}
                  </time>
                  <span className="dk-t-small dk-strong">{t(`desk.job.stage.${entry.stage}`)}</span>
                  <span className="dk-t-small dk-t-sub">{entry.message}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
        <Steps job={job} />
      </div>
      {action.error !== null && (
        <p className="dk-hint dk-t-danger" role="alert">
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
