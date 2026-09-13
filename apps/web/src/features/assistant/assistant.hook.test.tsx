// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { NEW_CHAT } from "./assistant.definition";
import { useAssistant } from "./assistant.hook";
import type { AssistantMessageDeltaData } from "./assistant.type";
import type {
  GetConversationQuery,
  SendMessageMutation
} from "../../graphql/generated/react-query";

const api = vi.hoisted(() => ({
  history: vi.fn<(variables: { conversationId: string }) => Promise<GetConversationQuery>>(),
  send: vi.fn<() => Promise<SendMessageMutation>>(),
  delta: {
    current: (data: AssistantMessageDeltaData) => {
      void data;
    }
  }
}));
vi.mock("../../lib/graphql-codegen-fetcher", () => ({
  useGraphqlFetcher: (document: { toString(): string }) => {
    const query = document.toString();
    if (query.includes("mutation SendMessage")) return api.send;
    if (query.includes("query GetConversations"))
      return () =>
        Promise.resolve({
          conversations: [
            { id: "a", title: "First", updatedAt: "2026-09-13" },
            { id: "b", title: "Second", updatedAt: "2026-09-13" }
          ]
        });
    return api.history;
  }
}));
vi.mock("../../hooks/use-subscription", () => ({
  useSubscription: ({ onData }: { onData: (data: AssistantMessageDeltaData) => void }) => {
    api.delta.current = onData;
  }
}));

let current: ReturnType<typeof useAssistant>;
function Harness({ organization }: { organization: string }) {
  current = useAssistant(organization, true);
  return null;
}
let client: QueryClient;
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

async function render(organization = "org-one") {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Harness key={organization} organization={organization} />
      </QueryClientProvider>
    )
  );
  await flush();
}
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}
async function select(id: string) {
  await act(async () => current.setActiveKey(id));
  await flush();
}
async function draft(value: string) {
  await act(async () => current.setDraft(value));
}
function deferredReply() {
  let resolve: (value: SendMessageMutation) => void = () => {};
  let reject: (reason: Error) => void = () => {};
  const promise = new Promise<SendMessageMutation>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  api.send.mockReturnValueOnce(promise);
  return { resolve, reject };
}
const reply: SendMessageMutation = {
  sendMessage: {
    status: "REPLIED",
    conversationId: "a",
    reply: "Done",
    message: null,
    toolActions: [
      {
        tool: "createNote",
        input: null,
        output: '{"id":"1ec1f87d-71b6-4d66-8a9a-dd611dab474f","title":"Plan"}'
      }
    ]
  }
};
function savedHistory(): GetConversationQuery {
  return {
    assistantMessages: [
      {
        id: "user",
        conversationId: "a",
        role: "user",
        content: "Plan",
        createdAt: "2026-09-13",
        toolActions: []
      },
      {
        id: "reply",
        conversationId: "a",
        role: "assistant",
        content: "Done",
        createdAt: "2026-09-13",
        toolActions: reply.sendMessage.toolActions
      }
    ]
  };
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  api.send.mockReset();
  api.history.mockReset();
  api.history.mockResolvedValue({ assistantMessages: [] });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
  vi.unstubAllGlobals();
});

it("preserves separate drafts including New chat", async () => {
  await render();
  await draft("New draft");
  await select("a");
  await draft("First draft");
  await select("b");
  await draft("Second draft");
  await select("a");
  expect(current.draft).toBe("First draft");
  await select(NEW_CHAT);
  expect(current.draft).toBe("New draft");
});

it("keeps a streaming reply and completion in its originating conversation", async () => {
  await render();
  await select("a");
  await draft("Plan");
  const gate = deferredReply();
  let sending: Promise<void>;
  await act(async () => {
    sending = current.send();
  });
  await select("b");
  await draft("Next draft");
  await act(async () =>
    api.delta.current({ assistantMessageDelta: { conversationId: "a", delta: "Working" } })
  );
  expect(current.messages).toEqual([]);
  expect(current.canSend).toBe(false);
  await act(async () => {
    void current.send();
  });
  expect(api.send).toHaveBeenCalledTimes(1);
  await select("a");
  expect(current.messages.at(-1)?.content).toBe("Working");
  await act(async () =>
    api.delta.current({ assistantMessageDelta: { conversationId: "b", delta: "Wrong" } })
  );
  expect(current.messages.at(-1)?.content).toBe("Working");
  await select("b");
  api.history.mockImplementation(async ({ conversationId }) =>
    conversationId === "a" ? savedHistory() : { assistantMessages: [] }
  );
  await act(async () => {
    gate.resolve(reply);
    await sending;
  });
  await flush();
  expect(current.activeKey).toBe("b");
  expect(current.draft).toBe("Next draft");
  expect(current.pendingKey).toBeNull();
  await select("a");
  expect(current.messages).toHaveLength(2);
  expect(current.messages[1]?.toolActions).toEqual(
    reply.sendMessage.toolActions.map(({ tool, output }) => ({ tool, output }))
  );
});

