import type { Page } from "@playwright/test";

import { mockNotes } from "./notes";

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
    offset:
      vars && typeof vars === "object" && "offset" in vars && typeof vars.offset === "number"
        ? vars.offset
        : 0,
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
  const searches: string[] = [];
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
    generation: "AI_NOT_CONFIGURED",
    searches
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
    } else if (query.includes("query GetTodos(")) {
      state.searches.push(vars.search);
      await route.fulfill({
        json: state.loadFailed
          ? { errors: [{ message: "Unavailable" }] }
          : {
              data: {
                todos:
                  common.state.organization === "org-two"
                    ? []
                    : rows
                        .filter(
                          (item) =>
                            `${item.title} ${item.description ?? ""}`
                              .toLowerCase()
                              .includes(vars.search.toLowerCase()) &&
                            (vars.completed === null || item.completed === vars.completed)
                        )
                        .slice(vars.offset, vars.offset + 50)
              }
            }
      });
    } else if (query.includes("query GetTodo("))
      await route.fulfill({
        json: { data: { todo: rows.find((item) => item.id === vars.id) ?? null } }
      });
    else if (query.includes("mutation GenerateTodos"))
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
