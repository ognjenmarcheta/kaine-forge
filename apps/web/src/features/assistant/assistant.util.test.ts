import { describe, expect, it } from "vitest";

import { readAssistantAction } from "./assistant.util";

const id = "1ec1f87d-71b6-4d66-8a9a-dd611dab474f";
const noteId = "f689ea39-2fe6-484a-a2cf-881646fd874a";

describe("assistant action results", () => {
  it.each(["createTodo", "updateTodo", "completeTodo"])(
    "uses returned completion state for %s",
    (tool) => {
      expect(
        readAssistantAction({
          tool,
          output: JSON.stringify({ id, title: "Review", completed: false })
        })
      ).toMatchObject({
        kind: "change",
        detail: "Review",
        state: "assistant.result.open",
        href: "/todos"
      });
    }
  );
  it.each(["createNote", "updateNote"])("links a confirmed %s to the note", (tool) => {
    expect(
      readAssistantAction({ tool, output: JSON.stringify({ id: noteId, title: "Plan" }) })
    ).toMatchObject({ kind: "change", detail: "Plan", href: `/notes/${noteId}` });
  });
  it("links an added Todo to its Note rather than its own id", () => {
    expect(
      readAssistantAction({
        tool: "addTodoToNote",
        output: JSON.stringify({ id, noteId, title: "Review" })
      })
    ).toMatchObject({ kind: "change", href: `/notes/${noteId}` });
  });
  it("distinguishes reads and confirmed deletions", () => {
    expect(readAssistantAction({ tool: "listTodos", output: "[]" })).toMatchObject({
      kind: "read",
      detail: "0",
      href: null
    });
    expect(
      readAssistantAction({ tool: "deleteTodo", output: JSON.stringify({ id, deleted: true }) })
    ).toMatchObject({ kind: "change" });
    expect(
      readAssistantAction({ tool: "deleteTodo", output: JSON.stringify({ id, deleted: false }) })
    ).toMatchObject({ kind: "unconfirmed", href: null });
  });
  it.each([
    null,
    "{broken",
    "null",
    "[]",
    '{"id":"../../auth","title":"Plan"}',
    '{"id":"1ec1f87d-71b6-4d66-8a9a-dd611dab474f"}'
  ])("does not invent a success or link for %s", (output) => {
    expect(readAssistantAction({ tool: "createNote", output })).toMatchObject({
      kind: "unconfirmed",
      href: null
    });
  });
  it("does not expose an unknown tool or raw output", () => {
    expect(
      readAssistantAction({
        tool: "internalSecret",
        output: JSON.stringify({ id, title: "Sensitive" })
      })
    ).toEqual({
      label: "assistant.action.unknown",
      kind: "unconfirmed",
      detail: null,
      state: null,
      href: null
    });
  });
});
