import type { AgentList } from "@repo/desk/contracts";
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
