import { Button, Input, Textarea } from "@repo/ui";
import { useEffect, useState, type FormEvent } from "react";

import type { TodoDraft, TodoItem } from "../todos.type";

interface TodoEditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (draft: TodoDraft) => Promise<void>;
  todo: TodoItem | null;
}

export function TodoEditDialog({ isOpen, onClose, onSubmit, todo }: TodoEditDialogProps) {
  const [draft, setDraft] = useState<TodoDraft>({
    description: "",
    title: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setDraft({
      description: todo?.description ?? "",
      title: todo?.title ?? ""
    });
  }, [todo]);

  if (!isOpen || !todo) {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSubmitting(true);
    await onSubmit(draft);
    setIsSubmitting(false);
    onClose();
  }

  return (
    <div className="web-dialog-backdrop" role="presentation">
      <section aria-label="Edit todo" className="web-dialog">
        <h2>Edit todo</h2>
        <form className="web-form" onSubmit={handleSubmit}>
          <label className="web-form__field">
            <span>Title</span>
            <Input
              required
              value={draft.title}
              onChange={(event) =>
                setDraft((state) => ({
                  ...state,
                  title: event.target.value
                }))
              }
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
              Save
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
