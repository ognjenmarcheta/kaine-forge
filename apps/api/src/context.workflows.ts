import type { ScopedData } from "./context.data";
import { createNote, deleteNote, updateNote } from "./features/notes/notes.adapter";
import { createNoteWorkflow } from "./features/notes/notes.workflow";
import type { PubSubEventMap } from "./pubsub";

export interface ApiWorkflowDeps {
  data: ScopedData;
  publish: <TEventName extends keyof PubSubEventMap>(
    eventName: TEventName,
    ...payload: PubSubEventMap[TEventName]
  ) => void;
}

export interface ApiWorkflows {
  note: ReturnType<typeof createNoteWorkflow>;
}

/**
 * Note writes that must honour a domain guard go through here, built per
 * request like `context.loaders.ts`. Todo writes go through `ctx.todos`
 * (`features/todos/todos.module.ts`).
 */
export function createApiWorkflows({ data, publish }: ApiWorkflowDeps): ApiWorkflows {
  return {
    note: createNoteWorkflow({
      createNote: (_scope, input) => createNote(data, input),
      deleteNote: (_scope, id) => deleteNote(data, id),
      publishNoteEvent: publish,
      updateNote: (_scope, id, patch) => updateNote(data, id, patch)
    })
  };
}
