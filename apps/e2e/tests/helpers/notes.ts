import type { Page } from "@playwright/test";

interface FixtureNote {
  id: string;
  title: string;
  body: string | null;
  createdAt: string;
  updatedAt: string;
  todos: { id: string; title: string; description: null; completed: boolean }[];
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
    offset:
      vars && typeof vars === "object" && "offset" in vars && typeof vars.offset === "number"
        ? vars.offset
        : 0,
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
    if (query.includes("query GetNotes(")) {
      await route.fulfill({
        json: state.loadFailed
          ? { errors: [{ message: "Unavailable" }] }
          : {
              data: {
                notes:
                  state.organization === "org-two"
                    ? []
                    : notes
                        .filter((note) =>
                          `${note.title} ${note.body ?? ""}`
                            .toLowerCase()
                            .includes(vars.search.trim().toLowerCase())
                        )
                        .slice(vars.offset, vars.offset + 50)
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
    } else await route.fulfill({ json: { data: {} } });
  });
  return {
    state,
    notes,
    finish: () => {
      state.hold = false;
      release();
    },
    publish: (event: "noteUpdated" | "noteDeleted", id: string) => publish(event, id)
  };
}
