import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  browserSyncStorePrefix,
  type SyncLeaderElection,
  type SyncOnlineDetector,
  type SyncStorageAdapter
} from "@repo/sync";
import { addNetworkStateListener, getNetworkStateAsync, type NetworkState } from "expo-network";

/**
 * The Outbox store for one (User, Organization): AsyncStorage keys under a
 * prefix that names both, so no two pairs ever share a key.
 */
export function createAsyncStorageOutbox(scope: {
  userId: string;
  organizationId: string;
}): SyncStorageAdapter {
  const prefix = `${browserSyncStorePrefix(scope.userId)}${scope.organizationId}:`;
  async function ownKeys(): Promise<string[]> {
    return (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(prefix));
  }
  return {
    get: (key) => AsyncStorage.getItem(prefix + key),
    set: (key, value) => AsyncStorage.setItem(prefix + key, value),
    delete: (key) => AsyncStorage.removeItem(prefix + key),
    keys: async () => (await ownKeys()).map((key) => key.slice(prefix.length)),
    clear: async () => {
      await AsyncStorage.multiRemove(await ownKeys());
    }
  };
}

/** Every Outbox key of a User, in any Organization. */
export async function userOutboxKeys(userId: string): Promise<string[]> {
  const prefix = browserSyncStorePrefix(userId);
  return (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(prefix));
}

function reachable(state: NetworkState): boolean {
  // Unknown reachability counts as online: a failed request says otherwise.
  return state.isConnected === true && state.isInternetReachable !== false;
}

/** Online state from expo-network, which the app already ships. */
export function createExpoNetworkDetector(): SyncOnlineDetector {
  let online = true;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const subscription = addNetworkStateListener((state) => {
    online = reachable(state);
    notify();
  });
  void getNetworkStateAsync()
    .then((state) => {
      online = reachable(state);
      notify();
    })
    .catch(() => undefined);
  return {
    isOnline: () => online,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    notifyOnline: notify,
    dispose() {
      subscription.remove();
      listeners.clear();
    }
  };
}

/** One app process holds one Outbox per scope, so it always leads it. */
export const singleProcessLeader: SyncLeaderElection = {
  requestLeadership: () => Promise.resolve(true),
  releaseLeadership: () => undefined,
  isLeader: () => true,
  onLeadershipChange: () => () => undefined
};
