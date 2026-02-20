import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  client: {
    marker: "initial",
    request: async (document: string, variables?: Record<string, unknown>) => {
      void document;
      void variables;
      return {};
    }
  }
}));

vi.mock("react", () => ({
  useCallback: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  useMemo: <T>(factory: () => T) => factory()
}));

vi.mock("../hooks/use-auth", () => ({
  useAuth: () => ({
    session: null
  })
}));

vi.mock("./graphql-client", () => ({
  createGraphqlClient: () => hoisted.client
}));

import { useGraphqlFetcher } from "./graphql-codegen-fetcher";

describe("useGraphqlFetcher", () => {
  beforeEach(() => {
    hoisted.client = {
      marker: "initial",
      request: async (document: string, variables?: Record<string, unknown>) => {
        void document;
        void variables;
        return {};
      }
    };
  });

  it("keeps request bound for variable-less operations", async () => {
    hoisted.client = {
      marker: "bound",
      request: async function (this: { marker: string }, document: string) {
        expect(this.marker).toBe("bound");
        return { document, ok: true };
      }
    };

    const fetcher = useGraphqlFetcher<{ document: string; ok: boolean }, Record<string, unknown>>(
      "query MobileHealth { health }"
    );

    await expect(fetcher()).resolves.toEqual({
      document: "query MobileHealth { health }",
      ok: true
    });
  });

  it("forwards variables and keeps request bound", async () => {
    hoisted.client = {
      marker: "bound",
      request: async function (
        this: { marker: string },
        document: string,
        variables?: Record<string, unknown>
      ) {
        expect(this.marker).toBe("bound");
        expect(variables).toEqual({ limit: 50, offset: 0 });
        return { document, ok: true };
      }
    };

    const fetcher = useGraphqlFetcher<
      { document: string; ok: boolean },
      { limit: number; offset: number }
    >(
      "query GetMobileTodos($limit: Int, $offset: Int) { todos(limit: $limit, offset: $offset) { id } }"
    );

    await expect(fetcher({ limit: 50, offset: 0 })).resolves.toEqual({
      document:
        "query GetMobileTodos($limit: Int, $offset: Int) { todos(limit: $limit, offset: $offset) { id } }",
      ok: true
    });
  });
});
