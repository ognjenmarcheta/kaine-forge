import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AlertDialogFooter, AlertDialogHeader } from "./alert-dialog";
import { Button } from "./button";

describe("AlertDialog", () => {
  it("renders header with layout classes", () => {
    const markup = renderToStaticMarkup(
      <AlertDialogHeader className="custom-header">
        <span>Title area</span>
      </AlertDialogHeader>
    );
    expect(markup).toContain("flex flex-col space-y-2");
    expect(markup).toContain("custom-header");
    expect(markup).toContain("Title area");
  });

  it("renders footer with layout classes", () => {
    const markup = renderToStaticMarkup(
      <AlertDialogFooter className="custom-footer">
        <Button type="button">Cancel</Button>
      </AlertDialogFooter>
    );
    expect(markup).toContain("flex flex-col-reverse");
    expect(markup).toContain("custom-footer");
    expect(markup).toContain("Cancel");
  });
});
