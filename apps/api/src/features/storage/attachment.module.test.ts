import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";
import { filesTable, organizationsTable, todosTable, usersTable } from "@repo/db/schema";
import { createTestDatabase, type TestDatabase } from "@repo/db/testing";
import { createLogger, type Logger } from "@repo/logger";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance
} from "vitest";

import { createAttachments, type Attachments } from "./attachment.module";
import type { ObjectStore } from "./attachment.store";
import { createMemoryObjectStore } from "./attachment.store.memory";
import { createScopedData, type ScopedData } from "../../context.data";
import { createTodos } from "../todos/todos.module";

let database: TestDatabase;
let data: ScopedData;
let ownTodoId: string;
let foreignTodoId: string;
let memory: ReturnType<typeof createMemoryObjectStore>;
let logger: Logger;
let warn: MockInstance<Logger["warn"]>;

const upload = { mimeType: "image/png", originalName: "photo.png", sizeBytes: 1024 };
const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pngObject = { contentType: "image/png", sizeBytes: 1024, bytes: PNG_BYTES };

function attachmentsWith(store: ObjectStore = memory): Attachments {
  return createAttachments({ data, logger, store });
}

async function rows() {
  return database.db.select().from(filesTable);
}

beforeAll(async () => {
  database = await createTestDatabase();
  const { db } = database;
  const [user] = await db
    .insert(usersTable)
    .values({ email: "u@example.test", name: "User" })
    .returning();
  if (!user) throw new Error("failed to seed user");
  const [own, foreign] = await db
    .insert(organizationsTable)
    .values([
      { name: "Own", slug: "own", userId: user.id },
      { name: "Foreign", slug: "foreign", userId: user.id }
    ])
    .returning();
  if (!own || !foreign) throw new Error("failed to seed organizations");
  const [ownTodo, foreignTodo] = await db
    .insert(todosTable)
    .values([
      { organizationId: own.id, title: "Own", userId: user.id },
      { organizationId: foreign.id, title: "Foreign", userId: user.id }
    ])
    .returning();
  if (!ownTodo || !foreignTodo) throw new Error("failed to seed todos");
  ownTodoId = ownTodo.id;
  foreignTodoId = foreignTodo.id;
  const scope: AuthenticatedOrganizationScope = {
    membership: { id: "membership-1", role: "owner", userId: user.id },
    organizationId: own.id,
    user: {
      email: user.email,
      emailVerified: true,
      id: user.id,
      name: user.name,
      twoFactorEnabled: false
    },
    userId: user.id
  };
  data = createScopedData({ db, requireOrganizationScope: () => scope });
}, 30_000);

afterAll(async () => {
  await database.close();
});

beforeEach(() => {
  memory = createMemoryObjectStore("uploads");
  logger = createLogger({ level: "silent", name: "attachment-module-test" });
  warn = vi.spyOn(logger, "warn");
});

/** request + the client's PUT, as the web upload hook does it. */
async function uploaded(
  attachments: Attachments,
  object: Parameters<typeof memory.upload>[1] = pngObject
) {
  const requested = await attachments.request({
    ...upload,
    entityId: ownTodoId,
    entityType: "todo"
  });
  memory.upload({ bucket: "uploads", key: requested.key }, object);
  return requested;
}

