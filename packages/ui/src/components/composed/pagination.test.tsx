// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { Pagination } from "./pagination";

describe("pagination", () => {
  it("uses consumer-provided navigation and control labels", () => {
    const markup = renderToStaticMarkup(
      <Pagination
        ariaLabel="Pages"
        currentPage={2}
        firstPageLabel="Go to first"
        lastPageLabel="Go to last"
        nextPageLabel="Go to next"
        onPageChange={vi.fn()}
        previousPageLabel="Go to previous"
        totalPages={5}
      />
    );

    expect(markup).toContain('aria-label="Pages"');
    expect(markup).toContain('aria-label="Go to first"');
    expect(markup).toContain('aria-label="Go to previous"');
    expect(markup).toContain('aria-label="Go to next"');
    expect(markup).toContain('aria-label="Go to last"');
    expect(markup).not.toContain('aria-label="Pagination"');
    expect(markup).not.toContain('aria-label="First page"');
  });

  it.each([
    ["Go to next", 4, "5"],
    ["Go to last", 2, "5"],
    ["Go to previous", 2, "1"],
    ["Go to first", 4, "1"]
  ])(
    "keeps focus on the current page when %s from page %i disables itself",
    async (label, start, landing) => {
      vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
      function Pages() {
        const [page, setPage] = useState(start);
        return (
          <Pagination
            ariaLabel="Pages"
            currentPage={page}
            firstPageLabel="Go to first"
            lastPageLabel="Go to last"
            nextPageLabel="Go to next"
            onPageChange={setPage}
            previousPageLabel="Go to previous"
            totalPages={5}
          />
        );
      }
      const container = document.createElement("div");
      document.body.append(container);
      const root = createRoot(container);
      await act(async () => root.render(<Pages />));

      const edge = container.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
      edge?.focus();
      await act(async () => edge?.click());

      expect(edge?.disabled).toBe(true);
      expect(document.activeElement?.textContent).toBe(landing);
      expect(document.activeElement?.getAttribute("aria-current")).toBe("page");
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  );
});
