import { describe, expect, it } from "vitest";

import { formatLoggableError } from "./observability";

describe("formatLoggableError", () => {
  it("keeps the message, name and stack of an Error", () => {
    const error = new TypeError("boom");
    const formatted = formatLoggableError(error);

    expect(formatted.message).toBe("boom");
    expect(formatted.name).toBe("TypeError");
    expect(formatted.stack).toContain("boom");
  });

  it("describes a thrown non-Error", () => {
    expect(formatLoggableError("just a string")).toEqual({
      message: "just a string",
      name: "UnknownError",
      stack: undefined
    });
  });

  it("drops provider payload fields rather than copying them onto the record", () => {
    // The shape of the AI SDK's APICallError: requestBodyValues is the outgoing
    // request, so it holds the system prompt and the whole conversation.
    // pino's default err serializer would copy both of these onto the log record
    // and attach the original object as `raw`.
    const apiCallError = Object.assign(new Error("model rejected the request"), {
      requestBodyValues: { messages: [{ content: "my private note", role: "user" }] },
      responseBody: '{"error":"the raw model output"}',
      url: "https://api.example.test/v1/chat"
    });

    const formatted = formatLoggableError(apiCallError);

    expect(Object.keys(formatted).sort()).toEqual(["message", "name", "stack"]);
    expect(JSON.stringify(formatted)).not.toContain("my private note");
    expect(JSON.stringify(formatted)).not.toContain("the raw model output");
  });
});
