import type { GhClient } from "./github.gh";
import { issueEventSchema, issueViewSchema, type IssueSnapshot } from "./github.types";

export const READY_LABEL = "ready-for-agent";

const ISSUE_FIELDS = "title,body,labels,comments,url,state,author,number";

/**
 * Read an issue and the REST events that tell who applied its labels.
 * `gh issue view` has no label actor, so the events come from the REST API.
 * Both reads are validated at the boundary.
 */
export const fetchIssueSnapshot = async (
  gh: GhClient,
  repository: string,
  issueNumber: number
): Promise<IssueSnapshot> => {
  const view = await gh.json(issueViewSchema, [
    "issue",
    "view",
    String(issueNumber),
    "--json",
    ISSUE_FIELDS
  ]);
  const events = await gh.apiPages(
    issueEventSchema,
    `repos/${repository}/issues/${issueNumber}/events`
  );

  return {
    number: view.number,
    title: view.title,
    body: view.body,
    url: view.url,
    open: view.state.toUpperCase() === "OPEN",
    author: view.author?.login ?? null,
    labels: view.labels.map((label) => label.name),
    comments: view.comments.map((comment) => ({
      url: comment.url,
      body: comment.body,
      createdAt: comment.createdAt,
      author: comment.author?.login ?? null,
      authorAssociation: comment.authorAssociation
    })),
    labelEvents: events.flatMap((event) =>
      (event.event === "labeled" || event.event === "unlabeled") && event.label !== undefined
        ? [
            {
              id: event.id,
              action: event.event,
              label: event.label.name,
              actor: event.actor?.login ?? null,
              createdAt: event.created_at
            }
          ]
        : []
    )
  };
};
