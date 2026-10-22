import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { buildLessonIssue } from "./stats.lesson-issue";
import { aggregateLessons, lessonCandidateFor, readLessonRecords } from "./stats.lessons";
import {
  promotedLessonSchema,
  type LessonIssueCreated,
  type LessonIssueDraft,
  type LessonReport,
  type PromotedLesson
} from "../contracts";
import { checkControllerIdentity } from "../github/github.identity";
import type { Clock, GitHubPort } from "../ports";
import { writeJsonAtomic } from "../store/store.atomic";

/** In the state root, beside `lessons.jsonl`, so `remove` keeps it. */
const promotedPath = (stateRoot: string): string => path.join(stateRoot, "lessons-promoted.json");

const promotedFileSchema = z
  .object({ version: z.literal(1), promoted: z.array(promotedLessonSchema) })
  .strict();

/** A missing file holds no promoted lesson. A malformed one is an error: a write would lose it. */
export const readPromotedLessons = async (stateRoot: string): Promise<PromotedLesson[]> => {
  let text: string;
  try {
    text = await readFile(promotedPath(stateRoot), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
  const parsed = promotedFileSchema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    throw new Error(`${promotedPath(stateRoot)} is not a valid promoted lessons file.`);
  }
  return parsed.data.promoted;
};

export type LessonActionResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: "not-found" | "lesson-refused"; readonly detail: string };

/** What the owner does with a lesson from the lessons page. */
export interface LessonActions {
  /** Mark a key handled. It leaves the candidates. A second promote replaces the note. */
  readonly promote: (key: string, note: string | null) => Promise<LessonActionResult<LessonReport>>;
  /** Make a promoted key a candidate again. */
  readonly unpromote: (key: string) => Promise<LessonActionResult<LessonReport>>;
  /** The exact title and body `createIssue` sends. */
  readonly issuePreview: (key: string) => Promise<LessonActionResult<LessonIssueDraft>>;
  /** Open the issue when `digest` still matches the preview, then promote the key with its number. */
  readonly createIssue: (
    key: string,
    digest: string
  ) => Promise<LessonActionResult<LessonIssueCreated>>;
}

export interface LessonDesk {
  readonly report: () => Promise<LessonReport>;
  readonly actions: LessonActions;
}

export interface LessonDeskDeps {
  readonly stateRoot: string;
  readonly clock: Clock;
  readonly github: Pick<GitHubPort, "repository" | "viewer" | "createIssue">;
  /** `owner` of the config. Only the owner's `gh` login may open an issue. */
  readonly owner: string | undefined;
  /** The `repo` instruction hash of the repository now, or `null`. */
  readonly currentRepo: () => Promise<string | null>;
}

const message = (error: unknown): string =>
  error instanceof Error ? error.message : "unknown error";

/**
 * The lessons report and the owner's actions on it. Writes to `lessons-promoted.json` run one at
 * a time. Lesson text is data: it reaches only the report and the issue body, never a prompt.
 */
export const createLessonDesk = (deps: LessonDeskDeps): LessonDesk => {
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const run = chain.then(task, task);
    chain = run.catch(() => undefined);
    return run;
  };

  const report = async (promoted?: readonly PromotedLesson[]): Promise<LessonReport> =>
    aggregateLessons(await readLessonRecords(deps.stateRoot), {
      currentRepo: await deps.currentRepo().catch(() => null),
      promoted: promoted ?? (await readPromotedLessons(deps.stateRoot))
    });

  const write = async (promoted: readonly PromotedLesson[]): Promise<LessonReport> => {
    await writeJsonAtomic(promotedPath(deps.stateRoot), { version: 1, promoted });
    return report(promoted);
  };

  const notFound = (key: string): LessonActionResult<never> => ({
    ok: false,
    code: "not-found",
    detail: `No lesson has the key '${key}'.`
  });

  /** The candidate for `key` and its promoted entry. Both read under the write queue. */
  const lookup = async (key: string) => {
    const [records, promoted] = await Promise.all([
      readLessonRecords(deps.stateRoot),
      readPromotedLessons(deps.stateRoot)
    ]);
    return {
      candidate: lessonCandidateFor(records.records, key),
      promoted,
      entry: promoted.find((lesson) => lesson.key === key) ?? null
    };
  };

  const promote: LessonActions["promote"] = (key, note) =>
    serial(async () => {
      const { candidate, promoted, entry } = await lookup(key);
      if (candidate === null) return notFound(key);
      const next: PromotedLesson = {
        key,
        at: deps.clock.now().toISOString(),
        note,
        issue: entry?.issue ?? null
      };
      return {
        ok: true,
        value: await write([...promoted.filter((lesson) => lesson.key !== key), next])
      };
    });

  const unpromote: LessonActions["unpromote"] = (key) =>
    serial(async () => {
      const { promoted, entry } = await lookup(key);
      if (entry === null) {
        return { ok: false, code: "not-found", detail: `The lesson '${key}' is not promoted.` };
      }
      return { ok: true, value: await write(promoted.filter((lesson) => lesson.key !== key)) };
    });

  const draftFor = async (key: string): Promise<LessonActionResult<LessonIssueDraft>> => {
    const { candidate, entry } = await lookup(key);
    if (candidate === null) return notFound(key);
    if (entry?.issue !== null && entry?.issue !== undefined) {
      return {
        ok: false,
        code: "lesson-refused",
        detail: `The lesson '${key}' already has issue #${entry.issue}.`
      };
    }
    return { ok: true, value: buildLessonIssue(candidate, entry?.note ?? null) };
  };

  const createIssue: LessonActions["createIssue"] = (key, digest) =>
    serial(async () => {
      const drafted = await draftFor(key);
      if (!drafted.ok) return drafted;
      const refuse = (detail: string): LessonActionResult<never> => ({
        ok: false,
        code: "lesson-refused",
        detail: `${detail} No issue was opened.`
      });
      if (drafted.value.digest !== digest) {
        return refuse("The lesson changed after the preview. Open the preview again.");
      }
      let created: { readonly number: number; readonly url: string };
      try {
        const identity = await checkControllerIdentity(deps.github, deps.owner);
        if (!identity.ok) return refuse(identity.reason);
        created = await deps.github.createIssue({
          title: drafted.value.title,
          body: drafted.value.body
        });
      } catch (error) {
        return refuse(`GitHub failed: ${message(error)}.`);
      }
      const { promoted, entry } = await lookup(key);
      const next: PromotedLesson = {
        key,
        at: deps.clock.now().toISOString(),
        note: entry?.note ?? null,
        issue: created.number
      };
      const value = await write([...promoted.filter((lesson) => lesson.key !== key), next]);
      return { ok: true, value: { issue: created.number, url: created.url, report: value } };
    });

  return {
    report: () => report(),
    actions: {
      promote,
      unpromote,
      issuePreview: (key) => serial(() => draftFor(key)),
      createIssue
    }
  };
};
