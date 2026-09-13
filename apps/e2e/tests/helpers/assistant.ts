import { type Page } from "@playwright/test";

const noteId = "1ec1f87d-71b6-4d66-8a9a-dd611dab474f";
const tools = [
  { tool: "createNote", input: null, output: JSON.stringify({ id: noteId, title: "Release plan" }) }
];
interface Message {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  createdAt: string;
  toolActions: { tool: string; input: null; output: string }[];
}

function conversationId(body: string): string {
  const parsed: unknown = JSON.parse(body);
  if (typeof parsed === "object" && parsed !== null && "variables" in parsed) {
    const variables = parsed.variables;
    if (
      typeof variables === "object" &&
      variables !== null &&
      "conversationId" in variables &&
      typeof variables.conversationId === "string"
    )
      return variables.conversationId;
  }
  return "a";
}

export async function mockAssistant(page: Page) {
  let resolveReply: () => void = () => {};
  let sendDelta: (text: string) => void = () => {};
  const gate = new Promise<void>((resolve) => {
    resolveReply = resolve;
  });
  const state = { fail: false, historyError: false, sends: 0, long: false };
  let conversations = [
    { id: "a", title: "Release plan", updatedAt: "2026-09-13T12:00:00Z" },
    { id: "b", title: "Review checklist", updatedAt: "2026-09-12T12:00:00Z" }
  ];
  let messages: Message[] = [
    {
      id: "u1",
      conversationId: "a",
      role: "user",
      content: "Create a release planning Note.",
      createdAt: "2026-09-13T12:00:00Z",
      toolActions: []
    },
    {
      id: "a1",
      conversationId: "a",
      role: "assistant",
      content:
        "I created a Note for the release plan. You can add your review checklist and next steps there.",
      createdAt: "2026-09-13T12:00:01Z",
      toolActions: tools
    }
  ];
  await page.route("**/api/auth/**", async (route) => {
    await route.fulfill({
      json: route.request().url().includes("organization/list")
        ? [{ id: "org-one", name: "Example Organization", slug: "example" }]
        : {
            session: {
              id: "fixture-session",
              userId: "fixture-user",
              activeOrganizationId: "org-one",
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
    socket.onMessage((raw) => {
      if (typeof raw !== "string") return;
      const message: unknown = JSON.parse(raw);
      if (typeof message !== "object" || !message || !("type" in message)) return;
      if (message.type === "connection_init")
        socket.send(JSON.stringify({ type: "connection_ack" }));
      if (
        message.type === "subscribe" &&
        "id" in message &&
        typeof message.id === "string" &&
        raw.includes("assistantMessageDelta")
      ) {
        const id = message.id;
        sendDelta = (text) =>
          socket.send(
            JSON.stringify({
              id,
              type: "next",
              payload: { data: { assistantMessageDelta: { conversationId: "a", delta: text } } }
            })
          );
      }
    });
  });
  await page.route("**/graphql", async (route) => {
    const query = route.request().postData() ?? "";
    if (query.includes("query GetConversations"))
      await route.fulfill({ json: { data: { conversations } } });
    else if (query.includes("query GetConversation")) {
      if (state.historyError) {
        await route.fulfill({ json: { errors: [{ message: "Unavailable" }] } });
        return;
      }
      const rows =
        conversationId(query) === "b"
          ? []
          : state.long
            ? Array.from({ length: 20 }, (_, index) =>
                messages.map((message) => ({ ...message, id: `${message.id}-${index.toString()}` }))
              ).flat()
            : messages;
      await route.fulfill({ json: { data: { assistantMessages: rows } } });
    } else if (query.includes("mutation SendMessage")) {
      state.sends += 1;
      await gate;
      if (!state.fail)
        messages = [
          ...messages,
          {
            id: "u2",
            conversationId: "a",
            role: "user",
            content: "Create a planning Note with a checklist",
            createdAt: "2026-09-13T12:01:00Z",
            toolActions: []
          },
          {
            id: "a2",
            conversationId: "a",
            role: "assistant",
            content: "Your planning Note is ready.",
            createdAt: "2026-09-13T12:01:01Z",
            toolActions: tools
          }
        ];
      await route.fulfill({
        json: {
          data: {
            sendMessage: {
              status: state.fail ? "FAILED" : "REPLIED",
              conversationId: "a",
              reply: state.fail ? null : "Your planning Note is ready.",
              message: null,
              toolActions: state.fail ? [] : tools
            }
          }
        }
      });
    } else if (query.includes("mutation DeleteConversation")) {
      conversations = conversations.filter((item) => item.id !== "a");
      await route.fulfill({ json: { data: { deleteConversation: true } } });
    } else await route.fulfill({ json: { data: {} } });
  });
  return { state, finish: () => resolveReply(), delta: (text: string) => sendDelta(text) };
}

export async function openAssistantHistory(page: Page) {
  if (await page.getByRole("button", { name: "Conversations", exact: true }).isVisible()) {
    await page.getByRole("button", { name: "Conversations", exact: true }).click();
  }
}
