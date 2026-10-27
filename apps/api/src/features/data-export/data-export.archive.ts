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
import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import JSZip from "jszip";

/** A value JSON.stringify writes as is: what the selected columns hold. */
type ArchiveValue =
  | string
  | number
  | boolean
  | null
  | Date
  | readonly ArchiveValue[]
  | { readonly [key: string]: ArchiveValue | undefined };

/**
 * The files of one export archive, by file name, each serialized as JSON.
 * Every query below names its columns: a credential column added to a table
 * later never reaches an archive by accident, and the archive holds no
 * password hash, session token, or two-factor secret (those tables are never read).
 */
export type ArchiveFiles = Record<`${string}.json`, ArchiveValue>;

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
  // jsonb arrives already parsed, as JSON values.
  toolActions: sql<ArchiveValue>`${assistantMessagesTable.toolActions}`,
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
async function contentFiles(
  db: Database,
  owner: { todos: SQL; notes: SQL; files: SQL }
): Promise<ArchiveFiles> {
  const [todos, notes, files] = await Promise.all([
    db.select(todoColumns).from(todosTable).where(owner.todos).orderBy(asc(todosTable.createdAt)),
    db.select(noteColumns).from(notesTable).where(owner.notes).orderBy(asc(notesTable.createdAt)),
    db
      .select(manifestColumns)
      .from(filesTable)
      .where(and(owner.files, eq(filesTable.status, "uploaded")))
      .orderBy(asc(filesTable.createdAt))
  ]);

  return { "todos.json": todos, "notes.json": notes, "files-manifest.json": files };
}

/**
 * A user's own assistant conversations and their messages. Conversations are
 * private to their author, so only a user export holds them, never an
 * Organization export.
 */
async function assistantFiles(db: Database, userId: string): Promise<ArchiveFiles> {
  const conversations = await db
    .select(conversationColumns)
    .from(assistantConversationsTable)
    .where(eq(assistantConversationsTable.userId, userId))
    .orderBy(asc(assistantConversationsTable.createdAt));
  // Messages follow their conversations, so an export never holds a message
  // of a conversation it does not hold.
  const messages =
    conversations.length > 0
      ? await db
          .select(messageColumns)
          .from(assistantMessagesTable)
          .where(
            inArray(
              assistantMessagesTable.conversationId,
              conversations.map((conversation) => conversation.id)
            )
          )
          .orderBy(asc(assistantMessagesTable.createdAt))
      : [];

  return {
    "assistant-conversations.json": conversations,
    "assistant-messages.json": messages
  };
}

/** A user's own data: profile, Organization Memberships, and the rows they created. */
export async function collectUserExport(db: Database, userId: string): Promise<ArchiveFiles> {
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

  const memberships = await db
    .select({
      organizationId: organizationsTable.id,
      organizationName: organizationsTable.name,
      organizationSlug: organizationsTable.slug,
      role: membersTable.role,
      joinedAt: membersTable.createdAt
    })
    .from(membersTable)
    .innerJoin(organizationsTable, eq(organizationsTable.id, membersTable.organizationId))
    .where(eq(membersTable.userId, userId))
    .orderBy(asc(membersTable.createdAt));

  return {
    "profile.json": profile,
    "memberships.json": memberships,
    ...(await contentFiles(db, {
      todos: eq(todosTable.userId, userId),
      notes: eq(notesTable.userId, userId),
      files: eq(filesTable.uploadedBy, userId)
    })),
    ...(await assistantFiles(db, userId))
  };
}

/**
 * One Organization's data: the Organization, its members and roles,
 * Invitations, and shared content. No assistant conversations: they are
 * private to their author, who exports them with a user export.
 */
export async function collectOrganizationExport(
  db: Database,
  organizationId: string
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

  const [members, customRoles, invitations] = await Promise.all([
    db
      .select({
        userId: membersTable.userId,
        name: usersTable.name,
        email: usersTable.email,
        role: membersTable.role,
        joinedAt: membersTable.createdAt
      })
      .from(membersTable)
      .innerJoin(usersTable, eq(usersTable.id, membersTable.userId))
      .where(eq(membersTable.organizationId, organizationId))
      .orderBy(asc(membersTable.createdAt)),
    db
      .select({
        role: organizationRolesTable.role,
        permission: organizationRolesTable.permission,
        createdAt: organizationRolesTable.createdAt,
        updatedAt: organizationRolesTable.updatedAt
      })
      .from(organizationRolesTable)
      .where(eq(organizationRolesTable.organizationId, organizationId))
      .orderBy(asc(organizationRolesTable.createdAt)),
    db
      .select({
        id: invitationsTable.id,
        email: invitationsTable.email,
        role: invitationsTable.role,
        status: invitationsTable.status,
        inviterId: invitationsTable.inviterId,
        expiresAt: invitationsTable.expiresAt,
        createdAt: invitationsTable.createdAt
      })
      .from(invitationsTable)
      .where(eq(invitationsTable.organizationId, organizationId))
      .orderBy(asc(invitationsTable.createdAt))
  ]);

  return {
    "organization.json": organization,
    "members.json": members,
    // A Custom Role reads as the Permissions it grants, as the server checks them.
    "roles.json": customRoles.map((customRole) => ({
      role: customRole.role,
      permissions: resolveRolePermissions(customRole.role, customRoles),
      createdAt: customRole.createdAt,
      updatedAt: customRole.updatedAt
    })),
    "invitations.json": invitations,
    ...(await contentFiles(db, {
      todos: eq(todosTable.organizationId, organizationId),
      notes: eq(notesTable.organizationId, organizationId),
      files: eq(filesTable.organizationId, organizationId)
    }))
  };
}

/** One zip archive with a pretty-printed JSON file per entry. */
export async function zipArchive(files: ArchiveFiles): Promise<Uint8Array> {
  const zip = new JSZip();

  for (const [name, value] of Object.entries(files)) {
    zip.file(name, `${JSON.stringify(value, null, 2)}\n`);
  }

  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
