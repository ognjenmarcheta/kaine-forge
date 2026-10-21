import { expect, test as base, type Page } from "@playwright/test";
import { z } from "zod";

const CONTROL = "http://127.0.0.1:4180";

const launchReply = z.object({ url: z.string() });
const callList = z.array(z.object({ issue: z.number(), action: z.string(), payload: z.unknown() }));
type Call = z.infer<typeof callList>[number];

interface Desk {
  /** Reset the fixture data and open the local URL in a fresh page. */
  readonly open: (
    options?: { scenario?: "board" | "empty"; failShipGate?: boolean },
    path?: string
  ) => Promise<string>;
  readonly calls: () => Promise<Call[]>;
  readonly mutate: (issue: number) => Promise<void>;
  readonly log: (issue: number, message: string) => Promise<void>;
}

const test = base.extend<{ desk: Desk; problems: string[] }>({
  // Every test fails on a console error or a page error (a CSP violation shows up as one).
  problems: async ({ page }, use) => {
    const problems: string[] = [];
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      // Known limit, listed in docs/agents/agent-desk.md: Radix injects a <style> element for
      // scroll locking and the select list, and the server's `style-src 'self'` blocks it.
      if (text.startsWith("Applying inline style violates")) return;
      // A refusal (409) is a normal answer of the API, and the browser logs every non-2xx response.
      if (text.startsWith("Failed to load resource") && text.includes("status of 409")) return;
      problems.push(text);
    });
    page.on("pageerror", (error) => problems.push(error.message));
    await use(problems);
    expect(problems).toEqual([]);
  },
  desk: async ({ page, request, problems }, use) => {
    void problems;
    await use({
      open: async (options = {}, path = "") => {
        const reply = await request.post(`${CONTROL}/reset`, { data: options });
        const { url } = launchReply.parse(await reply.json());
        await page.goto(`${url}/${path}`);
        return url;
      },
      calls: async () => callList.parse(await (await request.get(`${CONTROL}/calls`)).json()),
      mutate: async (issue) => {
        await request.post(`${CONTROL}/mutate`, {
          data: { issue, stage: "build", status: "running" }
        });
      },
      log: async (issue, message) => {
        await request.post(`${CONTROL}/log`, { data: { issue, message } });
      }
    });
  }
});

const group = (page: Page, name: RegExp) => page.getByRole("region", { name });
/** The board opens as Your turn; this switches it to the four columns. */
const showColumns = async (page: Page) => {
  await page
    .getByRole("group", { name: "Board layout" })
    .getByRole("button", { name: "Columns" })
    .click();
};
/** One row of Your turn, found by its issue number. */
const row = (page: Page, issue: number) =>
  page
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: new RegExp(`^#${String(issue)} `) }) });
const inspector = (page: Page) => page.getByRole("complementary");
const more = async (page: Page, item: string) => {
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: item }).click();
};
/** The decision card's buttons, named by the card's heading. */
const decide = (page: Page, heading: string) => page.getByRole("group", { name: heading });
/**
 * Approve, feedback, continue, cancel, and remove wait 8 s for Undo before they are sent. A test
 * that installed the page clock skips the wait; the request still goes out the normal way.
 */
const skipUndo = (page: Page) => page.clock.fastForward(8_000);

test("opens the plain local URL and shows the four board columns", async ({ page, desk }) => {
  await desk.open();
  await expect(page.getByRole("heading", { name: /^Your turn/, level: 1 })).toBeVisible();
  expect(page.url()).not.toContain("session");
  const cookies = await page.context().cookies();
  expect(cookies.find((cookie) => cookie.name.startsWith("desk_session_"))).toMatchObject({
    httpOnly: true,
    sameSite: "Strict"
  });

  await showColumns(page);
  await expect(page.getByRole("heading", { name: "Issues", level: 1 })).toBeVisible();
  await expect(group(page, /^Needs you/)).toContainText("#103");
  await expect(group(page, /^Needs you/)).toContainText(
    "Two consecutive checks failed the same way"
  );
  await expect(group(page, /^Waiting for you/)).toContainText("#101");
  await expect(group(page, /^Waiting for you/)).toContainText("#102");
  await expect(group(page, /^Running/)).toContainText("#104");
  await expect(group(page, /^Done/)).toContainText("#105");
  // One chip joins stage and state; the progress bar says where the issue is in words.
  await expect(group(page, /^Waiting for you/)).toContainText("Plan approval · waiting for you");
  await expect(
    group(page, /^Waiting for you/)
      .getByRole("img", { name: "Stage 3 of 9: Plan approval (Waiting for you)" })
      .first()
  ).toBeVisible();
  await expect(group(page, /^Running/)).toContainText("Build · running");
  await expect(group(page, /^Done/).getByRole("link", { name: "Open PR" })).toHaveAttribute(
    "href",
    "https://github.com/owner/kaine-forge/pull/321"
  );
  // The board reads no issue detail: the list has everything a card shows.
  const details = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((name) => /\/api\/issues\/\d+$/.test(name))
  );
  expect(details).toEqual([]);
});

test("shows an empty board with a way to start", async ({ page, desk }) => {
  await desk.open({ scenario: "empty" });
  await expect(page.getByRole("heading", { name: "No issues on the desk yet" })).toBeVisible();
  await page.getByRole("button", { name: "Start your first issue" }).click();
  await expect(page.getByRole("dialog", { name: "Start an issue" })).toBeVisible();
});

