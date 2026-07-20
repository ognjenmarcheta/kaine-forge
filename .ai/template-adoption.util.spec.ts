import { describe, expect, it } from "vitest";

import {
  activeTemplateReferences,
  adoptionTargets,
  applyTemplateAdoption,
  deriveTemplateAdoptionConfig,
  excludedFromTemplateAdoption,
  parseTemplateAdoptionConfig
} from "./template-adoption.util";

describe("deriveTemplateAdoptionConfig", () => {
  it("derives slugs and app defaults from the product name", () => {
    const config = deriveTemplateAdoptionConfig({
      productName: "Acme Ops",
      desktopIdentifier: "com.acme.ops.desktop"
    });

    expect(config).toMatchObject({
      productName: "Acme Ops",
      packageName: "acme-ops",
      repoSlug: "acme-ops",
      dockerImagePrefix: "acme-ops",
      s3Bucket: "acme-ops-dev",
      webTitle: "acme-ops",
      mobileName: "Acme Ops Mobile",
      mobileSlug: "acme-ops-mobile",
      desktopProductName: "Acme Ops",
      desktopWindowTitle: "Acme Ops Desktop",
      desktopIdentifier: "com.acme.ops.desktop"
    });
  });

  it("uses provided values over derived defaults", () => {
    const config = deriveTemplateAdoptionConfig({
      productName: "Acme Ops",
      packageName: "acme-platform",
      repoSlug: "acme-monorepo",
      dockerImagePrefix: "registry/acme",
      s3Bucket: "acme-assets",
      webTitle: "Acme Console",
      mobileName: "Acme Field",
      mobileSlug: "acme-field",
      desktopProductName: "Acme Workbench",
      desktopWindowTitle: "Acme Workbench",
      desktopIdentifier: "io.acme.workbench",
      compatibilityPolicy: "Acme follows semver.",
      designCompatibilityPolicy: "Acme keeps design changes documented."
    });

    expect(config.packageName).toBe("acme-platform");
    expect(config.repoSlug).toBe("acme-monorepo");
    expect(config.dockerImagePrefix).toBe("registry/acme");
    expect(config.s3Bucket).toBe("acme-assets");
    expect(config.webTitle).toBe("Acme Console");
    expect(config.mobileName).toBe("Acme Field");
    expect(config.mobileSlug).toBe("acme-field");
    expect(config.desktopProductName).toBe("Acme Workbench");
    expect(config.desktopWindowTitle).toBe("Acme Workbench");
    expect(config.desktopIdentifier).toBe("io.acme.workbench");
    expect(config.compatibilityPolicy).toBe("Acme follows semver.");
    expect(config.designCompatibilityPolicy).toBe("Acme keeps design changes documented.");
  });
});

describe("parseTemplateAdoptionConfig", () => {
  it("rejects missing product names and invalid identifiers", () => {
    expect(() => parseTemplateAdoptionConfig({ packageName: "acme" })).toThrow(/productName/);
    expect(() =>
      parseTemplateAdoptionConfig({
        productName: "Acme Ops",
        packageName: "Acme Ops",
        desktopIdentifier: "not valid"
      })
    ).toThrow(/packageName/);
  });
});

