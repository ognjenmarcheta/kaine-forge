import { createActiveOrganizationQueryKey } from "@repo/query";
import { useEffect } from "react";

import { useOrganizationThemeQuery } from "../../graphql/generated/react-query";

/** The last Organization Theme, read by public/theme.js so the next page load paints with it. */
export const THEME_NAME_STORAGE_KEY = "kaine.theme.name";

/** The query key of the Active Organization's theme, shared by the reader and the settings. */
export function organizationThemeQueryKey(organizationId: string | null) {
  return createActiveOrganizationQueryKey(useOrganizationThemeQuery.getKey(), organizationId);
}

function applyThemeName(name: string | null): void {
  const root = document.documentElement;

  try {
    if (name === null) globalThis.localStorage.removeItem(THEME_NAME_STORAGE_KEY);
    else globalThis.localStorage.setItem(THEME_NAME_STORAGE_KEY, name);
  } catch {
    // Without storage the theme still applies to this page.
  }

  if (name === null) delete root.dataset.theme;
  else root.dataset.theme = name;
}

/**
 * The Active Organization's theme name, or null while it loads. The API answers with a
 * registered name; the CSS falls back to the default theme for any other.
 */
export function useOrganizationThemeName(organizationId: string | null): string | null {
  const query = useOrganizationThemeQuery(undefined, {
    enabled: Boolean(organizationId),
    queryKey: organizationThemeQueryKey(organizationId)
  });

  return organizationId ? (query.data?.organizationTheme ?? null) : null;
}

/**
 * Applies the Active Organization's theme to the page. Without a signed-in Organization,
 * and when the shell unmounts on sign-out, the page goes back to the default theme.
 */
export function useApplyOrganizationTheme(organizationId: string | null): void {
  const theme = useOrganizationThemeName(organizationId);

  useEffect(() => {
    if (organizationId === null) applyThemeName(null);
    else if (theme !== null) applyThemeName(theme);
  }, [organizationId, theme]);

  useEffect(() => () => applyThemeName(null), []);
}
