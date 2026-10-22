import type { FlowList } from "@repo/desk/contracts";
import { useEffect, useState } from "react";

import { toApiError, type FailureCode } from "../api/api.client";
import { useDesk } from "../state/desk.provider";

export type FlowListState =
  | { readonly status: "loading" }
  | { readonly status: "ok"; readonly list: FlowList }
  | { readonly status: "error"; readonly code: FailureCode; readonly detail: string | null };

/** The registry's flows. It loads each time `active` turns true, so an edit shows on the next open. */
export function useFlowList(active: boolean): FlowListState {
  const { api } = useDesk();
  const [state, setState] = useState<FlowListState>({ status: "loading" });
  useEffect(() => {
    if (!active) return;
    let current = true;
    setState({ status: "loading" });
    api.flows().then(
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
  }, [active, api]);
  return state;
}
