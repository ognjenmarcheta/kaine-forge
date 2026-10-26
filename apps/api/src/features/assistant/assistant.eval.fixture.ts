import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";
import {
  notesTable,
  todosTable,
  usersTable,
  organizationsTable,
  membersTable
} from "@repo/db/schema";
import type { TestDatabase } from "@repo/db/testing";
import { createLogger } from "@repo/logger";
import { isDeepStrictEqual } from "node:util";

import type { ExecutableEvalCase } from "./assistant.eval.data";
import { substituteFixture } from "./assistant.eval.scoring";
import { createScopedData } from "../../context.data";
import { createNotes } from "../notes/notes.module";
import { createTodoAttachments } from "../storage/attachment.lifecycle";
import { createTodos } from "../todos/todos.module";

export async function seedEvalFixture(database: TestDatabase, evaluation: ExecutableEvalCase) {
  const [user] = await database.db
    .insert(usersTable)
    .values({ name: "Evaluation", email: "eval@example.test" })
    .returning();
  if (!user) throw new Error("Missing fixture User");
  const [own, foreign] = await database.db
    .insert(organizationsTable)
    .values([
      { name: "Evaluation A", slug: "eval-a", userId: user.id },
      { name: "Evaluation B", slug: "eval-b", userId: user.id }
    ])
    .returning();
  if (!own || !foreign) throw new Error("Missing fixture Organizations");
  const [member] = await database.db
    .insert(membersTable)
    .values({ organizationId: own.id, userId: user.id, role: "owner" })
    .returning();
  if (!member) throw new Error("Missing fixture Organization Membership");
  const scope: AuthenticatedOrganizationScope = {
    membership: { id: member.id, role: member.role, userId: member.userId },
    organizationId: own.id,
    userId: user.id,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: false,
      twoFactorEnabled: false
    }
  };
  const [foreignTodo] = await database.db
    .insert(todosTable)
    .values({ organizationId: foreign.id, userId: user.id, title: "Foreign Todo" })
    .returning();
  const [foreignNote] = await database.db
    .insert(notesTable)
    .values({
      organizationId: foreign.id,
      userId: user.id,
      title: "Foreign Note",
      body: "Preserve this row"
    })
    .returning();
  if (!foreignTodo || !foreignNote) throw new Error("Missing protected rows");
  const ids: Record<string, string> = { foreignTodo: foreignTodo.id, foreignNote: foreignNote.id };
  for (const seed of evaluation.seed) {
    const values = { organizationId: own.id, userId: user.id, title: seed.title };
    const [row] =
      seed.kind === "todo"
        ? await database.db.insert(todosTable).values(values).returning()
        : await database.db.insert(notesTable).values(values).returning();
    if (!row) throw new Error("Missing seed row");
    ids[`${seed.kind}:${seed.title}`] = row.id;
  }
  const snapshot = async () => ({
    todos: await database.db.select().from(todosTable),
    notes: await database.db.select().from(notesTable)
  });
  const before = await snapshot();
  const targets = evaluation.contract.mutations.flatMap((mutation) => {
    const id = mutation.input["id"];
    return typeof id === "string" ? [substituteFixture(id, ids)] : [];
  });
  const protectedRows = (rows: typeof before) => ({
    todos: rows.todos
      .filter((row) => row.organizationId === foreign.id || !targets.includes(row.id))
      .filter((row) => before.todos.some((original) => original.id === row.id))
      .sort((a, b) => a.id.localeCompare(b.id)),
    notes: rows.notes
      .filter((row) => row.organizationId === foreign.id || !targets.includes(row.id))
      .filter((row) => before.notes.some((original) => original.id === row.id))
      .sort((a, b) => a.id.localeCompare(b.id))
  });
  const data = createScopedData({ db: database.db, requireOrganizationScope: () => scope });
  // Object deletes are no-ops: an evaluation never reaches object storage.
  const logger = createLogger({ name: "eval", level: "silent" });
  const todos = createTodos({
    attachments: createTodoAttachments({ data, deleteObject: async () => undefined, logger }),
    data,
    logger,
    publish: () => {}
  });
  return {
    data,
    notes: createNotes({ data, publish: () => {} }),
    todos,
    scope,
    ids,
    before,
    async inspect() {
      const after = await snapshot();
      const foreignCountUnchanged =
        after.todos.filter((row) => row.organizationId === foreign.id).length === 1 &&
        after.notes.filter((row) => row.organizationId === foreign.id).length === 1;
      return {
        after,
        protectedRowsUnchanged:
          foreignCountUnchanged &&
          isDeepStrictEqual(protectedRows(before), protectedRows(after)) &&
          [...after.todos, ...after.notes].every(
            (row) =>
              row.userId === user.id &&
              (row.organizationId === own.id || row.organizationId === foreign.id)
          ),
        state: {
          todos: after.todos
            .filter((row) => row.organizationId === own.id)
            .map((row) => ({
              title: row.title,
              description: row.description,
              completed: row.completed,
              note:
                row.noteId === null
                  ? null
                  : (after.notes.find((note) => note.id === row.noteId)?.title ?? "missing-note")
            })),
          notes: after.notes
            .filter((row) => row.organizationId === own.id)
            .map((row) => ({ title: row.title, body: row.body }))
        }
      };
    }
  };
}