test("filters the board by number or title", async ({ page, desk }) => {
  await desk.open();
  await expect(page.getByRole("link", { name: /#101/ })).toBeVisible();
  const search = page.getByRole("searchbox", { name: "Search issues" });
  await search.fill("#999");
  await expect(page.getByText("No issue here matches the search.")).toBeVisible();
  await search.fill("#103");
  await expect(page.getByRole("link", { name: /#101/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /#103/ })).toBeVisible();
  await page.getByRole("button", { name: "Clear the search" }).click();
  await search.fill("loop counts");
  await expect(page.getByRole("link", { name: /#104/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /#103/ })).toHaveCount(0);
});

test("continues a stopped issue from its card and shows the result as a toast", async ({
  page,
  desk
}) => {
  await desk.open();
  await group(page, /^Needs you/)
    .getByRole("button", { name: "Continue" })
    .click();
  await expect(page.getByText("#103 · The run will continue.")).toBeVisible();
  await expect(page.getByText(/^#103 · Continued\./)).toBeVisible({ timeout: 15_000 });
  await expect(group(page, /^Your decisions/)).toContainText("#103");
  expect(await desk.calls()).toEqual([{ issue: 103, action: "continue", payload: { from: null } }]);
});

test("opens the plan gate from the card's next action", async ({ page, desk }) => {
  await desk.open();
  await row(page, 101).getByRole("link", { name: "Review plan" }).click();
  await expect(page).toHaveURL(/\?issue=101/);
  await expect(page.getByRole("heading", { name: "Approve the plan" })).toBeVisible();
});

test("approves a low-risk plan from Your turn, and Undo sends nothing", async ({ page, desk }) => {
  await desk.open();
  // Next up is the stopped issue; the plans wait below it, oldest first.
  await expect(row(page, 103)).toContainText("Next up");
  await expect(row(page, 101)).not.toContainText("Next up");
  const approve = row(page, 101).getByRole("button", { name: "Approve the plan of #101" });

  await approve.click();
  await expect(page.getByText("#101 · The plan will be approved.")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Undone. Nothing ran.")).toBeVisible();

  await approve.click();
  await expect(page.getByText(/^#101 · Plan approved\./)).toBeVisible({ timeout: 15_000 });
  // One approve only: the undone one never reached the server.
  expect(await desk.calls()).toEqual([{ issue: 101, action: "approve", payload: {} }]);
});

test("approves every low-risk plan in one undoable batch", async ({ page, desk }) => {
  await desk.open();
  await group(page, /^Your decisions/)
    .getByRole("button", { name: "Approve 2 low-risk plans…" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Approve 2 low-risk plans?" });
  await expect(dialog).toContainText("#101 Add an empty state to the board");
  await expect(dialog).toContainText("#106 Translate the empty state");
  await dialog.getByRole("button", { name: "Approve 2 plans" }).click();

  await expect(page.getByText("#101, #106 · 2 low-risk plans will be approved.")).toBeVisible();
  expect(await desk.calls()).toEqual([]);
  await expect(page.getByText("Plans approved: #101, #106. The builds started.")).toBeVisible({
    timeout: 15_000
  });
  expect(await desk.calls()).toEqual([
    { issue: 101, action: "approve", payload: {} },
    { issue: 106, action: "approve", payload: {} }
  ]);
});

test("switches the board to columns with filters, and keeps the choice", async ({ page, desk }) => {
  await desk.open();
  await expect(page.getByRole("group", { name: "Filter" })).toHaveCount(0);
  await showColumns(page);
  await expect(page.getByRole("heading", { name: "Issues", level: 1 })).toBeVisible();
  for (const name of [/^Needs you/, /^Waiting for you/, /^Running/, /^Done/]) {
    await expect(group(page, name)).toBeVisible();
  }
  const filters = page.getByRole("group", { name: "Filter" });
  await filters.getByRole("button", { name: /^Running/ }).click();
  await expect(group(page, /^Running/)).toContainText("#104");
  await expect(page.getByRole("link", { name: /#101/ })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Issues", level: 1 })).toBeVisible();
  await expect(group(page, /^Waiting for you/)).toContainText("#101");
});

test("opens the plain local URL in a second browser without a launch token", async ({
  page,
  browser,
  desk
}) => {
  const url = await desk.open();
  await expect(page.getByRole("heading", { name: /^Your turn/, level: 1 })).toBeVisible();

  // A second browser has no cookie yet. Opening the local page issues one.
  const other = await browser.newContext();
  const stranger = await other.newPage();
  await stranger.goto(`${url}/`);
  await expect(stranger.getByRole("heading", { name: /^Your turn/, level: 1 })).toBeVisible();
  await other.close();
});

test("opens an issue: the inspector shows the current stage beside a graph that fits", async ({
  page,
  desk
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await desk.open();
  await page.getByRole("link", { name: /#102/ }).click();
  await expect(
    page.getByRole("heading", { name: /#102 Explain the review verdict/, level: 1 })
  ).toBeVisible();
  await expect(inspector(page).getByRole("heading", { name: "PR review", level: 2 })).toBeVisible();
  await expect(inspector(page).getByRole("list", { name: "Ship readiness" })).toBeVisible();

  // The graph opens from the More menu; the stepper under the header is always there.
  await expect(page.getByRole("group", { name: "Pipeline graph" })).toHaveCount(0);
  await more(page, "Show graph");
  const graph = page.getByRole("group", { name: "Pipeline graph" });
  await expect(graph.getByRole("group", { name: /^PR review: Waiting for you/ })).toBeVisible();
  await expect(page.getByRole("list", { name: "What the colors mean" })).toContainText("Went back");
  // Every stage is inside the graph at a 1440 px desktop: nothing is cropped.
  const box = await graph.boundingBox();
  for (const node of await graph.locator(".react-flow__node").all()) {
    const rect = await node.boundingBox();
    expect(rect, (await node.getAttribute("data-id")) ?? "node").not.toBeNull();
    if (rect === null || box === null) continue;
    expect(rect.x).toBeGreaterThanOrEqual(box.x - 1);
    expect(rect.x + rect.width).toBeLessThanOrEqual(box.x + box.width + 1);
  }
  // A loop edge keeps its count, inside the graph and clear of every node.
  const loop = graph.getByText("Check loops: 1");
  await expect(loop).toBeVisible();
  const label = await loop.boundingBox();
  expect(label).not.toBeNull();
  if (label !== null && box !== null) {
    expect(label.y).toBeGreaterThanOrEqual(box.y);
    for (const node of await graph.locator(".react-flow__node").all()) {
      const rect = await node.boundingBox();
      if (rect === null) continue;
      const apart =
        label.x + label.width <= rect.x ||
        rect.x + rect.width <= label.x ||
        label.y + label.height <= rect.y ||
        rect.y + rect.height <= label.y;
      expect(apart, (await node.getAttribute("data-id")) ?? "node").toBe(true);
    }
  }
  // The whole pipeline fits at full size: the node text renders at its token size, uncut.
  const text = await graph.locator(".desk-node").evaluateAll((nodes) => {
    const viewport = document.querySelector(".react-flow__viewport");
    const zoom = viewport === null ? 0 : new DOMMatrix(getComputedStyle(viewport).transform).a;
    const size = (node: Element, selector: string): number => {
      const element = node.querySelector(selector);
      return element === null ? Number.NaN : parseFloat(getComputedStyle(element).fontSize) * zoom;
    };
    const tokens = getComputedStyle(document.documentElement);
    const token = (name: string): number => {
      const probe = document.createElement("span");
      probe.style.font = tokens.getPropertyValue(name);
      document.body.append(probe);
      const px = parseFloat(getComputedStyle(probe).fontSize);
      probe.remove();
      return px;
    };
    return {
      zoom,
      small: token("--ds-font-body-small"),
      xsmall: token("--ds-font-body-xsmall"),
      titles: nodes.map((node) => size(node, ".desk-node__title")),
      statuses: nodes.map((node) => size(node, ".desk-node__status")),
      metrics: nodes.flatMap((node) =>
        node.querySelector(".desk-node__metrics") === null
          ? []
          : [size(node, ".desk-node__metrics")]
      ),
      cut: nodes.flatMap((node) => {
        const title = node.querySelector(".desk-node__title");
        return title !== null && title.scrollWidth > title.clientWidth ? [title.textContent] : [];
      })
    };
  });
  expect(text.zoom).toBeGreaterThanOrEqual(1);
  expect(Math.min(...text.titles)).toBeGreaterThanOrEqual(text.small);
  expect(Math.min(...text.statuses, ...text.metrics)).toBeGreaterThanOrEqual(text.xsmall);
  expect(text.cut).toEqual([]);

  // The stepper names every stage with its status and marks the current one.
  const stages = page.getByRole("list", { name: "Stages and their status" });
  await expect(stages.getByRole("button")).toHaveCount(9);
  await expect(stages.getByRole("button").nth(6)).toHaveAttribute("aria-current", "step");
  await expect(stages.getByRole("button").nth(6)).toHaveAccessibleName("PR review Waiting for you");

  // The graph keeps its pan and zoom controls and cannot be edited.
  await expect(graph.getByRole("button", { name: "Zoom in" })).toBeVisible();
  const moved = await graph
    .locator(".react-flow__node")
    .first()
    .evaluate((node) => (node instanceof HTMLElement ? node.style.transform : ""));
  await graph
    .locator(".react-flow__node")
    .first()
    .dragTo(graph.locator(".react-flow__pane"), { force: true });
  expect(
    await graph
      .locator(".react-flow__node")
      .first()
      .evaluate((node) => (node instanceof HTMLElement ? node.style.transform : ""))
  ).toBe(moved);
});

test("selects a stage from the graph by click and by keyboard, and keeps the view on updates", async ({
  page,
  desk
}) => {
  await desk.open({}, "?issue=102");
  await more(page, "Show graph");
  const graph = page.getByRole("group", { name: "Pipeline graph" });
  await graph.getByRole("group", { name: /^Check: / }).click();
  await expect(inspector(page).getByRole("heading", { name: "Check", level: 2 })).toBeVisible();
  await expect(inspector(page)).toContainText("Check went back 1×");

  await graph.getByRole("group", { name: /^Plan: / }).focus();
  await page.keyboard.press("Enter");
  await expect(inspector(page).getByRole("heading", { name: "Plan", level: 2 })).toBeVisible();
  await expect(inspector(page).getByRole("list", { name: "Acceptance criteria" })).toContainText(
    "An empty board explains how to start an issue"
  );

  // A zoom by the engineer survives a new model.
  await graph.getByRole("button", { name: "Zoom in" }).click();
  const viewport = graph.locator(".react-flow__viewport");
  const zoomed = await viewport.getAttribute("style");
  await desk.log(102, "a new log line");
  await page.waitForTimeout(300);
  expect(await viewport.getAttribute("style")).toBe(zoomed);
  // The selection persists while new data arrives.
  await expect(inspector(page).getByRole("heading", { name: "Plan", level: 2 })).toBeVisible();
});

test("opens the full result of a stage in a drawer, with markup in the ticket kept as text", async ({
  page,
  desk
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await desk.open({}, "?issue=102");
  await more(page, "Show graph");
  const graph = page.getByRole("group", { name: "Pipeline graph" });
  await graph.getByRole("group", { name: /^Ticket: / }).click();
  const open = inspector(page).getByRole("button", { name: "Open full result" });
  await open.click();
  const drawer = page.getByRole("dialog", { name: "Ticket" });
  await expect(drawer).toContainText("<script>window.injected = true</script>");
  await expect(drawer).toContainText("6 of 6 sections");
  expect(await page.evaluate(() => "injected" in window)).toBe(false);
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(open).toBeFocused();

  await graph.getByRole("group", { name: /^Check: / }).click();
  await open.click();
  await expect(page.getByRole("dialog", { name: "Check" })).toContainText("Tasks: 6 successful");
  await page.keyboard.press("Escape");

  await graph.getByRole("group", { name: /^PR review: / }).click();
  await open.click();
  const review = page.getByRole("dialog", { name: "PR review" });
  await expect(review).toContainText("The heading level jumps from h1 to h3.");
  await expect(review).toContainText("apps/web/src/board.empty.tsx:14");
  await expect(review).toContainText("Files: 2, lines added: 4, removed: 1");
});

test("shows the history as activity rows, newest first, with loop rounds", async ({
  page,
  desk
}) => {
  await desk.open({}, "?issue=102");
  await expect(page.getByRole("tab", { name: "Activity" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  const activity = page.getByRole("list", { name: "History of this issue" });
  await expect(activity.getByRole("heading", { level: 3 }).first()).toHaveText("Review");
  await expect(activity).toContainText("Check · round 2");
  await expect(activity).toContainText("Checks failed");
  await expect(activity).toContainText("Went back");
  await expect(activity.locator(".desk-activity__row").first()).toContainText("Review approved");
});

test("approves a plan and follows the issue to the next gate without a reload", async ({
  page,
  desk
}) => {
  await page.clock.install();
  await desk.open({}, "?issue=101");
  await expect(page.getByRole("heading", { name: "Approve the plan" })).toBeVisible();
  await expect(
    inspector(page).getByRole("heading", { name: "Plan approval", level: 2 })
  ).toBeVisible();
  await decide(page, "Approve the plan").getByRole("button", { name: "Approve plan" }).click();
  await expect(page.getByText("#101 · The plan will be approved.")).toBeVisible();
  expect(await desk.calls()).toEqual([]);
  await skipUndo(page);
  await expect(page.getByRole("heading", { name: "Review the work" })).toBeVisible();
  await expect(page.getByText(/^#101 · Plan approved\./)).toBeVisible();
  // The inspector follows the issue to its new stage.
  await expect(inspector(page).getByRole("heading", { name: "PR review", level: 2 })).toBeVisible();
  expect(await desk.calls()).toEqual([{ issue: 101, action: "approve", payload: {} }]);
});

test("approves a plan with A, and the answer to the planner's question goes with it", async ({
  page,
  desk
}) => {
  await page.clock.install();
  await desk.open({}, "?issue=101");
  // The risk line: the planner's grade and why.
  await expect(page.locator(".desk-riskline")).toContainText("Low risk");
  await expect(page.locator(".desk-riskline")).toContainText(
    "Two files, one of them new, and a test"
  );
  const card = page.getByRole("region", { name: "Approve the plan" });
  await expect(card.getByText("Should the empty state link to the docs?")).toBeVisible();
  await page.getByRole("textbox", { name: /Your answer/ }).fill("Yes, link the desk docs");
  // A in a text box is a letter. Outside it, A approves.
  await page.getByRole("heading", { name: "Approve the plan" }).click();
  await page.keyboard.press("a");
  await expect(page.getByText("#101 · The plan will be approved.")).toBeVisible();
  await skipUndo(page);
  await expect(page.getByRole("heading", { name: "Review the work" })).toBeVisible();
  expect(await desk.calls()).toEqual([
    { issue: 101, action: "approve", payload: { note: "Yes, link the desk docs" } }
  ]);
});

test("requests changes to the plan from the decision card", async ({ page, desk }) => {
  await page.clock.install();
  await desk.open({}, "?issue=101");
  await decide(page, "Approve the plan").getByRole("button", { name: "Request changes" }).click();
  await expect(page.getByRole("textbox", { name: "Feedback" })).toBeFocused();
  await page.getByRole("textbox", { name: "Feedback" }).fill("Cover the empty case");
  await page.getByRole("button", { name: "Send feedback" }).click();
  await skipUndo(page);
  await expect(page.getByText("Feedback sent. The stage ran again.")).toBeVisible();
  expect(await desk.calls()).toEqual([
    { issue: 101, action: "feedback", payload: { to: "plan", text: "Cover the empty case" } }
  ]);
});

test("shows the ship dry run, asks twice, then ships and links the pull request", async ({
  page,
  desk
}) => {
  await desk.open({}, "?issue=102");
  await decide(page, "Review the work").getByRole("button", { name: "Ship as draft PR…" }).click();

  const dialog = page.getByRole("dialog", { name: "Ship to a draft pull request" });
  await expect(dialog.getByText("Every ship rule passes.")).toBeVisible();
  await expect(dialog).toContainText("feat(web): add a board empty state");
  await expect(dialog).toContainText(".changeset/board-empty-state.md");
  await expect(dialog).toContainText("Changeset file");
  await expect(dialog).toContainText("Files in the commit (3)");
  // Nothing was shipped by the dry run.
  expect(await desk.calls()).toEqual([
    { issue: 102, action: "ship", payload: { confirm: false, dryRun: true } }
  ]);

  await dialog.getByRole("button", { name: "Continue to confirm" }).click();
  await expect(dialog).toContainText("commits 3 files on KAINE-102-feat-agent-desk");
  await dialog.getByRole("button", { name: "Confirm and ship" }).click();
  await expect(dialog.getByText("Shipped. The draft pull request is open.")).toBeVisible();
  expect((await desk.calls()).at(-1)).toEqual({
    issue: 102,
    action: "ship",
    payload: { confirm: true, dryRun: false }
  });

  await dialog.getByRole("button", { name: "Close", exact: true }).first().click();
  await expect(page.getByRole("link", { name: "Open the draft pull request" })).toHaveAttribute(
    "href",
    "https://github.com/owner/kaine-forge/pull/321"
  );
  // The note appears once, in the decision card.
  await expect(
    page.getByText(/You merge it yourself. The desk never merges, approves/)
  ).toHaveCount(1);
});

test("keeps Ship secondary until every file is viewed, and the dialog says what is not", async ({
  page,
  desk
}) => {
  await desk.open({}, "?issue=102");
  const bar = decide(page, "Review the work");
  const ship = bar.getByRole("button", { name: "Ship as draft PR…" });
  await expect(
    page.getByRole("region", { name: "Review the work" }).getByText("Ready to ship")
  ).toBeVisible();
  await expect(bar).toContainText("0 of 2 files viewed");
  await expect(ship).toHaveClass(/ui-button--subtle/);

  // Both files have a finding, so both sit under that group, each with its count.
  const files = page.getByRole("navigation", { name: "Changed files" });
  await expect(files.getByRole("listitem").nth(0)).toHaveText("Has findings");
  await expect(files.getByRole("listitem").nth(1)).toContainText("apps/web/src/board.tsx");
  await expect(files.getByRole("listitem").nth(1)).toContainText("Findings: 1");
  await expect(files.getByRole("listitem").nth(2)).toContainText("apps/web/src/board.empty.tsx");
  // The open file shows its finding under the line it names.
  await expect(page.getByLabel("Patch of apps/web/src/board.tsx").getByRole("note")).toContainText(
    "Import order differs from the rest of the file."
  );

  // S opens the dialog anyway: it warns and names the files, and does not block.
  await page.keyboard.press("s");
  const dialog = page.getByRole("dialog", { name: "Ship to a draft pull request" });
  await expect(dialog.getByText("Not every file is marked viewed.")).toBeVisible();
  await expect(dialog).toContainText("apps/web/src/board.empty.tsx");
  await expect(dialog.getByRole("button", { name: "Continue to confirm" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Close", exact: true }).first().click();
  await expect(dialog).toBeHidden();

  // N opens the next unviewed file. Marking it viewed brings back the one still to read.
  await page.keyboard.press("n");
  const empty = page.getByLabel("Patch of apps/web/src/board.empty.tsx");
  await expect(empty.getByRole("note")).toContainText("The heading level jumps from h1 to h3.");
  await files.getByRole("checkbox", { name: "Viewed apps/web/src/board.empty.tsx" }).click();
  await expect(page.getByLabel("Patch of apps/web/src/board.tsx")).toContainText("BoardEmpty");
  await expect(bar).toContainText("1 of 2 files viewed");
  // The last file folds once it is viewed.
  await files.getByRole("checkbox", { name: "Viewed apps/web/src/board.tsx" }).click();
  await expect(page.getByText("Marked as viewed.")).toBeVisible();

  // Every file viewed: Ship leads, and Next unviewed file is gone.
  await expect(bar).toContainText("2 of 2 files viewed");
  await expect(ship).toHaveClass(/ui-button--primary/);
  await expect(bar.getByRole("button", { name: "Next unviewed file" })).toHaveCount(0);
  // The marks belong to this version of the diff and survive a reload.
  await page.reload();
  await expect(decide(page, "Review the work")).toContainText("2 of 2 files viewed");
  await page.keyboard.press("s");
  await expect(page.getByRole("dialog", { name: "Ship to a draft pull request" })).toContainText(
    "Every ship rule passes."
  );
  await expect(page.getByText("Not every file is marked viewed.")).toHaveCount(0);
});

test("blocks the ship when a gate rule fails", async ({ page, desk }) => {
  await desk.open({ failShipGate: true }, "?issue=102");
  await page.getByRole("button", { name: "Ship as draft PR…" }).click();
  const dialog = page.getByRole("dialog", { name: "Ship to a draft pull request" });
  await expect(dialog).toContainText("The worktree changed after the checks ran.");
  await expect(dialog.getByRole("button", { name: "Continue to confirm" })).toBeDisabled();
});

test("continues an issue that needs the engineer", async ({ page, desk }) => {
  await page.clock.install();
  await desk.open({}, "?issue=103");
  await expect(page.getByRole("heading", { name: "The desk needs you" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Build stopped" })).toBeVisible();
  await expect(page.getByLabel("Reason from the engine")).toContainText(
    "FAIL apps/web/src/board.test.tsx"
  );
  // The likely cause comes from facts: the builder's last run got stuck.
  await expect(page.getByText("Likely cause: the agent got stuck")).toBeVisible();
  await expect(inspector(page)).toContainText(
    "Needs you: Two consecutive checks failed the same way: FAIL apps/web/src/board.test.tsx"
  );
  await expect(page.getByRole("combobox", { name: "Resume from" })).toContainText(
    "Build (the engine remembers it)"
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await skipUndo(page);
  await expect(page.getByRole("heading", { name: "Review the work" })).toBeVisible();
  expect(await desk.calls()).toEqual([{ issue: 103, action: "continue", payload: { from: null } }]);
});

test("cancels from the More menu only after a confirmation", async ({ page, desk }) => {
  await page.clock.install();
  await desk.open({}, "?issue=101");
  await more(page, "Cancel run");
  await expect(page.getByRole("dialog", { name: "Cancel this run?" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "More actions" })).toBeFocused();
  expect(await desk.calls()).toEqual([]);
  await more(page, "Cancel run");
  await page.getByRole("button", { name: "Cancel the run" }).click();
  await skipUndo(page);
  await expect(page.getByRole("heading", { name: "Cancelled" }).first()).toBeVisible();
});

test("pauses a running issue with P, shows its latest log line, and resumes it", async ({
  page,
  desk
}) => {
  await desk.open({}, "?issue=104");
  await expect(page.getByRole("heading", { name: "Working" })).toBeVisible();
  await desk.log(104, "Builder edits board.tsx");
  await expect(page.locator(".desk-nowline")).toContainText("Builder edits board.tsx");
  await page.keyboard.press("p");
  await expect(page.getByText(/^Paused since/)).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  expect(await desk.calls()).toEqual([
    { issue: 104, action: "pause", payload: {} },
    { issue: 104, action: "resume", payload: {} }
  ]);
});

test("removes an issue from the More menu and returns to the board", async ({ page, desk }) => {
  await desk.open({}, "?issue=105");
  await more(page, "Remove");
  await page.getByRole("button", { name: "Remove the issue" }).click();
  await expect(page.getByRole("heading", { name: /^Your turn/, level: 1 })).toBeVisible({
    timeout: 15_000
  });
  await expect(page.getByRole("link", { name: /#105/ })).toHaveCount(0);
  expect(await desk.calls()).toEqual([{ issue: 105, action: "remove", payload: { force: false } }]);
});

test("starts an issue from a dialog and explains a refusal", async ({ page, desk }) => {
  await desk.open();
  await page.getByRole("button", { name: "Start issue" }).click();
  const dialog = page.getByRole("dialog", { name: "Start an issue" });
  await dialog.getByRole("textbox", { name: "Issue number" }).fill("not a number");
  await dialog.getByRole("button", { name: "Start", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Enter a positive whole number.");

  await dialog.getByRole("textbox", { name: "Issue number" }).fill("404");
  await dialog.getByRole("button", { name: "Start", exact: true }).click();
  await expect(
    page.getByText("#404 · Intake refused this issue. The reason is below.")
  ).toBeVisible();
  await expect(page.getByText("Issue #404 is closed.")).toBeVisible();
  await expect(dialog).toBeVisible();

  await dialog.getByRole("textbox", { name: "Issue number" }).fill("500");
  await dialog.getByRole("checkbox", { name: /Run on my own authority/ }).click();
  await dialog.getByRole("button", { name: "Start", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/^#500 · Started\./)).toBeVisible();
  await expect(page.getByRole("link", { name: /#500/ })).toBeVisible();
  expect((await desk.calls()).at(-1)).toEqual({
    issue: 500,
    action: "start",
    payload: { override: true }
  });
});

test("updates the board when a change comes from outside, and shows the live log as text", async ({
  page,
  desk
}) => {
  await desk.open();
  await expect(group(page, /^Your decisions/)).toContainText("#101");
  await desk.mutate(101);
  await expect(group(page, /^Running/)).toContainText("#101");
  await expect(group(page, /^Your decisions/)).not.toContainText("#101");

  await page.getByRole("link", { name: /#101/ }).click();
  await page.getByRole("tab", { name: "Live log" }).click();
  await desk.log(101, "Agent says <b>hello</b> token=[redacted]");
  await expect(page.getByRole("log", { name: "Log of this issue" })).toContainText(
    "Agent says <b>hello</b> token=[redacted]"
  );
  await expect(page.locator(".desk-log b")).toHaveCount(0);
  // The time is shown once, as a local time element: the text itself carries none.
  const line = page.locator(".desk-log__line", { hasText: "Agent says" });
  await expect(line.locator("time")).toHaveCount(1);
  expect(await line.locator("span").textContent()).toBe("Agent says <b>hello</b> token=[redacted]");
});

test("shows the health report with a status in words", async ({ page, desk }) => {
  await desk.open();
  await page.getByRole("navigation").getByRole("link", { name: "Health" }).click();
  await expect(page.getByRole("heading", { name: "Health", level: 1 })).toBeVisible();
  await expect(page.getByText("claude: command not found")).toBeVisible();
  await expect(page.getByText("Warning", { exact: true })).toBeVisible();
  await expect(page.getByText("Error", { exact: true })).toBeVisible();
});

test("compares agent runs by role and model, and shows a stage's agent usage", async ({
  page,
  desk
}) => {
  await desk.open();
  await page.getByRole("navigation").getByRole("link", { name: "Runs" }).click();
  await expect(page.getByRole("heading", { name: "Agent runs", level: 1 })).toBeVisible();
  const groups = page.getByRole("table", { name: "By role and model" });
  await expect(groups.getByRole("row")).toHaveCount(5);
  await expect(groups.getByRole("row", { name: /Builder claude opus 2 1 1/ })).toBeVisible();
  const issues = page.getByRole("table", { name: "By issue" });
  await expect(issues.getByRole("row", { name: /#99 Removed/ })).toBeVisible();
  const lessons = page.getByRole("table", { name: "Lesson candidates" });
  await expect(
    lessons.getByRole("row", { name: /review\/Correctness\/Consider Review finding #102 #103 3 1/ })
  ).toBeVisible();
  await expect(lessons.getByText("The export drops the header row")).toBeVisible();

  await issues.getByRole("link", { name: "#102" }).click();
  await page
    .getByRole("list", { name: "Stages and their status" })
    .getByRole("button", { name: /^Build/ })
    .click();
  await expect(
    inspector(page).getByRole("heading", { name: "Agent usage, all runs" })
  ).toBeVisible();
  await expect(inspector(page).getByText("$1.25")).toBeVisible();
});

test("offers a command to copy, and repairs the Docker image after a confirmation", async ({
  page,
  desk
}) => {
  await desk.open({}, "?view=health");
  const claude = page.getByRole("listitem").filter({ hasText: "Claude CLI" });
  await expect(claude.getByText("npm install -g @anthropic-ai/claude-code")).toBeVisible();
  await expect(claude.getByRole("button", { name: "Fix" })).toHaveCount(0);

  const image = page.getByRole("listitem").filter({ hasText: "Docker image" });
  await image.getByRole("button", { name: "Fix" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Build the image" }).click();
  await expect(image.getByRole("button", { name: /Running/ })).toBeDisabled();
  await expect(page.getByText("Repaired: Docker image")).toBeVisible();
  // The report runs again and the check passes.
  await expect(image.getByText("kaine-desk-worker:abc is current")).toBeVisible();
  await expect(image.getByRole("button", { name: "Fix" })).toHaveCount(0);
});

test("starts an issue picked from GitHub, and shows open pull requests read-only", async ({
  page,
  desk
}) => {
  await desk.open();
  // Your turn lists the pull request in short; the full list sits under the columns.
  await expect(group(page, /^Open pull requests/)).toContainText("#321");
  await showColumns(page);
  const pulls = page.getByRole("region", { name: "Open pull requests (1)" });
  await expect(pulls.getByRole("link", { name: "#321" })).toHaveAttribute(
    "href",
    "https://github.com/owner/kaine-forge/pull/321"
  );
  await expect(pulls.getByRole("link", { name: "Issue #105 on the board" })).toBeVisible();

  await page.getByRole("button", { name: "Start issue" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Start an issue" });
  await expect(dialog.getByRole("button", { name: /#101/ })).toBeDisabled();
  // Untrusted GitHub text stays text.
  await expect(dialog.getByText("Explain the verdict <b>now</b>")).toBeVisible();
  await dialog.getByRole("button", { name: /#120/ }).click();
  await expect(dialog.getByRole("textbox", { name: "Issue number" })).toHaveValue("120");
  await expect(dialog.getByText("Contract 6/6")).toBeVisible();
  await dialog.getByRole("button", { name: "Start", exact: true }).click();

  await expect(page.getByRole("link", { name: /#120/ })).toBeVisible();
  expect(await desk.calls()).toContainEqual({
    issue: 120,
    action: "start",
    payload: { override: false }
  });
});

test("drafts the issue format for a stopped intake and applies it after a second yes", async ({
  page,
  desk
}) => {
  await desk.open();
  await page.getByRole("button", { name: "Start issue" }).first().click();
  const start = page.getByRole("dialog", { name: "Start an issue" });
  await start.getByRole("textbox", { name: "Issue number" }).fill("130");
  await start.getByRole("button", { name: "Start", exact: true }).click();

  await group(page, /^Needs you/)
    .getByRole("link", { name: "Fix and start again" })
    .click();
  await page.getByRole("button", { name: "Draft the issue format" }).click();
  const draft = page.getByRole("dialog", { name: "Draft of #130" });
  await expect(draft.getByText("Contract 6/6")).toBeVisible();
  await expect(draft.getByText("Which release fixes the advisory?")).toBeVisible();
  // The quoted original stays text.
  await expect(draft.getByText(/<b>Remove<\/b> the exception/)).toBeVisible();

  await draft.getByRole("button", { name: "Apply to GitHub…" }).click();
  await draft.getByRole("button", { name: "Replace the issue body" }).click();
  await expect(page.getByText(/The issue body on GitHub is the draft now/)).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Draft of #130" })).toHaveCount(0);
  const calls = await desk.calls();
  expect(calls.map((call) => call.action)).toEqual(["start", "draft", "apply-draft"]);
  expect(calls.at(-1)?.payload).toEqual({ confirm: true });
});

test("switches language and theme without leaving the page", async ({ page, desk }) => {
  await desk.open({}, "?issue=101");
  await page.getByRole("button", { name: "Request changes" }).click();
  await page.getByRole("textbox", { name: "Feedback" }).fill("A draft that must survive");
  const lightBackground = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor
  );

  await page.getByRole("button", { name: "Preferences" }).click();
  const prefs = page.getByRole("dialog", { name: "Preferences" });
  await prefs.getByRole("button", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe(
    lightBackground
  );

  // The panel stays open: the next choice is one click away.
  await prefs.getByRole("button", { name: "Deutsch" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.getByRole("button", { name: "Plan freigeben" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Übersicht/ })).toBeVisible();
  // The draft in the feedback box survives the change.
  await expect(page.getByRole("textbox", { name: "Rückmeldung" })).toHaveValue(
    "A draft that must survive"
  );

  await page
    .getByRole("dialog", { name: "Einstellungen" })
    .getByRole("button", { name: "Srpski" })
    .click();
  await expect(page.getByRole("button", { name: "Odobri plan" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Pregled/ })).toBeVisible();
});

test("follows the system dark theme until the engineer picks one", async ({ page, desk }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await desk.open();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Preferences" }).click();
  await page
    .getByRole("dialog", { name: "Preferences" })
    .getByRole("button", { name: "Dark" })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(group(page, /^Needs you/)).toContainText("#103");
});

test("fits a phone screen without sideways scrolling, with a one-row header", async ({
  page,
  desk
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await desk.open();
  await expect(page.getByRole("heading", { name: /^Your turn/, level: 1 })).toBeVisible();
  // Brand, navigation, search, and preferences share one row. A phone has no live pill.
  await expect(page.locator(".desk-live")).toBeHidden();
  const rows = await page.evaluate(() => {
    const centre = (selector: string): number => {
      const box = document.querySelector(selector)?.getBoundingClientRect();
      return box === undefined ? Number.NaN : Math.round(box.top + box.height / 2);
    };
    return [".desk-brand", ".desk-nav", ".desk-cmdk", ".desk-icon-button"].map(centre);
  });
  expect(Math.max(...rows) - Math.min(...rows), String(rows)).toBeLessThanOrEqual(2);
  // Touch targets are at least 44 px high.
  for (const target of [
    page.getByRole("link", { name: /^Board/ }),
    page.getByRole("button", { name: "Preferences" }),
    group(page, /^Needs you/).getByRole("button", { name: "Continue" })
  ]) {
    expect((await target.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  for (const path of ["", "?issue=102", "?issue=103", "?view=health", "?view=stats"]) {
    await page.goto(`/${path}`);
    await expect(page.locator("main")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  // The search placeholder is not cut on a phone.
  await page.goto("/");
  const search = page.getByRole("searchbox", { name: "Search issues" });
  await expect(search).toBeVisible();
  expect(
    await search.evaluate((input) => {
      if (!(input instanceof HTMLInputElement)) return false;
      const style = getComputedStyle(input);
      const context = document.createElement("canvas").getContext("2d");
      if (context === null) return false;
      context.font = `${style.fontSize} ${style.fontFamily}`;
      const room =
        input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      return context.measureText(input.placeholder).width <= room;
    })
  ).toBe(true);
});

test("on a phone the decision's buttons are a bar at the bottom, and the page ends above it", async ({
  page,
  desk
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.clock.install();
  await desk.open({}, "?issue=103");
  await expect(page.getByRole("group", { name: "Pipeline graph" })).toBeHidden();
  const stepper = page.getByRole("list", { name: "Stages and their status" });
  await expect(stepper.getByRole("button")).toHaveCount(9);

  // The incident and the way on are on screen at load, in the page flow.
  await expect(page.getByLabel("Reason from the engine")).toBeInViewport();
  const resume = page.getByRole("combobox", { name: "Resume from" });

  // The stepper selects a stage for the inspector; the decision stays.
  await stepper.getByRole("button", { name: /^Check/ }).click();
  await expect(inspector(page).getByRole("heading", { name: "Check", level: 2 })).toBeVisible();

  // Continue uses the stage chosen above, and focus moves to the next decision.
  await resume.click();
  await page.getByRole("option", { name: "Check" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await skipUndo(page);
  const next = page.getByRole("heading", { name: "Review the work" });
  await expect(next).toBeFocused();
  expect(await desk.calls()).toEqual([
    { issue: 103, action: "continue", payload: { from: "check" } }
  ]);

  // At the review gate the buttons are a bar fixed to the bottom of the screen.
  const bar = decide(page, "Review the work");
  const ship = bar.getByRole("button", { name: "Ship as draft PR…" });
  await expect(ship).toBeInViewport();
  expect((await ship.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  const barBox = await bar.boundingBox();
  expect((barBox?.y ?? 0) + (barBox?.height ?? 0)).toBeCloseTo(800, 0);
  expect(barBox?.height ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(130);
  // The end of the page scrolls above the bar, not under it.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const end = await inspector(page).boundingBox();
  const fixedBar = await bar.boundingBox();
  expect((end?.y ?? 0) + (end?.height ?? 0)).toBeLessThanOrEqual(fixedBar?.y ?? 0);

  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("keeps the board and an issue usable from the keyboard", async ({ page, desk }) => {
  await desk.open();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
});
