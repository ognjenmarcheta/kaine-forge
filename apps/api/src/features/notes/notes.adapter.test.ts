import { beforeEach, describe, expect, it, vi } from "vitest";

const { chain, mockDb } = vi.hoisted(() => {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    offset: vi.fn(),
    returning: vi.fn(),
    set: vi.fn(),
    values: vi.fn(),
    onConflictDoNothing: vi.fn()
  };
  Object.values(chain).forEach((fn) => fn.mockReturnValue(chain));
  chain.returning.mockResolvedValue([]);

  const mockDb = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain)
  };

  return { chain, mockDb };
});

vi.mock("@repo/db", () => ({
  db: mockDb,
  notesTable: {
    id: "id",
    userId: "userId",
    organizationId: "orgId",
    createdAt: "createdAt"
  }
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => args),
  desc: vi.fn((col: unknown) => col),
  eq: vi.fn((a: unknown, b: unknown) => [a, b])
}));

import { createNote, deleteNote, getNoteById, listNotesByScope } from "./notes.adapter";

describe("notes.adapter", () => {
  const scope = {
    organizationId: "org-1",
    user: {
      email: "u1@example.com",
      emailVerified: false,
      id: "user-1",
      name: "User One"
    },
    userId: "user-1"
  };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(chain).forEach((fn) => fn.mockReturnValue(chain));
    chain.returning.mockResolvedValue([]);
  });

  it("listNotesByScope calls db.select with correct chain", async () => {
    await listNotesByScope(scope, { limit: 20, offset: 0 });
    expect(mockDb.select).toHaveBeenCalled();
    expect(chain.from).toHaveBeenCalled();
    expect(chain.where).toHaveBeenCalled();
    expect(chain.orderBy).toHaveBeenCalled();
    expect(chain.limit).toHaveBeenCalledWith(20);
    expect(chain.offset).toHaveBeenCalledWith(0);
  });

  it("listNotesByScope filters by Organization only", async () => {
    await listNotesByScope(scope, { limit: 20, offset: 0 });

    expect(chain.where).toHaveBeenCalledWith([["orgId", "org-1"]]);
  });

  it("getNoteById calls db.select with limit 1", async () => {
    await getNoteById(scope, "note-1");
    expect(mockDb.select).toHaveBeenCalled();
    expect(chain.limit).toHaveBeenCalledWith(1);
  });

  it("createNote calls db.insert and returns created note", async () => {
    const note = {
      id: "note-1",
      title: "Test",
      body: null,
      userId: "user-1",
      organizationId: "org-1",
      createdAt: new Date(),
      updatedAt: new Date()
    };
    chain.returning.mockResolvedValueOnce([note]);

    const result = await createNote(scope, { title: "Test", body: null });
    expect(mockDb.insert).toHaveBeenCalled();
    expect(result).toEqual(note);
  });

  it("deleteNote calls db.delete and returns true when a row is returned", async () => {
    chain.returning.mockResolvedValueOnce([{ id: "note-1" }]);
    const result = await deleteNote(scope, "note-1");
    expect(mockDb.delete).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it("deleteNote returns false when no row is returned", async () => {
    chain.returning.mockResolvedValueOnce([]);
    const result = await deleteNote(scope, "note-1");
    expect(result).toBe(false);
  });
});
