import type { HealthReport } from "@repo/desk/contracts";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DeskApiError } from "../api/api.client";
import { DeskApp } from "../desk.app";
import { fakeApi, renderDesk } from "../test/test.render";

const REPORT: HealthReport = {
  ok: false,
  generatedAt: "2026-10-13T09:00:00.000Z",
  checks: [
    { id: "node", label: "Node.js", status: "ok", detail: "v24.0.0", command: null, fix: null },
    {
      id: "gh-identity",
      label: "gh identity",
      status: "error",
      detail: "gh is not authenticated",
      command: "gh auth login",
      fix: null
    },
    {
      id: "docker-image",
      label: "Docker image",
      status: "warn",
      detail: "kaine-desk-worker:abc is not built.",
      command: "pnpm desk docker build",
      fix: "docker-build"
    }
  ]
};

const rowOf = async (label: string): Promise<HTMLElement> => {
  const name = await screen.findByText(label, { selector: "strong" });
  const row = name.closest("li");
  if (row === null) throw new Error(`no row for ${label}`);
  return row;
};

beforeEach(() => window.history.replaceState(null, "", "?view=health"));
afterEach(() => window.history.replaceState(null, "", "/"));

describe("HealthView remedies", () => {
  it("offers the command of a failed check to copy, and nothing on a passed check", async () => {
    renderDesk(<DeskApp />, fakeApi({ health: () => Promise.resolve(REPORT) }));

    const identity = await rowOf("gh identity");
    expect(within(identity).getByText("gh auth login")).toBeTruthy();
    expect(
      within(identity).getByRole("button", { name: "Copy the command: gh auth login" })
    ).toBeTruthy();
    // A login is the engineer's to do: no repair button.
    expect(within(identity).queryByRole("button", { name: "Fix" })).toBeNull();
    expect(within(await rowOf("Node.js")).queryByRole("button")).toBeNull();
  });

  it("runs a repair only after the confirmation", async () => {
    const healthFix = vi.fn(() => Promise.resolve());
    renderDesk(<DeskApp />, fakeApi({ health: () => Promise.resolve(REPORT), healthFix }));

    await userEvent.click(within(await rowOf("Docker image")).getByRole("button", { name: "Fix" }));
    expect(healthFix).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog", { name: "Build the Docker image?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Build the image" }));

    expect(healthFix).toHaveBeenCalledWith("docker-build");
    expect(
      await within(await rowOf("Docker image")).findByRole("button", { name: /Running/ })
    ).toHaveProperty("disabled", true);
  });

  it("shows a refused repair and lets the engineer try again", async () => {
    const healthFix = vi.fn(() =>
      Promise.reject(new DeskApiError("busy", 409, "'docker-build' still runs."))
    );
    renderDesk(<DeskApp />, fakeApi({ health: () => Promise.resolve(REPORT), healthFix }));

    await userEvent.click(within(await rowOf("Docker image")).getByRole("button", { name: "Fix" }));
    await userEvent.click(await screen.findByRole("button", { name: "Build the image" }));

    expect(await screen.findByText("'docker-build' still runs.")).toBeTruthy();
    expect(within(await rowOf("Docker image")).getByRole("button", { name: "Fix" })).toHaveProperty(
      "disabled",
      false
    );
  });
});
