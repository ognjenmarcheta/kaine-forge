import { expect, test } from "@playwright/test";

import { NAV_LABELS, signIn } from "./helpers/auth";
import {
  createOrganization,
  graphql,
  isRecord,
  PERSONAL_ORG_NAME,
  selectOrganization
} from "./helpers/organizations";

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
  await createOrganization(page, otherOrgName);
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

test("a member of one organization cannot read or mutate another organization's note", async ({
  page
}) => {
  const suffix = Date.now().toString(36);
  const noteTitle = `Isolation note ${suffix}`;
  const otherOrgName = `E2E Isolation Notes Org ${suffix}`;

  await signIn(page);
  await selectOrganization(page, PERSONAL_ORG_NAME);

  // Create the note in the Personal organization.
  const created = await graphql(
    page,
    `
      mutation IsolationCreateNote($input: CreateNoteInput!) {
        createNote(input: $input) {
          id
          title
          organizationId
        }
      }
    `,
    { input: { title: noteTitle, body: "Scoped to Personal" } }
  );
  expect(created.errors).toEqual([]);
  const createdNote = created.data?.createNote;
  if (!isRecord(createdNote) || typeof createdNote.id !== "string") {
    throw new Error("createNote did not return an id");
  }
  const noteId = createdNote.id;
  const personalOrganizationId = createdNote.organizationId;

  await createOrganization(page, otherOrgName);
  await selectOrganization(page, otherOrgName);

  // Reads: the note is not fetchable by id, not in the unfiltered list, and not
  // found by searching for its title.
  const read = await graphql(
    page,
    `
      query IsolationReadNote($id: ID!, $search: String) {
        note(id: $id) {
          id
        }
        listed: notes {
          id
          organizationId
        }
        searched: notes(search: $search) {
          id
          organizationId
        }
      }
    `,
    { id: noteId, search: noteTitle }
  );
  expect(read.errors).toEqual([]);
  expect(read.data?.note).toBeNull();
  for (const key of ["listed", "searched"]) {
    const rows = Array.isArray(read.data?.[key]) ? read.data[key] : [];
    expect(
      rows.map((note: unknown) => (isRecord(note) ? note.id : note)),
      key
    ).not.toContain(noteId);
    for (const note of rows) {
      expect(isRecord(note) ? note.organizationId : note, key).not.toBe(personalOrganizationId);
    }
  }

  // Writes: updateNote scopes by the session's organization and finds nothing.
  const mutated = await graphql(
    page,
    `
      mutation IsolationUpdateNote($id: ID!, $input: UpdateNoteInput!) {
        updateNote(id: $id, input: $input) {
          id
          title
        }
      }
    `,
    { id: noteId, input: { title: `${noteTitle} edited` } }
  );
  expect(mutated.data?.updateNote ?? null).toBeNull();
  expect(mutated.errors.join("\n")).toMatch(/not found/i);

  // The UI agrees with the API.
  await page.getByRole("link", { name: NAV_LABELS.notes }).click();
  await expect(page).toHaveURL(/\/notes$/);
  // The new organization has no notes, so its empty state proves the list
  // finished loading; only then is the absence check meaningful.
  await expect(page.getByText(/^(No notes yet\.|notes\.empty)$/)).toBeVisible();
  await expect(page.getByRole("status", { name: /^(Loading…|notes\.loading)$/ })).toHaveCount(0);
  await expect(page.getByText(noteTitle)).toHaveCount(0);

  // Positive control, and back on Personal for the other specs.
  await selectOrganization(page, PERSONAL_ORG_NAME);
  const control = await graphql(
    page,
    `
      query IsolationControlNote($id: ID!) {
        note(id: $id) {
          id
          title
          organizationId
        }
      }
    `,
    { id: noteId }
  );
  expect(control.errors).toEqual([]);
  const controlNote = control.data?.note;
  expect(isRecord(controlNote) ? controlNote.id : controlNote).toBe(noteId);
  expect(isRecord(controlNote) ? controlNote.title : controlNote).toBe(noteTitle);
  expect(isRecord(controlNote) ? controlNote.organizationId : controlNote).toBe(
    personalOrganizationId
  );
});
