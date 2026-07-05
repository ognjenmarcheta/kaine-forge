import { describe, expect, it, vi } from "vitest";

import { createNoteWorkflow, type NoteWorkflowAdapter } from "./notes.workflow";

const scope = {
  organizationId: "org-1",
  user: {
    email: "user@example.com",
    emailVerified: false,
    id: "user-1",
    name: "User"
  },
  userId: "user-1"
};

const note = {
  id: "note-1",
  title: "Groceries",
  body: "Buy milk",
  organizationId: "org-1",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01")
};

function createAdapter(overrides: Partial<NoteWorkflowAdapter> = {}): NoteWorkflowAdapter {
  return {
    createNote: vi.fn(async () => note),
    deleteNote: vi.fn(async () => true),
    publishNoteEvent: vi.fn(),
    updateNote: vi.fn(async () => note),
    ...overrides
  };
}

describe("createNoteWorkflow", () => {
  it("creates a note with trimmed title and normalized body, then publishes note:created", async () => {
    const adapter = createAdapter();
    const workflow = createNoteWorkflow(adapter);

    const result = await workflow.createNote(scope, {
      title: "  Groceries  ",
      body: "  Buy milk  "
    });

    expect(adapter.createNote).toHaveBeenCalledWith(scope, {
      title: "Groceries",
      body: "Buy milk"
    });
    expect(adapter.publishNoteEvent).toHaveBeenCalledWith("note:created", note);
    expect(result).toBe(note);
  });

  it("updates a note and publishes note:updated", async () => {
    const adapter = createAdapter();
    const workflow = createNoteWorkflow(adapter);

    const result = await workflow.updateNote(scope, "note-1", { title: "New title" });

    expect(adapter.updateNote).toHaveBeenCalledWith(scope, "note-1", { title: "New title" });
    expect(adapter.publishNoteEvent).toHaveBeenCalledWith("note:updated", note);
    expect(result).toBe(note);
  });

  it("publishes note:deleted with id and organizationId when the adapter deletes the note", async () => {
    const adapter = createAdapter({ deleteNote: vi.fn(async () => true) });
    const workflow = createNoteWorkflow(adapter);

    const result = await workflow.deleteNote(scope, "note-1");

    expect(result).toBe(true);
    expect(adapter.publishNoteEvent).toHaveBeenCalledWith("note:deleted", {
      id: "note-1",
      organizationId: "org-1"
    });
  });

  it("does not publish note:deleted when the adapter reports nothing was deleted", async () => {
    const adapter = createAdapter({ deleteNote: vi.fn(async () => false) });
    const workflow = createNoteWorkflow(adapter);

    const result = await workflow.deleteNote(scope, "note-1");

    expect(result).toBe(false);
    expect(adapter.publishNoteEvent).not.toHaveBeenCalled();
  });
});
