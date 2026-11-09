import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { makeState } from "./server.testing";
import { createStoreWatcher, type StoreWatcher } from "./server.watch";
import { createIssueStore, type IssueStore } from "../store/store.issue";

let root: string;
let store: IssueStore;
let watcher: StoreWatcher;
let changed: number[];
let removed: number[];

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "desk-watch-"));
  store = createIssueStore(root);
  changed = [];
  removed = [];
  // A long interval and no fs.watch: the test drives every poll itself.
  watcher = createStoreWatcher({
    store,
    pollMs: 60_000,
    useFsWatch: false,
    onChanged: (issueNumber) => changed.push(issueNumber),
    onRemoved: (issueNumber) => removed.push(issueNumber)
  });
  await watcher.start();
});
afterEach(async () => {
  watcher.stop();
  await rm(root, { recursive: true, force: true });
});

describe("createStoreWatcher", () => {
  it("reports a new issue once, not while its folder exists without state.json", async () => {
    // store.write creates the folder before it renames state.json into place.
    await mkdir(store.issueDir(8), { recursive: true });
    await watcher.poll();
    expect({ changed, removed }).toEqual({ changed: [], removed: [] });

    await store.write(makeState(8, { stage: "build", status: "running" }));
    await watcher.poll();
    await watcher.poll();
    expect({ changed, removed }).toEqual({ changed: [8], removed: [] });
  });
});
