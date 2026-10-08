import type { ActionOutcome, ActionRequestInput, ServerEvent } from "@repo/desk/contracts";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode
} from "react";

import { deskReducer, initialDeskState, revisionOf, type DeskState } from "./desk.store";
import { createDeskApi, toApiError, type DeskApi, type FailureCode } from "../api/api.client";
import { isSessionLost } from "../api/api.errors";
import { exchangeLaunchToken } from "../api/api.session";
import { connectEventStream, type EventSourceLike } from "../api/api.stream";

/** How a requested action ended, as the page needs it. */
export type ActionSettled =
  | { readonly kind: "done"; readonly outcome: ActionOutcome }
  /** The server accepted a long action, and the caller chose not to wait for its end. */
  | { readonly kind: "accepted" }
  | { readonly kind: "error"; readonly code: FailureCode; readonly detail: string | null }
  /** The action still ran when the live connection dropped. Reload the issue to see the result. */
  | { readonly kind: "unknown" };

export interface DeskContextValue {
  readonly state: DeskState;
  readonly api: DeskApi;
  /**
   * Send an action. By default it settles when the action ends, even when the server
   * answered `accepted`. With `wait: false` it settles at once on `accepted`.
   */
  readonly act: (
    issueNumber: number,
    request: ActionRequestInput,
    options?: { readonly wait?: boolean }
  ) => Promise<ActionSettled>;
  readonly reloadIssues: () => Promise<boolean>;
  readonly loadDetail: (issueNumber: number) => Promise<void>;
  readonly loadLog: (issueNumber: number) => Promise<void>;
  readonly loadHealth: () => Promise<void>;
}

const DeskContext = createContext<DeskContextValue | null>(null);

export const useDesk = (): DeskContextValue => {
  const value = useContext(DeskContext);
  if (value === null) throw new Error("DeskProvider is missing");
  return value;
};

interface Waiter {
  readonly action: string;
  readonly settle: (settled: ActionSettled) => void;
}

export interface DeskProviderProps {
  readonly children: ReactNode;
  /** A test supplies its own client and event source. */
  readonly api?: DeskApi;
  readonly createSource?: (url: string) => EventSourceLike;
}

export function DeskProvider({ children, api: apiOverride, createSource }: DeskProviderProps) {
  const api = useMemo(() => apiOverride ?? createDeskApi(), [apiOverride]);
  const [state, dispatch] = useReducer(deskReducer, initialDeskState);
  const waiters = useRef(new Map<number, Waiter[]>());
  const exchange = useRef<Promise<void> | null>(null);
  const detailFlights = useRef(new Set<string>());
  // Callbacks read the latest state through this ref, so their identity stays stable.
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  }, [state]);

  const settleWaiters = useCallback(
    (issueNumber: number, matches: (waiter: Waiter) => boolean, settled: ActionSettled): void => {
      const all = waiters.current.get(issueNumber) ?? [];
      const [hit, rest] = [all.filter(matches), all.filter((waiter) => !matches(waiter))];
      if (rest.length === 0) waiters.current.delete(issueNumber);
      else waiters.current.set(issueNumber, rest);
      for (const waiter of hit) waiter.settle(settled);
    },
    []
  );

  const reloadIssues = useCallback(async (): Promise<boolean> => {
    try {
      const issues = await api.issues();
      dispatch({ type: "issues-loaded", issues });
      // An action that was accepted before the connection dropped has ended
      // when its issue is no longer busy: the result event may have been missed.
      for (const issue of issues) {
        if (!issue.busy) settleWaiters(issue.issueNumber, () => true, { kind: "unknown" });
      }
      return true;
    } catch (error) {
      const failure = toApiError(error);
      dispatch({
        type: "session",
        session: isSessionLost(failure.code) ? "unauthorized" : "unavailable"
      });
      return !isSessionLost(failure.code);
    }
  }, [api, settleWaiters]);

  const handleEvent = useCallback(
    (event: ServerEvent): void => {
      if (event.type === "action-result") {
        const settled: ActionSettled =
          event.error === null
            ? event.outcome === null
              ? { kind: "unknown" }
              : { kind: "done", outcome: event.outcome }
            : { kind: "error", code: event.error.code, detail: event.error.detail };
        settleWaiters(event.issueNumber, (waiter) => waiter.action === event.action, settled);
      }
      dispatch({ type: "server-event", event });
    },
    [settleWaiters]
  );

  useEffect(() => {
    let stream: { close: () => void } | null = null;
    let disposed = false;
    // React runs this effect twice in development. The launch token works once, so both runs share one exchange.
    exchange.current ??= exchangeLaunchToken(api, window.location, (url) =>
      window.history.replaceState(null, "", url)
    );
    void (async () => {
      try {
        await exchange.current;
      } catch {
        dispatch({ type: "session", session: "unavailable" });
        return;
      }
      const reachable = await reloadIssues();
      if (!reachable || disposed) return;
      stream = connectEventStream({
        createSource: createSource ?? ((url) => new EventSource(url)),
        onEvent: handleEvent,
        onStatus: (connection) => dispatch({ type: "connection", connection }),
        onSync: reloadIssues
      });
    })();
    return () => {
      disposed = true;
      stream?.close();
    };
  }, [api, createSource, handleEvent, reloadIssues]);

  const act = useCallback<DeskContextValue["act"]>(
    async (issueNumber, request, options) => {
      try {
        const response = await api.act(issueNumber, request);
        if (response.status === "done") return { kind: "done", outcome: response.outcome };
        if (options?.wait === false) return { kind: "accepted" };
        return await new Promise<ActionSettled>((resolve) => {
          const list = waiters.current.get(issueNumber) ?? [];
          waiters.current.set(issueNumber, [...list, { action: response.action, settle: resolve }]);
        });
      } catch (error) {
        const failure = toApiError(error);
        if (isSessionLost(failure.code)) dispatch({ type: "session", session: "unauthorized" });
        return { kind: "error", code: failure.code, detail: failure.detail };
      }
    },
    [api]
  );

  const loadDetail = useCallback(
    async (issueNumber: number): Promise<void> => {
      const summary = latest.current.issues[issueNumber];
      const revision = summary === undefined ? "unknown" : revisionOf(summary);
      const key = `${String(issueNumber)}|${revision}`;
      if (detailFlights.current.has(key)) return;
      detailFlights.current.add(key);
      try {
        const detail = await api.issue(issueNumber);
        dispatch({ type: "detail-loaded", entry: { detail, revision } });
      } catch (error) {
        const failure = toApiError(error);
        if (isSessionLost(failure.code)) dispatch({ type: "session", session: "unauthorized" });
        throw failure;
      } finally {
        detailFlights.current.delete(key);
      }
    },
    [api]
  );

  const loadLog = useCallback(
    async (issueNumber: number): Promise<void> => {
      const after = latest.current.logs[issueNumber]?.at(-1)?.seq ?? 0;
      const result = await api.log(issueNumber, after);
      dispatch({ type: "logs-loaded", issueNumber, entries: result.entries });
    },
    [api]
  );

  const loadHealth = useCallback(async (): Promise<void> => {
    dispatch({ type: "health-loaded", report: await api.health() });
  }, [api]);

  const value = useMemo<DeskContextValue>(
    () => ({ state, api, act, reloadIssues, loadDetail, loadLog, loadHealth }),
    [state, api, act, reloadIssues, loadDetail, loadLog, loadHealth]
  );
  return <DeskContext.Provider value={value}>{children}</DeskContext.Provider>;
}
