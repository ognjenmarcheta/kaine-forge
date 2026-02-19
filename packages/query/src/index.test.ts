import { describe, expect, it, vi } from "vitest";

import { invalidateOrgScopedQueries, queryKeys } from "./index";

describe("query keys", () => {
  it("builds stable organization and todo keys", () => {
    expect(queryKeys.session()).toEqual(["auth", "session"]);
    expect(queryKeys.organizations()).toEqual(["organizations"]);
    expect(queryKeys.organizationMembers("org-1")).toEqual(["organizations", "members", "org-1"]);
    expect(queryKeys.todos("org-1", { limit: 50, offset: 0 })).toEqual([
      "todos",
      "org-1",
      { limit: 50, offset: 0 }
    ]);
  });
});

describe("invalidateOrgScopedQueries", () => {
  it("invalidates todos and organization members scope", async () => {
    const invalidateQueries = vi.fn(async () => undefined);

    await invalidateOrgScopedQueries({
      invalidateQueries
    });

    expect(invalidateQueries).toHaveBeenCalledTimes(2);
    expect(invalidateQueries).toHaveBeenNthCalledWith(1, {
      queryKey: ["todos"]
    });
    expect(invalidateQueries).toHaveBeenNthCalledWith(2, {
      queryKey: ["organizations", "members"]
    });
  });
});
