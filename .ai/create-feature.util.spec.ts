import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./ai.util";
import {
  applyCreateFeature,
  buildFeatureFiles,
  CreateFeatureError,
  deriveFeatureNames,
  parseCreateFeatureArgs,
  wiringTargets
} from "./create-feature.util";

describe("deriveFeatureNames", () => {
  it("derives every casing a slice template needs", () => {
    expect(
      deriveFeatureNames({ name: "invoice", plural: "invoices", write: false, generate: true })
    ).toEqual({
      singularKebab: "invoice",
      pluralKebab: "invoices",
      singularCamel: "invoice",
      pluralCamel: "invoices",
      singularPascal: "Invoice",
      pluralPascal: "Invoices",
      singularWords: "invoice",
      pluralWords: "invoices",
      pluralSnake: "invoices",
      pluralConstant: "INVOICES",
      label: "Invoices"
    });
  });

  it("derives multi-word names", () => {
    expect(
      deriveFeatureNames({
        name: "purchase-order",
        plural: "purchase-orders",
        write: false,
        generate: true
      })
    ).toEqual({
      singularKebab: "purchase-order",
      pluralKebab: "purchase-orders",
      singularCamel: "purchaseOrder",
      pluralCamel: "purchaseOrders",
      singularPascal: "PurchaseOrder",
      pluralPascal: "PurchaseOrders",
      singularWords: "purchase order",
      pluralWords: "purchase orders",
      pluralSnake: "purchase_orders",
      pluralConstant: "PURCHASE_ORDERS",
      label: "Purchase orders"
    });
  });

  it("defaults the plural to the singular plus s", () => {
    const names = deriveFeatureNames({ name: "invoice", write: false, generate: true });
    expect(names.pluralKebab).toBe("invoices");
    expect(names.label).toBe("Invoices");
  });

  it("prefers an explicit label and compacts its whitespace", () => {
    const names = deriveFeatureNames({
      name: "purchase-order",
      plural: "purchase-orders",
      label: "  Purchase   Orders ",
      write: false,
      generate: true
    });
    expect(names.label).toBe("Purchase Orders");
  });

  it.each(["Invoice", "my_feature", "1x", "-x", "invoice-", "invoice--x", ""])(
    "rejects the invalid name %j",
    (name) => {
      expect(() => deriveFeatureNames({ name, write: false, generate: true })).toThrowError(
        /must be lowercase kebab-case/
      );
    }
  );

  it("rejects an invalid plural", () => {
    expect(() =>
      deriveFeatureNames({ name: "invoice", plural: "Invoices", write: false, generate: true })
    ).toThrowError(/--plural 'Invoices' must be lowercase kebab-case/);
  });

  it("rejects a plural equal to the singular", () => {
    expect(() =>
      deriveFeatureNames({ name: "data", plural: "data", write: false, generate: true })
    ).toThrowError(/--plural must differ from the singular name 'data'/);
  });

  it("rejects a blank label", () => {
    expect(() =>
      deriveFeatureNames({ name: "invoice", label: "   ", write: false, generate: true })
    ).toThrowError(/--label must not be empty/);
  });
});

describe("parseCreateFeatureArgs", () => {
  it("previews and generates by default", () => {
    expect(parseCreateFeatureArgs(["invoice"])).toEqual({
      name: "invoice",
      plural: undefined,
      label: undefined,
      write: false,
      generate: true
    });
  });

  it("reads every flag", () => {
    expect(
      parseCreateFeatureArgs([
        "purchase-order",
        "--plural",
        "purchase-orders",
        "--label",
        "Purchase orders",
        "--write",
        "--no-generate"
      ])
    ).toEqual({
      name: "purchase-order",
      plural: "purchase-orders",
      label: "Purchase orders",
      write: true,
      generate: false
    });
  });

  it("requires a feature name", () => {
    expect(() => parseCreateFeatureArgs(["--write"])).toThrowError(
      /requires a singular feature name/
    );
  });

  it("accepts one feature name only", () => {
    expect(() => parseCreateFeatureArgs(["invoice", "invoices"])).toThrowError(
      /accepts one feature name, received: invoice, invoices/
    );
  });

  it("rejects unknown flags", () => {
    expect(() => parseCreateFeatureArgs(["invoice", "--fields"])).toThrowError(
      /unknown argument '--fields'/
    );
  });

  it.each(["--plural", "--label"])("rejects %s without a value", (flag) => {
    expect(() => parseCreateFeatureArgs(["invoice", flag])).toThrowError(
      new RegExp(`${flag} requires a value`)
    );
    expect(() => parseCreateFeatureArgs(["invoice", flag, "--write"])).toThrowError(
      new RegExp(`${flag} requires a value`)
    );
  });
});

