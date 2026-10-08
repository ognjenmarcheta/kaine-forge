import { randomUUID } from "node:crypto";
import { appendFile, mkdir, open, rename, rm } from "node:fs/promises";
import path from "node:path";

/**
 * Write JSON so a reader sees the old file or the new file, never a partial
 * one: write a temp file in the same directory, flush it, then rename it.
 */
export const writeJsonAtomic = async <T>(file: string, value: T): Promise<void> => {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temporary, "w");
    try {
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
};

/** Append one JSON record as one line. `JSON.stringify` never emits a raw newline. */
export const appendJsonl = async <T>(file: string, record: T): Promise<void> => {
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(record)}\n`, "utf8");
};
