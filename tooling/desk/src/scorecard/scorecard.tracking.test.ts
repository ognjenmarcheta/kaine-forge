import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";

import {
  fetchTrackedIssues,
  fixOf,
  toTrackedIssues,
  trackedSources,
  type RawTrackedIssue
} from "./scorecard.tracking";
import type { GhClient } from "../github/github.gh";

const raw = (number: number, over: Partial<RawTrackedIssue> = {}): RawTrackedIssue => ({
  number,
  title: `Issue ${String(number)}`,
  url: `https://github.com/o/r/issues/${String(number)}`,
  state: "OPEN",
  createdAt: "2026-11-01T10:00:00Z",
  closedAt: null,
  labels: { nodes: [] },
  closedByPullRequestsReferences: { nodes: [] },
  ...over
});

const pr = (
  number: number,
  state: "OPEN" | "CLOSED" | "MERGED",
  mergedAt: string | null = null
) => ({
  number,
  url: `https://github.com/o/r/pull/${String(number)}`,
  state,
  mergedAt
});

describe("trackedSources", () => {
  it("takes the ledger's issues and the jobs' filed issues, with the finding each was for", () => {
    const sources = trackedSources(
      [
        {
          findings: [
            {
              slug: "old",
              title: "",
              dimension: 1,
              ladderRank: 1,
              disposition: "fixed",
              issue: 257
            },
            { slug: "no-issue", title: "", dimension: 1, ladderRank: 1, disposition: "open" }
          ]
        }
      ],
      [{ slug: "adr-index-drift", number: 848 }]
    );
    expect([...sources.slugs]).toEqual([
      [257, "old"],
      [848, "adr-index-drift"]
    ]);
  });
});

describe("fixOf", () => {
  it("prefers the latest merged PR, then an open one, then a closed one", () => {
    expect(
      fixOf([
        pr(10, "CLOSED"),
        pr(11, "MERGED", "2026-11-01T00:00:00Z"),
        pr(12, "MERGED", "2026-11-03T00:00:00Z"),
        pr(13, "OPEN")
      ])
    ).toMatchObject({ number: 12, state: "merged", mergedAt: "2026-11-03T00:00:00Z" });
    expect(fixOf([pr(10, "CLOSED"), pr(13, "OPEN")])).toMatchObject({ number: 13, state: "open" });
    expect(fixOf([])).toBeNull();
  });
});

describe("toTrackedIssues", () => {
  it("marks the label, the finding, the fix, and the desk run of each issue", () => {
    const issues = toTrackedIssues(
      [
        raw(848, { labels: { nodes: [{ name: "source:scorecard" }] } }),
        raw(257, {
          state: "CLOSED",
          closedAt: "2026-08-18T10:03:02Z",
          closedByPullRequestsReferences: { nodes: [pr(279, "MERGED", "2026-08-18T10:03:02Z")] }
        })
      ],
      trackedSources([], [{ slug: "adr-index-drift", number: 848 }]),
      new Map([[848, { stage: "build", status: "running" }]])
    );
    expect(issues).toMatchObject([
      { number: 848, labeled: true, slug: "adr-index-drift", fix: null, run: { stage: "build" } },
      {
        number: 257,
        state: "closed",
        labeled: false,
        slug: null,
        fix: { number: 279, state: "merged" }
      }
    ]);
  });
});

describe("fetchTrackedIssues", () => {
  const ghWith = (
    answer: (body: { query: string; variables: Record<string, string> }) => unknown
  ) => {
    const bodies: { query: string; variables: Record<string, string> }[] = [];
    const gh: GhClient = {
      text: () => Promise.reject(new Error("unused")),
      json: () => Promise.reject(new Error("unused")),
      apiPages: () => Promise.reject(new Error("unused")),
      api: <T>(schema: ZodType<T>, _endpoint: string, request?: { readonly body?: unknown }) => {
        // SAFETY: the code under test sends a GraphQL body with a query and its variables.
        const body = request?.body as { query: string; variables: Record<string, string> };
        bodies.push(body);
        return Promise.resolve().then(() => schema.parse(answer(body)));
      }
    };
    return { gh, bodies };
  };

  it("reads every number and the labelled issues in one call, declaring only used variables", async () => {
    const { gh, bodies } = ghWith(() => ({
      data: { repository: { i848: raw(848), i760: {} }, search: { nodes: [raw(900)] } }
    }));
    const issues = await fetchTrackedIssues(gh, "o/r", [848, 760]);
    expect(issues.map((issue) => issue.number)).toEqual([848, 900]);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]?.variables).toEqual({
      owner: "o",
      name: "r",
      q: "repo:o/r is:issue label:source:scorecard"
    });
  });

  it("reads each number alone when GitHub refuses the call, and leaves out a missing one", async () => {
    const { gh, bodies } = ghWith((body) => {
      if (body.query.includes("i99999"))
        throw new Error("Could not resolve to an Issue with the number of 99999.");
      return {
        data: {
          repository: body.query.includes("i848") ? { i848: raw(848) } : undefined,
          search: body.query.includes("search(") ? { nodes: [] } : undefined
        }
      };
    });
    const issues = await fetchTrackedIssues(gh, "o/r", [848, 99999]);
    expect(issues.map((issue) => issue.number)).toEqual([848]);
    // The whole call, then the label search alone and each number alone, in any order.
    expect(bodies).toHaveLength(4);
    expect(
      bodies
        .slice(1)
        .map((body) => Object.keys(body.variables).sort().join(","))
        .sort()
    ).toEqual(["name,owner", "name,owner", "q"]);
  });
});
