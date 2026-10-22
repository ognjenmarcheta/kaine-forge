import { GhError, type GhClient } from "./github.gh";
import {
  issueEventSchema,
  issueViewSchema,
  type CreateIssueRequest,
  type CreatedIssue,
  type IssueSnapshot
} from "./github.types";

export const READY_LABEL = "ready-for-agent";

const CREATED_ISSUE_URL = /^https:\/\/\S+\/issues\/(\d+)$/;

/**
 * Open an issue with `gh issue create`. The body goes through stdin: no shell, no temporary
 * file. `gh` prints the new issue's URL last; its number is read from there.
 */
export const createIssue = async (
  gh: GhClient,
  request: CreateIssueRequest
): Promise<CreatedIssue> => {
  const output = await gh.text(
    ["issue", "create", "--title", request.title, "--body-file", "-"],
    request.body
  );
  const url = output.trim().split("\n").at(-1)?.trim() ?? "";
  const number = CREATED_ISSUE_URL.exec(url)?.[1];
  if (number === undefined) {
    throw new GhError("gh issue create printed no issue URL", "parse");
  }
  return { number: Number(number), url };
};

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
