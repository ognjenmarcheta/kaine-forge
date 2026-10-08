import type { ArtifactId } from "@repo/desk/contracts";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";

import { toApiError, type DeskApi, type FailureCode } from "../api/api.client";
import { useDesk } from "../state/desk.provider";

export type ArtifactState<T> =
  | { readonly status: "loading" }
  /** The issue has not written this file yet. */
  | { readonly status: "missing" }
  | { readonly status: "error"; readonly code: FailureCode; readonly detail: string | null }
  | { readonly status: "ok"; readonly value: T };

function useArtifactLoad<T>(
  key: string,
  enabled: boolean,
  load: (api: DeskApi) => Promise<T>
): ArtifactState<T> {
  const { api } = useDesk();
  const [state, setState] = useState<ArtifactState<T>>({ status: "loading" });
  const loader = useRef(load);
  useEffect(() => {
    loader.current = load;
  });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // Keep the last value on screen while a newer one loads.
    setState((current) => (current.status === "ok" ? current : { status: "loading" }));
    loader
      .current(api)
      .then((value) => {
        if (!cancelled) setState({ status: "ok", value });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const failure = toApiError(error);
        setState(
          failure.code === "artifact-missing"
            ? { status: "missing" }
            : { status: "error", code: failure.code, detail: failure.detail }
        );
      });
    return () => {
      cancelled = true;
    };
  }, [api, key, enabled]);
  return state;
}

/** Read a JSON artifact and validate it with its contract. `revision` reloads it when the issue changes. */
export function useJsonArtifact<T>(
  issueNumber: number,
  id: ArtifactId,
  schema: z.ZodType<T>,
  revision: string,
  enabled = true
): ArtifactState<T> {
  return useArtifactLoad(`${String(issueNumber)}|${id}|${revision}`, enabled, (api) =>
    api.artifactJson(issueNumber, id, schema)
  );
}

/** Read a text artifact (the ticket, the diff). The text is shown escaped. */
export function useTextArtifact(
  issueNumber: number,
  id: ArtifactId,
  revision: string,
  enabled = true
): ArtifactState<string> {
  return useArtifactLoad(`${String(issueNumber)}|${id}|${revision}`, enabled, (api) =>
    api.artifactText(issueNumber, id)
  );
}
