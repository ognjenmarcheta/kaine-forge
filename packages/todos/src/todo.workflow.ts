export interface TodoDraft {
  description: string;
  title: string;
}

export interface TodoCompletionState {
  completed: boolean;
}

export interface TodoCreatePayload {
  description: string | null;
  title: string;
}

export interface TodoUpdatePayload extends TodoCreatePayload {
  completed: boolean;
}

function normalizedDescription(description: string): string | null {
  const trimmed = description.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function toTodoCreatePayload(draft: TodoDraft): TodoCreatePayload {
  return {
    description: normalizedDescription(draft.description),
    title: draft.title.trim()
  };
}

export function toTodoUpdatePayload(
  draft: TodoDraft,
  current: TodoCompletionState
): TodoUpdatePayload {
  return {
    ...toTodoCreatePayload(draft),
    completed: current.completed
  };
}

export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) {
    return `${String(bytes)} B`;
  }

  const kilobytes = bytes / 1024;

  if (kilobytes < 1024) {
    return `${Number(kilobytes.toFixed(1)).toString()} KB`;
  }

  const megabytes = kilobytes / 1024;
  return `${Number(megabytes.toFixed(1)).toString()} MB`;
}
