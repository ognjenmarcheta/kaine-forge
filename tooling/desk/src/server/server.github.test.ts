import { afterEach, describe, expect, it, vi } from "vitest";

import { githubListsSchema, type GithubLists } from "../contracts";
import { authenticated, createHarness, type Api, type Harness } from "./server.testing";
import type { OpenWork } from "../github/github.lists";

let harness: Harness | null = null;
let api: Api | null = null;
afterEach(async () => {
  await harness?.cleanup();
  harness = null;
  api = null;
});

const WORK: OpenWork = {
  issues: [
    {
      number: 3,
      title: "Started already",
      url: "https://github.com/o/r/issues/3",
      labels: [{ name: "ready-for-agent" }],
      body: "",
      updatedAt: "2026-10-13T09:00:00Z"
    }
  ],
  pulls: []
};

/** Logs in once per test: the launch token works one time. */
const get = async (path: string): Promise<GithubLists> => {
  if (harness === null) throw new Error("no harness");
  api ??= await authenticated(harness);
  return githubListsSchema.parse((await api.get(path)).json());
};

describe("GET /api/github", () => {
  it("lists the open work, marks the issues on the board, and reuses the list", async () => {
    const openWork = vi.fn(() => Promise.resolve(WORK));
    harness = await createHarness({ openWork });
    await harness.seed(3);

    const first = await get("/api/github");
    await get("/api/github");

    expect(first).toMatchObject({ ok: true, issues: [{ number: 3, ready: true, onBoard: true }] });
    expect(openWork).toHaveBeenCalledTimes(1);
  });

  it("asks GitHub again on refresh", async () => {
    const openWork = vi.fn(() => Promise.resolve(WORK));
    harness = await createHarness({ openWork });
    await get("/api/github");
    await get("/api/github?refresh=1");
    expect(openWork).toHaveBeenCalledTimes(2);
  });

  it("says why when gh cannot list, and does not keep the failure", async () => {
    const openWork = vi
      .fn<() => Promise<OpenWork>>()
      .mockRejectedValueOnce(new Error("gh issue list failed (exit 4): not logged in"))
      .mockResolvedValue(WORK);
    harness = await createHarness({ openWork });

    expect(await get("/api/github")).toMatchObject({
      ok: false,
      reason: "gh issue list failed (exit 4): not logged in"
    });
    expect(await get("/api/github")).toMatchObject({ ok: true });
  });

  it("says so when the desk has no GitHub access", async () => {
    harness = await createHarness();
    expect(await get("/api/github")).toMatchObject({ ok: false });
  });
});
