import { afterAll, beforeAll, expect, it, vi } from "vitest";

const { client, testDb } = await vi.hoisted(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const client = new PGlite();
  return { client, testDb: drizzle(client) };
});
vi.mock("@repo/db", async () => ({ ...(await import("@repo/db/schema")), db: testDb }));
import { listTodosByScope } from "./todos.adapter";

const scope = {
  organizationId: "00000000-0000-0000-0000-000000000001",
  userId: "00000000-0000-0000-0000-000000000001",
  user: { id: "u", email: "u@example.test", emailVerified: true, name: "User" }
};
beforeAll(async () => {
  await client.exec(
    `CREATE TABLE todos (id uuid PRIMARY KEY, title varchar(255) NOT NULL, description text, completed boolean NOT NULL, user_id uuid NOT NULL, organization_id uuid NOT NULL, note_id uuid, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL)`
  );
  for (let index = 1; index <= 62; index++) {
    await client.query("INSERT INTO todos VALUES ($1,$2,$3,$4,$5,$6,NULL,$7,$7)", [
      `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`,
      index === 1 ? "Needle TITLE" : index === 2 ? "Literal %_\\ phrase" : `Todo ${index}`,
      index === 3 ? "Needle DESCRIPTION" : null,
      index % 2 === 0,
      scope.userId,
      index === 62 ? "00000000-0000-0000-0000-000000000002" : scope.organizationId,
      "2026-09-13T12:00:00Z"
    ]);
  }
});
afterAll(() => client.close());
it("searches saved title and description beyond the first page, before pagination", async () => {
  const matches = await listTodosByScope(scope, { limit: 50, offset: 0 }, { search: " nEeDlE " });
  expect(matches.map((item) => item.title)).toEqual(["Todo 3", "Needle TITLE"]);
  expect(
    await listTodosByScope(scope, { limit: 50, offset: 0 }, { search: "needle", completed: true })
  ).toEqual([]);
  expect(
    await listTodosByScope(scope, { limit: 50, offset: 0 }, { search: "needle", completed: false })
  ).toHaveLength(2);
});
it("treats SQL wildcard characters as literals", async () => {
  for (const search of ["%", "_", "\\", "%_\\"]) {
    const rows = await listTodosByScope(scope, { limit: 50, offset: 0 }, { search });
    expect(rows.map((item) => item.title)).toEqual(["Literal %_\\ phrase"]);
  }
});
it("keeps empty search compatible, paginates deterministically and isolates Organizations", async () => {
  const first = await listTodosByScope(scope, { limit: 50, offset: 0 });
  expect(await listTodosByScope(scope, { limit: 50, offset: 0 }, { search: "  " })).toEqual(first);
  const second = await listTodosByScope(scope, { limit: 50, offset: 50 });
  expect(first).toHaveLength(50);
  expect(second).toHaveLength(11);
  expect(first[0]?.title).toBe("Todo 61");
  expect(new Set([...first, ...second].map((item) => item.id)).size).toBe(61);
  expect(await listTodosByScope(scope, { limit: 50, offset: 0 }, { search: "Todo 62" })).toEqual(
    []
  );
  const completed = await listTodosByScope(scope, { limit: 50, offset: 0 }, { completed: true });
  expect(completed).toHaveLength(30);
  expect(completed.every((item) => item.completed)).toBe(true);
});
