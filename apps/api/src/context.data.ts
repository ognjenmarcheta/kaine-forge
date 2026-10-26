import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";
import type { Database } from "@repo/db/types";
import { and, eq, ilike, or, type SQL } from "drizzle-orm";
import type {
  AnyPgColumn,
  PgColumn,
  PgTable,
  PgUpdateSetSource,
  TableLikeHasEmptySelection
} from "drizzle-orm/pg-core";

export type OrganizationOwnedTable = PgTable & { organizationId: AnyPgColumn };
type UserOwnedTable = OrganizationOwnedTable & { userId: AnyPgColumn };

export interface PaginationInput {
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}

export interface Pagination {
  limit: number;
  offset: number;
}

/** Clamps a requested page: limit to [1, maxLimit], offset to 0 or more, both floored. */
export function clampPagination(
  input: PaginationInput,
  limits: { defaultLimit: number; maxLimit: number }
): Pagination {
  const limit = Math.min(
    limits.maxLimit,
    Math.max(1, Math.floor(input.limit ?? limits.defaultLimit))
  );
  const offset = Math.max(0, Math.floor(input.offset ?? 0));
  return { limit, offset };
}

/**
 * Case-insensitive "contains" over the columns, with `\`, `%` and `_` matched
 * literally. A blank phrase is no filter (`undefined`, which `and()` drops).
 */
export function containsPhrase(
  phrase: string | null | undefined,
  columns: readonly [PgColumn, ...PgColumn[]]
): SQL | undefined {
  const trimmed = phrase?.trim();
  if (!trimmed) return undefined;
  const pattern = `%${trimmed.replace(/[\\%_]/g, "\\$&")}%`;
  return or(...columns.map((column) => ilike(column, pattern)));
}

/**
 * Data access for one request's Authenticated Organization Scope. Every read,
 * update, and delete it builds carries the organization predicate, and Drizzle
 * removes `.where` from the returned builder, so a caller adds conditions only
 * through the extra arguments. Building it reads no scope: the first query
 * does, so a request without one fails there with the scope's own error.
 */
export interface ScopedData {
  selectFrom<TTable extends OrganizationOwnedTable>(
    table: TTable,
    ...conditions: (SQL | undefined)[]
  ): ReturnType<typeof selectFromScoped<TTable>>;
  update<TTable extends OrganizationOwnedTable>(
    table: TTable,
    set: PgUpdateSetSource<TTable>,
    ...conditions: (SQL | undefined)[]
  ): ReturnType<typeof updateScoped<TTable>>;
  delete<TTable extends OrganizationOwnedTable>(
    table: TTable,
    ...conditions: (SQL | undefined)[]
  ): ReturnType<typeof deleteScoped<TTable>>;
  /** An insert builder; spread `stamp()` into its values. */
  insert<TTable extends OrganizationOwnedTable>(
    table: TTable
  ): ReturnType<typeof insertInto<TTable>>;
  /** The scope's organization, plus its user under the table's author column. */
  stamp(): { organizationId: string };
  stamp<TAuthor extends "uploadedBy" | "userId">(
    author: TAuthor
  ): { organizationId: string } & Record<TAuthor, string>;
  /** Rows the scope's user owns, for user-private tables such as Conversations. */
  mine(table: UserOwnedTable): SQL;
}

function organizationPredicate(
  table: OrganizationOwnedTable,
  scope: AuthenticatedOrganizationScope,
  conditions: (SQL | undefined)[]
): SQL | undefined {
  return and(eq(table.organizationId, scope.organizationId), ...conditions);
}

function selectFromScoped<TTable extends OrganizationOwnedTable>(
  db: Database,
  scope: AuthenticatedOrganizationScope,
  table: TTable,
  conditions: (SQL | undefined)[]
) {
  // SAFETY: TableLikeHasEmptySelection is true only for a Subquery without a
  // `returning` clause; an OrganizationOwnedTable is a PgTable, never a
  // Subquery, so the check is always false. TypeScript cannot resolve it for a
  // generic table, so the source is narrowed to the branch it always takes.
  const source = table as TableLikeHasEmptySelection<TTable> extends true ? never : TTable;
  return db
    .select()
    .from(source)
    .where(organizationPredicate(table, scope, conditions));
}

function updateScoped<TTable extends OrganizationOwnedTable>(
  db: Database,
  scope: AuthenticatedOrganizationScope,
  table: TTable,
  set: PgUpdateSetSource<TTable>,
  conditions: (SQL | undefined)[]
) {
  return db
    .update(table)
    .set(set)
    .where(organizationPredicate(table, scope, conditions));
}

function deleteScoped<TTable extends OrganizationOwnedTable>(
  db: Database,
  scope: AuthenticatedOrganizationScope,
  table: TTable,
  conditions: (SQL | undefined)[]
) {
  return db.delete(table).where(organizationPredicate(table, scope, conditions));
}

function insertInto<TTable extends OrganizationOwnedTable>(db: Database, table: TTable) {
  return db.insert(table);
}

export function createScopedData(input: {
  db: Database;
  requireOrganizationScope: () => AuthenticatedOrganizationScope;
}): ScopedData {
  const { db, requireOrganizationScope } = input;

  function stamp(): { organizationId: string };
  function stamp<TAuthor extends "uploadedBy" | "userId">(
    author: TAuthor
  ): { organizationId: string } & Record<TAuthor, string>;
  function stamp(author?: "uploadedBy" | "userId") {
    const scope = requireOrganizationScope();
    return author
      ? { organizationId: scope.organizationId, [author]: scope.userId }
      : { organizationId: scope.organizationId };
  }

  return {
    selectFrom: (table, ...conditions) =>
      selectFromScoped(db, requireOrganizationScope(), table, conditions),
    update: (table, set, ...conditions) =>
      updateScoped(db, requireOrganizationScope(), table, set, conditions),
    delete: (table, ...conditions) =>
      deleteScoped(db, requireOrganizationScope(), table, conditions),
    insert: (table) => {
      requireOrganizationScope();
      return insertInto(db, table);
    },
    stamp,
    mine: (table) => eq(table.userId, requireOrganizationScope().userId)
  };
}
