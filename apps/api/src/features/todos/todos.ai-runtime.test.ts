import { afterEach, describe, expect, it, vi } from "vitest";

const aiSdkMocks = vi.hoisted(() => {
  const deepseekModel = vi.fn((model: string) => ({
    model,
    provider: "deepseek"
  }));
  const openAiModel = vi.fn((model: string) => ({
    model,
    provider: "openai"
  }));

  return {
    createDeepSeek: vi.fn(() => deepseekModel),
    createOpenAI: vi.fn(() => openAiModel),
    deepseekModel,
    generateText: vi.fn(async () => ({
      output: {
        todos: [
          {
            description: "description",
            title: "Generated todo"
          }
        ]
      },
      usage: { inputTokens: 80, outputTokens: 30, totalTokens: 110 }
    })),
    objectOutput: vi.fn((config: unknown) => config),
    openAiModel
  };
});

vi.mock("@ai-sdk/deepseek", () => ({
  createDeepSeek: aiSdkMocks.createDeepSeek
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: aiSdkMocks.createOpenAI
}));

vi.mock("ai", () => ({
  generateText: aiSdkMocks.generateText,
  Output: {
    object: aiSdkMocks.objectOutput
  }
}));

import { createTodoAiRuntime } from "./todos.ai-runtime";

describe("createTodoAiRuntime", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("uses OpenAI by default", async () => {
    vi.stubEnv("OPENAI_API_KEY", "openai-key");

    const runtime = createTodoAiRuntime({ recordModelCall: vi.fn() });

    expect(runtime.isConfigured()).toBe(true);
    await expect(runtime.generateTodoDrafts({ prompt: "Plan launch" })).resolves.toEqual([
      {
        description: "description",
        title: "Generated todo"
      }
    ]);
    expect(aiSdkMocks.createOpenAI).toHaveBeenCalledWith({ apiKey: "openai-key" });
    expect(aiSdkMocks.openAiModel).toHaveBeenCalledWith("gpt-4.1-mini");
    expect(aiSdkMocks.createDeepSeek).not.toHaveBeenCalled();
    expect(aiSdkMocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: {
          model: "gpt-4.1-mini",
          provider: "openai"
        },
        prompt: "Plan launch"
      })
    );
  });

  it("uses DeepSeek when selected", async () => {
    vi.stubEnv("AI_TODO_PROVIDER", "deepseek");
    vi.stubEnv("DEEPSEEK_API_KEY", "deepseek-key");

    const runtime = createTodoAiRuntime({ recordModelCall: vi.fn() });

    expect(runtime.isConfigured()).toBe(true);
    await runtime.generateTodoDrafts({ prompt: "Plan launch" });
    expect(aiSdkMocks.createDeepSeek).toHaveBeenCalledWith({ apiKey: "deepseek-key" });
    expect(aiSdkMocks.deepseekModel).toHaveBeenCalledWith("deepseek-chat");
    expect(aiSdkMocks.createOpenAI).not.toHaveBeenCalled();
  });

  it("returns not configured when the selected provider key is missing", async () => {
    vi.stubEnv("AI_TODO_PROVIDER", "deepseek");
    vi.stubEnv("OPENAI_API_KEY", "openai-key");

    const runtime = createTodoAiRuntime({ recordModelCall: vi.fn() });

    expect(runtime.isConfigured()).toBe(false);
    await expect(runtime.generateTodoDrafts({ prompt: "Plan launch" })).resolves.toEqual([]);
    expect(aiSdkMocks.generateText).not.toHaveBeenCalled();
    expect(aiSdkMocks.createOpenAI).not.toHaveBeenCalled();
    expect(aiSdkMocks.createDeepSeek).not.toHaveBeenCalled();
  });

  it("uses AI_TODO_MODEL as an override for the selected provider", async () => {
    vi.stubEnv("AI_TODO_MODEL", "deepseek-reasoner");
    vi.stubEnv("AI_TODO_PROVIDER", "deepseek");
    vi.stubEnv("DEEPSEEK_API_KEY", "deepseek-key");

    const runtime = createTodoAiRuntime({ recordModelCall: vi.fn() });

    await runtime.generateTodoDrafts({ prompt: "Plan launch" });
    expect(aiSdkMocks.deepseekModel).toHaveBeenCalledWith("deepseek-reasoner");
  });

  it("falls back to OpenAI for invalid provider values", async () => {
    vi.stubEnv("AI_TODO_PROVIDER", "unknown-provider");
    vi.stubEnv("OPENAI_API_KEY", "openai-key");

    const runtime = createTodoAiRuntime({ recordModelCall: vi.fn() });

    expect(runtime.isConfigured()).toBe(true);
    await runtime.generateTodoDrafts({ prompt: "Plan launch" });
    expect(aiSdkMocks.createOpenAI).toHaveBeenCalledWith({ apiKey: "openai-key" });
    expect(aiSdkMocks.openAiModel).toHaveBeenCalledWith("gpt-4.1-mini");
    expect(aiSdkMocks.createDeepSeek).not.toHaveBeenCalled();
  });

  it("records provider, model, tokens and duration for each call", async () => {
    vi.stubEnv("OPENAI_API_KEY", "openai-key");
    const recordModelCall = vi.fn();

    await createTodoAiRuntime({ recordModelCall }).generateTodoDrafts({ prompt: "Plan launch" });

    expect(recordModelCall).toHaveBeenCalledTimes(1);
    expect(recordModelCall).toHaveBeenCalledWith({
      runId: expect.any(String),
      status: "success",
      failureCategory: null,
      steps: 1,
      toolCalls: 0,
      durationMs: expect.any(Number),
      inputTokens: 80,
      model: "gpt-4.1-mini",
      outputTokens: 30,
      provider: "openai",
      totalTokens: 110
    });
  });

  it("records nothing when the provider is not configured", async () => {
    const recordModelCall = vi.fn();

    await createTodoAiRuntime({ recordModelCall }).generateTodoDrafts({ prompt: "Plan launch" });

    expect(recordModelCall).not.toHaveBeenCalled();
  });

  it("records failure and cancellation without provider exception data", async () => {
    vi.stubEnv("OPENAI_API_KEY", "openai-key");
    const recordModelCall = vi.fn();
    aiSdkMocks.generateText.mockRejectedValueOnce(new Error("secret-headers"));
    const runtime = createTodoAiRuntime({ recordModelCall });
    await expect(runtime.generateTodoDrafts({ prompt: "sensitive" })).rejects.toThrow();
    expect(recordModelCall).toHaveBeenCalledTimes(1);
    expect(recordModelCall).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "failure", totalTokens: undefined })
    );
    await expect(
      runtime.generateTodoDrafts({ prompt: "sensitive", abortSignal: AbortSignal.abort() })
    ).rejects.toThrow();
    expect(recordModelCall).toHaveBeenCalledTimes(2);
    expect(recordModelCall).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "cancelled" })
    );
    expect(JSON.stringify(recordModelCall.mock.calls)).not.toMatch(
      /secret-headers|sensitive|apiKey/
    );
  });
});
