import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { factoryMain } from "./factory";
import { FactoryCoordination } from "./factory-coordination";
import { login } from "./factory-docker";
import { finishStorage } from "./factory-storage";
import { FactoryStore } from "./factory-store";
import { factoryConfigSchema, factoryRunSchema } from "./factory.util";

let root: string;
let store: FactoryStore;
vi.mock("./factory-checkouts", () => ({
  CONTROLLER_VERSION: "test",
  selectedCheckout: () => root,
  commonDirectory: (checkout: string) => path.join(checkout, "common"),
  discoverCheckouts: () => []
}));
vi.mock("./factory-docker", () => ({ cancelContainers: vi.fn(), login: vi.fn() }));
vi.mock("./factory-storage", () => ({ finishStorage: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  root = mkdtempSync(path.join(tmpdir(), "factory-recovery-test-"));
  store = new FactoryStore(path.join(root, ".ai.local/factory/runs"), root);
  const config = factoryConfigSchema.parse({
    enabled: false,
    repository: "owner/repo",
    owner: "owner",
    image: `sha256:${"a".repeat(64)}`,
    models: { codex: "model", claude: "model" },
    stages: Object.fromEntries(
      ["intake", "spec", "implement", "review", "learn"].map((stage) => [
        stage,
        { provider: "codex", model: "model" }
      ])
    )
  });
  writeFileSync(path.join(root, ".ai.local/factory/config.json"), JSON.stringify(config));
});
afterEach(() => {
  vi.restoreAllMocks();
  if (path.dirname(root) !== path.resolve(tmpdir())) throw new Error("Unsafe fixture cleanup");
  rmSync(root, { recursive: true, force: true });
});
it("releases the active and shared lease when login cannot acquire provider credentials", async () => {
  vi.spyOn(FactoryCoordination.prototype, "resource").mockRejectedValue(
    new Error("Explicit recovery required")
  );
  await expect(factoryMain(["login", "--provider", "claude"])).rejects.toThrow(
    "Explicit recovery required"
  );
  expect(login).not.toHaveBeenCalled();
  expect(store.active()).toBeNull();
  expect(readdirSync(path.join(root, "common/kaine-factory"))).toEqual([]);
});
it.each([true, false])(
  "persists recovery before releasing ownership (cleaned=%s)",
  async (cleaned) => {
    const id = randomUUID();
    const run = factoryRunSchema.parse({
      id,
      issue: 1,
      stage: "implement",
      provider: "codex",
      model: "model",
      revision: "a".repeat(40),
      authorization: "owner",
      snapshot: "s",
      startedAt: "now",
      finishedAt: null,
      status: "failed",
      detail: "Install failed",
      branch: "",
      pr: null,
      validation: [],
      result: null,
      invocations: [],
      cleanup: { status: "cleanup-unverified", errors: ["Old cleanup failure"] }
    });
    store.save(run);
    store.write("active.json", { id, pid: 999999 });
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("Exited"), { code: "ESRCH" });
    });
    vi.mocked(finishStorage).mockImplementation((_config, current) => {
      current.cleanup = {
        status: cleaned ? "passed" : "cleanup-unverified",
        errors: cleaned ? [] : ["Export failed"]
      };
      return cleaned;
    });
    if (cleaned) {
      await factoryMain(["cancel", "--run", id]);
      expect(store.runs()[0]?.cleanup?.status).toBe("passed");
      expect(store.runs()[0]?.status).toBe("cancelled");
      expect(store.active()).toBeNull();
      const release = store.acquire(randomUUID());
      release();
    } else {
      await expect(factoryMain(["cancel", "--run", id])).rejects.toThrow(
        "recovery remains unverified"
      );
      expect(store.runs()[0]?.cleanup?.errors).toEqual(["Export failed"]);
      expect(existsSync(store.file("active.json"))).toBe(true);
    }
  }
);
