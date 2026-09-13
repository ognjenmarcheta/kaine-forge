import { createLogger } from "@repo/logger";
import { afterEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({
  database: null as ReturnType<typeof createEvalDatabase> | null
}));
vi.mock("@repo/db", async () => ({
  ...(await import("@repo/db/schema")),
  get db() {
    if (!holder.database) throw new Error("Uninitialized evaluation database");
    return holder.database.db;
  }
}));
vi.mock("@repo/db/client", () => {
  throw new Error("Production PostgreSQL forbidden");
});
vi.mock("pg", () => {
  throw new Error("Production PostgreSQL forbidden");
});

import { assistantEvalCases } from "./assistant.eval.data";
import { createEvalDatabase, seedEvalFixture } from "./assistant.eval.fixture";
import { createAssistantTools } from "./assistant.tools";
import { createApiWorkflows } from "../../context.workflows";
import { createNote, deleteNote, getNoteById } from "../notes/notes.adapter";

afterEach(async () => {
  await holder.database?.client.close();
  holder.database = null;
});

describe("evaluation fixture with production tools and workflows", () => {
  it("allows owner Note deletion and preserves the full foreign Note after denied deletion", async () => {
    const evaluation = assistantEvalCases.find((entry) => entry.id === "foreign-note-update");
    if (!evaluation) throw new Error("Missing case");
    holder.database = createEvalDatabase();
    const fixture = await seedEvalFixture(holder.database, evaluation);
    const foreign = fixture.ids["foreignNote"];
    if (!foreign) throw new Error("Missing foreign Note");
    expect(await deleteNote(fixture.scope, foreign)).toBe(false);
    expect((await fixture.inspect()).protectedRowsUnchanged).toBe(true);
    const own = await createNote(fixture.scope, { title: "Owner control", body: null });
    expect(await deleteNote(fixture.scope, own.id)).toBe(true);
    expect(await getNoteById(fixture.scope, own.id)).toBeNull();
    expect((await fixture.inspect()).protectedRowsUnchanged).toBe(true);
  });
  it("creates the expected row through the real tool and preserves foreign data", async () => {
    const evaluation = assistantEvalCases.find((entry) => entry.id === "create-simple");
    if (!evaluation) throw new Error("Missing case");
    holder.database = createEvalDatabase();
    const fixture = await seedEvalFixture(holder.database, evaluation);
    const tools = createAssistantTools({
      scope: fixture.scope,
      todoWorkflow: createApiWorkflows({
        logger: createLogger({ name: "eval", level: "silent" }),
        publish: () => {}
      }).todo,
      noteWorkflow: createApiWorkflows({
        logger: createLogger({ name: "eval", level: "silent" }),
        publish: () => {}
      }).note
    });
    const execute = tools["createTodo"]?.execute;
    if (!execute) throw new Error("Missing create tool");
    await execute(
      { title: "buy milk", description: null },
      { toolCallId: "test", messages: [], context: undefined }
    );
    const after = await fixture.inspect();
    expect(after.state).toEqual(evaluation.contract.state);
    expect(after.protectedRowsUnchanged).toBe(true);
  });
  it("rejects foreign writes using actual adapters and retains full protected rows", async () => {
    const evaluation = assistantEvalCases.find((entry) => entry.id === "foreign-todo-delete");
    if (!evaluation) throw new Error("Missing case");
    holder.database = createEvalDatabase();
    const fixture = await seedEvalFixture(holder.database, evaluation);
    const workflows = createApiWorkflows({
      logger: createLogger({ name: "eval", level: "silent" }),
      publish: () => {}
    });
    const tools = createAssistantTools({
      scope: fixture.scope,
      todoWorkflow: workflows.todo,
      noteWorkflow: workflows.note
    });
    const remove = tools["deleteTodo"]?.execute;
    const rename = tools["updateNote"]?.execute;
    if (!remove || !rename) throw new Error("Missing tools");
    expect(
      await remove(
        { id: fixture.ids["foreignTodo"] },
        { toolCallId: "delete", messages: [], context: undefined }
      )
    ).toMatchObject({ deleted: false });
    await expect(
      rename(
        { id: fixture.ids["foreignNote"], title: "Changed" },
        { toolCallId: "rename", messages: [], context: undefined }
      )
    ).rejects.toThrow();
    expect(await fixture.inspect()).toMatchObject({
      state: evaluation.contract.state,
      protectedRowsUnchanged: true
    });
  });
});
