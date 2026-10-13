import { readFile } from "node:fs/promises";
import type { z } from "zod";

export interface JsonlRecords<T> {
  readonly records: readonly T[];
  /** Lines that are not a valid record (a torn write, a newer schema). They are skipped. */
  readonly invalidLines: number;
}

/** One record per line. A line that is not JSON or not a valid record is counted and skipped. */
export const parseJsonl = <T>(text: string, schema: z.ZodType<T>): JsonlRecords<T> => {
  const records: T[] = [];
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
    const parsed = schema.safeParse(json);
    if (parsed.success) records.push(parsed.data);
    else invalidLines += 1;
  }
  return { records, invalidLines };
};

/** A missing file reads as no records. */
export const readJsonl = async <T>(
  file: string,
  schema: z.ZodType<T>
): Promise<JsonlRecords<T>> => {
  try {
    return parseJsonl(await readFile(file, "utf8"), schema);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { records: [], invalidLines: 0 };
    }
    throw error;
  }
};
