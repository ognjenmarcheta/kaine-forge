import { expect, type Page } from "@playwright/test";

import { NAV_LABELS } from "./auth";

export const PERSONAL_ORG_NAME = "Personal";

const ORG_CREATE_TITLE = /^(Create organization|organizations\.create)$/;
const ORG_NAME_LABEL = /^(Organization name|organizations\.name)$/;
const BUTTON_SAVE = /^(Save|button\.save)$/;

export interface GraphqlResult {
  data: Record<string, unknown> | null;
  errors: string[];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Same-origin GraphQL call: `/graphql` resolves against the web baseURL and the
 * Vite proxy forwards it to the API, so the browser context's session cookie
 * rides along and the API sees the same active organization as the UI.
 */
export async function graphql(
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

/** Pick an organization in the sidebar switcher and wait until it is active. */
export async function selectOrganization(page: Page, name: string): Promise<void> {
  const switcher = page.getByRole("button", { name: NAV_LABELS.organization });
  await switcher.click();
  await expect(page.getByRole("menuitem", { name })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("menuitem", { name }).click();
  await expect(switcher).toContainText(name, { timeout: 10_000 });
}

/** Create an organization through the switcher dialog, as a user would. */
export async function createOrganization(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: NAV_LABELS.organization }).click();
  await page.getByRole("menuitem", { name: NAV_LABELS.organizationCreate }).click();
  const dialog = page.getByRole("dialog", { name: ORG_CREATE_TITLE });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(ORG_NAME_LABEL).fill(name);
  await dialog.getByRole("button", { name: BUTTON_SAVE }).click();
  await expect(dialog).toHaveCount(0);
}
