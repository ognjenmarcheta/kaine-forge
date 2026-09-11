import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { DashboardOverview } from "./dashboard-overview";

const scope = vi.hoisted(() => ({ organizationsVisible: true }));
vi.mock("../../../hooks/use-organization", () => ({
  useOrganization: () => ({
    ...scope,
    activeOrganizationId: "one",
    organizations: [{ id: "one", name: "Example organization" }]
  })
}));
vi.mock("../../../hooks/use-translation", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

describe("dashboard navigation", () => {
  it.each([true, false])("exposes supported workflows with organizations visible=%s", (visible) => {
    scope.organizationsVisible = visible;
    const markup = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(DashboardOverview))
    );
    for (const path of ["todos", "notes", "assistant"]) expect(markup).toContain(`href="/${path}"`);
    expect(markup.includes('href="/members"')).toBe(visible);
    expect(markup.includes("Example organization")).toBe(visible);
  });
});
