import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourcePath = resolve(dirname(fileURLToPath(import.meta.url)), "router.tsx");
const source = readFileSync(sourcePath, "utf8");

describe("app shell header controls contract", () => {
  it("uses app-sidebar composition with shadcn-style sections", () => {
    expect(source).toContain("AppSidebar");
    expect(source).toContain("OrganizationSwitcher");
    expect(source).toContain("NavMain");
    expect(source).toContain("NavPreferences");
    expect(source).toContain("NavUser");
    expect(source).toContain("Breadcrumbs");
    expect(source).toContain("navigation.settings");
    expect(source).toContain('layout="inline-icons"');
  });

  it("keeps legacy selector/menu wrappers out of the shell", () => {
    expect(source).not.toContain("HeaderSelectControl");
    expect(source).not.toContain("HeaderUserMenu");
    expect(source).not.toContain("ShellSelectControl");
    expect(source).not.toContain("ShellUserMenu");
    expect(source).not.toContain("LabeledSelect");
    expect(source).not.toContain("<UserMenu");
  });
});
