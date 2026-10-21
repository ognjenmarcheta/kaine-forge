import { useCallback, useEffect, useState } from "react";
import { z } from "zod";

const storageKey = (issueNumber: number): string => `kaine-desk-viewed-${String(issueNumber)}`;

const storedSchema = z.object({ diff: z.string(), paths: z.array(z.string()) });

/** Storage can throw (private windows, blocked site data). Viewed marks are a convenience. */
function read(issueNumber: number, diff: string): ReadonlySet<string> {
  try {
    const raw = localStorage.getItem(storageKey(issueNumber));
    if (raw === null) return new Set();
    const stored = storedSchema.safeParse(JSON.parse(raw));
    return stored.success && stored.data.diff === diff ? new Set(stored.data.paths) : new Set();
  } catch {
    return new Set();
  }
}

function write(issueNumber: number, diff: string, paths: ReadonlySet<string>): void {
  try {
    localStorage.setItem(storageKey(issueNumber), JSON.stringify({ diff, paths: [...paths] }));
  } catch {
    // The marks stay for this page only.
  }
}

export interface ViewedFiles {
  readonly viewed: ReadonlySet<string>;
  readonly setViewed: (path: string, viewed: boolean) => void;
}

/**
 * The files the owner marked as viewed in this version of the diff. A new diff (another build)
 * starts with no marks: what was read is not what ships now.
 */
export function useViewedFiles(issueNumber: number, diff: string): ViewedFiles {
  const key = `${String(issueNumber)}|${diff}`;
  const [state, setState] = useState(() => ({ key, viewed: read(issueNumber, diff) }));
  const current = state.key === key ? state.viewed : null;

  useEffect(() => {
    if (current === null) setState({ key, viewed: read(issueNumber, diff) });
  }, [current, key, diff, issueNumber]);

  const setViewed = useCallback(
    (path: string, viewed: boolean): void => {
      setState((was) => {
        const next = new Set(was.key === key ? was.viewed : read(issueNumber, diff));
        if (viewed) next.add(path);
        else next.delete(path);
        write(issueNumber, diff, next);
        return { key, viewed: next };
      });
    },
    [key, diff, issueNumber]
  );

  return { viewed: current ?? read(issueNumber, diff), setViewed };
}
