import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Only the fields these tests read. Typing the mock's parameter is what makes
// streamText.mock.calls indexable, and removes the need for a cast.
interface StreamTextCall {
  instructions: string;
  messages: Array<{ content: string; role: string }>;
  model: { model: string; provider: string };
  stopWhen: unknown;
  tools: unknown;
}

interface StreamTextResult {
  steps: Promise<unknown[]>;
  text: Promise<string>;
  textStream: AsyncGenerator<string>;
  usage: Promise<{
    inputTokens: number | undefined;
    outputTokens: number | undefined;
    totalTokens: number | undefined;
  }>;
}

const aiSdkMocks = vi.hoisted(() => {
  const deepseekModel = vi.fn((model: string) => ({ model, provider: "deepseek" }));
  const openAiModel = vi.fn((model: string) => ({ model, provider: "openai" }));
  const stepCountSentinel = { kind: "step-count" };
  const steps = [
    {
      toolCalls: [
        { toolCallId: "call-1", toolName: "listTodos", input: { limit: 5 } },
        { toolCallId: "call-2", toolName: "createTodo", input: { title: "Buy milk" } }
      ],
      // Deliberately reversed: pairing must be by toolCallId, not by index.
      toolResults: [
        { toolCallId: "call-2", output: { id: "todo-1" } },
        { toolCallId: "call-1", output: { todos: [] } }
      ]
    },
    {
      toolCalls: [{ toolCallId: "call-3", toolName: "toggleTodo", input: { id: "todo-1" } }],
      toolResults: []
    }
  ];

  return {
    createDeepSeek: vi.fn(() => deepseekModel),
    createOpenAI: vi.fn(() => openAiModel),
    deepseekModel,
    isStepCount: vi.fn(() => stepCountSentinel),
    openAiModel,
    stepCountSentinel,
    steps,
    // A fresh object per call: textStream is a single-use async generator.
    streamText: vi.fn<(options: StreamTextCall) => StreamTextResult>(() => ({
      steps: Promise.resolve(steps),
      text: Promise.resolve("Created it."),
      textStream: (async function* () {
        yield "Created";
        yield "";
        yield " it.";
      })(),
      usage: Promise.resolve({ inputTokens: 120, outputTokens: 45, totalTokens: 165 })
    }))
  };
});

vi.mock("@ai-sdk/deepseek", () => ({ createDeepSeek: aiSdkMocks.createDeepSeek }));
vi.mock("@ai-sdk/openai", () => ({ createOpenAI: aiSdkMocks.createOpenAI }));
vi.mock("ai", () => ({
  isStepCount: aiSdkMocks.isStepCount,
  streamText: aiSdkMocks.streamText
}));

// assistant.tools imports the notes and todos adapters, which import @repo/db,
// whose client throws and constructs a pg.Pool at module load. Mocking the tools
// module is one mock instead of two, and lets the forwarded deps be asserted.
const toolSet = { listTodos: "tool" };
vi.mock("./assistant.tools", () => ({ createAssistantTools: vi.fn(() => toolSet) }));

import { createAssistantAiRuntime } from "./assistant.ai-runtime";
import { createAssistantTools } from "./assistant.tools";

const scope = {
  organizationId: "org-1",
  user: { email: "u@example.test", emailVerified: true, id: "user-1", name: "User" },
  userId: "user-1"
};

const workflows = {
  note: { createNote: vi.fn(), deleteNote: vi.fn(), updateNote: vi.fn() },
  todo: {
    createTodo: vi.fn(),
    deleteTodo: vi.fn(),
    toggleTodo: vi.fn(),
    updateTodo: vi.fn()
  }
};

const deps = () => ({
  publishAssistantDelta: vi.fn(),
  recordModelCall: vi.fn(),
  workflows
});

const runInput = {
  conversationId: "conv-1",
  messages: [{ content: "Buy milk", role: "user" as const }],
  scope
};

