import { avatarOf, type AgentAvatarSpec, type AgentList } from "@repo/desk/contracts";
import { useCallback, useEffect, useState } from "react";

import { toApiError, type FailureCode } from "../api/api.client";
import { useDesk } from "../state/desk.provider";

export type AgentListState =
  | { readonly status: "loading" }
  | { readonly status: "ok"; readonly list: AgentList }
  | { readonly status: "error"; readonly code: FailureCode; readonly detail: string | null };

/** The registry's agents, each with what a run gets now. `reload` asks again after a write. */
export function useAgentList(): { readonly state: AgentListState; readonly reload: () => void } {
  const { api } = useDesk();
  const [state, setState] = useState<AgentListState>({ status: "loading" });
  const [round, setRound] = useState(0);
  useEffect(() => {
    let current = true;
    api.agents().then(
      (list) => {
        if (current) setState({ status: "ok", list });
      },
      (failure: unknown) => {
        const converted = toApiError(failure);
        if (current) setState({ status: "error", code: converted.code, detail: converted.detail });
      }
    );
    return () => {
      current = false;
    };
  }, [api, round]);
  const reload = useCallback(() => setRound((value) => value + 1), []);
  return { state, reload };
}

/**
 * The avatar of an agent that the page knows only by its id: its own from the agent list, or the
 * default of the id while the list loads or when it has no such agent.
 */
export function useAvatarOfId(): (id: string) => AgentAvatarSpec {
  const { state } = useAgentList();
  return useCallback(
    (id: string) =>
      avatarOf(
        (state.status === "ok"
          ? state.list.agents.find((view) => view.definition.id === id)?.definition
          : undefined) ?? { id }
      ),
    [state]
  );
}
