import { randomUUID } from "node:crypto";
import { appendFile, mkdir, open, rename, rm } from "node:fs/promises";
import path from "node:path";

const RENAME_ATTEMPTS = 20;
const BUSY_CODES: ReadonlySet<string> = new Set(["EPERM", "EACCES", "EBUSY"]);

/**
 * On Windows a rename over a file that another process reads at that moment fails with
 * EPERM, EACCES or EBUSY. The desk server reads `state.json` while the engine writes it, so
 * the rename tries again for a short while. Other errors, and other platforms, fail at once.
 */
const renameOver = async (from: string, to: string): Promise<void> => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String(error.code) : "";
      if (process.platform !== "win32" || !BUSY_CODES.has(code) || attempt >= RENAME_ATTEMPTS) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 5 * attempt));
    }
  }
};

/**
 * Write text so a reader sees the old file or the new file, never a partial
 * one: write a temp file in the same directory, flush it, then rename it.
 */
export const writeTextAtomic = async (file: string, text: string): Promise<void> => {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temporary, "w");
    try {
      await handle.writeFile(text, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await renameOver(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
};

/** Write JSON the same way as `writeTextAtomic`. */
export const writeJsonAtomic = async <T>(file: string, value: T): Promise<void> =>
  writeTextAtomic(file, `${JSON.stringify(value, null, 2)}\n`);

/** Append one JSON record as one line. `JSON.stringify` never emits a raw newline. */
export const appendJsonl = async <T>(file: string, record: T): Promise<void> => {
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(record)}\n`, "utf8");
};
