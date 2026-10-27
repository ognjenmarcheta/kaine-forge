import { useEffect } from "react";
import { useMatches } from "react-router-dom";

import { useTranslation } from "./use-translation";

function routeTitleKey(handle: unknown): string | null {
  if (typeof handle === "object" && handle !== null && "titleKey" in handle) {
    return typeof handle.titleKey === "string" ? handle.titleKey : null;
  }
  return null;
}

/** Sets `document.title` from the deepest matched route's `handle.titleKey`. */
export function useRouteTitle() {
  const matches = useMatches();
  const { t } = useTranslation();
  const titleKey = matches.reduce<string | null>(
    (key, match) => routeTitleKey(match.handle) ?? key,
    null
  );
  const appName = t("common.appName");
  const title = titleKey ? `${t(titleKey)} · ${appName}` : appName;

  useEffect(() => {
    document.title = title;
  }, [title]);
}
