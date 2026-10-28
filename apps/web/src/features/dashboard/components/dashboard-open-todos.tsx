import { createActiveOrganizationQueryKey } from "@repo/query";
import { toTodoCreatePayload } from "@repo/todos";
import {
  Button,
  Checkbox,
  EmptyState,
  Field,
  FieldError,
  FieldLabel,
  Input,
  QueryError,
  SettingsSection
} from "@repo/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { LoadingRows } from "../../../components/loading-rows";
import {
  useCreateTodoMutation,
  useGetTodosQuery,
  useTodoCountsQuery,
  useUpdateTodoMutation,
  type GetTodosQuery
} from "../../../graphql/generated/react-query";
import { useTranslation } from "../../../hooks/use-translation";
import { validTodo } from "../../todos/todos.util";

const OPEN_TODOS = { completed: false, first: 5 };

type OpenTodo = GetTodosQuery["todos"]["items"][number];

export function DashboardOpenTodos({
  organizationId,
  enabled
}: {
  organizationId: string | null;
  enabled: boolean;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const queryKey = createActiveOrganizationQueryKey(
    useGetTodosQuery.getKey(OPEN_TODOS),
    organizationId
  );
  const todos = useGetTodosQuery(OPEN_TODOS, { enabled, queryKey });
  const create = useCreateTodoMutation({ retry: false });
  const update = useUpdateTodoMutation({ retry: false });
  const [title, setTitle] = useState("");
  const [toggling, setToggling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const quickInput = useRef<HTMLInputElement>(null);
  const draft = { title, description: "" };

  function refresh() {
    // A confirmed write stays confirmed if the refetch fails.
    void Promise.all([
      client.invalidateQueries({ queryKey: useGetTodosQuery.getKey() }),
      client.invalidateQueries({ queryKey: useTodoCountsQuery.getKey() })
    ]).catch(() => undefined);
  }
  async function add(event: FormEvent) {
    event.preventDefault();
    if (!enabled || !validTodo(draft) || create.isPending) return;
    setError(null);
    try {
      await create.mutateAsync({ input: toTodoCreatePayload(draft) });
      setTitle("");
      refresh();
    } catch {
      setError("todos.createUncertain");
    }
  }
  async function toggle(item: OpenTodo) {
    if (toggling) return;
    setToggling(item.id);
    setError(null);
    try {
      const result = await update.mutateAsync({
        id: item.id,
        input: { completed: !item.completed }
      });
      // Show the confirmed state until the refetch drops the completed row.
      client.setQueryData<GetTodosQuery>(queryKey, (data) =>
        data
          ? {
              todos: {
                ...data.todos,
                items: data.todos.items.map((row) =>
                  row.id === item.id ? { ...row, completed: result.updateTodo.completed } : row
                )
              }
            }
          : data
      );
      refresh();
    } catch {
      setError("todos.actionFailed");
    } finally {
      setToggling(null);
    }
  }

  const items = todos.data?.todos.items ?? [];

  return (
    <SettingsSection
      title={t("dashboard.todos.title")}
      actions={
        <Button asChild appearance="link">
          <Link to="/todos">{t("dashboard.todos.viewAll")}</Link>
        </Button>
      }
    >
      <form className="ui-dashboard__quick" onSubmit={(event) => void add(event)}>
        <Field>
          <FieldLabel htmlFor="dashboard-quick-todo">{t("todos.quickTitle")}</FieldLabel>
          <Input
            ref={quickInput}
            id="dashboard-quick-todo"
            value={title}
            disabled={!enabled || create.isPending}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        <Button type="submit" disabled={!enabled || !validTodo(draft) || create.isPending}>
          {t(create.isPending ? "todos.saving" : "todos.add")}
        </Button>
      </form>
      {error ? <FieldError>{t(error)}</FieldError> : null}
      {todos.isPending ? <LoadingRows label={t("dashboard.todos.loading")} /> : null}
      {todos.isError ? (
        <QueryError
          message={t("dashboard.todos.error")}
          retryLabel={t("common.retry")}
          onRetry={() => void todos.refetch()}
        />
      ) : null}
      {todos.isSuccess && items.length === 0 ? (
        <EmptyState
          title={t("dashboard.todos.empty")}
          description={t("dashboard.todos.emptyDescription")}
          action={
            <Button type="button" onClick={() => quickInput.current?.focus()}>
              {t("dashboard.todos.addFirst")}
            </Button>
          }
        />
      ) : null}
      {items.length > 0 ? (
        <ul className="ui-work-list">
          {items.map((item) => (
            <li key={item.id} className="ui-work-row ui-dashboard__row">
              <Checkbox
                aria-label={item.title}
                checked={item.completed}
                disabled={toggling !== null}
                onCheckedChange={() => void toggle(item)}
              />
              <Link className="ui-dashboard__row-title" to="/todos">
                {item.title}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </SettingsSection>
  );
}
