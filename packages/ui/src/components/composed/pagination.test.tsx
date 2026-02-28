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
});
