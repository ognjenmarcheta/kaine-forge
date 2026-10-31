import type { Page } from "@playwright/test";

import { connection } from "./connection";
import { featureFlagData } from "./feature-flags";
import { notificationData } from "./notifications";
import { ORGANIZATION_PERMISSIONS_RESPONSE } from "./permissions";
import { pushedMutations, textOf, type PushedMutation } from "./sync";

interface FixtureNote {
  id: string;
  title: string;
  body: string | null;
  createdAt: string;
  updatedAt: string;
  todos: {
    id: string;
    title: string;
    description: null;
    completed: boolean;
    createdAt?: string;
  }[];
}
function variables(body: string) {
  const parsed: unknown = JSON.parse(body);
  const vars =
    parsed && typeof parsed === "object" && "variables" in parsed ? parsed.variables : null;
  const input = vars && typeof vars === "object" && "input" in vars ? vars.input : null;
  return {
    id:
      vars && typeof vars === "object" && "id" in vars && typeof vars.id === "string"
        ? vars.id
        : "",
    search:
      vars && typeof vars === "object" && "search" in vars && typeof vars.search === "string"
        ? vars.search
        : "",
    after:
      vars && typeof vars === "object" && "after" in vars && typeof vars.after === "string"
        ? vars.after
        : null,
    title:
      input && typeof input === "object" && "title" in input && typeof input.title === "string"
        ? input.title
        : "",
    body:
      input && typeof input === "object" && "body" in input && typeof input.body === "string"
        ? input.body
        : ""
  };
}

