import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";
import type { Database } from "@repo/db/types";
import { and, asc, desc, eq, getTableName, gt, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import type {
  AnyPgColumn,
  PgColumn,
  PgTable,
  PgUpdateSetSource,
  TableLikeHasEmptySelection
} from "drizzle-orm/pg-core";
import { GraphQLError } from "graphql";

export type OrganizationOwnedTable = PgTable & { organizationId: AnyPgColumn };
type UserOwnedTable = OrganizationOwnedTable & { userId: AnyPgColumn };

type PagedTable = OrganizationOwnedTable & { id: AnyPgColumn };
type UserPagedTable = PgTable & { id: AnyPgColumn; userId: AnyPgColumn };

// The column a list is bound to and its value: the Organization for scoped
// data, the user for a user's own rows. A cursor carries the value.
interface PageOwner {
  column: AnyPgColumn;
  id: string;
}

/** The `first` and `after` arguments of a list field. */
export interface PageInput {
  first?: number | null | undefined;
  after?: string | null | undefined;
}

/** How a list sorts: a timestamptz column, with `id` breaking ties in the same direction. */
export interface PageOrder {
  orderBy: AnyPgColumn;
  direction: "asc" | "desc";
  limits: { defaultLimit: number; maxLimit: number };
}

/** One page of a list: the `<Type>Connection` shape every list field returns. */
export interface Connection<TRow> {
  items: TRow[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}

export const EMPTY_CONNECTION: Connection<never> = {
  items: [],
  pageInfo: { hasNextPage: false, endCursor: null }
};

// Postgres keeps microseconds and a JS Date keeps milliseconds, so the cursor
// carries the sort key as Postgres prints it: rounding it to a Date would skip
// rows created in the same millisecond.
const SORT_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A sort key in the cursor's exact format that names an instant Postgres
 * accepts. The pattern alone lets `2025-13-45T99:99:99` and year 0 through,
 * and Postgres would then fail the query; a key that does not survive a Date
 * round trip to the millisecond, or falls before year 1, is refused instead.
 * The microsecond tail stays as sent.
 */
function isSortKey(value: unknown): value is string {
  if (typeof value !== "string" || !SORT_KEY_PATTERN.test(value)) return false;
  const milliseconds = `${value.slice(0, 23)}Z`;
  const parsed = Date.parse(milliseconds);
  return (
    !value.startsWith("0000") &&
    !Number.isNaN(parsed) &&
    new Date(parsed).toISOString() === milliseconds
  );
}

interface CursorPosition {
  sortKey: string;
  id: string;
}

function invalidCursor(): GraphQLError {
  return new GraphQLError("invalid cursor", { extensions: { code: "BAD_USER_INPUT" } });
}

// A cursor names its list and owner (Organization or user), so one from
// another list or owner is refused instead of paging from a foreign position.
function encodeCursor(list: string, ownerId: string, position: CursorPosition): string {
  return Buffer.from(JSON.stringify([list, ownerId, position.sortKey, position.id])).toString(
    "base64url"
  );
}

function decodeCursor(cursor: string, list: string, ownerId: string): CursorPosition {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw invalidCursor();
  }
  if (!Array.isArray(parsed) || parsed.length !== 4) throw invalidCursor();
  const [cursorList, cursorOwnerId, sortKey, id] = parsed;
  if (
    cursorList !== list ||
    cursorOwnerId !== ownerId ||
    !isSortKey(sortKey) ||
    typeof id !== "string" ||
    !UUID_PATTERN.test(id)
  ) {
    throw invalidCursor();
  }
  return { sortKey, id };
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
  /**
   * One page of the table in `order`, after the `after` cursor: `first` is
   * clamped to the order's limits, and `first + 1` rows are read to set
   * `hasNextPage`. A malformed or foreign cursor throws `invalid cursor`.
   */
  page<TTable extends PagedTable>(
    table: TTable,
    input: PageInput,
    order: PageOrder,
    ...conditions: (SQL | undefined)[]
  ): Promise<Connection<TTable["$inferSelect"]>>;
}

function organizationPredicate(
  table: OrganizationOwnedTable,
  scope: AuthenticatedOrganizationScope,
  conditions: (SQL | undefined)[]
): SQL | undefined {
  return and(eq(table.organizationId, scope.organizationId), ...conditions);
}

function selectable<TTable extends PgTable>(table: TTable) {
  // SAFETY: TableLikeHasEmptySelection is true only for a Subquery without a
  // `returning` clause; the source is a PgTable, never a
  // Subquery, so the check is always false. TypeScript cannot resolve it for a
  // generic table, so the source is narrowed to the branch it always takes.
  return table as TableLikeHasEmptySelection<TTable> extends true ? never : TTable;
}

function selectFromScoped<TTable extends OrganizationOwnedTable>(
  db: Database,
  scope: AuthenticatedOrganizationScope,
  table: TTable,
  conditions: (SQL | undefined)[]
) {
  return db
    .select()
    .from(selectable(table))
    .where(organizationPredicate(table, scope, conditions));
}

async function selectPage<TTable extends PgTable & { id: AnyPgColumn }>(
  db: Database,
  owner: PageOwner,
  table: TTable,
  input: PageInput,
  order: PageOrder,
  conditions: (SQL | undefined)[]
): Promise<Connection<TTable["$inferSelect"]>> {
  const { defaultLimit, maxLimit } = order.limits;
  const first = Math.min(maxLimit, Math.max(1, Math.floor(input.first ?? defaultLimit)));
  const list = getTableName(table);
  const after = input.after == null ? undefined : decodeCursor(input.after, list, owner.id);
  const [direction, beyond] = order.direction === "desc" ? [desc, lt] : [asc, gt];
  let keyset: SQL | undefined;
  if (after) {
    const sortKey = sql`${after.sortKey}::timestamptz`;
    keyset = or(
      beyond(order.orderBy, sortKey),
      and(eq(order.orderBy, sortKey), beyond(table.id, after.id))
    );
  }

  const rows = await db
    .select({
      row: table,
      sortKey: sql<string>`to_char(${order.orderBy} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      id: sql<string>`${table.id}::text`
    })
    .from(selectable(table))
    .where(and(eq(owner.column, owner.id), ...conditions, keyset))
    .orderBy(direction(order.orderBy), direction(table.id))
    .limit(first + 1);
  const page = rows.slice(0, first);
  const last = page.at(-1);

  return {
    items: page.map(({ row }) => row),
    pageInfo: {
      hasNextPage: rows.length > first,
      endCursor: last ? encodeCursor(list, owner.id, last) : null
    }
  };
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
    mine: (table) => eq(table.userId, requireOrganizationScope().userId),
    page: (table, input, order, ...conditions) =>
      selectPage(
        db,
        { column: table.organizationId, id: requireOrganizationScope().organizationId },
        table,
        input,
        order,
        conditions
      )
  };
}

/**
 * One page of the rows a user owns whatever their Active Organization, such
 * as their Notifications, with the same cursor rules as `ScopedData.page`. A
 * cursor is bound to the user, so another user's cursor is refused.
 */
export function pageOwnedByUser<TTable extends UserPagedTable>(
  db: Database,
  userId: string,
  table: TTable,
  input: PageInput,
  order: PageOrder,
  ...conditions: (SQL | undefined)[]
): Promise<Connection<TTable["$inferSelect"]>> {
  return selectPage(db, { column: table.userId, id: userId }, table, input, order, conditions);
}
