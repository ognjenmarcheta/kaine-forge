import type { AgentList, FlowList } from "@repo/desk/contracts";
import { useCallback, useEffect, useState } from "react";

import { toApiError, type FailureCode } from "../api/api.client";
import { useDesk } from "../state/desk.provider";

export type FlowsState =
  | { readonly status: "loading" }
  | { readonly status: "ok"; readonly flows: FlowList; readonly agents: AgentList }
  | { readonly status: "error"; readonly code: FailureCode; readonly detail: string | null };

/**
 * The registry's flows, and its agents: a flow step names an agent, and the rules check what
 * it produces. `reload` asks again after a write.
 */
export function useFlowsData(): { readonly state: FlowsState; readonly reload: () => void } {
  const { api } = useDesk();
  const [state, setState] = useState<FlowsState>({ status: "loading" });
  const [round, setRound] = useState(0);
  useEffect(() => {
    let current = true;
    Promise.all([api.flows(), api.agents()]).then(
      ([flows, agents]) => {
        if (current) setState({ status: "ok", flows, agents });
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
