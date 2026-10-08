import { describe, expect, it } from "vitest";

import { stopProcessGroup } from "./process.tree";
import { defaultIsProcessAlive } from "../store/store.lease";
import { spawnOrphanLeader } from "../testing/process.testing";

describe("stopProcessGroup", () => {
  it("stops the group of a recorded pid and proves it is gone", async () => {
    const pid = await spawnOrphanLeader();
    expect(defaultIsProcessAlive(pid)).toBe(true);
    expect(await stopProcessGroup(pid)).toBe("passed");
    expect(defaultIsProcessAlive(pid)).toBe(false);
  });

  it("reports a group that is already gone as stopped", async () => {
    const pid = await spawnOrphanLeader();
    expect(await stopProcessGroup(pid)).toBe("passed");
    expect(await stopProcessGroup(pid)).toBe("passed");
  });
});
