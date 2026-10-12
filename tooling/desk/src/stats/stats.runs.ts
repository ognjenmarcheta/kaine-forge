import { readFile } from "node:fs/promises";
import path from "node:path";

import { runRecordSchema, type RunRecord } from "../contracts";
import { appendJsonl } from "../store/store.atomic";

/** In the state root, not in an issue folder, so `remove` keeps the history. */
export const runsPath = (stateRoot: string): string => path.join(stateRoot, "runs.jsonl");

export const appendRunRecord = async (stateRoot: string, record: RunRecord): Promise<void> => {
  await appendJsonl(runsPath(stateRoot), runRecordSchema.parse(record));
};

export interface RunRecords {
  readonly records: readonly RunRecord[];
  /** Lines that are not a valid record (a torn write, a newer schema). They are skipped. */
  readonly invalidLines: number;
}

export const parseRunRecords = (text: string): RunRecords => {
  const records: RunRecord[] = [];
  let invalidLines = 0;
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      invalidLines += 1;
      continue;
    }
    const parsed = runRecordSchema.safeParse(json);
    if (parsed.success) records.push(parsed.data);
    else invalidLines += 1;
  }
  return { records, invalidLines };
};

export const readRunRecords = async (stateRoot: string): Promise<RunRecords> => {
  try {
    return parseRunRecords(await readFile(runsPath(stateRoot), "utf8"));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { records: [], invalidLines: 0 };
    }
    throw error;
  }
};
