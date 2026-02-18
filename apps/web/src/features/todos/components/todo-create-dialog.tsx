import { Button, Input, Textarea } from "@repo/ui";
import { useState, type FormEvent } from "react";

import { TODO_DEFINITION } from "../todos.definition";
import type { TodoDraft } from "../todos.type";

interface TodoCreateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (draft: TodoDraft) => Promise<void>;
}

export function TodoCreateDialog({ isOpen, onClose, onSubmit }: TodoCreateDialogProps) {
  const [draft, setDraft] = useState<TodoDraft>(TODO_DEFINITION.emptyDraft);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSubmitting(true);
    await onSubmit(draft);
    setDraft(TODO_DEFINITION.emptyDraft);
    setIsSubmitting(false);
    onClose();
  }

  return (
    <div className="web-dialog-backdrop" role="presentation">
      <section aria-label="Create todo" className="web-dialog">
        <h2>New todo</h2>
        <form className="web-form" onSubmit={handleSubmit}>
          <label className="web-form__field">
            <span>Title</span>
            <Input
              required
              value={draft.title}
              onChange={(event) => setDraft((state) => ({ ...state, title: event.target.value }))}
            />
          </label>
          <label className="web-form__field">
            <span>Description</span>
            <Textarea
              value={draft.description}
              onChange={(event) =>
                setDraft((state) => ({
                  ...state,
                  description: event.target.value
                }))
              }
            />
          </label>
          <div className="web-form__row">
            <Button intent="subtle" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={isSubmitting} type="submit">
              Create
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