it("keeps an addressable temporary chat and moves its draft to the saved conversation", async () => {
  await render();
  await draft("Plan");
  const gate = deferredReply();
  let sending: Promise<void>;
  await act(async () => {
    sending = current.send();
  });
  const temporary = current.activeKey;
  expect(temporary).not.toBe(NEW_CHAT);
  await draft("Follow up");
  await select(NEW_CHAT);
  await draft("Another request");
  await select(temporary);
  expect(current.draft).toBe("Follow up");
  await select(NEW_CHAT);
  api.history.mockResolvedValue(savedHistory());
  await act(async () => {
    gate.resolve(reply);
    await sending;
  });
  expect(current.activeKey).toBe(NEW_CHAT);
  expect(current.draft).toBe("Another request");
  await select("a");
  expect(current.draft).toBe("Follow up");
  expect(current.messages).toHaveLength(2);
});

it.each(["notConfigured", "failed"] as const)(
  "preserves the prompt and newer draft after %s without retrying",
  async (error) => {
    await render();
    await draft("Plan");
    const gate = deferredReply();
    let sending: Promise<void>;
    await act(async () => {
      sending = current.send();
    });
    await draft("Newer draft");
    await act(async () => {
      if (error === "failed") gate.reject(new Error("Connection lost"));
      else
        gate.resolve({
          sendMessage: {
            status: "AI_NOT_CONFIGURED",
            conversationId: "",
            reply: null,
            message: null,
            toolActions: []
          }
        });
      await sending;
    });
    expect(current.draft).toBe("Newer draft");
    expect(current.messages).toHaveLength(1);
    expect(current.messages[0]).toMatchObject({ error, prompt: "Plan", streaming: false });
    expect(api.send).toHaveBeenCalledTimes(1);
  }
);

it("keeps an unsaved failed conversation reachable after navigating away", async () => {
  await render();
  await draft("Plan");
  const gate = deferredReply();
  let sending: Promise<void>;
  await act(async () => {
    sending = current.send();
  });
  const temporary = current.activeKey;
  await select(NEW_CHAT);
  await draft("Different draft");
  await act(async () => {
    gate.resolve({
      sendMessage: {
        status: "AI_NOT_CONFIGURED",
        conversationId: "",
        reply: null,
        message: null,
        toolActions: []
      }
    });
    await sending;
  });
  expect(current.activeKey).toBe(NEW_CHAT);
  expect(current.temporaryConversations).toMatchObject([{ id: temporary, title: "Plan" }]);
  await select(temporary);
  expect(current.messages[0]).toMatchObject({ error: "notConfigured", prompt: "Plan" });
  await act(async () => current.forget(temporary));
  expect(current.temporaryConversations).toEqual([]);
  expect(current.draft).toBe("Different draft");
});

it("retains confirmed messages if history refresh fails, then replaces them on reload", async () => {
  await render();
  await draft("Plan");
  api.send.mockResolvedValue(reply);
  api.history.mockRejectedValue(new Error("Unavailable"));
  await act(async () => current.send());
  await flush();
  expect(current.messages.map((message) => message.content)).toEqual(["Plan", "Done"]);
  api.history.mockResolvedValue(savedHistory());
  await act(async () => {
    await current.historyQuery.refetch();
  });
  await flush();
  expect(current.messages.map((message) => message.content)).toEqual(["Plan", "Done"]);
});

it("blocks sending when history is unavailable", async () => {
  api.history.mockRejectedValue(new Error("Unavailable"));
  await render();
  await select("a");
  await draft("Plan");
  await act(async () => current.send());
  expect(api.send).not.toHaveBeenCalled();
  expect(current.canSend).toBe(false);
});

it("drops drafts and ignores a late completion after an organization reset", async () => {
  await render();
  await draft("Plan");
  const gate = deferredReply();
  let sending: Promise<void>;
  await act(async () => {
    sending = current.send();
  });
  await draft("Old draft");
  await render("org-two");
  await act(async () => {
    gate.resolve(reply);
    await sending;
  });
  expect(current.activeKey).toBe(NEW_CHAT);
  expect(current.draft).toBe("");
  expect(current.messages).toEqual([]);
  expect(api.history).not.toHaveBeenCalled();
});

it("rejects whitespace and duplicate sends before React renders pending state", async () => {
  await render();
  await draft("   ");
  await act(async () => current.send());
  expect(api.send).not.toHaveBeenCalled();
  await draft("Plan");
  const gate = deferredReply();
  let sending: Promise<void>;
  await act(async () => {
    sending = current.send();
    void current.send();
  });
  expect(api.send).toHaveBeenCalledTimes(1);
  await act(async () => {
    gate.resolve(reply);
    await sending;
  });
});
