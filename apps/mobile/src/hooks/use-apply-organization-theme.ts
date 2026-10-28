import { createActiveOrganizationQueryKey } from "@repo/query";
import { useEffect } from "react";

import { useTheme } from "./use-theme";
import { useMobileOrganizationThemeQuery } from "../graphql/generated/react-query";

/**
 * Applies the Active Organization's theme and caches it for the next launch. After sign-out
 * the app goes back to the default theme.
 */
export function useApplyOrganizationTheme(organizationId: string | null, signedOut: boolean) {
  const { setThemeName } = useTheme();
  const query = useMobileOrganizationThemeQuery(undefined, {
    enabled: Boolean(organizationId),
    queryKey: createActiveOrganizationQueryKey(
      useMobileOrganizationThemeQuery.getKey(),
      organizationId
    )
  });
  const theme = query.data?.organizationTheme;

  useEffect(() => {
    if (signedOut) setThemeName(null);
    else if (theme) setThemeName(theme);
  }, [setThemeName, signedOut, theme]);
}
