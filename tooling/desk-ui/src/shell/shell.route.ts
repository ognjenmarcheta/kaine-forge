export type Route =
  | { readonly view: "board" }
  | { readonly view: "health" }
  | { readonly view: "issue"; readonly issueNumber: number };

const POSITIVE_INTEGER = /^[1-9]\d{0,8}$/;

/** Read the route from the query string. Anything unknown or malformed shows the board. */
export function parseRoute(search: string): Route {
  const params = new URLSearchParams(search);
  const issue = params.get("issue");
  if (issue !== null && POSITIVE_INTEGER.test(issue)) {
    return { view: "issue", issueNumber: Number(issue) };
  }
  if (params.get("view") === "health") return { view: "health" };
  return { view: "board" };
}

/** The address of a route, relative to the current page. */
export function routeHref(route: Route): string {
  switch (route.view) {
    case "board":
      return "?";
    case "health":
      return "?view=health";
    case "issue":
      return `?issue=${String(route.issueNumber)}`;
  }
}
