import { invitationsTable, sessionsTable, verificationsTable } from "@repo/db/schema";
import type { Database } from "@repo/db/types";
import type { Logger } from "@repo/logger";
import { inArray, lt, sql } from "drizzle-orm";

import { HOUSEKEEPING_CONFIG } from "./housekeeping.definition";

interface PurgeCounts {
  sessions: number;
  verifications: number;
  invitations: number;
}

/** Deletes up to `limit` rows of one table and resolves how many it deleted. */
type BatchPurge = (tx: Database, limit: number) => Promise<number>;

function batchPurges(now: Date): Array<[keyof PurgeCounts, BatchPurge]> {
  const invitationCutoff = new Date(now.getTime() - HOUSEKEEPING_CONFIG.invitationRetentionMs);

  return [
    [
      "sessions",
      async (tx, limit) => {
        const expired = tx
          .select({ id: sessionsTable.id })
          .from(sessionsTable)
          .where(lt(sessionsTable.expiresAt, now))
          .limit(limit);
        const rows = await tx
          .delete(sessionsTable)
          .where(inArray(sessionsTable.id, expired))
          .returning({ id: sessionsTable.id });
        return rows.length;
      }
    ],
    [
      "verifications",
      async (tx, limit) => {
        const expired = tx
          .select({ id: verificationsTable.id })
          .from(verificationsTable)
          .where(lt(verificationsTable.expiresAt, now))
          .limit(limit);
        const rows = await tx
          .delete(verificationsTable)
          .where(inArray(verificationsTable.id, expired))
          .returning({ id: verificationsTable.id });
        return rows.length;
      }
    ],
    [
      "invitations",
      async (tx, limit) => {
        const expired = tx
          .select({ id: invitationsTable.id })
          .from(invitationsTable)
          .where(lt(invitationsTable.expiresAt, invitationCutoff))
          .limit(limit);
        const rows = await tx
          .delete(invitationsTable)
          .where(inArray(invitationsTable.id, expired))
          .returning({ id: invitationsTable.id });
        return rows.length;
      }
    ]
  ];
}

/**
 * Deletes expired sessions and verification rows, and Invitations whose expiry
 * is older than the retention window, whatever their status. A system job, not
 * a request: it takes no client input and deletes by expiry only.
 *
 * Each batch runs in its own transaction under the housekeeping advisory lock.
 * When another replica holds the lock, the run stops and resolves the counts so far.
 */
export async function purgeExpiredAuthRows({
  db,
  now,
  batchSize = HOUSEKEEPING_CONFIG.batchSize
}: {
  db: Database;
  now: Date;
  batchSize?: number;
}): Promise<PurgeCounts> {
  const counts: PurgeCounts = { sessions: 0, verifications: 0, invitations: 0 };

  for (const [table, purge] of batchPurges(now)) {
    for (;;) {
      const deleted = await withHousekeepingLock(db, (tx) => purge(tx, batchSize));

      if (deleted === null) {
        return counts;
      }

      counts[table] += deleted;

      if (deleted < batchSize) {
        break;
      }
    }
  }

  return counts;
}

/**
 * Runs `task` in a transaction that holds the housekeeping transaction-scoped
 * advisory lock. Resolves null without running `task` when another replica
 * holds the lock.
 */
async function withHousekeepingLock<T>(
  db: Database,
  task: (tx: Database) => Promise<T>
): Promise<T | null> {
  return db.transaction(async (tx) => {
    const result: unknown = await tx.execute(
      sql`select pg_try_advisory_xact_lock(${HOUSEKEEPING_CONFIG.advisoryLockKey}) as locked`
    );
    const locked =
      typeof result === "object" &&
      result !== null &&
      "rows" in result &&
      Array.isArray(result.rows) &&
      isLockedRow(result.rows[0]);

    return locked ? task(tx) : null;
  });
}

function isLockedRow(row: unknown): boolean {
  return typeof row === "object" && row !== null && "locked" in row && row.locked === true;
}

/**
 * Purges expired auth rows every `intervalMs`, never two runs at once in this
 * process. Returns a stop function.
 */
export function startHousekeeping({
  db,
  intervalMs,
  logger
}: {
  db: Database;
  intervalMs: number;
  logger: Pick<Logger, "error" | "info">;
}): () => void {
  let running = false;

  const timer = setInterval(() => {
    if (running) {
      return;
    }

    running = true;
    purgeExpiredAuthRows({ db, now: new Date() })
      .then((counts) => {
        if (counts.sessions > 0 || counts.verifications > 0 || counts.invitations > 0) {
          logger.info(counts, "housekeeping purged expired auth rows");
        }
      })
      .catch((error: unknown) => {
        logger.error({ err: error }, "housekeeping failed");
      })
      .finally(() => {
        running = false;
      });
  }, intervalMs);

  // Housekeeping never keeps the process alive on its own.
  timer.unref();
  return () => {
    clearInterval(timer);
  };
}
