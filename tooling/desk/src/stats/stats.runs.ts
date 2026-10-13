import path from "node:path";

import { parseJsonl, readJsonl, type JsonlRecords } from "./stats.jsonl";
import { runRecordSchema, type RunRecord } from "../contracts";
import { appendJsonl } from "../store/store.atomic";

/** In the state root, not in an issue folder, so `remove` keeps the history. */
export const runsPath = (stateRoot: string): string => path.join(stateRoot, "runs.jsonl");

export const appendRunRecord = async (stateRoot: string, record: RunRecord): Promise<void> => {
  await appendJsonl(runsPath(stateRoot), runRecordSchema.parse(record));
};

export type RunRecords = JsonlRecords<RunRecord>;

export const parseRunRecords = (text: string): RunRecords => parseJsonl(text, runRecordSchema);

export const readRunRecords = (stateRoot: string): Promise<RunRecords> =>
  readJsonl(runsPath(stateRoot), runRecordSchema);
