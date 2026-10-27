import type { z } from "zod";

export interface JobRetryPolicy {
  /** Retries after the first attempt; the job fails after attempt `limit + 1`. */
  limit: number;
  /** Delay before a retry. With `backoff`, the base of an exponential delay. */
  delaySeconds: number;
  backoff: boolean;
  /** Cap on the exponential delay. */
  maxDelaySeconds?: number;
}

export interface JobRetentionPolicy {
  /** Seconds a completed or failed job (and its payload) stays in the job table. */
  deleteAfterSeconds: number;
  /** Seconds a job may wait to run before it is deleted unrun. */
  pendingSeconds: number;
}

// pg-boss stores a payload as jsonb, so a payload is a JSON object at this
// serialization seam; each definition's schema narrows it.
export type JobPayloadData = Record<string, unknown>;

export interface JobDefinition<TPayload extends JobPayloadData> {
  /** Parses the stored payload at the handler boundary. */
  payload: z.ZodType<TPayload>;
  retry: JobRetryPolicy;
  retention?: JobRetentionPolicy;
}

// A job's name is its key in a definitions record, so enqueue and handler maps
// are checked against the keys at compile time.
export type JobDefinitions = Record<string, JobDefinition<JobPayloadData>>;

export type JobPayload<TDefinition> =
  TDefinition extends JobDefinition<infer TPayload> ? TPayload : never;

export type JobHandlers<TDefinitions extends JobDefinitions> = {
  [TName in keyof TDefinitions]: (payload: JobPayload<TDefinitions[TName]>) => Promise<void>;
};

export function defineJob<TPayload extends JobPayloadData>(
  definition: JobDefinition<TPayload>
): JobDefinition<TPayload> {
  return definition;
}
