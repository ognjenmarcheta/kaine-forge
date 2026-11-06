export * from "./sync.engine";
export { createBrowserOnlineDetector, type BrowserWindow } from "./sync.online";
export * from "./sync.type";
export { SyncAuthError, SyncNetworkError, SyncRequestError } from "./sync.util";
// The adapter shapes an app supplies, without importing TanStack itself.
export type {
  LeaderElection as SyncLeaderElection,
  OnlineDetector as SyncOnlineDetector,
  StorageAdapter as SyncStorageAdapter
} from "@tanstack/offline-transactions";