describe("CreateFeatureError", () => {
  it("names the file the caller has to look at", () => {
    const error = new CreateFeatureError("apps/web/src/router.tsx", "anchor not found");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("CreateFeatureError");
    expect(error.path).toBe("apps/web/src/router.tsx");
    expect(error.message).toBe("anchor not found");
  });
});

describe("buildFeatureFiles", () => {
  const names = deriveFeatureNames({
    name: "purchase-order",
    plural: "purchase-orders",
    write: false,
    generate: true
  });
  const files = buildFeatureFiles(names);
  const read = (path: string): string => {
    const content = files.get(path);
    if (content === undefined) {
      throw new Error(`buildFeatureFiles did not emit ${path}`);
    }
    return content;
  };
  const apiDir = "apps/api/src/features/purchase-orders";
  const webDir = "apps/web/src/features/purchase-orders";

  it("emits the db and api slice under Feature-Driven Development names", () => {
    expect([...files.keys()]).toEqual([
      "packages/db/src/schema/purchase-orders.schema.ts",
      "packages/db/src/types/purchase-orders.type.ts",
      `${apiDir}/purchase-orders.config.ts`,
      `${apiDir}/purchase-orders.type.ts`,
      `${apiDir}/purchase-orders.util.ts`,
      `${apiDir}/purchase-orders.adapter.ts`,
      `${apiDir}/purchase-orders.adapter.test.ts`,
      `${apiDir}/purchase-orders.workflow.ts`,
      `${apiDir}/purchase-orders.workflow.test.ts`,
      `${apiDir}/purchase-orders.schema.ts`,
      `${apiDir}/purchase-orders.router.ts`,
      `${apiDir}/purchase-orders.router.test.ts`,
      "packages/translation/src/locales/en/purchase-orders.json",
      "packages/translation/src/locales/de/purchase-orders.json",
      "packages/translation/src/locales/sr/purchase-orders.json",
      "apps/web/src/graphql/operations/purchase-orders.graphql",
      `${webDir}/purchase-orders.config.ts`,
      `${webDir}/purchase-orders.route.tsx`,
      `${webDir}/purchase-order-detail.route.tsx`,
      `${webDir}/purchase-orders.route.test.ts`,
      "apps/e2e/tests/web-purchase-orders-flows.e2e.ts",
      ".changeset/create-feature-purchase-orders.md"
    ]);
  });

  it("names the Postgres table and index in snake_case", () => {
    const schema = read("packages/db/src/schema/purchase-orders.schema.ts");
    expect(schema).toContain('pgTable(\n  "purchase_orders",');
    expect(schema).toContain('index("purchase_orders_organization_id_created_at_idx")');
    expect(schema).toContain("export const purchaseOrdersTable");
  });

  it("scopes every adapter function to the Authenticated Organization Scope", () => {
    const adapter = read(`${apiDir}/purchase-orders.adapter.ts`);
    const exported = adapter.match(/export async function (\w+)\(/g) ?? [];

    expect(exported).toHaveLength(5);
    for (const declaration of exported) {
      const body = adapter.slice(adapter.indexOf(declaration));
      const nextExport = body.indexOf("export async function", 1);
      const fn = nextExport === -1 ? body : body.slice(0, nextExport);
      expect(fn).toContain("scope: AuthenticatedOrganizationScope");
      expect(fn).toContain("scope.organizationId");
    }
  });

  it("opens every resolver with requireOrganizationScope and filters subscriptions", () => {
    const router = read(`${apiDir}/purchase-orders.router.ts`);
    const resolvers =
      router.match(/async (?:purchaseOrders|purchaseOrder|create|update|delete)\w*\(/g) ?? [];

    expect(resolvers.length).toBeGreaterThanOrEqual(5);
    expect(router.match(/ctx\.requireOrganizationScope\(\)/g)).toHaveLength(8);
    expect(router.match(/filterByOrganization\(organizationId\)/g)).toHaveLength(3);
  });

  it("never lets a client supply the organization id", () => {
    const sdl = read(`${apiDir}/purchase-orders.schema.ts`);
    const inputs = sdl.slice(
      sdl.indexOf("input CreatePurchaseOrderInput"),
      sdl.indexOf("type PurchaseOrderDeletedPayload")
    );

    expect(inputs).not.toContain("organizationId");
    expect(sdl).toContain("organizationId: ID!");
  });

  it("emits no any and no type assertion outside as const in slice sources", () => {
    for (const [path, content] of files) {
      if (path.endsWith(".test.ts") || path.endsWith(".md") || path.endsWith(".json")) {
        continue;
      }
      expect(content, path).not.toMatch(/\bany\b/);
      expect(content, path).not.toMatch(/ as (?!const\b)/);
    }
  });

  it("keeps the emitted tests aligned with the emitted event names", () => {
    expect(read(`${apiDir}/purchase-orders.workflow.ts`)).toContain('"purchaseOrder:created"');
    expect(read(`${apiDir}/purchase-orders.workflow.test.ts`)).toContain('"purchaseOrder:created"');
    expect(read(`${apiDir}/purchase-orders.router.test.ts`)).toContain(
      'vi.mock("./purchase-orders.adapter"'
    );
  });
});

describe("applyCreateFeature", () => {
  // A reserved fixture name: this spec wires a feature into the real repository
  // files, so it must never collide with a feature the repository actually has.
  const names = deriveFeatureNames({
    name: "scaffoldfixture",
    plural: "scaffoldfixtures",
    write: false,
    generate: true
  });

  const readWiringTargets = (): Map<string, string> => {
    const files = new Map<string, string>();
    for (const path of wiringTargets) {
      files.set(path, readFileSync(join(REPO_ROOT, path), "utf8"));
    }
    return files;
  };

  it("changes every wiring target in the real repository", () => {
    const result = applyCreateFeature(readWiringTargets(), names);

    expect(result.changedPaths).toEqual([...wiringTargets]);
    expect(result.createdPaths).toEqual([...buildFeatureFiles(names).keys()]);
  });

  it("wires LF and CRLF sources equivalently while preserving each source's line endings", () => {
    const lf = new Map(
      [...readWiringTargets()].map(([path, text]) => [path, text.replace(/\r\n/g, "\n")])
    );
    const crlf = new Map([...lf].map(([path, text]) => [path, text.replace(/\n/g, "\r\n")]));
    const expected = applyCreateFeature(lf, names);
    const actual = applyCreateFeature(crlf, names);
    for (const path of wiringTargets) {
      expect(actual.files.get(path)?.replace(/\r\n/g, "\n")).toBe(expected.files.get(path));
      expect(actual.files.get(path)).toContain("\r\n");
    }
  });

  it("registers the feature everywhere the runtime reads it from", () => {
    const { files } = applyCreateFeature(readWiringTargets(), names);
    const read = (path: string): string => files.get(path) ?? "";

    expect(read("packages/db/src/schema/index.ts")).toContain(
      'export * from "./scaffoldfixtures.schema";'
    );
    expect(read("packages/db/src/types/index.ts")).toContain(
      'export * from "./scaffoldfixtures.type";'
    );
    expect(read("apps/api/src/pubsub.ts")).toContain(
      "export interface ScaffoldfixtureSubscriptionPayload"
    );
    expect(read("apps/api/src/pubsub.ts")).toContain(
      '"scaffoldfixture:deleted": [ScaffoldfixtureDeletedPayload];'
    );
    expect(read("apps/api/src/schema/features.ts")).toContain('name: "scaffoldfixtures"');
    expect(read("apps/api/src/schema/features.test.ts")).toContain(
      'vi.mock("../features/scaffoldfixtures/scaffoldfixtures.adapter", () => ({}));'
    );
    expect(read("packages/translation/src/translation.definition.ts")).toContain(
      '"scaffoldfixtures"'
    );
    expect(read("packages/translation/src/translation.config.ts")).toContain(
      'import scaffoldfixturesEn from "./locales/en/scaffoldfixtures.json";'
    );
  });

  it("keeps the api feature registry and its test in the same order", () => {
    const { files } = applyCreateFeature(readWiringTargets(), names);
    const registry = files.get("apps/api/src/schema/features.ts") ?? "";
    const registryTest = files.get("apps/api/src/schema/features.test.ts") ?? "";

    const registered = [...registry.matchAll(/^ {4}name: "([\w-]+)",$/gm)].map((match) => match[1]);
    const asserted = [
      ...registryTest
        .slice(registryTest.indexOf("expect(apiFeatures.map((feature) => feature.name)).toEqual(["))
        .matchAll(/^ {6}"([\w-]+)"/gm)
    ].map((match) => match[1]);

    expect(registered).toEqual(asserted);
    expect(registered.at(-1)).toBe("scaffoldfixtures");
  });

  it("keeps every translation namespace resource wired for all three locales", () => {
    const { files } = applyCreateFeature(readWiringTargets(), names);
    const config = files.get("packages/translation/src/translation.config.ts") ?? "";

    for (const suffix of ["De", "En", "Sr"]) {
      expect(config).toContain(`"scaffoldfixtures": scaffoldfixtures${suffix}`);
    }
  });

  it("throws without a partial result when an anchor moved", () => {
    const files = readWiringTargets();
    files.set(
      "apps/api/src/schema/features.ts",
      (files.get("apps/api/src/schema/features.ts") ?? "").replace(
        "export const apiFeatures: ApiFeature[] = [",
        "export const registeredApiFeatures: ApiFeature[] = ["
      )
    );

    expect(() => applyCreateFeature(files, names)).toThrowError(CreateFeatureError);
    expect(() => applyCreateFeature(files, names)).toThrowError(
      /apps\/api\/src\/schema\/features\.ts: anchor not found/
    );
  });

  it("throws when a wiring target is missing entirely", () => {
    const files = readWiringTargets();
    files.delete("apps/api/src/pubsub.ts");

    expect(() => applyCreateFeature(files, names)).toThrowError(
      /apps\/api\/src\/pubsub\.ts: wiring target is missing/
    );
  });

  it("throws when the feature name is already registered", () => {
    const notes = deriveFeatureNames({ name: "note", write: false, generate: true });

    expect(() => applyCreateFeature(readWiringTargets(), notes)).toThrowError(
      /api feature 'notes' is already registered/
    );
  });

  it("throws when a scaffold path already exists", () => {
    const files = readWiringTargets();
    files.set(
      "apps/api/src/features/scaffoldfixtures/scaffoldfixtures.adapter.ts",
      "// already here\n"
    );

    expect(() => applyCreateFeature(files, names)).toThrowError(
      /scaffoldfixtures\.adapter\.ts: already exists/
    );
  });
});

describe("emitted i18n closure", () => {
  const names = deriveFeatureNames({
    name: "purchase-order",
    plural: "purchase-orders",
    write: false,
    generate: true
  });
  const files = buildFeatureFiles(names);
  const webDir = "apps/web/src/features/purchase-orders";

  const jsonKeys = (path: string): string[] => {
    const parsed: unknown = JSON.parse(readFileSync(join(REPO_ROOT, path), "utf8"));
    return parsed !== null && typeof parsed === "object" ? Object.keys(parsed) : [];
  };

  it("resolves every t() key to an emitted key or an existing shared key", () => {
    const emitted: unknown = JSON.parse(
      files.get("packages/translation/src/locales/en/purchase-orders.json") ?? "{}"
    );
    const emittedKeys = emitted !== null && typeof emitted === "object" ? Object.keys(emitted) : [];
    const available = new Set([
      ...emittedKeys,
      ...jsonKeys("packages/translation/src/locales/en/common.json"),
      ...jsonKeys("packages/translation/src/locales/en/navigation.json"),
      // Added to all three navigation.json files by the wiring step.
      "navigation.purchase-orders"
    ]);

    const used = [
      `${webDir}/purchase-orders.route.tsx`,
      `${webDir}/purchase-order-detail.route.tsx`
    ].flatMap((path) => [...(files.get(path) ?? "").matchAll(/\bt\("([^"]+)"\)/g)]);

    expect(used.length).toBeGreaterThan(8);
    for (const match of used) {
      expect(available, `missing translation key ${String(match[1])}`).toContain(match[1]);
    }
  });

  it("emits identical keys for all three locales", () => {
    const keysFor = (locale: string): string[] => {
      const parsed: unknown = JSON.parse(
        files.get(`packages/translation/src/locales/${locale}/purchase-orders.json`) ?? "{}"
      );
      return parsed !== null && typeof parsed === "object" ? Object.keys(parsed) : [];
    };

    expect(keysFor("de")).toEqual(keysFor("en"));
    expect(keysFor("sr")).toEqual(keysFor("en"));
    expect(keysFor("en")).toHaveLength(8);
  });
});
