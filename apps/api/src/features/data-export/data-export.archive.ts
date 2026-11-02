import { resolveRolePermissions } from "@repo/auth/permissions";
import {
  assistantConversationsTable,
  assistantMessagesTable,
  filesTable,
  invitationsTable,
  membersTable,
  notesTable,
  organizationRolesTable,
  organizationsTable,
  todosTable,
  usersTable
} from "@repo/db/schema";
import type { Database } from "@repo/db/types";
import { and, asc, eq, gt, inArray, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import JSZip from "jszip";
import { Readable, Transform } from "node:stream";

/** A value JSON.stringify writes as is: what the selected columns hold. */
type ArchiveValue =
  | string
  | number
  | boolean
  | null
  | Date
  | readonly ArchiveValue[]
  | { readonly [key: string]: ArchiveValue | undefined };

/** One file's content: a single value, or a list read one page at a time. */
type ArchiveEntry = ArchiveValue | AsyncIterable<readonly ArchiveValue[]>;

/**
 * The files of one export archive, by file name, each serialized as JSON.
 * Every query below names its columns: a credential column added to a table
 * later never reaches an archive by accident, and the archive holds no
 * password hash, session token, or two-factor secret (those tables are never read).
 */
export type ArchiveFiles = Record<`${string}.json`, ArchiveEntry>;

/**
 * A row's place in (createdAt, id) order. createdAt is text to the
 * microsecond: a JS Date keeps only milliseconds, so a Date cursor would skip
 * or repeat rows.
 */
interface PageCursor {
  sortKey: string;
  id: string;
}

interface KeysetPage {
  cursor: { sortKey: SQL<string>; id: SQL<string> };
  after: SQL | undefined;
  orderBy: SQL[];
  limit: number;
}

/**
 * A list read `pageSize` rows at a time by keyset, in (createdAt, id) order,
 * one page per yield. `fetchPage` selects `cursor` next to the row and
 * applies `after`, `orderBy`, and `limit`.
 */
async function* keysetPages<TRow>(
  order: { createdAt: AnyColumn; id: AnyColumn },
  pageSize: number,
  fetchPage: (page: KeysetPage) => Promise<Array<{ row: TRow; cursor: PageCursor }>>
): AsyncGenerator<TRow[]> {
  const cursor = {
    sortKey: sql<string>`to_char(${order.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
    id: sql<string>`${order.id}::text`
  };
  const orderBy = [asc(order.createdAt), asc(order.id)];
  let after: SQL | undefined;

  for (;;) {
    const page = await fetchPage({ cursor, after, orderBy, limit: pageSize });
    yield page.map(({ row }) => row);
    const last = page.at(-1)?.cursor;

    if (page.length < pageSize || !last) {
      return;
    }

    const sortKey = sql`${last.sortKey}::timestamptz`;
    after = or(
      gt(order.createdAt, sortKey),
      and(eq(order.createdAt, sortKey), gt(order.id, last.id))
    );
  }
}

const todoColumns = {
  id: todosTable.id,
  organizationId: todosTable.organizationId,
  userId: todosTable.userId,
  title: todosTable.title,
  description: todosTable.description,
  completed: todosTable.completed,
  noteId: todosTable.noteId,
  createdAt: todosTable.createdAt,
  updatedAt: todosTable.updatedAt
};

const noteColumns = {
  id: notesTable.id,
  organizationId: notesTable.organizationId,
  userId: notesTable.userId,
  title: notesTable.title,
  body: notesTable.body,
  createdAt: notesTable.createdAt,
  updatedAt: notesTable.updatedAt
};

const conversationColumns = {
  id: assistantConversationsTable.id,
  organizationId: assistantConversationsTable.organizationId,
  userId: assistantConversationsTable.userId,
  title: assistantConversationsTable.title,
  createdAt: assistantConversationsTable.createdAt,
  updatedAt: assistantConversationsTable.updatedAt
};

const messageColumns = {
  id: assistantMessagesTable.id,
  conversationId: assistantMessagesTable.conversationId,
  organizationId: assistantMessagesTable.organizationId,
  role: assistantMessagesTable.role,
  content: assistantMessagesTable.content,
  // No tool_actions: a tool result can quote other members' todos and notes.
  createdAt: assistantMessagesTable.createdAt
};

// The files manifest: Attachment metadata, never the bytes. Only uploaded
// Attachments have an object to name.
const manifestColumns = {
  id: filesTable.id,
  organizationId: filesTable.organizationId,
  uploadedBy: filesTable.uploadedBy,
  key: filesTable.key,
  name: filesTable.originalName,
  contentType: filesTable.mimeType,
  sizeBytes: filesTable.sizeBytes,
  entityType: filesTable.entityType,
  entityId: filesTable.entityId,
  createdAt: filesTable.createdAt
};

// Shared content of an Organization: todos, notes, and the files manifest.
function contentFiles(
  db: Database,
  owner: { todos: SQL; notes: SQL; files: SQL },
  pageSize: number
): ArchiveFiles {
  return {
    "todos.json": keysetPages(todosTable, pageSize, ({ cursor, after, orderBy, limit }) =>
      db
        .select({ row: todoColumns, cursor })
        .from(todosTable)
        .where(and(owner.todos, after))
        .orderBy(...orderBy)
        .limit(limit)
    ),
    "notes.json": keysetPages(notesTable, pageSize, ({ cursor, after, orderBy, limit }) =>
      db
        .select({ row: noteColumns, cursor })
        .from(notesTable)
        .where(and(owner.notes, after))
        .orderBy(...orderBy)
        .limit(limit)
    ),
    "files-manifest.json": keysetPages(filesTable, pageSize, ({ cursor, after, orderBy, limit }) =>
      db
        .select({ row: manifestColumns, cursor })
        .from(filesTable)
        .where(and(owner.files, eq(filesTable.status, "uploaded"), after))
        .orderBy(...orderBy)
        .limit(limit)
    )
  };
}

/**
 * The Organizations a user belongs to now. A user export holds their rows in
 * these only: what they created in an Organization they left stays with it.
 */
function currentOrganizationIds(db: Database, userId: string) {
  return db
    .select({ id: membersTable.organizationId })
    .from(membersTable)
    .where(eq(membersTable.userId, userId));
}

/** Rows the user wrote, in an Organization they belong to now. */
function mineInCurrentOrganizations(
  db: Database,
  userId: string,
  author: AnyColumn,
  organization: AnyColumn
): SQL {
  return sql`(${eq(author, userId)} and ${inArray(organization, currentOrganizationIds(db, userId))})`;
}

/**
 * A user's own assistant conversations and their messages, in the
 * Organizations they belong to. Conversations are private to their author,
 * so only a user export holds them, never an Organization export.
 */
function assistantFiles(db: Database, userId: string, pageSize: number): ArchiveFiles {
  const owned = mineInCurrentOrganizations(
    db,
    userId,
    assistantConversationsTable.userId,
    assistantConversationsTable.organizationId
  );

  return {
    "assistant-conversations.json": keysetPages(
      assistantConversationsTable,
      pageSize,
      ({ cursor, after, orderBy, limit }) =>
        db
          .select({ row: conversationColumns, cursor })
          .from(assistantConversationsTable)
          .where(and(owned, after))
          .orderBy(...orderBy)
          .limit(limit)
    ),
    // Messages follow the same conversations, by subquery: a bound id list
    // would pass Postgres' 65,535 parameter limit for a large export.
    "assistant-messages.json": keysetPages(
      assistantMessagesTable,
      pageSize,
      ({ cursor, after, orderBy, limit }) =>
        db
          .select({ row: messageColumns, cursor })
          .from(assistantMessagesTable)
          .where(
            and(
              inArray(
                assistantMessagesTable.conversationId,
                db
                  .select({ id: assistantConversationsTable.id })
                  .from(assistantConversationsTable)
                  .where(owned)
              ),
              after
            )
          )
          .orderBy(...orderBy)
          .limit(limit)
    )
  };
}

/**
 * A user's own data: profile, current Organization Memberships, and the rows
 * they created in those Organizations.
 */
export async function collectUserExport(
  db: Database,
  userId: string,
  pageSize: number
): Promise<ArchiveFiles> {
  const [profile] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      image: usersTable.image,
      emailVerified: usersTable.emailVerified,
      twoFactorEnabled: usersTable.twoFactorEnabled,
      locale: usersTable.locale,
      createdAt: usersTable.createdAt,
      updatedAt: usersTable.updatedAt
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!profile) {
    throw new Error("export requester not found");
  }

  return {
    "profile.json": profile,
    "memberships.json": keysetPages(membersTable, pageSize, ({ cursor, after, orderBy, limit }) =>
      db
        .select({
          row: {
            organizationId: organizationsTable.id,
            organizationName: organizationsTable.name,
            organizationSlug: organizationsTable.slug,
            role: membersTable.role,
            joinedAt: membersTable.createdAt
          },
          cursor
        })
        .from(membersTable)
        .innerJoin(organizationsTable, eq(organizationsTable.id, membersTable.organizationId))
        .where(and(eq(membersTable.userId, userId), after))
        .orderBy(...orderBy)
        .limit(limit)
    ),
    ...contentFiles(
      db,
      {
        todos: mineInCurrentOrganizations(db, userId, todosTable.userId, todosTable.organizationId),
        notes: mineInCurrentOrganizations(db, userId, notesTable.userId, notesTable.organizationId),
        files: mineInCurrentOrganizations(
          db,
          userId,
          filesTable.uploadedBy,
          filesTable.organizationId
        )
      },
      pageSize
    ),
    ...assistantFiles(db, userId, pageSize)
  };
}

/**
 * One Organization's data: the Organization, its members and roles,
 * Invitations, and shared content. No assistant conversations: they are
 * private to their author, who exports them with a user export.
 */
export async function collectOrganizationExport(
  db: Database,
  organizationId: string,
  pageSize: number
): Promise<ArchiveFiles> {
  const [organization] = await db
    .select({
      id: organizationsTable.id,
      name: organizationsTable.name,
      slug: organizationsTable.slug,
      logo: organizationsTable.logo,
      personal: organizationsTable.personal,
      ownerUserId: organizationsTable.userId,
      createdAt: organizationsTable.createdAt
    })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, organizationId))
    .limit(1);

  if (!organization) {
    throw new Error("exported organization not found");
  }

  // One query: a Custom Role resolves against all of them, and an
  // Organization has few.
  const customRoles = await db
    .select({
      role: organizationRolesTable.role,
      permission: organizationRolesTable.permission,
      createdAt: organizationRolesTable.createdAt,
      updatedAt: organizationRolesTable.updatedAt
    })
    .from(organizationRolesTable)
    .where(eq(organizationRolesTable.organizationId, organizationId))
    .orderBy(asc(organizationRolesTable.createdAt));

  return {
    "organization.json": organization,
    "members.json": keysetPages(membersTable, pageSize, ({ cursor, after, orderBy, limit }) =>
      db
        .select({
          row: {
            userId: membersTable.userId,
            name: usersTable.name,
            email: usersTable.email,
            role: membersTable.role,
            joinedAt: membersTable.createdAt
          },
          cursor
        })
        .from(membersTable)
        .innerJoin(usersTable, eq(usersTable.id, membersTable.userId))
        .where(and(eq(membersTable.organizationId, organizationId), after))
        .orderBy(...orderBy)
        .limit(limit)
    ),
    // A Custom Role reads as the Permissions it grants, as the server checks them.
    "roles.json": customRoles.map((customRole) => ({
      role: customRole.role,
      permissions: resolveRolePermissions(customRole.role, customRoles),
      createdAt: customRole.createdAt,
      updatedAt: customRole.updatedAt
    })),
    "invitations.json": keysetPages(
      invitationsTable,
      pageSize,
      ({ cursor, after, orderBy, limit }) =>
        db
          .select({
            row: {
              id: invitationsTable.id,
              email: invitationsTable.email,
              role: invitationsTable.role,
              status: invitationsTable.status,
              inviterId: invitationsTable.inviterId,
              expiresAt: invitationsTable.expiresAt,
              createdAt: invitationsTable.createdAt
            },
            cursor
          })
          .from(invitationsTable)
          .where(and(eq(invitationsTable.organizationId, organizationId), after))
          .orderBy(...orderBy)
          .limit(limit)
    ),
    ...contentFiles(
      db,
      {
        todos: eq(todosTable.organizationId, organizationId),
        notes: eq(notesTable.organizationId, organizationId),
        files: eq(filesTable.organizationId, organizationId)
      },
      pageSize
    )
  };
}

/** The export passed an archive cap; the export fails with reason too_large. */
class DataExportTooLargeError extends Error {
  override name = "DataExportTooLargeError";
}

function isList(entry: ArchiveEntry): entry is AsyncIterable<readonly ArchiveValue[]> {
  return typeof entry === "object" && entry !== null && Symbol.asyncIterator in entry;
}

/**
 * One entry's JSON, as `JSON.stringify(value, null, 2)` and a newline write
 * it, one chunk per page. JSON escapes a newline inside a string, so indenting
 * after every newline only indents structure.
 */
async function* jsonChunks(entry: ArchiveEntry): AsyncGenerator<string> {
  if (!isList(entry)) {
    yield `${JSON.stringify(entry, null, 2)}\n`;
    return;
  }

  let empty = true;

  for await (const page of entry) {
    if (page.length === 0) {
      continue;
    }

    const items = page.map((row) => `  ${JSON.stringify(row, null, 2).replaceAll("\n", "\n  ")}`);
    yield `${empty ? "[\n" : ",\n"}${items.join(",\n")}`;
    empty = false;
  }

  yield empty ? "[]\n" : "\n]\n";
}

/** A zip archive, compressed as it is read. */
export interface ArchiveStream {
  stream: Readable;
  /** The zip's bytes so far: its size once `stream` has ended. */
  sizeBytes: () => number;
  /** True once the export passed a cap, whichever error then reaches the reader. */
  tooLarge: () => boolean;
}

/**
 * One zip archive with a pretty-printed JSON file per entry, built while it is
 * read: memory holds one page of rows and the zip's buffers, whatever the
 * size. The stream fails with DataExportTooLargeError once the JSON passes
 * `maxJsonBytes` or the zip passes `maxZipBytes`, and with the error of any
 * failed page query.
 */
export function zipArchive(
  files: ArchiveFiles,
  caps: { maxJsonBytes: number; maxZipBytes: number }
): ArchiveStream {
  let jsonBytes = 0;
  let zipBytes = 0;
  let tooLarge = false;
  const overCap = () => {
    tooLarge = true;
    return new DataExportTooLargeError("data export is over the archive size cap");
  };
  const stream = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      zipBytes += chunk.byteLength;
      done(zipBytes > caps.maxZipBytes ? overCap() : null, chunk);
    }
  });

  // jszip drops an entry stream's error that arrives while it is paused, and
  // the archive never ends. So an entry never fails toward jszip: it fails
  // the output stream instead.
  async function* entryBytes(entry: ArchiveEntry): AsyncGenerator<Buffer> {
    try {
      for await (const chunk of jsonChunks(entry)) {
        const bytes = Buffer.from(chunk);
        jsonBytes += bytes.byteLength;

        if (jsonBytes > caps.maxJsonBytes) {
          throw overCap();
        }

        yield bytes;
      }
    } catch (error) {
      stream.destroy(error instanceof Error ? error : new Error("data export entry failed"));
    }
  }

  const zip = new JSZip();

  for (const [name, entry] of Object.entries(files)) {
    zip.file(name, Readable.from(entryBytes(entry)));
  }

  zip
    .generateNodeStream({ type: "nodebuffer", streamFiles: true, compression: "DEFLATE" })
    .on("error", (error: Error) => stream.destroy(error))
    .pipe(stream);

  return { stream, sizeBytes: () => zipBytes, tooLarge: () => tooLarge };
}