describe("applyTemplateAdoption", () => {
  it("rewrites only allowlisted active identity surfaces", () => {
    const config = deriveTemplateAdoptionConfig({
      productName: "Acme Ops",
      desktopIdentifier: "com.acme.ops.desktop",
      compatibilityPolicy: "Acme supports the current public API for one major version.",
      designCompatibilityPolicy: "Acme records visual breaking changes in release notes."
    });
    const files = new Map<string, string>([
      [
        "package.json",
        JSON.stringify(
          { name: "kaine-forge", dependencies: { "@repo/ui": "workspace:*" } },
          null,
          2
        )
      ],
      ["README.md", "# Kaine Forge\n\ndocker build -f Dockerfile.web -t kaine-forge-web .\n"],
      [
        "MONOREPO_GUIDE.md",
        [
          "# Monorepo Guide",
          "",
          "<!-- TEMPLATE_POLICY_BLOCK_START -->",
          "",
          "Kaine Forge is a boilerplate template.",
          "",
          "<!-- TEMPLATE_POLICY_BLOCK_END -->",
          "",
          "kaine-forge/",
          'import { Button } from "@repo/ui";'
        ].join("\n")
      ],
      ["apps/web/index.html", "<title>kaine-forge</title>\n"],
      ["apps/web/src/stores/theme.store.ts", '      name: "kaine.theme.mode",\n'],
      ["packages/auth/src/auth.instance.ts", '      cookiePrefix: "kaine",\n'],
      [
        "packages/translation/src/locales/en/common.json",
        JSON.stringify({ "common.appName": "Kaine Forge" }, null, 2)
      ],
      ["packages/ui/src/example.ts", 'import { Button } from "@repo/ui";\n']
    ]);

    const result = applyTemplateAdoption(files, config);

    expect(result.changedFiles.map((file) => file.path)).toEqual([
      "package.json",
      "README.md",
      "MONOREPO_GUIDE.md",
      "apps/web/index.html",
      "apps/web/src/stores/theme.store.ts",
      "packages/auth/src/auth.instance.ts",
      "packages/translation/src/locales/en/common.json"
    ]);
    expect(result.files.get("apps/web/src/stores/theme.store.ts")).toContain(
      'name: "acme-ops.theme.mode"'
    );
    expect(result.files.get("packages/auth/src/auth.instance.ts")).toContain(
      'cookiePrefix: "acme-ops"'
    );
    expect(result.files.get("package.json")).toContain('"name": "acme-ops"');
    expect(result.files.get("package.json")).toContain('"@repo/ui": "workspace:*"');
    expect(result.files.get("README.md")).toContain("# Acme Ops");
    expect(result.files.get("README.md")).toContain("-t acme-ops-web");
    expect(result.files.get("MONOREPO_GUIDE.md")).toContain(
      "Acme supports the current public API for one major version."
    );
    expect(result.files.get("MONOREPO_GUIDE.md")).not.toContain("TEMPLATE_POLICY_BLOCK");
    expect(result.files.get("MONOREPO_GUIDE.md")).toContain("acme-ops/");
    expect(result.files.get("MONOREPO_GUIDE.md")).toContain("@repo/ui");
    expect(result.files.get("packages/ui/src/example.ts")).toBe(
      'import { Button } from "@repo/ui";\n'
    );
  });

  it("reports active template references for check mode", () => {
    const references = activeTemplateReferences(
      new Map<string, string>([
        ["README.md", "# Kaine Forge\n"],
        ["apps/web/index.html", "<title>kaine-forge</title>\n"],
        ["apps/web/src/stores/theme.store.ts", 'name: "kaine.theme.mode",\n'],
        ["packages/auth/src/auth.instance.ts", 'cookiePrefix: "kaine",\n'],
        ["apps/desktop/src-tauri/tauri.conf.json", '"identifier": "com.kaine.forge.desktop"\n']
      ])
    );

    expect(references).toEqual([
      { path: "apps/desktop/src-tauri/tauri.conf.json", line: 1, match: "com.kaine.forge" },
      { path: "apps/web/index.html", line: 1, match: "kaine-forge" },
      { path: "apps/web/src/stores/theme.store.ts", line: 1, match: '"kaine.' },
      { path: "packages/auth/src/auth.instance.ts", line: 1, match: '"kaine"' },
      { path: "README.md", line: 1, match: "Kaine Forge" }
    ]);
  });

  it("excludes historical, generated, build, dependency, and local artifact paths", () => {
    expect(excludedFromTemplateAdoption("apps/web/CHANGELOG.md")).toBe(true);
    expect(excludedFromTemplateAdoption("apps/web/src/graphql/generated/graphql.ts")).toBe(true);
    expect(excludedFromTemplateAdoption("apps/desktop/src-tauri/target/debug/build.txt")).toBe(
      true
    );
    expect(excludedFromTemplateAdoption(".worktrees/adopted-repo/README.md")).toBe(true);
    expect(excludedFromTemplateAdoption(".ai/template-adoption.util.ts")).toBe(true);
    expect(excludedFromTemplateAdoption(".ai/skills/kaine-adopt-template.md")).toBe(true);
    expect(excludedFromTemplateAdoption(".agents/skills/kaine-adopt-template/SKILL.md")).toBe(true);
    expect(excludedFromTemplateAdoption("node_modules/example/package.json")).toBe(true);
    expect(excludedFromTemplateAdoption(".ai.local/mcp.json")).toBe(true);
    expect(excludedFromTemplateAdoption("README.md")).toBe(false);
  });

  it("keeps the replacement manifest allowlisted", () => {
    expect(adoptionTargets).toContain("README.md");
    expect(adoptionTargets).toContain("CONTEXT.md");
    expect(adoptionTargets).toContain("CONTRIBUTING.md");
    expect(adoptionTargets).toContain("docker-compose.yml");
    expect(adoptionTargets).toContain(".ai/guide.md");
    expect(adoptionTargets).toContain(".ai/skills/kaine-open-pr.md");
    expect(adoptionTargets).toContain(".ai/skills/kaine-test.md");
    expect(adoptionTargets).toContain("packages/auth/src/auth.instance.ts");
    expect(adoptionTargets).toContain("apps/web/src/stores/theme.store.ts");
    expect(adoptionTargets).toContain("apps/mobile/src/features/auth/auth.definition.ts");
    expect(adoptionTargets).not.toContain("pnpm-lock.yaml");
    expect(adoptionTargets).not.toContain("packages/ui/src/example.ts");
  });
});
