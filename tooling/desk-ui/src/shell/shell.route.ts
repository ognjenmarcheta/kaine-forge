import { DEFINITION_ID_PATTERN } from "@repo/desk/contracts";

export type Route =
  /** What waits on the owner: stopped work, decisions, and PRs to merge. */
  | { readonly view: "inbox" }
  /** Every issue and desk job, as a list or in columns. */
  | { readonly view: "work" }
  | { readonly view: "flows" }
  /** One flow in the editor. A new flow starts as a copy, so it always has an id. */
  | { readonly view: "flow"; readonly flowId: string }
  | { readonly view: "agents" }
  /** One agent in the editor; `null` is a new agent. */
  | { readonly view: "agent"; readonly agentId: string | null }
  /** The checks that this machine can run the desk. */
  | { readonly view: "setup" }
  /** How agents perform, what they cost, and the lessons that come back. */
  | { readonly view: "insights" }
  /** With `jobId`: the preview of a scorecard job's ledger. */
  | { readonly view: "scorecard"; readonly jobId?: number }
  /** One desk job: a scorecard run started from the desk. */
  | { readonly view: "job"; readonly jobId: number }
  /** The UI lab. Its own pages are `#/…` routes on this address. */
  | { readonly view: "lab" }
  | { readonly view: "issue"; readonly issueNumber: number };

const POSITIVE_INTEGER = /^[1-9]\d{0,8}$/;

/** Read the route from the query string. Anything unknown or malformed shows the Inbox. */
export function parseRoute(search: string): Route {
  const params = new URLSearchParams(search);
  const issue = params.get("issue");
  if (issue !== null && POSITIVE_INTEGER.test(issue)) {
    return { view: "issue", issueNumber: Number(issue) };
  }
  const job = params.get("job");
  const view = params.get("view");
  if (view === null && job !== null && POSITIVE_INTEGER.test(job)) {
    return { view: "job", jobId: Number(job) };
  }
  if (view === "agents") {
    if (params.has("new")) return { view: "agent", agentId: null };
    const agent = params.get("agent");
    return agent !== null && DEFINITION_ID_PATTERN.test(agent)
      ? { view: "agent", agentId: agent }
      : { view: "agents" };
  }
  if (view === "flows") {
    const flow = params.get("flow");
    return flow !== null && DEFINITION_ID_PATTERN.test(flow)
      ? { view: "flow", flowId: flow }
      : { view: "flows" };
  }
  if (view === "work") return { view: "work" };
  if (view === "setup") return { view: "setup" };
  if (view === "insights") return { view: "insights" };
  if (view === "scorecard") {
    return job !== null && POSITIVE_INTEGER.test(job)
      ? { view: "scorecard", jobId: Number(job) }
      : { view: "scorecard" };
  }
  if (view === "lab") return { view: "lab" };
  return { view: "inbox" };
}

/** The address of a route, relative to the current page. */
export function routeHref(route: Route): string {
  switch (route.view) {
    case "inbox":
      return "?";
    case "work":
      return "?view=work";
    case "flows":
      return "?view=flows";
    case "flow":
      return `?view=flows&flow=${encodeURIComponent(route.flowId)}`;
    case "agents":
      return "?view=agents";
    case "agent":
      return route.agentId === null
        ? "?view=agents&new=1"
        : `?view=agents&agent=${encodeURIComponent(route.agentId)}`;
    case "setup":
      return "?view=setup";
    case "insights":
      return "?view=insights";
    case "scorecard":
      return route.jobId === undefined
        ? "?view=scorecard"
        : `?view=scorecard&job=${String(route.jobId)}`;
    case "job":
      return `?job=${String(route.jobId)}`;
    case "lab":
      return "?view=lab";
    case "issue":
      return `?issue=${String(route.issueNumber)}`;
  }
}
