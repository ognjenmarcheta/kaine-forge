import type { IssueDetail, IssueSummary } from "@repo/desk/contracts";
import { useEffect, useState } from "react";

import { toApiError, type FailureCode } from "../api/api.client";
import { useDesk } from "../state/desk.provider";
import { revisionOf } from "../state/desk.store";

export interface IssueDetailState {
  readonly summary: IssueSummary | undefined;
  /** The newest detail the page has. It may be one revision behind while a newer one loads. */
  readonly detail: IssueDetail | undefined;
  /** The revision of `summary`. Artifact hooks reload when it changes. */
  readonly revision: string;
  readonly error: { readonly code: FailureCode; readonly detail: string | null } | null;
}

/**
 * The issue detail, kept in step with the summary: when the summary changes (an event
 * or a reload) the detail loads again. The store holds one copy for each issue number.
 */
export function useIssueDetail(issueNumber: number): IssueDetailState {
  const { state, loadDetail } = useDesk();
  const summary = state.issues[issueNumber];
  const entry = state.details[issueNumber];
  const revision = summary === undefined ? "" : revisionOf(summary);
  const [error, setError] = useState<IssueDetailState["error"]>(null);

  const stale = summary?.readable === true && entry?.revision !== revision;
  useEffect(() => {
    if (!stale) return;
    let cancelled = false;
    loadDetail(issueNumber)
      .then(() => {
        if (!cancelled) setError(null);
      })
      .catch((failure: unknown) => {
        if (cancelled) return;
        const converted = toApiError(failure);
        setError({ code: converted.code, detail: converted.detail });
      });
    return () => {
      cancelled = true;
    };
  }, [stale, revision, issueNumber, loadDetail]);

  return {
    summary,
    detail: entry?.detail,
    revision,
    error
  };
}
