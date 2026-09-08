import { expect, test, type Page } from "@playwright/test";

import { NAV_LABELS, signIn } from "./helpers/auth";

const ORG_CREATE_TITLE = /^(Create organization|organizations\.create)$/;
const ORG_NAME_LABEL = /^(Organization name|organizations\.name)$/;
const BUTTON_SAVE = /^(Save|button\.save)$/;
const PERSONAL_ORG_NAME = "Personal";

interface GraphqlResult {
  data: Record<string, unknown> | null;
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Same-origin GraphQL call: `/graphql` resolves against the web baseURL and the
 * Vite proxy forwards it to the API, so the browser context's session cookie
 * rides along and the API sees the same active organization as the UI.
 */
async function graphql(
  page: Page,
  query: string,
  variables: Record<string, unknown>
): Promise<GraphqlResult> {
  const response = await page.request.post("/graphql", { data: { query, variables } });
  expect(response.ok(), `GraphQL HTTP ${String(response.status())}`).toBe(true);

  const payload: unknown = await response.json();
  if (!isRecord(payload)) {
    throw new Error("GraphQL response is not an object");
  }

  const errors = Array.isArray(payload.errors)
    ? payload.errors.map((error: unknown) =>
        isRecord(error) && typeof error.message === "string" ? error.message : String(error)
      )
    : [];

  return { data: isRecord(payload.data) ? payload.data : null, errors };
}

async function selectOrganization(page: Page, name: string): Promise<void> {
  const switcher = page.getByRole("button", { name: NAV_LABELS.organization });
  await switcher.click();
  await expect(page.getByRole("menuitem", { name })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("menuitem", { name }).click();
  await expect(switcher).toContainText(name, { timeout: 10_000 });
}

test("a member of one organization cannot read or mutate another organization's todo", async ({
  page
}) => {
  const suffix = Date.now().toString(36);
  const todoTitle = `Isolation todo ${suffix}`;
  const otherOrgName = `E2E Isolation Org ${suffix}`;

  await signIn(page);
  await selectOrganization(page, PERSONAL_ORG_NAME);

  // Create the todo in the Personal organization.
  const created = await graphql(
    page,
    `
      mutation IsolationCreateTodo($input: CreateTodoInput!) {
        createTodo(input: $input) {
          id
          title
          organizationId
        }
      }
    `,
    { input: { title: todoTitle } }
  );
  expect(created.errors).toEqual([]);
  const createdTodo = created.data?.createTodo;
  if (!isRecord(createdTodo) || typeof createdTodo.id !== "string") {
    throw new Error("createTodo did not return an id");
  }
  const todoId = createdTodo.id;
  const personalOrganizationId = createdTodo.organizationId;

  // Create a second organization and make it the active one.
  const switcher = page.getByRole("button", { name: NAV_LABELS.organization });
  await switcher.click();
  await page.getByRole("menuitem", { name: NAV_LABELS.organizationCreate }).click();
  const dialog = page.getByRole("dialog", { name: ORG_CREATE_TITLE });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(ORG_NAME_LABEL).fill(otherOrgName);
  await dialog.getByRole("button", { name: BUTTON_SAVE }).click();
  await expect(dialog).toHaveCount(0);
  await selectOrganization(page, otherOrgName);

  // Reads: the todo is neither fetchable by id nor listed.
  const read = await graphql(
    page,
    `
      query IsolationRead($id: ID!) {
        todo(id: $id) {
          id
        }
        todos {
          id
          organizationId
        }
      }
    `,
    { id: todoId }
  );
  expect(read.errors).toEqual([]);
  expect(read.data?.todo).toBeNull();
  const listed = Array.isArray(read.data?.todos) ? read.data.todos : [];
  expect(listed.map((todo: unknown) => (isRecord(todo) ? todo.id : todo))).not.toContain(todoId);
  for (const todo of listed) {
    expect(isRecord(todo) ? todo.organizationId : todo).not.toBe(personalOrganizationId);
  }

  // Writes: the resolver scopes by the session's organization and finds nothing.
  const mutated = await graphql(
    page,
    `
      mutation IsolationToggle($id: ID!) {
        toggleTodo(id: $id) {
          id
          completed
        }
      }
    `,
    { id: todoId }
  );
  expect(mutated.data?.toggleTodo ?? null).toBeNull();
  expect(mutated.errors.join("\n")).toMatch(/not found/i);

  // The UI agrees with the API.
  await page.getByRole("link", { name: NAV_LABELS.todos }).click();
  await expect(page).toHaveURL(/\/todos$/);
  await expect(page.getByRole("checkbox", { name: todoTitle })).toHaveCount(0);

  // Positive control: back in the Personal organization the same id resolves,
  // so the null above came from scoping, not from a bad id. Also leaves the
  // shared seeded user on Personal for the other specs.
  await selectOrganization(page, PERSONAL_ORG_NAME);
  const control = await graphql(
    page,
    `
      query IsolationControl($id: ID!) {
        todo(id: $id) {
          id
          organizationId
        }
      }
    `,
    { id: todoId }
  );
  expect(control.errors).toEqual([]);
  const controlTodo = control.data?.todo;
  expect(isRecord(controlTodo) ? controlTodo.id : controlTodo).toBe(todoId);
  expect(isRecord(controlTodo) ? controlTodo.organizationId : controlTodo).toBe(
    personalOrganizationId
  );
});
