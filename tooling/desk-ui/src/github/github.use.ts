import type { GithubLists } from "@repo/desk/contracts";
import { useCallback, useEffect, useState } from "react";

import { toApiError, type FailureCode } from "../api/api.client";
import { useDesk } from "../state/desk.provider";

export type GithubListsState =
  | { readonly status: "loading" }
  /** The server answered. `lists.ok` is false when `gh` could not list the work. */
  | { readonly status: "ok"; readonly lists: GithubLists }
  | { readonly status: "error"; readonly code: FailureCode; readonly detail: string | null };

/**
 * The open issues and pull requests of the repository. It loads while `active` is true and
 * again on `reload`; `reload(true)` asks GitHub again instead of the server's minute-old list.
 */
export function useGithubLists(active: boolean): {
  readonly state: GithubListsState;
  readonly reload: (refresh: boolean) => void;
} {
  const { api } = useDesk();
  const [state, setState] = useState<GithubListsState>({ status: "loading" });

  const reload = useCallback(
    (refresh: boolean): void => {
      setState({ status: "loading" });
      api.github(refresh).then(
        (lists) => setState({ status: "ok", lists }),
        (failure: unknown) => {
          const converted = toApiError(failure);
          setState({ status: "error", code: converted.code, detail: converted.detail });
        }
      );
    },
    [api]
  );

  useEffect(() => {
    if (active) reload(false);
  }, [active, reload]);

  return { state, reload };
}
