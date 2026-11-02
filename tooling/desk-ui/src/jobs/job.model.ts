import type { JobStage, JobState, JobStatus } from "@repo/desk/contracts";

import type { Tone } from "../status/status.model";

export const JOB_TONE: Readonly<Record<JobStatus, Tone>> = {
  running: "information",
  waiting: "warning",
  "needs-you": "danger",
  done: "success",
  cancelled: "neutral"
};

/** The steps each job kind shows, in order. */
export const JOB_STEPS: Readonly<Record<JobState["kind"], readonly JobStage[]>> = {
  scorecard: ["setup", "sweep", "score", "review", "ship"],
  screen: ["setup", "build", "check", "review", "ship"]
};

export type StepState = "done" | "current" | "todo";

/** Where each step stands for a job: before its stage, at it, or after it. */
export const stepStates = (job: Pick<JobState, "kind" | "stage" | "status">): StepState[] => {
  const steps = JOB_STEPS[job.kind];
  const at = job.stage === "done" ? steps.length : steps.indexOf(job.stage);
  return steps.map((_, index) =>
    index < at || job.status === "done" ? "done" : index === at ? "current" : "todo"
  );
};

/** The job's lab compare page in its own lab server, or `null` while that server is down. */
export const compareUrlOf = (job: Pick<JobState, "input" | "screen">): string | null =>
  job.screen?.port === null || job.screen?.port === undefined || job.input.screen === undefined
    ? null
    : `http://localhost:${String(job.screen.port)}/?view=lab#/compare/${job.input.screen.id}`;

/** A job that is not finished: the desk runs one of each kind at a time. */
export const isOpenJob = (job: Pick<JobState, "status">): boolean =>
  job.status !== "done" && job.status !== "cancelled";

/** The newest unfinished job of a kind, if any. */
export const openJobOf = (
  jobs: Readonly<Record<number, JobState>>,
  kind: JobState["kind"]
): JobState | null =>
  Object.values(jobs)
    .filter((job) => job.kind === kind && isOpenJob(job))
    .sort((left, right) => right.id - left.id)[0] ?? null;

/** Jobs for the board's side list: unfinished first, newest first, then the last few finished. */
export const boardJobs = (
  jobs: Readonly<Record<number, JobState>>,
  finishedShown = 3
): JobState[] => {
  const all = Object.values(jobs).sort((left, right) => right.id - left.id);
  return [
    ...all.filter(isOpenJob),
    ...all.filter((job) => !isOpenJob(job)).slice(0, finishedShown)
  ];
};
