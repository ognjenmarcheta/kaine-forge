import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourcePath = resolve(dirname(fileURLToPath(import.meta.url)), "todos.route.tsx");
const source = readFileSync(sourcePath, "utf8");

describe("TodosRoute AI generation contract", () => {
  it("uses the generated GraphQL mutation and Sonner toasts for AI feedback", () => {
    expect(source).toContain("useGenerateTodosMutation");
    expect(source).toContain('from "sonner"');
    expect(source).toContain("toast.");
  });
});
