import { describe, expect, it, vi } from "vitest";

vi.mock("../features/storage/storage.adapter", () => ({}));
vi.mock("../features/todos/todos.adapter", () => ({}));

import { apiFeatures, apiResolvers, apiTypeDefs } from "./features";

describe("api schema feature registry", () => {
  it("registers all feature type definitions in one place", () => {
    expect(apiFeatures.map((feature) => feature.name)).toEqual([
      "organizations",
      "todos",
      "storage"
    ]);
    expect(apiTypeDefs.join("\n")).toContain("type Query");
    expect(apiTypeDefs.join("\n")).toContain("extend type Query");
  });

  it("merges root and object resolvers", () => {
    expect(apiResolvers.Query).toMatchObject({
      health: expect.any(Function),
      organizations: expect.any(Function),
      todos: expect.any(Function),
      files: expect.any(Function)
    });
    expect(apiResolvers.Mutation).toMatchObject({
      createTodo: expect.any(Function),
      requestUploadUrl: expect.any(Function)
    });
    expect(apiResolvers.Subscription).toMatchObject({
      todoCreated: expect.any(Object)
    });
    expect(apiResolvers.Todo).toMatchObject({
      attachments: expect.any(Function)
    });
  });
});
