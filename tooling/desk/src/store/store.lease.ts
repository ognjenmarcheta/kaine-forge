import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { link, mkdir, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

const execFileAsync = promisify(execFile);

/** A takeover lock older than this belongs to a process that died mid-takeover. */
const TAKEOVER_LOCK_STALE_MS = 30_000;

export const leaseRecordSchema = z
  .object({
    token: z.string().min(1),
    pid: z.number().int().positive(),
    /**
     * Start time of the holder process as `ps` reports it. A reused pid has a
     * different start time. `null` when `ps` is unavailable: liveness then
     * relies on the pid alone.
     */
    processStart: z.string().nullable(),
    acquiredAt: z.iso.datetime({ offset: true })
  })
  .strict();
export type LeaseRecord = z.infer<typeof leaseRecordSchema>;

export interface Lease {
  readonly record: LeaseRecord;
  /** Idempotent. Removes the lease file only while this lease still owns it. */
  readonly release: () => Promise<void>;
}

export type LeaseAcquireResult =
  | { readonly status: "acquired"; readonly lease: Lease }
  | { readonly status: "held"; readonly holder: LeaseRecord | null };

/** Seams for tests. The defaults use the real process table. */
export interface LeaseDeps {
  readonly pid: number;
  readonly now: () => Date;
  readonly isProcessAlive: (pid: number) => boolean;
  readonly processStart: (pid: number) => Promise<string | null>;
}

const isErrno = (error: unknown, code: string): boolean =>
  error instanceof Error && "code" in error && error.code === code;

export const defaultIsProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to another user.
    return isErrno(error, "EPERM");
  }
};

export const defaultProcessStart = async (pid: number): Promise<string | null> => {
  try {
    const { stdout } = await execFileAsync("ps", ["-o", "lstart=", "-p", String(pid)]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
};

const defaultDeps: LeaseDeps = {
  pid: process.pid,
  now: () => new Date(),
  isProcessAlive: defaultIsProcessAlive,
  processStart: defaultProcessStart
};

type LeaseRead =
  | { readonly kind: "missing" }
  | { readonly kind: "corrupt" }
  | { readonly kind: "valid"; readonly record: LeaseRecord };

const readLease = async (file: string): Promise<LeaseRead> => {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    if (isErrno(error, "ENOENT")) return { kind: "missing" };
    throw error;
  }
  try {
    const parsed = leaseRecordSchema.safeParse(JSON.parse(raw));
    return parsed.success ? { kind: "valid", record: parsed.data } : { kind: "corrupt" };
  } catch {
    return { kind: "corrupt" };
  }
};

const isHolderAlive = async (record: LeaseRecord, deps: LeaseDeps): Promise<boolean> => {
  if (!deps.isProcessAlive(record.pid)) return false;
  if (record.processStart === null) return true;
  const current = await deps.processStart(record.pid);
  // If `ps` fails now, keep the lease: a false "stale" verdict is the unsafe error.
  return current === null || current === record.processStart;
};

/**
 * Create the lease file with its content already in place. Writing a temp
 * file and hard-linking it makes create-if-absent atomic: no reader sees an
 * empty or partial lease.
 */
const tryCreate = async (file: string, record: LeaseRecord): Promise<boolean> => {
  const temporary = `${file}.${record.token}.tmp`;
  await writeFile(temporary, `${JSON.stringify(record)}\n`, { flag: "wx" });
  try {
    await link(temporary, file);
    return true;
  } catch (error) {
    if (isErrno(error, "EEXIST")) return false;
    throw error;
  } finally {
    await rm(temporary, { force: true });
  }
};

/** Serializes stale takeover so two contenders cannot each delete the other's fresh lease. */
const takeTakeoverLock = async (lock: string, deps: LeaseDeps): Promise<boolean> => {
  try {
    const handle = await open(lock, "wx");
    await handle.close();
    return true;
  } catch (error) {
    if (!isErrno(error, "EEXIST")) throw error;
  }
  try {
    const { mtimeMs } = await stat(lock);
    if (deps.now().getTime() - mtimeMs > TAKEOVER_LOCK_STALE_MS) await rm(lock, { force: true });
  } catch (error) {
    if (!isErrno(error, "ENOENT")) throw error;
  }
  return false;
};

/**
 * Take exclusive ownership of `file`. A lease whose holder process is gone is
 * stale and gets taken over. Returns `held` while a live process owns it.
 */
export const acquireLease = async (
  file: string,
  overrides: Partial<LeaseDeps> = {}
): Promise<LeaseAcquireResult> => {
  const deps: LeaseDeps = { ...defaultDeps, ...overrides };
  await mkdir(path.dirname(file), { recursive: true });

  const record: LeaseRecord = {
    token: randomUUID(),
    pid: deps.pid,
    processStart: await deps.processStart(deps.pid),
    acquiredAt: deps.now().toISOString()
  };
  const acquired = (): LeaseAcquireResult => ({
    status: "acquired",
    lease: {
      record,
      release: async () => {
        const current = await readLease(file);
        if (current.kind === "valid" && current.record.token === record.token) {
          await rm(file, { force: true });
        }
      }
    }
  });
  const held = (read: LeaseRead): LeaseAcquireResult => ({
    status: "held",
    holder: read.kind === "valid" ? read.record : null
  });

  if (await tryCreate(file, record)) return acquired();

  const existing = await readLease(file);
  if (existing.kind === "valid" && (await isHolderAlive(existing.record, deps))) {
    return held(existing);
  }

  const lock = `${file}.takeover`;
  if (!(await takeTakeoverLock(lock, deps))) return held(existing);
  try {
    const current = await readLease(file);
    if (current.kind === "valid" && (await isHolderAlive(current.record, deps))) {
      return held(current);
    }
    if (current.kind !== "missing") await rm(file, { force: true });
    if (await tryCreate(file, record)) return acquired();
    return held(await readLease(file));
  } finally {
    await rm(lock, { force: true });
  }
};
