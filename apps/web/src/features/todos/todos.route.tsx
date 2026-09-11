import { createActiveOrganizationQueryKey } from "@repo/query";
import { createTodoClientWorkflow } from "@repo/todos";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { TodoCreateDialog } from "./components/todo-create-dialog";
import { TodoEditDialog } from "./components/todo-edit-dialog";
import { TodoList } from "./components/todo-list";
import { TODOS_CONFIG } from "./todos.config";
import type { TodoDraft, TodoItem } from "./todos.type";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { LoadingRows } from "../../components/loading-rows";
import {
  useCreateTodoMutation,
  useDeleteTodoMutation,
  useGenerateTodosMutation,
  useGetTodosQuery,
  useToggleTodoMutation,
  useUpdateTodoMutation
} from "../../graphql/generated/react-query";
import { useOrganization } from "../../hooks/use-organization";
import { useSubscription } from "../../hooks/use-subscription";
import { useTranslation } from "../../hooks/use-translation";
import { queryRuntime } from "../../lib/query-runtime";

queryRuntime.registerOrgScopedOperation("todos.web.list", useGetTodosQuery.getKey());

interface TodoExampleDraft {
  description: string;
  markCompleted: boolean;
  planningNotes: string;
  title: string;
}

interface TodoWorkflowResult {
  id: string;
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
  const [aiPrompt, setAiPrompt] = useState("");
  const [isAiOpen, setIsAiOpen] = useState(false);

