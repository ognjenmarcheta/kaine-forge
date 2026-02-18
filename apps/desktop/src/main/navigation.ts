export const DESKTOP_ROUTE_PATHS = {
  dashboard: "/dashboard",
  todos: "/todos"
} as const;

export type DesktopRoute = keyof typeof DESKTOP_ROUTE_PATHS;

export function resolveDesktopRouteUrl(baseUrl: string, route: DesktopRoute): string {
  const normalizedBaseUrl = normalizeBaseRendererUrl(baseUrl);
  const parsed = new URL(normalizedBaseUrl);

  if (parsed.protocol === "file:") {
    parsed.hash = `#${DESKTOP_ROUTE_PATHS[route]}`;
    return parsed.toString();
  }

  parsed.pathname = DESKTOP_ROUTE_PATHS[route];
  parsed.search = "";

  return parsed.toString();
}

export function normalizeBaseRendererUrl(input: string | undefined): string {
  if (!input) {
    return "http://localhost:3000";
  }

  try {
    return new URL(input).toString();
  } catch {
    return "http://localhost:3000";
  }
}
