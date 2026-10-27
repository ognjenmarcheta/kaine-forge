import type { Db } from "pg-boss";

interface PgQueryResult {
  rows: Array<Record<string, unknown>>;
}

/** The query method of a node-postgres Pool. */
export interface PgQueryable {
  query(text: string, values?: unknown[]): Promise<PgQueryResult | PgQueryResult[]>;
}

/**
 * Runs pg-boss on the application's own node-postgres pool, so the runner
 * adds no second pool and shares its SSL settings and shutdown.
 */
export function fromPgPool(pool: PgQueryable): Db {
  return {
    async executeSql(text, values) {
      // pg-boss sends multi-statement DDL without parameters. node-postgres
      // runs that only on the simple protocol, which an empty values array
      // would switch off, and resolves it with one result per statement.
      const result = values?.length ? await pool.query(text, values) : await pool.query(text);
      return Array.isArray(result) ? { rows: result.flatMap((entry) => entry.rows) } : result;
    }
  };
}
