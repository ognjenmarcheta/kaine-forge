import { useEffect } from "react";
import { toast } from "sonner";

import { translate } from "../i18n/i18n.t";

/** How long an action waits before it is sent. The toast offers Undo for this time. */
export const UNDO_WINDOW_MS = 8_000;

export interface SendOptions {
  /** The page is closing: the request must outlive it (`fetch` with `keepalive`). */
  readonly keepalive: boolean;
}

export interface UndoableAction<T> {
  /** What will happen, in words ("The plan will be approved."). */
  readonly label: string;
  /** The issues the action touches. The toast names them. */
  readonly issues: readonly number[];
  readonly send: (options: SendOptions) => Promise<T>;
}

export type UndoOutcome<T> =
  { readonly kind: "sent"; readonly value: T } | { readonly kind: "undone" };

/** Actions that wait in their undo window, by toast id. */
const waiting = new Map<string, (keepalive: boolean) => void>();
let nextId = 0;

const titleOf = (issues: readonly number[], label: string): string =>
  issues.length === 0
    ? label
    : translate("desk.toast.title", {
        number: issues.map(String).join(", #"),
        message: label
      });

/**
 * Hold an action for `UNDO_WINDOW_MS`, then send it. Until then a toast shows what will
 * happen and offers Undo; Undo drops the action and nothing reaches the server. Nothing on
 * the page changes before the send: the toast is the only pending state.
 */
export function runUndoable<T>(action: UndoableAction<T>): Promise<UndoOutcome<T>> {
  return new Promise((resolve, reject) => {
    nextId += 1;
    const id = `desk-undo-${String(nextId)}`;
    const fire = (keepalive: boolean): void => {
      if (!waiting.delete(id)) return;
      clearTimeout(timer);
      toast.dismiss(id);
      action.send({ keepalive }).then((value) => resolve({ kind: "sent", value }), reject);
    };
    const timer = setTimeout(() => fire(false), UNDO_WINDOW_MS);
    waiting.set(id, fire);
    toast(titleOf(action.issues, action.label), {
      id,
      duration: UNDO_WINDOW_MS,
      description: translate("desk.undo.pending", { seconds: UNDO_WINDOW_MS / 1000 }),
      action: {
        label: translate("desk.undo.undo"),
        onClick: () => {
          if (!waiting.delete(id)) return;
          clearTimeout(timer);
          resolve({ kind: "undone" });
          toast(translate("desk.undo.undone"));
        }
      }
    });
  });
}

/** Send every waiting action now. The page is closing, so each request uses `keepalive`. */
export function flushUndoable(): void {
  for (const fire of [...waiting.values()]) fire(true);
}

/** A page that closes during an undo window still sends what the person chose. */
export function useFlushUndoOnPageHide(): void {
  useEffect(() => {
    window.addEventListener("pagehide", flushUndoable);
    return () => window.removeEventListener("pagehide", flushUndoable);
  }, []);
}