describe("createAttachments", () => {
  it("records a pending row at the store's place and presigns its upload", async () => {
    const requested = await attachmentsWith().request({
      ...upload,
      entityId: ownTodoId,
      entityType: "todo"
    });

    expect(requested.uploadUrl).toBe(`memory://uploads/${requested.key}?upload`);
    expect(requested.key).toMatch(new RegExp(`/todo/${requested.fileId}/photo\\.png$`));
    expect(await attachmentsWith().get(requested.fileId)).toMatchObject({
      bucket: "uploads",
      entityId: ownTodoId,
      entityType: "todo",
      key: requested.key,
      status: "pending"
    });
  });

  it("rejects an invalid file or a Todo target outside the Active Organization, and records nothing", async () => {
    const before = await rows();

    await expect(
      attachmentsWith().request({ ...upload, mimeType: "image/svg+xml" })
    ).rejects.toThrow("file validation failed");
    await expect(
      attachmentsWith().request({ ...upload, entityId: foreignTodoId, entityType: "todo" })
    ).rejects.toThrow("attachment target not found");
    await expect(attachmentsWith().request({ ...upload, entityType: "todo" })).rejects.toThrow(
      "attachment target not found"
    );
    await expect(
      attachmentsWith().request({ ...upload, originalName: "photo.png.exe" })
    ).rejects.toThrow('file extension "exe" does not match');
    expect(await rows()).toEqual(before);
  });

  it("confirms only a pending Attachment whose object exists and matches the claim", async () => {
    const attachments = attachmentsWith();
    const missing = await attachments.request({
      ...upload,
      entityId: ownTodoId,
      entityType: "todo"
    });
    const good = await uploaded(attachments, {
      ...pngObject,
      contentType: "image/png; charset=binary"
    });

    await expect(attachments.confirm(missing.fileId)).rejects.toThrow("has not been uploaded");
    expect(await attachments.get(missing.fileId)).toMatchObject({ status: "pending" });
    await expect(attachments.confirm(good.fileId)).resolves.toMatchObject({ status: "uploaded" });
    await expect(attachments.confirm(good.fileId)).rejects.toThrow("expected pending");
    await expect(attachments.confirm("00000000-0000-4000-8000-00000000ffff")).rejects.toThrow(
      "file not found"
    );
  });

  it.each([
    ["larger than claimed", { ...pngObject, sizeBytes: 5000 }, /exceeds claimed size/],
    ["of another stored type", { ...pngObject, contentType: "application/pdf" }, /does not match/],
    [
      "whose bytes are not the claimed type",
      { ...pngObject, bytes: new TextEncoder().encode("<html><script>") },
      /uploaded content does not match claimed type image\/png/
    ]
  ])("deletes an object %s and marks its row deleted", async (_case, object, message) => {
    const attachments = attachmentsWith();
    const requested = await uploaded(attachments, object);

    await expect(attachments.confirm(requested.fileId)).rejects.toThrow(message);

    expect(memory.keys()).not.toContain(requested.key);
    expect(await attachments.get(requested.fileId)).toMatchObject({ status: "deleted" });
  });

  it("presigns downloads for uploaded Attachments only, and lists them per Todo", async () => {
    const attachments = attachmentsWith();
    const pending = await attachments.request({
      ...upload,
      entityId: ownTodoId,
      entityType: "todo"
    });
    const done = await uploaded(attachments);
    await attachments.confirm(done.fileId);
    const [pendingFile, doneFile] = await Promise.all([
      attachments.get(pending.fileId),
      attachments.get(done.fileId)
    ]);
    if (!pendingFile || !doneFile) throw new Error("missing files");

    expect(await attachments.downloadUrl(pendingFile)).toBeNull();
    expect(await attachments.downloadUrl(doneFile)).toBe(
      `memory://uploads/${done.key}?disposition=inline`
    );
    const listed = (await attachments.listByTodoIds([ownTodoId])).map((file) => file.id);
    expect(listed).toContain(done.fileId);
    expect(listed).not.toContain(pending.fileId);
  });

  it("deletes the object, then marks the row deleted", async () => {
    const attachments = attachmentsWith();
    const requested = await uploaded(attachments);

    await expect(attachments.delete(requested.fileId)).resolves.toBe(true);

    expect(memory.keys()).not.toContain(requested.key);
    expect(await attachments.get(requested.fileId)).toMatchObject({ status: "deleted" });
  });

  it("logs a failed object delete and still marks the row deleted", async () => {
    const requested = await uploaded(attachmentsWith());
    const failing = attachmentsWith({
      ...memory,
      delete: async () => {
        throw new Error("s3 unreachable");
      }
    });

    await expect(failing.delete(requested.fileId)).resolves.toBe(true);

    expect(await failing.get(requested.fileId)).toMatchObject({ status: "deleted" });
    expect(warn).toHaveBeenCalledWith(
      {
        error: { message: "s3 unreachable", name: "Error", stack: expect.any(String) },
        key: requested.key
      },
      "failed to delete object from S3"
    );
  });

  it("leaves no object of a deleted Todo in the store", async () => {
    const attachments = attachmentsWith();
    const todos = createTodos({ attachments, data, logger, publish: () => {} });
    const todo = await todos.create({ title: "With photos" });
    for (const name of ["a.png", "b.png"]) {
      const requested = await attachments.request({
        ...upload,
        originalName: name,
        entityId: todo.id,
        entityType: "todo"
      });
      memory.upload({ bucket: "uploads", key: requested.key }, pngObject);
      await attachments.confirm(requested.fileId);
    }
    expect(memory.keys()).toHaveLength(2);

    await expect(todos.delete(todo.id)).resolves.toBe(true);

    await vi.waitFor(() => expect(memory.keys()).toEqual([]));
    expect(await attachments.listByTodoIds([todo.id])).toEqual([]);
  });
});
