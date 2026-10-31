import type { Page } from "@playwright/test";

import { mockNotes } from "./notes";
import { pushedMutations, textOf } from "./sync";

interface FixtureTodo {
  id: string;
  title: string;
  description: string | null;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  attachments: {
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    downloadUrl: string;
  }[];
}
function variables(body: string) {
  const parsed: unknown = JSON.parse(body);
  const vars =
    parsed && typeof parsed === "object" && "variables" in parsed ? parsed.variables : null;
  const input = vars && typeof vars === "object" && "input" in vars ? vars.input : null;
  return {
    entityId:
      input &&
      typeof input === "object" &&
      "entityId" in input &&
      typeof input.entityId === "string"
        ? input.entityId
        : "",
    filename:
      input &&
      typeof input === "object" &&
      "originalName" in input &&
      typeof input.originalName === "string"
        ? input.originalName
        : "",
    id:
      vars && typeof vars === "object" && "id" in vars && typeof vars.id === "string"
        ? vars.id
        : "",
    fileId:
      vars && typeof vars === "object" && "fileId" in vars && typeof vars.fileId === "string"
        ? vars.fileId
        : "",
    search:
      vars && typeof vars === "object" && "search" in vars && typeof vars.search === "string"
        ? vars.search
        : "",
    after:
      vars && typeof vars === "object" && "after" in vars && typeof vars.after === "string"
        ? vars.after
        : null,
    completed:
      vars && typeof vars === "object" && "completed" in vars && typeof vars.completed === "boolean"
        ? vars.completed
        : null,
    title:
      input && typeof input === "object" && "title" in input && typeof input.title === "string"
        ? input.title
        : undefined,
    description:
      input &&
      typeof input === "object" &&
      "description" in input &&
      typeof input.description === "string"
        ? input.description
        : null,
    state:
      input &&
      typeof input === "object" &&
      "completed" in input &&
      typeof input.completed === "boolean"
        ? input.completed
        : undefined
  };
}
function todoIdOf(body: string): string {
  const parsed: unknown = JSON.parse(body);
  const vars =
    parsed && typeof parsed === "object" && "variables" in parsed ? parsed.variables : null;
  return vars && typeof vars === "object" && "todoId" in vars && typeof vars.todoId === "string"
    ? vars.todoId
    : "";
}
export async function mockTodos(page: Page) {
  const common = await mockNotes(page);
  const stamp = "2026-09-13T12:00:00Z";
  const rows: FixtureTodo[] = [
    {
      id: "a",
      title: "Prepare release notes",
      description: "Summarize the changes and confirm the upgrade steps.",
      completed: false,
      attachments: [],
      createdAt: stamp,
      updatedAt: stamp
    },
    {
      id: "b",
      title: "Review accessibility",
      description: "Check keyboard navigation and both themes.",
      completed: true,
      attachments: [],
      createdAt: stamp,
      updatedAt: stamp
    }
  ];
  const served = new Set<string>();
  let pulls = 0;
  const state = {
    holdUpload: false,
    failUpload: false,
    uploadTodo: "",
    filename: "",
    confirms: 0,
    hold: false,
    fail: false,
    loadFailed: false,
    creates: 0,
    updates: 0,
    generation: "AI_NOT_CONFIGURED"
  };
  let release: () => void = () => {};
  let releaseUpload: () => void = () => {};
  await page.route("**/fixture-upload", async (route) => {
    if (state.holdUpload)
      await new Promise<void>((resolve) => {
        releaseUpload = resolve;
      });
    await route.fulfill({ status: state.failUpload ? 500 : 200, body: "" });
  });
  let publish: (event: "todoUpdated" | "todoDeleted", id: string) => void = () => {};
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
    if (query.includes("mutation RequestUploadUrl")) {
      state.uploadTodo = vars.entityId;
      state.filename = vars.filename;
      await route.fulfill({
        json: {
          data: {
            requestUploadUrl: {
              fileId: "fixture-file",
              uploadUrl: "http://127.0.0.1:3010/fixture-upload",
              key: "fixture-key",
              expiresIn: 600
            }
          }
        }
      });
    } else if (query.includes("mutation ConfirmUpload")) {
      state.confirms++;
      const file = {
        id: "fixture-file",
        originalName: state.filename,
        mimeType: "text/plain",
        sizeBytes: 4,
        downloadUrl: "http://127.0.0.1:3010/fixture-upload"
      };
      rows.find((item) => item.id === state.uploadTodo)?.attachments.push(file);
      await route.fulfill({
        json: {
          data: {
            confirmUpload: {
              ...file,
              key: "fixture-key",
              status: "UPLOADED",
              createdAt: stamp,
              updatedAt: stamp
            }
          }
        }
      });
    } else if (query.includes("query SyncPull(")) {
      const visible = common.state.organization === "org-two" ? [] : rows;
      // Rows served before and gone now are the deletions this pull reports.
      const ids = new Set(visible.map((item) => item.id));
      const deleted = [...served].filter((id) => !ids.has(id));
      served.clear();
      for (const id of ids) served.add(id);
      // The Notes underneath, without their checklist Todos: these specs count only their own rows.
      const shared = common.sync.pull();
      await route.fulfill({
        json:
          state.loadFailed || common.state.loadFailed
            ? { errors: [{ message: "Unavailable" }] }
            : {
                data: {
                  syncPull: {
                    todos: [
                      ...visible.map((item) => ({
                        id: item.id,
                        title: item.title,
                        description: item.description,
                        completed: item.completed,
                        noteId: null,
                        attachments: item.attachments.map(
                          ({ id, originalName, mimeType, sizeBytes }) => ({
                            id,
                            originalName,
                            mimeType,
                            sizeBytes
                          })
                        ),
                        createdAt: item.createdAt,
                        updatedAt: item.updatedAt
                      }))
                    ],
                    notes: shared.notes,
                    deleted: [...deleted.map((id) => ({ entity: "TODO", id })), ...shared.deleted],
                    cursor: String(++pulls),
                    hasMore: false,
                    resetRequired: false
                  }
                }
              }
      });
    } else if (query.includes("query GetTodoAttachmentLinks(")) {
      const item = rows.find((row) => row.id === todoIdOf(query));
      await route.fulfill({
        json: {
          data: {
            files: {
              items: (item?.attachments ?? []).map(({ id, downloadUrl }) => ({
                id,
                downloadUrl,
                thumbnailUrl: null
              }))
            }
          }
        }
      });
    } else if (query.includes("mutation SyncPush(")) {
      const all = pushedMutations(query);
      // Note and checklist changes belong to the Notes fixture underneath.
      const mutations = all.filter((mutation) => !common.sync.owns(mutation));
      for (const mutation of mutations) {
        if (mutation.kind === "todoCreate") state.creates++;
        if (mutation.kind === "todoUpdate") state.updates++;
      }
      if (state.hold)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      if (state.fail) {
        await route.fulfill({ json: { errors: [{ message: "Unavailable" }] } });
        return;
      }
      for (const mutation of all) if (common.sync.owns(mutation)) common.sync.apply(mutation);
      for (const { kind, id, fields } of mutations) {
        const text = (key: string) => textOf(fields, key);
        if (kind === "todoCreate")
          rows.unshift({
            id,
            title: text("title") ?? "",
            description: text("description"),
            completed: false,
            attachments: [],
            // A new row sorts first, as the optimistic row did.
            createdAt: new Date().toISOString(),
            updatedAt: stamp
          });
        const item = rows.find((row) => row.id === id);
        if (kind === "todoUpdate" && item) {
          if ("title" in fields) item.title = text("title") ?? item.title;
          if ("description" in fields) item.description = text("description");
          if (typeof fields.completed === "boolean") item.completed = fields.completed;
        }
        if (kind === "todoDelete" && item) rows.splice(rows.indexOf(item), 1);
      }
      await route.fulfill({
        json: {
          data: {
            syncPush: { results: all.map(() => ({ status: "APPLIED", code: null })) }
          }
        }
      });
    } else if (query.includes("mutation GenerateTodos"))
      await route.fulfill({
        json: {
          data: {
            generateTodos: {
              status: state.generation,
              todos: state.generation === "CREATED" ? rows : []
            }
          }
        }
      });
    else if (query.includes("mutation CreateTodo") || query.includes("mutation UpdateTodo")) {
      const creating = query.includes("mutation CreateTodo");
      if (creating) state.creates++;
      else state.updates++;
      if (state.hold)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      if (state.fail) await route.fulfill({ json: { errors: [{ message: "Unavailable" }] } });
      else {
        const item = creating
          ? {
              id: `created-${String(state.creates)}`,
              title: vars.title ?? "",
              description: vars.description,
              completed: false,
              attachments: [],
              createdAt: stamp,
              updatedAt: stamp
            }
          : rows.find((row) => row.id === vars.id);
        if (item) {
          if (vars.title !== undefined) {
            item.title = vars.title;
            item.description = vars.description;
          }
          if (vars.state !== undefined) item.completed = vars.state;
        }
        if (creating && item) rows.unshift(item);
        await route.fulfill({ json: { data: { [creating ? "createTodo" : "updateTodo"]: item } } });
      }
    } else if (query.includes("mutation DeleteTodo")) {
      const index = rows.findIndex((item) => item.id === vars.id);
      if (index >= 0) rows.splice(index, 1);
      await route.fulfill({ json: { data: { deleteTodo: true } } });
    } else if (query.includes("mutation DeleteFile")) {
      for (const item of rows)
        item.attachments = item.attachments.filter((file) => file.id !== vars.fileId);
      await route.fulfill({ json: { data: { deleteFile: true } } });
    } else await route.fallback();
  });
  return {
    rows,
    state,
    organization: common.state,
    finishUpload: () => {
      state.holdUpload = false;
      releaseUpload();
    },
    finish: () => {
      state.hold = false;
      release();
    },
    publish: (event: "todoUpdated" | "todoDeleted", id: string) => publish(event, id)
  };
}