describe("createAssistantAiRuntime", () => {
  beforeEach(() => {
    // Both keys explicitly, so a developer with real keys exported in their
    // shell cannot change what these tests mean.
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("DEEPSEEK_API_KEY", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  describe("provider, key and model resolution", () => {
    it("uses OpenAI and gpt-4.1-mini by default", async () => {
      vi.stubEnv("OPENAI_API_KEY", "openai-key");
      const runtime = createAssistantAiRuntime(deps());

      expect(runtime.isConfigured()).toBe(true);
      await runtime.runAgent(runInput);

      expect(aiSdkMocks.createOpenAI).toHaveBeenCalledWith({ apiKey: "openai-key" });
      expect(aiSdkMocks.openAiModel).toHaveBeenCalledWith("gpt-4.1-mini");
      expect(aiSdkMocks.createDeepSeek).not.toHaveBeenCalled();
    });

    it("uses DeepSeek when the assistant provider selects it", async () => {
      vi.stubEnv("AI_ASSISTANT_PROVIDER", "deepseek");
      vi.stubEnv("DEEPSEEK_API_KEY", "deepseek-key");
      await createAssistantAiRuntime(deps()).runAgent(runInput);

      expect(aiSdkMocks.createDeepSeek).toHaveBeenCalledWith({ apiKey: "deepseek-key" });
      expect(aiSdkMocks.deepseekModel).toHaveBeenCalledWith("deepseek-chat");
      expect(aiSdkMocks.createOpenAI).not.toHaveBeenCalled();
    });

    it("falls back to the todo provider when the assistant one is unset", async () => {
      // The documented cross-feature fallback, so one DeepSeek setup serves both.
      vi.stubEnv("AI_TODO_PROVIDER", "deepseek");
      vi.stubEnv("DEEPSEEK_API_KEY", "deepseek-key");
      await createAssistantAiRuntime(deps()).runAgent(runInput);

      expect(aiSdkMocks.deepseekModel).toHaveBeenCalledWith("deepseek-chat");
    });

    it("falls back to OpenAI for an invalid provider value", async () => {
      // The runtime stays tolerant even though env validation now rejects this
      // at boot: the value can still arrive from a container override.
      vi.stubEnv("AI_ASSISTANT_PROVIDER", "opena1");
      vi.stubEnv("OPENAI_API_KEY", "openai-key");
      await createAssistantAiRuntime(deps()).runAgent(runInput);

      expect(aiSdkMocks.openAiModel).toHaveBeenCalledWith("gpt-4.1-mini");
    });

    it("prefers AI_ASSISTANT_MODEL over every default", async () => {
      vi.stubEnv("AI_ASSISTANT_MODEL", "o4-mini");
      vi.stubEnv("OPENAI_API_KEY", "openai-key");
      await createAssistantAiRuntime(deps()).runAgent(runInput);

      expect(aiSdkMocks.openAiModel).toHaveBeenCalledWith("o4-mini");
    });

    it("borrows AI_TODO_MODEL only when the todo provider matches", async () => {
      vi.stubEnv("AI_TODO_MODEL", "gpt-4o");
      vi.stubEnv("AI_TODO_PROVIDER", "openai");
      vi.stubEnv("OPENAI_API_KEY", "openai-key");
      await createAssistantAiRuntime(deps()).runAgent(runInput);

      expect(aiSdkMocks.openAiModel).toHaveBeenCalledWith("gpt-4o");
    });

    it("ignores AI_TODO_MODEL when the providers differ", async () => {
      // The branch a reimplementation gets wrong: an OpenAI model id must not
      // leak into a DeepSeek call.
      vi.stubEnv("AI_ASSISTANT_PROVIDER", "deepseek");
      vi.stubEnv("AI_TODO_MODEL", "gpt-4o");
      vi.stubEnv("AI_TODO_PROVIDER", "openai");
      vi.stubEnv("DEEPSEEK_API_KEY", "deepseek-key");
      await createAssistantAiRuntime(deps()).runAgent(runInput);

      expect(aiSdkMocks.deepseekModel).toHaveBeenCalledWith("deepseek-chat");
      expect(aiSdkMocks.deepseekModel).not.toHaveBeenCalledWith("gpt-4o");
    });

    it("reports not configured when the resolved provider's key is missing", async () => {
      vi.stubEnv("AI_ASSISTANT_PROVIDER", "deepseek");
      vi.stubEnv("OPENAI_API_KEY", "openai-key");
      const runtime = createAssistantAiRuntime(deps());

      expect(runtime.isConfigured()).toBe(false);
      // Throws rather than degrading, unlike the todo runtime which returns [].
      // assistant.ai.ts gates on isConfigured first, so this is a config race.
      await expect(runtime.runAgent(runInput)).rejects.toThrow("assistant AI is not configured");
      expect(aiSdkMocks.streamText).not.toHaveBeenCalled();
    });
  });

  describe("streamText arguments", () => {
    beforeEach(() => {
      vi.stubEnv("OPENAI_API_KEY", "openai-key");
    });

    it("keeps the tool-discipline instruction in the system prompt", async () => {
      await createAssistantAiRuntime(deps()).runAgent(runInput);
      const instructions = aiSdkMocks.streamText.mock.calls[0]?.[0].instructions;

      // Contains, not equals: wording edits stay free, deleting the discipline
      // instruction does not.
      expect(instructions).toContain("first call listTodos to find its id");
      expect(instructions).toContain("Do not use markdown");
    });

    it("forwards the workflows and scope to the tool factory", async () => {
      const injected = deps();
      await createAssistantAiRuntime(injected).runAgent(runInput);

      expect(createAssistantTools).toHaveBeenCalledWith({
        noteWorkflow: injected.workflows.note,
        scope,
        todoWorkflow: injected.workflows.todo
      });
      expect(aiSdkMocks.streamText.mock.calls[0]?.[0]).toMatchObject({ tools: toolSet });
    });

    it("caps the agent at eight steps", async () => {
      await createAssistantAiRuntime(deps()).runAgent(runInput);

      expect(aiSdkMocks.isStepCount).toHaveBeenCalledWith(8);
      expect(aiSdkMocks.streamText.mock.calls[0]?.[0]).toMatchObject({
        stopWhen: aiSdkMocks.stepCountSentinel
      });
    });

    it("maps conversation history to model messages in order", async () => {
      await createAssistantAiRuntime(deps()).runAgent({
        ...runInput,
        messages: [
          { content: "Buy milk", role: "user" },
          { content: "Done.", role: "assistant" },
          { content: "Thanks", role: "user" }
        ]
      });

      expect(aiSdkMocks.streamText.mock.calls[0]?.[0]).toMatchObject({
        messages: [
          { content: "Buy milk", role: "user" },
          { content: "Done.", role: "assistant" },
          { content: "Thanks", role: "user" }
        ]
      });
    });
  });

  describe("streaming and tool actions", () => {
    beforeEach(() => {
      vi.stubEnv("OPENAI_API_KEY", "openai-key");
    });

    it("publishes one delta per non-empty chunk", async () => {
      const injected = deps();
      await createAssistantAiRuntime(injected).runAgent(runInput);

      expect(injected.publishAssistantDelta).toHaveBeenCalledTimes(2);
      expect(injected.publishAssistantDelta).toHaveBeenNthCalledWith(1, {
        conversationId: "conv-1",
        delta: "Created",
        organizationId: "org-1",
        userId: "user-1"
      });
      expect(injected.publishAssistantDelta).toHaveBeenNthCalledWith(2, {
        conversationId: "conv-1",
        delta: " it.",
        organizationId: "org-1",
        userId: "user-1"
      });
    });

    it("pairs tool results with their call by id, across steps", async () => {
      const result = await createAssistantAiRuntime(deps()).runAgent(runInput);

      expect(result.reply).toBe("Created it.");
      expect(result.toolActions).toEqual([
        { tool: "listTodos", input: { limit: 5 }, output: { todos: [] } },
        { tool: "createTodo", input: { title: "Buy milk" }, output: { id: "todo-1" } },
        // No matching result: output is null rather than undefined.
        { tool: "toggleTodo", input: { id: "todo-1" }, output: null }
      ]);
    });
  });

  describe("telemetry", () => {
    beforeEach(() => {
      vi.stubEnv("OPENAI_API_KEY", "openai-key");
    });

    it("records provider, model, tokens, duration and shape once per call", async () => {
      const injected = deps();
      await createAssistantAiRuntime(injected).runAgent(runInput);

      expect(injected.recordModelCall).toHaveBeenCalledTimes(1);
      expect(injected.recordModelCall).toHaveBeenCalledWith({
        conversationId: "conv-1",
        durationMs: expect.any(Number),
        inputTokens: 120,
        model: "gpt-4.1-mini",
        outputTokens: 45,
        provider: "openai",
        steps: 2,
        toolCalls: 3,
        totalTokens: 165
      });
    });

    it("carries only metadata, never anything derived from the model", () => {
      // The leak rule as a test rather than a comment: adding `messages` or
      // `reply` to the telemetry object fails here.
      const injected = deps();

      return createAssistantAiRuntime(injected)
        .runAgent(runInput)
        .then(() => {
          const telemetry = injected.recordModelCall.mock.calls[0]?.[0] as Record<string, unknown>;

          expect(Object.keys(telemetry).sort()).toEqual([
            "conversationId",
            "durationMs",
            "inputTokens",
            "model",
            "outputTokens",
            "provider",
            "steps",
            "toolCalls",
            "totalTokens"
          ]);
        });
    });

    it("passes through undefined token counts rather than claiming zero", async () => {
      aiSdkMocks.streamText.mockImplementationOnce(() => ({
        steps: Promise.resolve(aiSdkMocks.steps),
        text: Promise.resolve("Created it."),
        textStream: (async function* () {
          yield "Created it.";
        })(),
        usage: Promise.resolve({
          inputTokens: undefined,
          outputTokens: undefined,
          totalTokens: undefined
        })
      }));
      const injected = deps();

      const result = await createAssistantAiRuntime(injected).runAgent(runInput);

      expect(injected.recordModelCall).toHaveBeenCalledWith(
        expect.objectContaining({ inputTokens: undefined, totalTokens: undefined })
      );
      // The reply path is unaffected by a provider that reports no usage.
      expect(result.reply).toBe("Created it.");
    });
  });
});
