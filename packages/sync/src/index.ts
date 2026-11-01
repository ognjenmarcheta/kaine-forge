export * from "./sync.engine";
export * from "./sync.type";
export { SyncAuthError, SyncRequestError } from "./sync.util";
// The adapter shapes an app supplies, without importing TanStack itself.
export type {
  LeaderElection as SyncLeaderElection,
  OnlineDetector as SyncOnlineDetector,
  StorageAdapter as SyncStorageAdapter
} from "@tanstack/offline-transactions";
