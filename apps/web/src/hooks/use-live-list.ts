import { useSubscription } from "./use-subscription";
import {
  OnNoteCreatedDocument,
  OnNoteDeletedDocument,
  OnNoteUpdatedDocument,
  OnTodoCreatedDocument,
  OnTodoDeletedDocument,
  OnTodoToggledDocument,
  OnTodoUpdatedDocument
} from "../graphql/generated/graphql";

interface LiveListOptions {
  enabled: boolean;
  /** Query keys to refetch after any event of the entity kind. */
  invalidateKeys: readonly (readonly unknown[])[];
  /** Runs with the deleted row's id after a delete event. */
  onDeleted?: (id: string) => void;
  /** Runs after any event of the entity kind, for example to start a sync pull. */
  onEvent?: () => void;
}

/** Keeps Todo queries fresh: refetches on every Todo event of the Active Organization. */
export function useLiveTodos({
  enabled,
  invalidateKeys,
  onDeleted,
  onEvent
}: LiveListOptions): void {
  const onData = () => onEvent?.();
  useSubscription({ query: OnTodoCreatedDocument, enabled, invalidateKeys, onData });
  useSubscription({ query: OnTodoUpdatedDocument, enabled, invalidateKeys, onData });
  useSubscription({ query: OnTodoToggledDocument, enabled, invalidateKeys, onData });
  useSubscription({
    query: OnTodoDeletedDocument,
    enabled,
    invalidateKeys,
    onData: ({ todoDeleted }) => {
      onDeleted?.(todoDeleted.id);
      onEvent?.();
    }
  });
}

/** Keeps Note queries fresh: refetches on every Note event of the Active Organization. */
export function useLiveNotes({ enabled, invalidateKeys, onDeleted }: LiveListOptions): void {
  useSubscription({ query: OnNoteCreatedDocument, enabled, invalidateKeys });
  useSubscription({ query: OnNoteUpdatedDocument, enabled, invalidateKeys });
  useSubscription({
    query: OnNoteDeletedDocument,
    enabled,
    invalidateKeys,
    onData: ({ noteDeleted }) => onDeleted?.(noteDeleted.id)
  });
}
