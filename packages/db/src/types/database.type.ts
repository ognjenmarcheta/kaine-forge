import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

/** A Drizzle Postgres database: the node-postgres client in production, PGlite in tests. */
export type Database = PgDatabase<PgQueryResultHKT>;
