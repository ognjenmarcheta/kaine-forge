import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const componentDirectory = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(componentDirectory, "organization-create-dialog.tsx"), "utf8");

describe("OrganizationCreateDialog contract", () => {
  it("uses ConfigFormModal from @repo/ui with required name field", () => {
    expect(source).toContain("ConfigFormModal");
    expect(source).toContain('from "@repo/ui"');
    expect(source).toContain('name: "name"');
    expect(source).toContain("required: true");
  });

  it("surfaces generic errors and trims the organization name before submit", () => {
    expect(source).toContain("name.trim()");
    expect(source).toContain('"error.generic"');
    expect(source).toContain("onSubmit(name.trim())");
  });
});
