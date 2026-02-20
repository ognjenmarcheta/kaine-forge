import { describe, expect, it, vi } from "vitest";

import { invalidateOrgScopedQueries, queryKeys } from "./index";

describe("query keys", () => {
  it("builds stable auth and organization keys", () => {
    expect(queryKeys.session()).toEqual(["auth", "session"]);
    expect(queryKeys.organizations()).toEqual(["organizations"]);
    expect(queryKeys.organizationMembers("org-1")).toEqual(["organizations", "members", "org-1"]);
  });
});

describe("invalidateOrgScopedQueries", () => {
  it("invalidates generated todos and organization members scope", async () => {
    const invalidateQueries = vi.fn(async () => undefined);

    await invalidateOrgScopedQueries({
      invalidateQueries
    });

    expect(invalidateQueries).toHaveBeenCalledTimes(3);
    expect(invalidateQueries).toHaveBeenNthCalledWith(1, {
      queryKey: ["GetTodos"]
    });
    expect(invalidateQueries).toHaveBeenNthCalledWith(2, {
      queryKey: ["GetMobileTodos"]
    });
    expect(invalidateQueries).toHaveBeenNthCalledWith(3, {
      queryKey: ["organizations", "members"]
    });
  });
});