  const listVariables = useMemo(
    () => ({
      limit: TODOS_CONFIG.pageSize,
      offset: 0
    }),
    []
  );
  const todosQueryKey = useMemo(
    () =>
      createActiveOrganizationQueryKey(
        useGetTodosQuery.getKey(listVariables),
        activeOrganizationId
      ),
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
  const generateTodosMutation = useGenerateTodosMutation();

  const subscriptionEnabled = Boolean(activeOrganizationId) && !isOrganizationLoading;

  useSubscription({
    query: "subscription { todoCreated { id } }",
    enabled: subscriptionEnabled,
    invalidateKeys: [todosQueryKey]
  });

  useSubscription({
    query: "subscription { todoUpdated { id } }",
    enabled: subscriptionEnabled,
    invalidateKeys: [todosQueryKey]
  });

  useSubscription({
    query: "subscription { todoDeleted { id } }",
    enabled: subscriptionEnabled,
    invalidateKeys: [todosQueryKey]
  });

  useSubscription({
    query: "subscription { todoToggled { id } }",
    enabled: subscriptionEnabled,
    invalidateKeys: [todosQueryKey]
  });

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
      try {
        setActionError(null);
        await createTodoFromDraft(
          {
            description: value.description,
            title: value.title
          },
          value.markCompleted
        );
        setIsAdvancedExampleOpen(false);
      } catch {
        setActionError(t("error.generic"));
      }
    }
  });

  const wasAdvancedOpen = useRef(false);
  useEffect(() => {
    if (isAdvancedExampleOpen && !wasAdvancedOpen.current) {
      advancedExampleForm.reset();
    }
    wasAdvancedOpen.current = isAdvancedExampleOpen;
  }, [advancedExampleForm, isAdvancedExampleOpen]);

  const invalidateTodos = useCallback(async () => {
    if (!activeOrganizationId) {
      return;
    }

    await queryClient.invalidateQueries({
      queryKey: todosQueryKey
    });
  }, [activeOrganizationId, queryClient, todosQueryKey]);

  const todoWorkflow = useMemo(
    () =>
      createTodoClientWorkflow<TodoWorkflowResult>({
        createTodo: async (payload) => {
          const result = await createMutation.mutateAsync({
            input: payload
          });
          return result.createTodo;
        },
        deleteTodo: async (id) => {
          const result = await deleteMutation.mutateAsync({
            id
          });
          return result.deleteTodo;
        },
        getActiveOrganizationId: () => activeOrganizationId,
        invalidateTodos,
        toggleTodo: async (id) => {
          const result = await toggleMutation.mutateAsync({
            id
          });
          return result.toggleTodo;
        },
        updateTodo: async (id, payload) => {
          const result = await updateMutation.mutateAsync({
            id,
            input: payload
          });
          return result.updateTodo;
        }
      }),
    [
      activeOrganizationId,
      createMutation,
      deleteMutation,
      invalidateTodos,
      toggleMutation,
      updateMutation
    ]
  );

  const todos = useMemo(() => todosQuery.data?.todos ?? [], [todosQuery.data]);
  const completedCount = useMemo(() => todos.filter((todo) => todo.completed).length, [todos]);
  const completionSummary = `${completedCount.toString()}/${todos.length.toString()} ${t("todos.completed")}`;

  async function createTodoFromDraft(draft: TodoDraft, markCompleted = false) {
    setActionError(null);

    const created = await todoWorkflow.create({
      draft
    });

    if (markCompleted) {
      await todoWorkflow.toggle({
        id: created.id
      });
    }
  }

  async function handleCreate(draft: TodoDraft) {
    try {
      await createTodoFromDraft(draft, false);
    } catch (error) {
      setActionError(t("error.generic"));
      throw error;
    }
  }

  async function handleEdit(draft: TodoDraft) {
    if (!editingTodo) {
      return;
    }

    try {
      setActionError(null);
      await todoWorkflow.update({
        current: editingTodo,
        draft,
        id: editingTodo.id
      });
      setEditingTodo(null);
    } catch (error) {
      setActionError(t("error.generic"));
      throw error;
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
      await todoWorkflow.delete({
        id: deletingTodoId
      });
      setDeletingTodoId(null);
    } catch {
      setActionError(t("error.generic"));
    }
  }

  async function handleToggle(item: TodoItem) {
    try {
      setActionError(null);
      await todoWorkflow.toggle({
        id: item.id
      });
    } catch {
      setActionError(t("error.generic"));
    }
  }

  async function handleGenerateTodos(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const prompt = aiPrompt.trim();

    if (generateTodosMutation.isPending) return;
    if (prompt.length === 0) {
      toast.error(t("todos.ai.promptRequired"));
      return;
    }

    try {
      setActionError(null);
      const result = await generateTodosMutation.mutateAsync({
        input: {
          prompt
        }
      });

      if (result.generateTodos.status === "AI_NOT_CONFIGURED") {
        toast.error(t("todos.ai.notConfigured"));
        return;
      }

      if (result.generateTodos.status === "CREATED") {
        await invalidateTodos();
        setAiPrompt("");
        setIsAiOpen(false);
        toast.success(t("todos.ai.created"));
        return;
      }

      toast.error(t("todos.ai.failed"));
    } catch {
      toast.error(t("todos.ai.failed"));
      setActionError(t("error.generic"));
    }
  }

  const isLoading = isOrganizationLoading || todosQuery.status === "pending";
  const error = actionError ?? (todosQuery.error ? t("error.generic") : null);

  return (
    <section className="grid gap-[var(--ds-space-200)]">
      <header className="ui-page-header">
        <div>
          <h1>{t("todos.title")}</h1>
          <p className="text-[color:var(--ds-text-subtle)]">{completionSummary}</p>
        </div>
        <div className="ui-toolbar">
          <Button onClick={() => setIsCreateOpen(true)}>{t("todos.create")}</Button>
          <Button appearance="subtle" onClick={() => setIsAiOpen(true)}>
            {t("todos.ai.title")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button appearance="ghost">{t("todos.examples.title")}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setIsSimpleExampleOpen(true)}>
                {t("todos.examples.simple.open")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setIsAdvancedExampleOpen(true)}>
                {t("todos.examples.advanced.open")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <FormModal
        open={isAiOpen}
        onOpenChange={setIsAiOpen}
        title={t("todos.ai.title")}
        description={t("todos.ai.description")}
        closeButtonLabel={t("common.close")}
        cancelLabel={t("button.cancel")}
        isSubmitting={generateTodosMutation.isPending}
        submitLabel={t("todos.ai.submit")}
        submittingLabel={t("todos.ai.generating")}
        onSubmit={handleGenerateTodos}
      >
        <Field>
          <FieldLabel htmlFor="todos-ai-prompt">{t("todos.ai.promptLabel")}</FieldLabel>
          <Textarea
            id="todos-ai-prompt"
            placeholder={t("todos.ai.promptPlaceholder")}
            value={aiPrompt}
            onChange={(event) => setAiPrompt(event.target.value)}
          />
        </Field>
      </FormModal>

      {isLoading ? <LoadingRows label={t("todos.loading")} /> : null}
      {error ? (
        <div role="alert" className="ui-toolbar">
          <FieldError>{error}</FieldError>
          <Button appearance="subtle" onClick={() => void todosQuery.refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      ) : null}
      {!isLoading && !todosQuery.error ? (
        <TodoList
          items={todos}
          onAttachmentChanged={() => {
            void invalidateTodos();
          }}
          onDelete={handleDelete}
          onEdit={(item) => setEditingTodo(item)}
          onToggle={(item) => void handleToggle(item)}
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
        formError={actionError}
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
        {actionError ? <FieldError>{actionError}</FieldError> : null}
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
