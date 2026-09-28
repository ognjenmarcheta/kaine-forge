import { z } from "zod";

import { actionSchema, stateSchema, type ActionRequest } from "./factory.contract";

const worktreeIdSchema = z.string().regex(/^[a-f0-9]{24}$/);
const runIdSchema = z.string().uuid();
const locationSchema = z
  .object({ runId: runIdSchema.nullable(), worktree: worktreeIdSchema.or(z.literal("")) })
  .refine(({ runId, worktree }) => runId === null || worktree !== "");

export function dashboardLocation(search: string) {
  const params = new URLSearchParams(search);
  return locationSchema.safeParse({
    runId: params.get("run"),
    worktree: params.get("worktree") ?? ""
  });
}
export function runRequestUrl(worktree: string | undefined, run: string): string {
  return `/api/worktrees/${encodeURIComponent(worktreeIdSchema.parse(worktree))}/runs/${encodeURIComponent(runIdSchema.parse(run))}`;
}
export function artifactRequestUrl(
  worktree: string | undefined,
  run: string,
  artifact: string
): string {
  return `/api/worktrees/${encodeURIComponent(worktreeIdSchema.parse(worktree))}/artifacts/${encodeURIComponent(runIdSchema.parse(run))}/${encodeURIComponent(runIdSchema.parse(artifact))}`;
}

export async function api<T>(url: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "same-origin" });
  const value: unknown = await response.json();
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(value);
    throw new Error(error.success ? error.data.error : `HTTP ${response.status}`);
  }
  return schema.parse(value);
}
export function act(request: ActionRequest) {
  return api("/api/actions", actionSchema, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request)
  });
}
let session: Promise<void> | undefined;
export function bootstrap(): Promise<void> {
  if (!session)
    session = (async () => {
      const token = new URLSearchParams(location.hash.slice(1)).get("session");
      if (!token) return;
      try {
        await api("/api/session", z.object({ ok: z.boolean() }), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token })
        });
      } catch {
        // Another tab can consume the one-use token while sharing an already valid cookie.
        await api("/api/state", stateSchema);
      }
      history.replaceState(null, "", location.pathname + location.search);
    })().catch((error: Error) => {
      session = undefined;
      throw error;
    });
  return session;
}
