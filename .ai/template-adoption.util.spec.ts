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
      webTitle: "Acme Ops",
      mobileName: "Acme Ops Mobile",
      mobileSlug: "acme-ops-mobile",
      mobileScheme: "acmeops",
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
    expect(() =>
      parseTemplateAdoptionConfig({
        productName: "Acme Ops",
        desktopIdentifier: "com.acme.ops.desktop",
        repoOwner: "not valid"
      })
    ).toThrow(/repoOwner/);
  });
});

describe("applyTemplateAdoption", () => {
  it("empties the scorecard ledger so adopters do not inherit template run history", () => {
    const config = deriveTemplateAdoptionConfig({
      productName: "Acme Ops",
      desktopIdentifier: "com.acme.ops.desktop",
      compatibilityPolicy: "Acme supports the current public API for one major version.",
      designCompatibilityPolicy: "Acme records visual breaking changes in release notes."
    });
    const ledger = [
      "# Monorepo Health Scorecard",
      "",
      "## Band descriptors",
      "",
      "| Band | Meaning |",
      "",
      "<!-- scorecard:data:start -->",
      "",
      "```json",
      JSON.stringify(
        {
          schema: 1,
          runs: [
            {
              date: "2026-07-28",
              commit: "15102fc",
              overall: 7.3,
              findings: [{ slug: "some-finding", issue: 325 }]
            }
          ],
          authoredFlows: [{ id: "release-deploy", title: "Release and deploy" }]
        },
        null,
        2
      ),
      "```",
      "",
      "<!-- scorecard:data:end -->",
      "",
      "<!-- scorecard:generated:start -->",
      "",
      "### Run history",
      "",
      "| 2026-07-28 | `15102fc` | 7.3 |",
      "",
      "<!-- scorecard:generated:end -->",
      "",
      "## Calibration notes",
      "",
      "Binding on later runs.",
      "",
      "### 2026-07-28 — first baseline (`15102fc`, sequential)",
      "",
      "- **Baseline run.** Do not re-litigate.",
      ""
    ].join("\n");

    const result = applyTemplateAdoption(
      new Map<string, string>([["docs/agents/monorepo-scorecard.md", ledger]]),
      config
    );
    const next = result.files.get("docs/agents/monorepo-scorecard.md") ?? "";

    // The adopter keeps the reusable scaffolding.
    expect(next).toContain("## Band descriptors");
    expect(next).toContain("## Calibration notes");
    expect(next).toContain("Binding on later runs.");

    // And inherits none of the template's own history.
    expect(next).toContain('"runs": []');
    expect(next).not.toContain("15102fc");
    expect(next).not.toContain("325");
    expect(next).not.toContain("### 2026-07-28");
    expect(next).toContain("_No runs recorded yet.");

    // authoredFlows describes template architecture, not history, so the
    // renderer still has the flows it requires.
    expect(next).toContain('"authoredFlows"');
    expect(next).toContain("release-deploy");

    // A trailing blank line would fail format:check in the adopted repository.
    expect(next.endsWith("\n")).toBe(true);
    expect(next.endsWith("\n\n")).toBe(false);
    expect(result.changedFiles.map((file) => file.path)).toContain(
      "docs/agents/monorepo-scorecard.md"
    );
  });

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
      [
        "packages/auth/src/auth.instance.ts",
        '      cookiePrefix: "kaine",\nexport const EXPO_AUTH_SCHEME = "kaineforge";\n'
      ],
      ["apps/mobile/src/lib/auth-api.ts", '        storagePrefix: "kaine",\n'],
      ["apps/mobile/src/features/auth/auth.config.ts", '  scheme: "kaineforge",\n'],
      ["apps/desktop/src-tauri/Cargo.toml", 'name = "kaine_forge_desktop_lib"\n'],
      ["docs/troubleshooting.md", "Cookie is **`kaine.session_token`**\n"],
      [
        "packages/translation/src/locales/en/common.json",
        JSON.stringify({ "common.appName": "Kaine Forge" }, null, 2)
      ],
      ["packages/ui/src/example.ts", 'import { Button } from "@repo/ui";\n']
    ]);

    const result = applyTemplateAdoption(files, config);

    expect(result.changedFiles.map((file) => file.path).sort()).toEqual(
      [
        "package.json",
        "README.md",
        "MONOREPO_GUIDE.md",
        "apps/web/index.html",
        "apps/web/src/stores/theme.store.ts",
        "apps/mobile/src/lib/auth-api.ts",
        "apps/mobile/src/features/auth/auth.config.ts",
        "apps/desktop/src-tauri/Cargo.toml",
        "docs/troubleshooting.md",
        "packages/auth/src/auth.instance.ts",
        "packages/translation/src/locales/en/common.json"
      ].sort()
    );
    expect(result.files.get("apps/web/src/stores/theme.store.ts")).toContain(
      'name: "acme-ops.theme.mode"'
    );
    expect(result.files.get("packages/auth/src/auth.instance.ts")).toContain(
      'cookiePrefix: "acme-ops"'
    );
    expect(result.files.get("packages/auth/src/auth.instance.ts")).toContain(
      'EXPO_AUTH_SCHEME = "acmeops"'
    );
    expect(result.files.get("apps/mobile/src/lib/auth-api.ts")).toContain(
      'storagePrefix: "acme-ops"'
    );
    expect(result.files.get("apps/mobile/src/features/auth/auth.config.ts")).toContain(
      'scheme: "acmeops"'
    );
    expect(result.files.get("apps/desktop/src-tauri/Cargo.toml")).toContain(
      'name = "acme_ops_desktop_lib"'
    );
    expect(result.files.get("docs/troubleshooting.md")).toContain("`acme-ops.session_token`");
    expect(result.files.get("apps/web/index.html")).toBe("<title>Acme Ops</title>\n");
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

  it("rewrites the GitHub owner when repoOwner is set", () => {
    const config = deriveTemplateAdoptionConfig({
      productName: "Acme Ops",
      repoOwner: "acme",
      desktopIdentifier: "com.acme.ops.desktop"
    });
    const files = new Map<string, string>([
      ["README.md", "https://github.com/ognjenmarcheta/kaine-forge/actions/workflows/ci-pr.yml\n"],
      [".ai/guide.md", "Issues are tracked in `ognjenmarcheta/kaine-forge`.\n"],
      [".github/CODEOWNERS", "* @ognjenmarcheta\n"]
    ]);

    const result = applyTemplateAdoption(files, config);

    expect(result.files.get("README.md")).toContain(
      "github.com/acme/acme-ops/actions/workflows/ci-pr.yml"
    );
    expect(result.files.get(".ai/guide.md")).toContain("acme/acme-ops");
    expect(result.files.get(".github/CODEOWNERS")).toBe("* @acme\n");
  });

  it("reports owner leftovers in check mode", () => {
    const references = activeTemplateReferences(
      new Map<string, string>([["README.md", "https://github.com/ognjenmarcheta/acme-ops\n"]])
    );

    expect(references).toEqual([{ path: "README.md", line: 1, match: "ognjenmarcheta" }]);
  });

  it("reports active template references for check mode", () => {
    const references = activeTemplateReferences(
      new Map<string, string>([
        ["README.md", "# Kaine Forge\n"],
        ["apps/web/index.html", "<title>kaine-forge</title>\n"],
        ["apps/web/src/stores/theme.store.ts", 'name: "kaine.theme.mode",\n'],
        ["packages/auth/src/auth.instance.ts", 'cookiePrefix: "kaine",\n'],
        ["apps/desktop/src-tauri/tauri.conf.json", '"identifier": "com.kaine.forge.desktop"\n'],
        ["apps/mobile/app.json", '"scheme": "kaineforge"\n'],
        ["apps/desktop/src-tauri/src/main.rs", "  kaine_forge_desktop_lib::run()\n"],
        ["docs/troubleshooting.md", "Cookie is **`kaine.session_token`**\n"]
      ])
    );

    expect(references).toEqual([
      { path: "apps/desktop/src-tauri/src/main.rs", line: 1, match: "kaine_forge" },
      { path: "apps/desktop/src-tauri/tauri.conf.json", line: 1, match: "com.kaine.forge" },
      { path: "apps/mobile/app.json", line: 1, match: "kaineforge" },
      { path: "apps/web/index.html", line: 1, match: "kaine-forge" },
      { path: "apps/web/src/stores/theme.store.ts", line: 1, match: '"kaine.' },
      { path: "docs/troubleshooting.md", line: 1, match: "`kaine." },
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
    expect(excludedFromTemplateAdoption(".tauri-target/release/build/out/a.js")).toBe(true);
    expect(excludedFromTemplateAdoption(".worktrees/adopted-repo/README.md")).toBe(true);
    expect(excludedFromTemplateAdoption(".ai/template-adoption.util.ts")).toBe(true);
    expect(excludedFromTemplateAdoption(".ai/skills/kaine-adopt-template.md")).toBe(true);
    expect(excludedFromTemplateAdoption(".agents/skills/kaine-adopt-template/SKILL.md")).toBe(true);
    expect(excludedFromTemplateAdoption("node_modules/example/package.json")).toBe(true);
    expect(excludedFromTemplateAdoption(".ai.local/mcp.json")).toBe(true);
    expect(
      excludedFromTemplateAdoption("docs/superpowers/plans/2026-07-22-domain-knowledge.md")
    ).toBe(true);
    expect(excludedFromTemplateAdoption(".changeset/adoption-e2e-findings.md")).toBe(true);
    expect(excludedFromTemplateAdoption("README.md")).toBe(false);
  });

  it("keeps the replacement manifest allowlisted", () => {
    expect(adoptionTargets).toContain("README.md");
    expect(adoptionTargets).toContain("CONTEXT.md");
    expect(adoptionTargets).toContain("CONTRIBUTING.md");
    expect(adoptionTargets).toContain("docker-compose.yml");
    expect(adoptionTargets).toContain(".ai/guide.md");
    expect(adoptionTargets).toContain(".ai/review.md");
    expect(adoptionTargets).toContain("docs/agents/day-one.md");
    expect(adoptionTargets).toContain("docs/adr/0009-domain-knowledge-as-agent-infra.md");
    expect(adoptionTargets).toContain(".ai/skills/kaine-open-pr.md");
    expect(adoptionTargets).toContain(".ai/skills/kaine-test.md");
    expect(adoptionTargets).toContain("packages/auth/src/auth.instance.ts");
    expect(adoptionTargets).toContain("apps/web/src/stores/theme.store.ts");
    expect(adoptionTargets).toContain("apps/mobile/src/features/auth/auth.definition.ts");
    expect(adoptionTargets).toContain("apps/mobile/src/lib/auth-api.ts");
    expect(adoptionTargets).toContain("apps/mobile/src/features/auth/auth.config.ts");
    expect(adoptionTargets).toContain("apps/desktop/src-tauri/src/main.rs");
    expect(adoptionTargets).toContain("docs/troubleshooting.md");
    expect(adoptionTargets).toContain("docs/agents/issue-tracker.md");
    expect(adoptionTargets).toContain(".ai/hooks/session-start.mjs");
    expect(adoptionTargets).toContain(".ai/agents/kaine-explorer.md");
    expect(adoptionTargets).toContain(".claude/settings.json");
    expect(adoptionTargets).toContain(".github/CODEOWNERS");
    expect(adoptionTargets).toContain(".github/ISSUE_TEMPLATE/config.yml");
    expect(adoptionTargets).not.toContain("REVIEW.md");
    expect(adoptionTargets).not.toContain("pnpm-lock.yaml");
    expect(adoptionTargets).not.toContain("packages/ui/src/example.ts");
  });
});