export async function mockNotes(page: Page) {
  const stamp = "2026-09-13T12:00:00Z";
  const notes: FixtureNote[] = [
    {
      id: "a",
      title: "Release planning",
      body: "Prepare a clear release summary.\n\nRecord decisions and next steps here.",
      createdAt: stamp,
      updatedAt: stamp,
      todos: [
        { id: "todo-one", title: "Review the release notes", description: null, completed: true }
      ]
    },
    {
      id: "b",
      title: "Design observations",
      body: "Keep the writing space calm and readable.",
      createdAt: stamp,
      updatedAt: stamp,
      todos: []
    }
  ];
  const state = {
    fail: false,
    loadFailed: false,
    saves: 0,
    creates: 0,
    hold: false,
    organization: "org-one"
  };
  let release: () => void = () => {};
  let pulls = 0;
  const served = { notes: new Set<string>(), todos: new Set<string>() };
  /**
   * This fixture's part of a sync pull: the Notes, their checklist Todos, and
   * every served row gone since the last pull, as its deletion.
   */
  function pullData() {
    const visible = state.organization === "org-two" ? [] : notes;
    const todos = visible.flatMap((note) =>
      note.todos.map((todo) => ({
        id: todo.id,
        title: todo.title,
        description: todo.description,
        completed: todo.completed,
        noteId: note.id,
        attachments: [],
        createdAt: todo.createdAt ?? stamp,
        updatedAt: stamp
      }))
    );
    const noteIds = new Set(visible.map((note) => note.id));
    const todoIds = new Set(todos.map((todo) => todo.id));
    const deleted = [
      ...[...served.notes].filter((id) => !noteIds.has(id)).map((id) => ({ entity: "NOTE", id })),
      ...[...served.todos].filter((id) => !todoIds.has(id)).map((id) => ({ entity: "TODO", id }))
    ];
    served.notes = noteIds;
    served.todos = todoIds;
    return {
      notes: visible.map(({ id, title, body, createdAt, updatedAt }) => ({
        id,
        title,
        body,
        createdAt,
        updatedAt
      })),
      todos,
      deleted
    };
  }
  /** Whether a pushed mutation is this fixture's: a Note, or a Todo on a Note's checklist. */
  function owns({ kind, id, fields }: PushedMutation): boolean {
    if (kind === "noteCreate" || kind === "noteUpdate" || kind === "noteDelete") return true;
    if (kind === "todoCreate") return textOf(fields, "noteId") !== null;
    return notes.some((note) => note.todos.some((todo) => todo.id === id));
  }
  function apply({ kind, id, fields }: PushedMutation): void {
    const note = notes.find((item) => item.id === id);
    const body = textOf(fields, "body")?.trim() || null;
    if (kind === "noteCreate")
      notes.unshift({
        id,
        title: textOf(fields, "title")?.trim() ?? "",
        body,
        createdAt: new Date().toISOString(),
        updatedAt: stamp,
        todos: []
      });
    if (kind === "noteUpdate" && note) {
      if ("title" in fields) note.title = textOf(fields, "title")?.trim() ?? note.title;
      if ("body" in fields) note.body = body;
    }
    if (kind === "noteDelete" && note) notes.splice(notes.indexOf(note), 1);
    if (kind === "todoCreate") {
      notes
        .find((item) => item.id === textOf(fields, "noteId"))
        ?.todos.unshift({
          id,
          title: textOf(fields, "title") ?? "",
          description: null,
          completed: false,
          createdAt: new Date().toISOString()
        });
    }
    for (const item of notes) {
      const todo = item.todos.find((entry) => entry.id === id);
      if (!todo) continue;
      if (kind === "todoUpdate" && typeof fields.completed === "boolean")
        todo.completed = fields.completed;
      if (kind === "todoDelete") item.todos.splice(item.todos.indexOf(todo), 1);
    }
  }
  let publish: (event: "noteUpdated" | "noteDeleted", id: string) => void = () => {};
  await page.route("**/api/auth/**", async (route) => {
    const url = route.request().url();
    if (url.includes("set-active")) state.organization = "org-two";
    await route.fulfill({
      json: url.includes("organization/list")
        ? [
            { id: "org-one", name: "Example Organization", slug: "example" },
            { id: "org-two", name: "Second Organization", slug: "second" }
          ]
        : {
            session: {
              id: "fixture-session",
              userId: "fixture-user",
              activeOrganizationId: state.organization,
              expiresAt: "2099-01-01T00:00:00Z"
            },
            user: {
              id: "fixture-user",
              email: "fixture@example.test",
              emailVerified: true,
              name: "Alex Morgan"
            }
          }
    });
  });
  await page.routeWebSocket("**/graphql", (socket) => {
    const subscriptions = new Map<string, string>();
    socket.onMessage((raw) => {
      if (typeof raw !== "string") return;
      const message: unknown = JSON.parse(raw);
      if (!message || typeof message !== "object" || !("type" in message)) return;
      if (message.type === "connection_init")
        socket.send(JSON.stringify({ type: "connection_ack" }));
      if (message.type === "subscribe" && "id" in message && typeof message.id === "string")
        subscriptions.set(message.id, raw);
      if (message.type === "complete" && "id" in message && typeof message.id === "string")
        subscriptions.delete(message.id);
    });
    publish = (event, id) => {
      for (const [subscription, query] of subscriptions)
        if (query.includes(event))
          socket.send(
            JSON.stringify({
              id: subscription,
              type: "next",
              payload: { data: { [event]: { id } } }
            })
          );
    };
  });
  await page.route("**/graphql", async (route) => {
    const query = route.request().postData() ?? "{}";
    const vars = variables(query);
    if (query.includes("query SyncPull(")) {
      await route.fulfill({
        json: state.loadFailed
          ? { errors: [{ message: "Unavailable" }] }
          : {
              data: {
                syncPull: {
                  ...pullData(),
                  cursor: String(++pulls),
                  hasMore: false,
                  resetRequired: false
                }
              }
            }
      });
    } else if (query.includes("mutation SyncPush(")) {
      const mutations = pushedMutations(query);
      for (const { kind } of mutations) {
        if (kind === "noteCreate" || kind === "noteUpdate") state.saves++;
        if (kind === "noteCreate") state.creates++;
      }
      if (state.hold)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      if (state.fail) {
        await route.fulfill({ json: { errors: [{ message: "Unavailable" }] } });
        return;
      }
      for (const mutation of mutations) apply(mutation);
      await route.fulfill({
        json: {
          data: {
            syncPush: { results: mutations.map(() => ({ status: "APPLIED", code: null })) }
          }
        }
      });
    } else if (query.includes("query GetNotes(")) {
      await route.fulfill({
        json: state.loadFailed
          ? { errors: [{ message: "Unavailable" }] }
          : {
              data: {
                notes: connection(
                  state.organization === "org-two"
                    ? []
                    : notes.filter((note) =>
                        `${note.title} ${note.body ?? ""}`
                          .toLowerCase()
                          .includes(vars.search.trim().toLowerCase())
                      ),
                  { after: vars.after, first: 50 }
                )
              }
            }
      });
    } else if (query.includes("query GetNote(")) {
      await route.fulfill({
        json: {
          data: {
            note:
              state.organization === "org-two"
                ? null
                : (notes.find((note) => note.id === vars.id) ?? null)
          }
        }
      });
    } else if (query.includes("mutation UpdateNote") || query.includes("mutation CreateNote")) {
      state.saves++;
      const creating = query.includes("mutation CreateNote");
      if (creating) state.creates++;
      if (state.hold)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      if (state.fail) await route.fulfill({ json: { errors: [{ message: "Unavailable" }] } });
      else {
        const note = creating
          ? {
              id: `created-${state.creates.toString()}`,
              title: vars.title.trim(),
              body: vars.body.trim() || null,
              createdAt: stamp,
              updatedAt: stamp,
              todos: []
            }
          : notes.find((item) => item.id === vars.id);
        if (note) {
          note.title = vars.title.trim();
          note.body = vars.body.trim() || null;
        }
        if (creating && note) notes.unshift(note);
        await route.fulfill({ json: { data: { [creating ? "createNote" : "updateNote"]: note } } });
      }
    } else if (query.includes("mutation DeleteNote")) {
      const index = notes.findIndex((note) => note.id === vars.id);
      if (index >= 0) notes.splice(index, 1);
      await route.fulfill({ json: { data: { deleteNote: true } } });
    } else if (query.includes("query OrganizationPermissions"))
      await route.fulfill({ json: ORGANIZATION_PERMISSIONS_RESPONSE });
    else
      await route.fulfill({
        json: { data: notificationData(query) ?? featureFlagData(query) ?? {} }
      });
  });
  return {
    state,
    notes,
    /** For a fixture built on this one, which answers the shared sync requests. */
    sync: { pull: pullData, owns, apply },
    finish: () => {
      state.hold = false;
      release();
    },
    publish: (event: "noteUpdated" | "noteDeleted", id: string) => publish(event, id)
  };
}
