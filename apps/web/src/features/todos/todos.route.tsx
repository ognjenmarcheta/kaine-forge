import {
  Button,
  Checkbox,
  ConfigFormModal,
  Field,
  FieldError,
  FieldLabel,
  FormModal,
  Input,
  Textarea,
  useUiForm,
  type SimpleFieldConfig,
  type SimpleFormValues
} from "@repo/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { TodoCreateDialog } from "./components/todo-create-dialog";
import { TodoEditDialog } from "./components/todo-edit-dialog";
import { TodoList } from "./components/todo-list";
import { TODOS_CONFIG } from "./todos.config";
import type { TodoDraft, TodoItem } from "./todos.type";
import { toCreatePayload, toUpdatePayload } from "./todos.util";
import { ConfirmDialog } from "../../components/confirm-dialog";
import {
  useCreateTodoMutation,
  useDeleteTodoMutation,
  useGetTodosQuery,
  useToggleTodoMutation,
  useUpdateTodoMutation
} from "../../graphql/generated/react-query";
import { useOrganization } from "../../hooks/use-organization";
import { useTranslation } from "../../hooks/use-translation";

interface TodoExampleDraft {
  description: string;
  markCompleted: boolean;
  planningNotes: string;
  title: string;
}

export function TodosRoute() {
  const { t } = useTranslation();
  const { activeOrganizationId, isLoading: isOrganizationLoading } = useOrganization();
  const queryClient = useQueryClient();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<TodoItem | null>(null);
  const [deletingTodoId, setDeletingTodoId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSimpleExampleOpen, setIsSimpleExampleOpen] = useState(false);
  const [isSimpleExampleSubmitting, setIsSimpleExampleSubmitting] = useState(false);
  const [isAdvancedExampleOpen, setIsAdvancedExampleOpen] = useState(false);

  const listVariables = useMemo(
    () => ({
      limit: TODOS_CONFIG.pageSize,
      offset: 0
    }),
    []
  );
  const todosQueryKey = useMemo(
    () =>
      activeOrganizationId
        ? [...useGetTodosQuery.getKey(listVariables), activeOrganizationId]
        : ["GetTodos", "inactive"],
    [activeOrganizationId, listVariables]
  );

  const todosQuery = useGetTodosQuery(listVariables, {
    queryKey: todosQueryKey,
    enabled: Boolean(activeOrganizationId) && !isOrganizationLoading
  });

  const createMutation = useCreateTodoMutation();
  const updateMutation = useUpdateTodoMutation();
  const deleteMutation = useDeleteTodoMutation();
  const toggleMutation = useToggleTodoMutation();

  const simpleExampleFields = useMemo<SimpleFieldConfig[]>(
    () => [
      {
        label: t("todos.examples.simple.title"),
        name: "title",
        required: true,
        type: "text"
      },
      {
        label: t("todos.examples.simple.description"),
        name: "description",
        type: "textarea"
      },
      {
        label: t("todos.examples.simple.markCompleted"),
        name: "markCompleted",
        type: "checkbox"
      }
    ],
    [t]
  );

  const advancedDefaultValues: TodoExampleDraft = {
    description: "",
    markCompleted: false,
    planningNotes: "",
    title: ""
  };

  const advancedExampleForm = useUiForm({
    defaultValues: advancedDefaultValues,
    onSubmit: async ({ value }) => {
      await createTodoFromDraft(
        {
          description: value.description,
          title: value.title
        },
        value.markCompleted
      );
      setIsAdvancedExampleOpen(false);
    }
  });

  useEffect(() => {
    if (isAdvancedExampleOpen) {
      advancedExampleForm.reset();
    }
  }, [advancedExampleForm, isAdvancedExampleOpen]);

  const invalidateTodos = async (queryKey: readonly unknown[]) => {
    if (!activeOrganizationId) {
      return;
    }

    await queryClient.invalidateQueries({
      queryKey
    });
  };

  const todos = useMemo(() => todosQuery.data?.todos ?? [], [todosQuery.data]);
  const completedCount = useMemo(() => todos.filter((todo) => todo.completed).length, [todos]);
  const completionSummary = `${completedCount.toString()}/${todos.length.toString()} ${t("todos.completed")}`;

  async function createTodoFromDraft(draft: TodoDraft, markCompleted = false) {
    setActionError(null);

    const created = await createMutation.mutateAsync({
      input: toCreatePayload(draft)
    });

    if (markCompleted) {
      await toggleMutation.mutateAsync({
        id: created.createTodo.id
      });
    }

    await invalidateTodos(todosQueryKey);
  }

  async function handleCreate(draft: TodoDraft) {
    try {
      await createTodoFromDraft(draft, false);
    } catch {
      setActionError(t("error.generic"));
    }
  }

  async function handleEdit(draft: TodoDraft) {
    if (!editingTodo) {
      return;
    }

    try {
      setActionError(null);
      await updateMutation.mutateAsync({
        id: editingTodo.id,
        input: toUpdatePayload(draft, editingTodo)
      });
      setEditingTodo(null);
      await invalidateTodos(todosQueryKey);
    } catch {
      setActionError(t("error.generic"));
    }
  }

  function handleDelete(id: string) {
    setDeletingTodoId(id);
  }

  async function confirmDelete() {
    if (!deletingTodoId) {
      return;
    }

    try {
      setActionError(null);
      await deleteMutation.mutateAsync({
        id: deletingTodoId
      });
      setDeletingTodoId(null);
      await invalidateTodos(todosQueryKey);
    } catch {
      setActionError(t("error.generic"));
    }
  }

  async function handleToggle(item: TodoItem) {
    try {
      setActionError(null);
      await toggleMutation.mutateAsync({
        id: item.id
      });
      await invalidateTodos(todosQueryKey);
    } catch {
      setActionError(t("error.generic"));
    }
  }

  const isLoading = isOrganizationLoading || todosQuery.status === "pending";
  const error = actionError ?? (todosQuery.error ? t("error.generic") : null);

  return (
    <section className="grid gap-[var(--ds-space-200)]">
      <header className="flex items-center justify-between gap-[var(--ds-space-150)]">
        <div>
          <h1>{t("todos.title")}</h1>
          <p className="text-[color:var(--ds-text-subtle)]">{completionSummary}</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>{t("todos.create")}</Button>
      </header>

      <section className="flex flex-col gap-[var(--ds-space-150)] rounded-[var(--ds-radius-300)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-[var(--ds-space-200)]">
        <h2>{t("todos.examples.title")}</h2>
        <p className="m-0 text-[color:var(--ds-text-subtle)]">{t("todos.examples.description")}</p>
        <div className="flex flex-wrap gap-[var(--ds-space-150)]">
          <Button appearance="subtle" type="button" onClick={() => setIsSimpleExampleOpen(true)}>
            {t("todos.examples.simple.open")}
          </Button>
          <Button appearance="subtle" type="button" onClick={() => setIsAdvancedExampleOpen(true)}>
            {t("todos.examples.advanced.open")}
          </Button>
        </div>
      </section>

      {isLoading ? (
        <p className="text-[color:var(--ds-text-subtle)]">{t("todos.loading")}</p>
      ) : null}
      {error ? <FieldError>{error}</FieldError> : null}
      {!isLoading ? (
        <TodoList
          items={todos}
          onDelete={handleDelete}
          onEdit={(item) => setEditingTodo(item)}
          onToggle={handleToggle}
        />
      ) : null}

      <TodoCreateDialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={handleCreate}
      />
      <TodoEditDialog
        isOpen={Boolean(editingTodo)}
        todo={editingTodo}
        onClose={() => setEditingTodo(null)}
        onSubmit={handleEdit}
      />
      <ConfirmDialog
        cancelLabel={t("button.cancel")}
        confirmLabel={t("button.delete")}
        isConfirming={deleteMutation.status === "pending"}
        isOpen={Boolean(deletingTodoId)}
        message={t("todos.deleteConfirmMessage")}
        title={t("todos.deleteConfirmTitle")}
        onCancel={() => setDeletingTodoId(null)}
        onConfirm={() => {
          void confirmDelete();
        }}
      />
      <ConfigFormModal
        cancelLabel={t("button.cancel")}
        defaultValues={{
          description: "",
          markCompleted: false,
          title: ""
        }}
        description={t("todos.examples.simple.descriptionText")}
        fields={simpleExampleFields}
        isSubmitting={isSimpleExampleSubmitting}
        open={isSimpleExampleOpen}
        submitLabel={t("todos.examples.simple.submit")}
        title={t("todos.examples.simple.modalTitle")}
        onOpenChange={(open) => {
          if (!open) {
            setIsSimpleExampleOpen(false);
          }
        }}
        onSubmit={async (values: SimpleFormValues) => {
          const title = typeof values.title === "string" ? values.title : "";
          const description = typeof values.description === "string" ? values.description : "";
          const markCompleted = values.markCompleted === true;

          try {
            setIsSimpleExampleSubmitting(true);
            await createTodoFromDraft(
              {
                description,
                title
              },
              markCompleted
            );
            setIsSimpleExampleOpen(false);
          } catch {
            setActionError(t("error.generic"));
          } finally {
            setIsSimpleExampleSubmitting(false);
          }
        }}
      />
      <FormModal
        cancelLabel={t("button.cancel")}
        description={t("todos.examples.advanced.descriptionText")}
        isSubmitting={createMutation.status === "pending" || toggleMutation.status === "pending"}
        open={isAdvancedExampleOpen}
        submitLabel={t("todos.examples.advanced.submit")}
        title={t("todos.examples.advanced.modalTitle")}
        onOpenChange={(open) => {
          if (!open) {
            setIsAdvancedExampleOpen(false);
          }
        }}
        onSubmit={() => advancedExampleForm.handleSubmit()}
      >
        <advancedExampleForm.Field
          name="title"
          validators={{
            onChange: ({ value }) =>
              value.trim().length > 0 ? undefined : t("todos.examples.error.titleRequired")
          }}
        >
          {(fieldApi) => (
            <Field>
              <FieldLabel htmlFor="advanced-example-title">
                {t("todos.examples.advanced.title")}
              </FieldLabel>
              <Input
                id="advanced-example-title"
                value={fieldApi.state.value}
                onBlur={fieldApi.handleBlur}
                onChange={(event) => fieldApi.handleChange(event.target.value)}
              />
              {fieldApi.state.meta.isTouched && fieldApi.state.meta.errors[0] ? (
                <FieldError>{String(fieldApi.state.meta.errors[0])}</FieldError>
              ) : null}
            </Field>
          )}
        </advancedExampleForm.Field>
        <div className="grid grid-cols-1 gap-[var(--ds-space-150)] md:grid-cols-2">
          <advancedExampleForm.Field name="description">
            {(fieldApi) => (
              <Field>
                <FieldLabel htmlFor="advanced-example-description">
                  {t("todos.examples.advanced.description")}
                </FieldLabel>
                <Textarea
                  id="advanced-example-description"
                  value={fieldApi.state.value}
                  onBlur={fieldApi.handleBlur}
                  onChange={(event) => fieldApi.handleChange(event.target.value)}
                />
              </Field>
            )}
          </advancedExampleForm.Field>
          <advancedExampleForm.Field name="planningNotes">
            {(fieldApi) => (
              <Field>
                <FieldLabel htmlFor="advanced-example-notes">
                  {t("todos.examples.advanced.notes")}
                </FieldLabel>
                <Textarea
                  id="advanced-example-notes"
                  value={fieldApi.state.value}
                  onBlur={fieldApi.handleBlur}
                  onChange={(event) => fieldApi.handleChange(event.target.value)}
                />
              </Field>
            )}
          </advancedExampleForm.Field>
        </div>
        <advancedExampleForm.Field name="markCompleted">
          {(fieldApi) => (
            <label
              className="flex items-center gap-[var(--ds-space-100)]"
              htmlFor="advanced-example-complete"
            >
              <Checkbox
                checked={fieldApi.state.value}
                id="advanced-example-complete"
                onBlur={fieldApi.handleBlur}
                onCheckedChange={(checked) => fieldApi.handleChange(checked === true)}
              />
              <span>{t("todos.examples.advanced.markCompleted")}</span>
            </label>
          )}
        </advancedExampleForm.Field>
      </FormModal>
    </section>
  );
}
