import { isDeskApiError, type DeskApi } from "./api.client";

export interface LaunchLocation {
  readonly hash: string;
  readonly pathname: string;
  readonly search: string;
}

/** The one-use token in the launch link (`#session=<token>`), or `null`. */
export const launchTokenOf = (hash: string): string | null =>
  new URLSearchParams(hash.replace(/^#/, "")).get("session");

/**
 * Trade the launch token for the session cookie, then remove the fragment
 * from the address bar, so the token is not kept in history or a bookmark.
 * A spent token (a reload, or another tab used it) is not an error: the
 * cookie may already be valid, and the first request tells. Only a failure
 * to reach the server throws.
 */
export async function exchangeLaunchToken(
  api: DeskApi,
  location: LaunchLocation,
  replaceUrl: (url: string) => void
): Promise<void> {
  const token = launchTokenOf(location.hash);
  if (token === null) return;
  try {
    await api.exchangeSession(token);
  } catch (error) {
    if (!isDeskApiError(error) || error.code === "network") throw error;
  } finally {
    replaceUrl(`${location.pathname}${location.search}`);
  }
}
