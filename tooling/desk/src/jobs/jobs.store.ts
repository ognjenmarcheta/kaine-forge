import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

import { jobStateSchema, type JobState } from "../contracts";
import { writeJsonAtomic } from "../store/store.atomic";

/**
 * Desk jobs on disk: `<state>/jobs/job-<id>.json`, and each job's files (the sweep, the agent
 * settings, the receipts) in `<state>/jobs/<id>/`. Only the desk server runs jobs, so a file has
 * one writer and needs no lease. A file that does not parse is skipped, not fatal.
 */
export interface JobStore {
  readonly list: () => Promise<JobState[]>;
  readonly read: (id: number) => Promise<JobState | null>;
  readonly write: (state: JobState) => Promise<void>;
  readonly remove: (id: number) => Promise<void>;
  /** One more than the highest id ever written. */
  readonly nextId: () => Promise<number>;
  /** The job's own directory for its files. Created on first use. */
  readonly filesDir: (id: number) => Promise<string>;
}

const FILE = /^job-([1-9]\d{0,8})\.json$/;

export const createJobStore = (stateRoot: string): JobStore => {
  const root = path.join(stateRoot, "jobs");
  const fileOf = (id: number): string => path.join(root, `job-${id}.json`);

  const ids = async (): Promise<number[]> => {
    let names: string[];
    try {
      names = await readdir(root);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
      throw error;
    }
    return names.flatMap((name) => {
      const match = FILE.exec(name)?.[1];
      return match === undefined ? [] : [Number(match)];
    });
  };

  const read = async (id: number): Promise<JobState | null> => {
    try {
      const parsed = jobStateSchema.safeParse(JSON.parse(await readFile(fileOf(id), "utf8")));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  };

  return {
    list: async () => {
      const states = await Promise.all((await ids()).map(read));
      return states
        .filter((state): state is JobState => state !== null)
        .sort((left, right) => right.id - left.id);
    },
    read,
    write: async (state) => {
      await mkdir(root, { recursive: true });
      await writeJsonAtomic(fileOf(state.id), state);
    },
    remove: async (id) => {
      await rm(fileOf(id), { force: true });
      await rm(path.join(root, String(id)), { recursive: true, force: true });
    },
    nextId: async () => Math.max(0, ...(await ids())) + 1,
    filesDir: async (id) => {
      const dir = path.join(root, String(id));
      await mkdir(dir, { recursive: true });
      return dir;
    }
  };
};
