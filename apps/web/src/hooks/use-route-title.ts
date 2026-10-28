import { useEffect } from "react";
import { useMatches } from "react-router-dom";

import { useTranslation } from "./use-translation";

function routeTitleKey(handle: unknown): string | null {
  if (typeof handle === "object" && handle !== null && "titleKey" in handle) {
    return typeof handle.titleKey === "string" ? handle.titleKey : null;
  }
  return null;
}

/**
 * Sets `document.title` from every matched route's `handle.titleKey`, deepest
 * first, so a settings tab reads "Members · Organization · App".
 */
export function useRouteTitle() {
  const matches = useMatches();
  const { t } = useTranslation();
  const titleKeys = matches.flatMap((match) => routeTitleKey(match.handle) ?? []).reverse();
  const title = [...titleKeys, "common.appName"].map((key) => t(key)).join(" · ");

  useEffect(() => {
    document.title = title;
  }, [title]);
}
