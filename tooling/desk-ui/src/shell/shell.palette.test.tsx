import type { IssueSummary } from "@repo/desk/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { PALETTE_LIMIT, rankEntries, type PaletteCommand } from "./shell.palette";
import { DeskApp } from "../desk.app";
import { fakeApi, makeState, makeSummary, renderDesk } from "../test/test.render";

const entry = (label: string): { command: PaletteCommand } => ({
  command: { id: label, label, run: () => undefined }
});

const labels = (entries: readonly { command: PaletteCommand }[]): string[] =>
  entries.map((item) => item.command.label);

describe("rankEntries", () => {
  it("ranks an early substring over a late one over letters with gaps, and drops non-matches", () => {
    const ranked = rankEntries(
      [
        entry("Go to Health"),
        entry("#44 Show loop counts"),
        entry("#42 Add an empty state"),
        entry("Empty the trash"),
        entry("Explain the verdict")
      ],
      "empty"
    );
    expect(labels(ranked)).toEqual(["Empty the trash", "#42 Add an empty state"]);
    expect(labels(rankEntries([entry("Go to Runs"), entry("Go to Health")], "hlth"))).toEqual([
      "Go to Health"
    ]);
  });

  it("keeps the best twelve and each label once", () => {
    const many = Array.from({ length: 20 }, (_, index) => entry(`#${String(index + 1)} Issue`));
    expect(rankEntries(many, "issue")).toHaveLength(PALETTE_LIMIT);
    expect(labels(rankEntries([entry("Board"), entry("Board")], "board"))).toEqual(["Board"]);
  });
});

const issue = (issueNumber: number, stage: "plan-gate" | "build", title: string): IssueSummary => ({
  ...makeSummary(
    makeState({ issueNumber, stage, status: stage === "build" ? "running" : "waiting" })
  ),
  title
});

const showBoard = () =>
  renderDesk(
    <DeskApp />,
    fakeApi({
      issues: () =>
        Promise.resolve([
          issue(42, "plan-gate", "Add an empty state"),
          issue(44, "build", "Show loop counts")
        ])
    })
  );

const selected = (): string =>
  within(screen.getByRole("listbox")).getByRole("option", { selected: true }).textContent ?? "";

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("CommandPalette", () => {
  it("opens on Ctrl+K, lists your turn and the pages, moves with the arrows, and runs on Enter", async () => {
    showBoard();
    await screen.findByRole("link", { name: /#42/ });
    await userEvent.keyboard("{Control>}k{/Control}");
    const search = await screen.findByRole("combobox", { name: "Search" });
    await waitFor(() => expect(document.activeElement).toBe(search));

    // Without a search: the issue that waits on you, not the running one, then the pages.
    const options = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "#42 Add an empty statePlan approval · waiting for you",
      "BoardG B",
      "HealthG H",
      "RunsG R"
    ]);
    expect(selected()).toContain("#42");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(selected()).toContain("Health");
    await userEvent.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}");
    expect(selected()).toContain("Runs");

    // Typing searches every issue, the running one too.
    await userEvent.type(search, "loop");
    expect(selected()).toContain("#44 Show loop counts");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(window.location.search).toBe("?issue=44"));
    expect(screen.queryByRole("combobox", { name: "Search" })).toBeNull();
  });

  it("opens on the slash key, says when nothing matches, and closes on Escape", async () => {
    showBoard();
    await screen.findByRole("link", { name: /#42/ });
    await userEvent.keyboard("/");
    const search = await screen.findByRole("combobox", { name: "Search" });
    await userEvent.type(search, "zzzz");
    expect(screen.getByText("No match.")).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("combobox", { name: "Search" })).toBeNull());
  });
});
