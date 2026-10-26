const NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export interface FeatureNames {
  singularKebab: string;
  pluralKebab: string;
  singularCamel: string;
  pluralCamel: string;
  singularPascal: string;
  pluralPascal: string;
  singularWords: string;
  pluralWords: string;
  pluralSnake: string;
  pluralConstant: string;
  label: string;
}

export interface CreateFeatureOptions {
  name: string;
  plural?: string | undefined;
  label?: string | undefined;
  write: boolean;
  generate: boolean;
}

// Raised for repository-level problems that name a file: a scaffold path that
// already exists, a wiring anchor that moved, or a feature name already
// registered. Invalid CLI input throws a plain Error instead, because there is
// no file to point the caller at.
export class CreateFeatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreateFeatureError";
  }
}

const validateName = (field: string, value: string): string => {
  if (!NAME_PATTERN.test(value)) {
    throw new Error(
      `create-feature ${field} '${value}' must be lowercase kebab-case (e.g. purchase-order)`
    );
  }
  return value;
};

const toCamel = (kebab: string): string => {
  const [first = "", ...rest] = kebab.split("-");
  return [first, ...rest.map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)].join("");
};

const toPascal = (kebab: string): string => {
  const camel = toCamel(kebab);
  return `${camel.charAt(0).toUpperCase()}${camel.slice(1)}`;
};

const toWords = (kebab: string): string => kebab.split("-").join(" ");

export const deriveFeatureNames = (options: CreateFeatureOptions): FeatureNames => {
  const singularKebab = validateName("name", options.name);
  const pluralKebab = validateName("--plural", options.plural ?? `${singularKebab}s`);

  // A shared form would emit two Query fields with the same name, which fails
  // schema composition rather than the generator.
  if (singularKebab === pluralKebab) {
    throw new Error(
      `create-feature --plural must differ from the singular name '${singularKebab}'`
    );
  }

  const pluralWords = toWords(pluralKebab);
  const rawLabel = options.label ?? `${pluralWords.charAt(0).toUpperCase()}${pluralWords.slice(1)}`;
  const label = rawLabel.trim().replace(/\s+/g, " ");

  if (!label) {
    throw new Error("create-feature --label must not be empty");
  }

  return {
    singularKebab,
    pluralKebab,
    singularCamel: toCamel(singularKebab),
    pluralCamel: toCamel(pluralKebab),
    singularPascal: toPascal(singularKebab),
    pluralPascal: toPascal(pluralKebab),
    singularWords: toWords(singularKebab),
    pluralWords,
    pluralSnake: pluralKebab.split("-").join("_"),
    pluralConstant: pluralKebab.split("-").join("_").toUpperCase(),
    label
  };
};

// `--help` is handled by the CLI shell before parsing, so it is an unknown
// argument here.
export const parseCreateFeatureArgs = (argv: readonly string[]): CreateFeatureOptions => {
  const positionals: string[] = [];
  let plural: string | undefined;
  let label: string | undefined;
  let write = false;
  let generate = true;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === undefined) {
      continue;
    }
    if (arg === "--write") {
      write = true;
      continue;
    }
    if (arg === "--no-generate") {
      generate = false;
      continue;
    }
    if (arg === "--plural" || arg === "--label") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("-")) {
        throw new Error(`create-feature ${arg} requires a value`);
      }
      if (arg === "--plural") {
        plural = value;
      } else {
        label = value;
      }
      index += 1;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`create-feature: unknown argument '${arg}'`);
    }
    positionals.push(arg);
  }

  const [name, ...extraPositionals] = positionals;

  if (name === undefined) {
    throw new Error("create-feature requires a singular feature name");
  }
  if (extraPositionals.length > 0) {
    throw new Error(`create-feature accepts one feature name, received: ${positionals.join(", ")}`);
  }

  return { name, plural, label, write, generate };
};

const dbSchemaFile = (
  names: FeatureNames
): string => `import { index, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { organizationsTable } from "./organizations.schema";
import { usersTable } from "./users.schema";

export const ${names.pluralCamel}Table = pgTable(
  "${names.pluralSnake}",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body"),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    // Every tenant query filters by organization and orders by creation time.
    index("${names.pluralSnake}_organization_id_created_at_idx").on(
      table.organizationId,
      table.createdAt
    )
  ]
);
`;

const dbTypeFile = (
  names: FeatureNames
): string => `import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

import { ${names.pluralCamel}Table } from "../schema/${names.pluralKebab}.schema";

export type ${names.singularPascal} = InferSelectModel<typeof ${names.pluralCamel}Table>;
export type New${names.singularPascal} = InferInsertModel<typeof ${names.pluralCamel}Table>;
`;

const apiConfigFile = (names: FeatureNames): string =>
  `export const ${names.pluralConstant}_CONFIG = { pagination: { defaultLimit: 20, maxLimit: 100 } } as const;\n`;

const apiTypeFile = (
  names: FeatureNames
): string => `export interface Create${names.singularPascal}Input {
  title: string;
  body?: string | null;
}
export interface Update${names.singularPascal}Input {
  title?: string;
  body?: string | null;
}
export interface ${names.singularPascal}Patch {
  title?: string;
  body?: string | null;
}
`;

const apiUtilFile = (names: FeatureNames): string => `const MIN_TITLE_LENGTH = 1;
const MAX_TITLE_LENGTH = 255;

export function ensure${names.singularPascal}Title(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length < MIN_TITLE_LENGTH) throw new Error("${names.singularWords} title is required");
  if (trimmed.length > MAX_TITLE_LENGTH) throw new Error("${names.singularWords} title is too long");
  return trimmed;
}

export function parseOptionalBody(body?: string | null): string | null {
  if (body == null) return null;
  const trimmed = body.trim();
  return trimmed.length === 0 ? null : trimmed;
}
`;

const apiModuleFile = (
  names: FeatureNames
): string => `import type { ${names.singularPascal} } from "@repo/db";
import { ${names.pluralCamel}Table } from "@repo/db/schema";
import { desc, eq } from "drizzle-orm";

import { ${names.pluralConstant}_CONFIG } from "./${names.pluralKebab}.config";
import type {
  Create${names.singularPascal}Input,
  ${names.singularPascal}Patch,
  Update${names.singularPascal}Input
} from "./${names.pluralKebab}.type";
import { ensure${names.singularPascal}Title, parseOptionalBody } from "./${names.pluralKebab}.util";
import { clampPagination, type PaginationInput, type ScopedData } from "../../context.data";
import type { PubSubEventMap } from "../../pubsub";

export interface ${names.singularPascal}ModuleDeps {
  data: ScopedData;
  publish: <TEventName extends keyof PubSubEventMap>(
    eventName: TEventName,
    ...payload: PubSubEventMap[TEventName]
  ) => void;
}

/**
 * Every ${names.singularPascal} read and write for one request's Authenticated Organization
 * Scope. Writes normalize their input and publish one \`${names.singularCamel}:*\` event.
 */
export interface ${names.pluralPascal} {
  list: (page: PaginationInput) => Promise<${names.singularPascal}[]>;
  get: (id: string) => Promise<${names.singularPascal} | null>;
  /** Throws \`${names.singularWords} title is required\`/\`too long\` and writes nothing. */
  create: (input: Create${names.singularPascal}Input) => Promise<${names.singularPascal}>;
  /** Throws \`${names.singularWords} not found\` when no ${names.singularPascal} with this id is in the scope. */
  update: (id: string, input: Update${names.singularPascal}Input) => Promise<${names.singularPascal}>;
  /** Publishes \`${names.singularCamel}:deleted\` only when a row was deleted. */
  delete: (id: string) => Promise<boolean>;
}

export function create${names.pluralPascal}({ data, publish }: ${names.singularPascal}ModuleDeps): ${names.pluralPascal} {
  return {
    async list(page) {
      const { limit, offset } = clampPagination(page, ${names.pluralConstant}_CONFIG.pagination);
      return data
        .selectFrom(${names.pluralCamel}Table)
        .orderBy(desc(${names.pluralCamel}Table.createdAt), desc(${names.pluralCamel}Table.id))
        .limit(limit)
        .offset(offset);
    },
    async get(id) {
      const rows = await data
        .selectFrom(${names.pluralCamel}Table, eq(${names.pluralCamel}Table.id, id))
        .limit(1);
      return rows[0] ?? null;
    },
    async create(input) {
      const rows = await data
        .insert(${names.pluralCamel}Table)
        .values({
          ...data.stamp("userId"),
          title: ensure${names.singularPascal}Title(input.title),
          body: parseOptionalBody(input.body ?? null)
        })
        .returning();
      const ${names.singularCamel} = rows[0];
      if (!${names.singularCamel}) throw new Error("failed to create ${names.singularWords}");
      publish("${names.singularCamel}:created", ${names.singularCamel});
      return ${names.singularCamel};
    },
    async update(id, input) {
      const patch: ${names.singularPascal}Patch = {};
      if (input.title !== undefined) patch.title = ensure${names.singularPascal}Title(input.title);
      if (input.body !== undefined) patch.body = parseOptionalBody(input.body);
      const rows = await data
        .update(
          ${names.pluralCamel}Table,
          { ...patch, updatedAt: new Date() },
          eq(${names.pluralCamel}Table.id, id)
        )
        .returning();
      const ${names.singularCamel} = rows[0];
      if (!${names.singularCamel}) throw new Error("${names.singularWords} not found");
      publish("${names.singularCamel}:updated", ${names.singularCamel});
      return ${names.singularCamel};
    },
    async delete(id) {
      const rows = await data
        .delete(${names.pluralCamel}Table, eq(${names.pluralCamel}Table.id, id))
        .returning({
          id: ${names.pluralCamel}Table.id,
          organizationId: ${names.pluralCamel}Table.organizationId
        });
      const row = rows[0];
      if (row) publish("${names.singularCamel}:deleted", row);
      return row !== undefined;
    }
  };
}
`;

const apiSdlFile = (
  names: FeatureNames
): string => `export const ${names.pluralCamel}TypeDefs = /* GraphQL */ \`
  type ${names.singularPascal} {
    id: ID!
    title: String!
    body: String
    organizationId: ID!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  input Create${names.singularPascal}Input {
    title: String!
    body: String
  }

  input Update${names.singularPascal}Input {
    title: String
    body: String
  }

  type ${names.singularPascal}DeletedPayload {
    id: ID!
    organizationId: ID!
  }

  extend type Query {
    ${names.pluralCamel}(limit: Int, offset: Int): [${names.singularPascal}!]!
    ${names.singularCamel}(id: ID!): ${names.singularPascal}
  }

  extend type Mutation {
    create${names.singularPascal}(input: Create${names.singularPascal}Input!): ${names.singularPascal}!
    update${names.singularPascal}(id: ID!, input: Update${names.singularPascal}Input!): ${names.singularPascal}!
    delete${names.singularPascal}(id: ID!): Boolean!
  }

  extend type Subscription {
    ${names.singularCamel}Created: ${names.singularPascal}!
    ${names.singularCamel}Updated: ${names.singularPascal}!
    ${names.singularCamel}Deleted: ${names.singularPascal}DeletedPayload!
  }
\`;
`;

const apiRouterFile = (
  names: FeatureNames
): string => `import type { Create${names.singularPascal}Input, Update${names.singularPascal}Input } from "./${names.pluralKebab}.type";
import type { ApiContext } from "../../context";
import type { PaginationInput } from "../../context.data";
import { organizationSubscriptions } from "../../pubsub";

type ResolverContext = ApiContext;
type ${names.singularPascal}ByIdArgs = { id: string };
type Create${names.singularPascal}Args = { input: Create${names.singularPascal}Input };
type Update${names.singularPascal}Args = { id: string; input: Update${names.singularPascal}Input };

export const ${names.pluralCamel}Resolvers = {
  Query: {
    async ${names.pluralCamel}(_parent: unknown, args: PaginationInput, ctx: ResolverContext) {
      return ctx.${names.pluralCamel}.list(args);
    },
    async ${names.singularCamel}(_parent: unknown, args: ${names.singularPascal}ByIdArgs, ctx: ResolverContext) {
      return ctx.${names.pluralCamel}.get(args.id);
    }
  },
  Mutation: {
    async create${names.singularPascal}(_parent: unknown, args: Create${names.singularPascal}Args, ctx: ResolverContext) {
      return ctx.${names.pluralCamel}.create(args.input);
    },
    async update${names.singularPascal}(_parent: unknown, args: Update${names.singularPascal}Args, ctx: ResolverContext) {
      return ctx.${names.pluralCamel}.update(args.id, args.input);
    },
    async delete${names.singularPascal}(_parent: unknown, args: ${names.singularPascal}ByIdArgs, ctx: ResolverContext) {
      return ctx.${names.pluralCamel}.delete(args.id);
    }
  },
  Subscription: organizationSubscriptions([
    "${names.singularCamel}Created",
    "${names.singularCamel}Updated",
    "${names.singularCamel}Deleted"
  ])
};
`;

const apiModuleTestFile = (
  names: FeatureNames
): string => `import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";
import { organizationsTable, ${names.pluralCamel}Table, usersTable } from "@repo/db/schema";
import { createTestDatabase, type TestDatabase } from "@repo/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { create${names.pluralPascal}, type ${names.pluralPascal} } from "./${names.pluralKebab}.module";
import { createScopedData } from "../../context.data";
import type { PubSubEventMap } from "../../pubsub";

// PGlite replays every migration in packages/db/drizzle, so this suite needs
// the ${names.pluralSnake} migration: run \`pnpm db:generate\` once the columns are final.
let database: TestDatabase;
let scope: AuthenticatedOrganizationScope;
let ${names.pluralCamel}: ${names.pluralPascal};
let foreign${names.pluralPascal}: ${names.pluralPascal};
let events: [keyof PubSubEventMap, ...unknown[]][];

async function seedScope(slug: string): Promise<AuthenticatedOrganizationScope> {
  const [user] = await database.db
    .insert(usersTable)
    .values({ email: \`\${slug}@example.test\`, name: slug })
    .returning();
  if (!user) throw new Error("failed to seed user");
  const [organization] = await database.db
    .insert(organizationsTable)
    .values({ name: slug, slug, userId: user.id })
    .returning();
  if (!organization) throw new Error("failed to seed organization");
  return {
    membership: { id: \`membership-\${slug}\`, role: "owner", userId: user.id },
    organizationId: organization.id,
    user: { email: user.email, emailVerified: true, id: user.id, name: user.name },
    userId: user.id
  };
}

function ${names.pluralCamel}For(owner: AuthenticatedOrganizationScope): ${names.pluralPascal} {
  return create${names.pluralPascal}({
    data: createScopedData({ db: database.db, requireOrganizationScope: () => owner }),
    publish: (eventName, ...payload) => {
      events.push([eventName, ...payload]);
    }
  });
}

beforeAll(async () => {
  database = await createTestDatabase();
  scope = await seedScope("own");
  ${names.pluralCamel} = ${names.pluralCamel}For(scope);
  foreign${names.pluralPascal} = ${names.pluralCamel}For(await seedScope("foreign"));
}, 30_000);

afterAll(async () => {
  await database.close();
});

beforeEach(() => {
  events = [];
});

describe("create${names.pluralPascal}", () => {
  it("creates a ${names.singularPascal} from normalized input and publishes ${names.singularCamel}:created once", async () => {
    const ${names.singularCamel} = await ${names.pluralCamel}.create({ title: "  Plan  ", body: "   " });

    expect(${names.singularCamel}).toMatchObject({
      title: "Plan",
      body: null,
      organizationId: scope.organizationId,
      userId: scope.userId
    });
    expect(events).toEqual([["${names.singularCamel}:created", ${names.singularCamel}]]);
  });

  it("rejects a blank title on create and update, and writes nothing", async () => {
    const ${names.singularCamel} = await ${names.pluralCamel}.create({ title: "Keep" });
    events = [];
    const before = await database.db.select().from(${names.pluralCamel}Table);

    await expect(${names.pluralCamel}.create({ title: "   " })).rejects.toThrow(
      "${names.singularWords} title is required"
    );
    await expect(${names.pluralCamel}.update(${names.singularCamel}.id, { title: " " })).rejects.toThrow(
      "${names.singularWords} title is required"
    );
    expect(await database.db.select().from(${names.pluralCamel}Table)).toEqual(before);
    expect(events).toEqual([]);
  });

  it("updates only the given fields and publishes ${names.singularCamel}:updated", async () => {
    const ${names.singularCamel} = await ${names.pluralCamel}.create({ title: "Draft", body: "body" });
    events = [];

    const updated = await ${names.pluralCamel}.update(${names.singularCamel}.id, { body: "  edited  " });

    expect(updated).toMatchObject({ title: "Draft", body: "edited" });
    expect(events).toEqual([["${names.singularCamel}:updated", updated]]);
  });

  it("publishes ${names.singularCamel}:deleted with the Active Organization only when a row was deleted", async () => {
    const ${names.singularCamel} = await ${names.pluralCamel}.create({ title: "Gone" });
    events = [];

    await expect(${names.pluralCamel}.delete(${names.singularCamel}.id)).resolves.toBe(true);
    await expect(${names.pluralCamel}.delete(${names.singularCamel}.id)).resolves.toBe(false);

    expect(events).toEqual([
      ["${names.singularCamel}:deleted", { id: ${names.singularCamel}.id, organizationId: scope.organizationId }]
    ]);
    expect(await ${names.pluralCamel}.get(${names.singularCamel}.id)).toBeNull();
  });

  it("never reads, changes, or deletes another Organization's ${names.pluralPascal}", async () => {
    const own = await ${names.pluralCamel}.create({ title: "Own" });
    const foreign = await foreign${names.pluralPascal}.create({ title: "Foreign" });
    const [before] = await database.db
      .select()
      .from(${names.pluralCamel}Table)
      .where(eq(${names.pluralCamel}Table.id, foreign.id));
    events = [];

    expect((await ${names.pluralCamel}.list({ limit: 100 })).map((row) => row.id)).toContain(own.id);
    expect((await ${names.pluralCamel}.list({ limit: 100 })).map((row) => row.id)).not.toContain(
      foreign.id
    );
    expect(await ${names.pluralCamel}.get(foreign.id)).toBeNull();
    await expect(${names.pluralCamel}.update(foreign.id, { title: "Taken" })).rejects.toThrow(
      "${names.singularWords} not found"
    );
    await expect(${names.pluralCamel}.delete(foreign.id)).resolves.toBe(false);

    const [after] = await database.db
      .select()
      .from(${names.pluralCamel}Table)
      .where(eq(${names.pluralCamel}Table.id, foreign.id));
    expect(after).toEqual(before);
    expect(events).toEqual([]);
  });

  it("clamps the requested page", async () => {
    expect(await ${names.pluralCamel}.list({ limit: 0 })).toHaveLength(1);
    expect(await ${names.pluralCamel}.list({ limit: 1, offset: -5 })).toHaveLength(1);
  });
});
`;

// English placeholders preserve the key shape. The locale value gate rejects
// de/sr copies until the contributor translates them, including navigation.
const localeFile = (names: FeatureNames): string => {
  const sentence = `${names.singularWords.charAt(0).toUpperCase()}${names.singularWords.slice(1)}`;
  return `${JSON.stringify(
    {
      [`${names.pluralKebab}.title`]: names.label,
      [`${names.pluralKebab}.create`]: `New ${names.singularWords}`,
      [`${names.pluralKebab}.empty`]: `No ${names.pluralWords} yet.`,
      [`${names.pluralKebab}.titleLabel`]: "Title",
      [`${names.pluralKebab}.bodyLabel`]: "Body",
      [`${names.pluralKebab}.notFound`]: `${sentence} not found.`,
      [`${names.pluralKebab}.deleteConfirmTitle`]: `Delete ${names.singularWords}`,
      [`${names.pluralKebab}.deleteConfirmMessage`]: `This ${names.singularWords} will be permanently deleted.`
    },
    null,
    2
  )}\n`;
};

export const buildFeatureFiles = (names: FeatureNames): Map<string, string> => {
  const feature = names.pluralKebab;
  const apiDir = `apps/api/src/features/${feature}`;
  const webDir = `apps/web/src/features/${feature}`;

  return new Map([
    [`packages/db/src/schema/${feature}.schema.ts`, dbSchemaFile(names)],
    [`packages/db/src/types/${feature}.type.ts`, dbTypeFile(names)],
    [`${apiDir}/${feature}.config.ts`, apiConfigFile(names)],
    [`${apiDir}/${feature}.type.ts`, apiTypeFile(names)],
    [`${apiDir}/${feature}.util.ts`, apiUtilFile(names)],
    [`${apiDir}/${feature}.module.ts`, apiModuleFile(names)],
    [`${apiDir}/${feature}.module.test.ts`, apiModuleTestFile(names)],
    [`${apiDir}/${feature}.schema.ts`, apiSdlFile(names)],
    [`${apiDir}/${feature}.router.ts`, apiRouterFile(names)],
    [`packages/translation/src/locales/en/${feature}.json`, localeFile(names)],
    [`packages/translation/src/locales/de/${feature}.json`, localeFile(names)],
    [`packages/translation/src/locales/sr/${feature}.json`, localeFile(names)],
    [`apps/web/src/graphql/operations/${feature}.graphql`, webOperationsFile(names)],
    [`${webDir}/${feature}.config.ts`, webConfigFile(names)],
    [`${webDir}/${feature}.route.tsx`, webListRouteFile(names)],
    [`${webDir}/${names.singularKebab}-detail.route.tsx`, webDetailRouteFile(names)],
    [`${webDir}/${feature}.route.test.ts`, webRouteTestFile(names)],
    [`apps/e2e/tests/web-${feature}-flows.e2e.ts`, e2eTestFile(names)],
    [`.changeset/create-feature-${feature}.md`, changesetFile(names)]
  ]);
};

export interface CreateFeatureResult {
  files: Map<string, string>;
  createdPaths: string[];
  changedPaths: string[];
}

// Every wiring point a slice has to reach. The spec asserts that generating a
// feature changes all of them, so renaming an anchor below fails a test instead
// of silently emitting a half-wired feature.
export const wiringTargets = [
  "packages/db/src/schema/index.ts",
  "packages/db/src/types/index.ts",
  "apps/api/src/pubsub.ts",
  "apps/api/src/context.ts",
  "apps/api/src/schema/features.ts",
  "apps/api/src/schema/features.test.ts",
  "packages/translation/src/translation.definition.ts",
  "packages/translation/src/translation.config.ts",
  "packages/translation/src/locales/en/navigation.json",
  "packages/translation/src/locales/de/navigation.json",
  "packages/translation/src/locales/sr/navigation.json",
  "apps/web/src/hooks/use-live-list.ts",
  "apps/web/src/router.tsx"
] as const;

const anchorIndex = (path: string, source: string, anchor: string): number => {
  const index = source.indexOf(anchor);
  if (index === -1) {
    throw new CreateFeatureError(`${path}: anchor not found: ${JSON.stringify(anchor)}`);
  }
  return index;
};

// Appends to a bracketed literal by cutting in just before its closing line.
const insertBeforeClose = (
  path: string,
  source: string,
  open: string,
  close: string,
  text: string
): string => {
  const start = anchorIndex(path, source, open);
  const end = source.indexOf(close, start + open.length);
  if (end === -1) {
    throw new CreateFeatureError(
      `${path}: found ${JSON.stringify(open)} but no closing ${JSON.stringify(close)}`
    );
  }
  return `${source.slice(0, end)}${text}${source.slice(end)}`;
};

const insertBefore = (path: string, source: string, anchor: string, text: string): string => {
  const index = anchorIndex(path, source, anchor);
  return `${source.slice(0, index)}${text}${source.slice(index)}`;
};

const matchedLineIndices = (lines: readonly string[], matcher: RegExp): number[] =>
  lines.flatMap((value, index) => (matcher.test(value) ? [index] : []));

const byLine = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// Sorts "  \"purchase-orders\": x" beside "  organizations: y" rather than ahead of
// every bare identifier, which is where a raw string compare would put it.
const entrySortKey = (line: string): string => line.trim().replace(/^"/, "");

// Keeps a contiguous run of import/export lines sorted. eslint --fix settles the
// exact group ranking afterwards; this only has to land in the right run.
const insertSortedLine = (path: string, source: string, matcher: RegExp, line: string): string => {
  const lines = source.split("\n");
  const indices = matchedLineIndices(lines, matcher);
  const first = indices[0];
  const last = indices[indices.length - 1];

  if (first === undefined || last === undefined) {
    throw new CreateFeatureError(`${path}: no lines match ${String(matcher)}`);
  }
  if (lines.includes(line)) {
    throw new CreateFeatureError(`${path}: already contains ${line.trim()}`);
  }

  const insertAt = indices.find((index) => byLine(lines[index] ?? "", line) > 0) ?? last + 1;
  return [...lines.slice(0, insertAt), line, ...lines.slice(insertAt)].join("\n");
};

// Rewrites the whole run of entries so the trailing commas stay correct under
// prettier's trailingComma: "none" no matter where the new entry sorts.
const insertObjectEntry = (
  path: string,
  source: string,
  matcher: RegExp,
  entry: string
): string => {
  const lines = source.split("\n");
  const indices = matchedLineIndices(lines, matcher);
  const first = indices[0];
  const last = indices[indices.length - 1];

  if (first === undefined || last === undefined) {
    throw new CreateFeatureError(`${path}: no object entries match ${String(matcher)}`);
  }

  const existing = indices.map((index) => (lines[index] ?? "").replace(/,\s*$/, ""));
  if (existing.includes(entry)) {
    throw new CreateFeatureError(`${path}: already contains ${entry.trim()}`);
  }

  const rendered = [...existing, entry]
    .sort((a, b) => byLine(entrySortKey(a), entrySortKey(b)))
    .map((value, index, all) => (index === all.length - 1 ? value : `${value},`));

  return [...lines.slice(0, first), ...rendered, ...lines.slice(last + 1)].join("\n");
};

const wirePubSub = (source: string, names: FeatureNames): string => {
  const path = "apps/api/src/pubsub.ts";
  const payloads = `export interface ${names.singularPascal}SubscriptionPayload {
  id: string;
  title: string;
  body: string | null;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ${names.singularPascal}DeletedPayload {
  id: string;
  organizationId: string;
}

`;
  const mapAnchor = anchorIndex(path, source, "export type PubSubEventMap = {");
  const withPayloads = `${source.slice(0, mapAnchor)}${payloads}${source.slice(mapAnchor)}`;

  const withEvents = insertBeforeClose(
    path,
    withPayloads,
    "export type PubSubEventMap = {",
    "\n};",
    `\n  "${names.singularCamel}:created": [${names.singularPascal}SubscriptionPayload];` +
      `\n  "${names.singularCamel}:updated": [${names.singularPascal}SubscriptionPayload];` +
      `\n  "${names.singularCamel}:deleted": [${names.singularPascal}DeletedPayload];`
  );

  return insertBeforeClose(
    path,
    withEvents,
    "export const ORGANIZATION_SUBSCRIPTIONS = {",
    "\n} as const",
    `,\n  ${names.singularCamel}Created: "${names.singularCamel}:created",` +
      `\n  ${names.singularCamel}Updated: "${names.singularCamel}:updated",` +
      `\n  ${names.singularCamel}Deleted: "${names.singularCamel}:deleted"`
  );
};

// The module joins the request context next to ctx.todos and ctx.notes, built
// from the same scoped data and publisher.
const wireApiContext = (source: string, names: FeatureNames): string => {
  const path = "apps/api/src/context.ts";
  if (source.includes(`\n  ${names.pluralCamel}: `)) {
    throw new CreateFeatureError(
      path,
      `${path}: ApiContext already has a '${names.pluralCamel}' field`
    );
  }

  const withImport = insertSortedLine(
    path,
    source,
    /^import \{ create\w+, type \w+ \} from "\.\/features\//,
    `import { create${names.pluralPascal}, type ${names.pluralPascal} } from "./features/${names.pluralKebab}/${names.pluralKebab}.module";`
  );
  const withField = insertBefore(
    path,
    withImport,
    "  loaders: ApiLoaders;",
    `  ${names.pluralCamel}: ${names.pluralPascal};\n`
  );

  return insertBefore(
    path,
    withField,
    "    loaders: createApiLoaders(",
    `    ${names.pluralCamel}: create${names.pluralPascal}({ data, publish }),\n`
  );
};

const wireLiveList = (source: string, names: FeatureNames): string => {
  const path = "apps/web/src/hooks/use-live-list.ts";
  anchorIndex(path, source, "interface LiveListOptions {");

  let next = source;
  for (const event of ["Created", "Updated", "Deleted"]) {
    next = insertObjectEntry(
      path,
      next,
      /^ {2}On\w+Document,?$/,
      `  On${names.singularPascal}${event}Document`
    );
  }

  return `${next.trimEnd()}

/** Keeps ${names.singularPascal} queries fresh: refetches on every ${names.singularPascal} event of the Active Organization. */
export function useLive${names.pluralPascal}({ enabled, invalidateKeys, onDeleted }: LiveListOptions): void {
  useSubscription({ query: On${names.singularPascal}CreatedDocument, enabled, invalidateKeys });
  useSubscription({ query: On${names.singularPascal}UpdatedDocument, enabled, invalidateKeys });
  useSubscription({
    query: On${names.singularPascal}DeletedDocument,
    enabled,
    invalidateKeys,
    onData: ({ ${names.singularCamel}Deleted }) => onDeleted?.(${names.singularCamel}Deleted.id)
  });
}
`;
};

const wireApiFeatures = (source: string, names: FeatureNames): string => {
  const path = "apps/api/src/schema/features.ts";
  const featureImports = /^import \{ \w+ \} from "\.\.\/features\//;
  const withRouter = insertSortedLine(
    path,
    source,
    featureImports,
    `import { ${names.pluralCamel}Resolvers } from "../features/${names.pluralKebab}/${names.pluralKebab}.router";`
  );
  const withSchema = insertSortedLine(
    path,
    withRouter,
    featureImports,
    `import { ${names.pluralCamel}TypeDefs } from "../features/${names.pluralKebab}/${names.pluralKebab}.schema";`
  );

  return insertBeforeClose(
    path,
    withSchema,
    "export const apiFeatures: ApiFeature[] = [",
    "\n];",
    `,\n  {\n    name: "${names.pluralKebab}",\n    typeDefs: ${names.pluralCamel}TypeDefs,\n    resolvers: ${names.pluralCamel}Resolvers\n  }`
  );
};

// The generated router reaches data only through ctx, so the registry test
// needs no module mock for it.
const wireApiFeaturesTest = (source: string, names: FeatureNames): string =>
  insertBeforeClose(
    "apps/api/src/schema/features.test.ts",
    source,
    "expect(apiFeatures.map((feature) => feature.name)).toEqual([",
    "\n    ]);",
    `,\n      "${names.pluralKebab}"`
  );

const wireTranslationDefinition = (source: string, names: FeatureNames): string =>
  insertBeforeClose(
    "packages/translation/src/translation.definition.ts",
    source,
    "export const TRANSLATION_NAMESPACES = [",
    "\n] as const;",
    `,\n  "${names.pluralKebab}"`
  );

const wireTranslationConfig = (source: string, names: FeatureNames): string => {
  const path = "packages/translation/src/translation.config.ts";
  const locales = [
    { dir: "de", suffix: "De" },
    { dir: "en", suffix: "En" },
    { dir: "sr", suffix: "Sr" }
  ];
  let next = source;

  for (const locale of locales) {
    next = insertSortedLine(
      path,
      next,
      /^import \w+ from "\.\/locales\//,
      `import ${names.pluralCamel}${locale.suffix} from "./locales/${locale.dir}/${names.pluralKebab}.json";`
    );
    next = insertObjectEntry(
      path,
      next,
      new RegExp(`^ {6}(?:\\w+|"[\\w-]+"): \\w+${locale.suffix},?$`),
      `      "${names.pluralKebab}": ${names.pluralCamel}${locale.suffix}`
    );
  }

  return next;
};

const wireTarget = (path: string, source: string, names: FeatureNames): string => {
  if (path === "packages/db/src/schema/index.ts") {
    return insertSortedLine(
      path,
      source,
      /^export \* from "\.\/\w[\w-]*\.schema";$/,
      `export * from "./${names.pluralKebab}.schema";`
    );
  }
  if (path === "packages/db/src/types/index.ts") {
    return insertSortedLine(
      path,
      source,
      /^export \* from "\.\/\w[\w-]*\.type";$/,
      `export * from "./${names.pluralKebab}.type";`
    );
  }
  if (path === "apps/api/src/pubsub.ts") {
    return wirePubSub(source, names);
  }
  if (path === "apps/api/src/context.ts") {
    return wireApiContext(source, names);
  }
  if (path === "apps/api/src/schema/features.ts") {
    return wireApiFeatures(source, names);
  }
  if (path === "apps/api/src/schema/features.test.ts") {
    return wireApiFeaturesTest(source, names);
  }
  if (path === "packages/translation/src/translation.definition.ts") {
    return wireTranslationDefinition(source, names);
  }
  if (path === "packages/translation/src/translation.config.ts") {
    return wireTranslationConfig(source, names);
  }
  if (path.startsWith("packages/translation/src/locales/") && path.endsWith("/navigation.json")) {
    return appendJsonEntry(path, source, `navigation.${names.pluralKebab}`, names.label);
  }
  if (path === "apps/web/src/hooks/use-live-list.ts") {
    return wireLiveList(source, names);
  }
  if (path === "apps/web/src/router.tsx") {
    return wireWebRouter(source, names);
  }
  throw new CreateFeatureError(`${path}: no wiring rule for this target`);
};

const assertNotRegistered = (files: ReadonlyMap<string, string>, names: FeatureNames): void => {
  const features = files.get("apps/api/src/schema/features.ts");
  if (features?.includes(`name: "${names.pluralKebab}"`)) {
    throw new CreateFeatureError(`api feature '${names.pluralKebab}' is already registered`);
  }

  const definition = files.get("packages/translation/src/translation.definition.ts");
  if (definition?.includes(`\n  "${names.pluralKebab}"`)) {
    throw new CreateFeatureError(`translation namespace '${names.pluralKebab}' already exists`);
  }
};

export const applyCreateFeature = (
  files: ReadonlyMap<string, string>,
  names: FeatureNames
): CreateFeatureResult => {
  assertNotRegistered(files, names);

  const created = buildFeatureFiles(names);
  for (const path of created.keys()) {
    if (files.has(path)) {
      throw new CreateFeatureError(`${path}: already exists; choose another feature name`);
    }
  }

  const next = new Map(files);
  for (const [path, content] of created) {
    next.set(path, content);
  }

  const changedPaths: string[] = [];
  for (const path of wiringTargets) {
    const source = files.get(path);
    if (source === undefined) {
      throw new CreateFeatureError(`${path}: wiring target is missing from the repository`);
    }
    const normalized = source.replace(/\r\n/g, "\n");
    const wired = wireTarget(path, normalized, names);
    const updated = source.includes("\r\n") ? wired.replace(/\n/g, "\r\n") : wired;
    if (updated === source) {
      throw new CreateFeatureError(`${path}: wiring made no change`);
    }
    next.set(path, updated);
    changedPaths.push(path);
  }

  return { files: next, createdPaths: [...created.keys()], changedPaths };
};

const webOperationsFile = (
  names: FeatureNames
): string => `query Get${names.pluralPascal}($limit: Int, $offset: Int) {
  ${names.pluralCamel}(limit: $limit, offset: $offset) {
    id
    title
    body
    createdAt
    updatedAt
  }
}

query Get${names.singularPascal}($id: ID!) {
  ${names.singularCamel}(id: $id) {
    id
    title
    body
    createdAt
    updatedAt
  }
}

mutation Create${names.singularPascal}($input: Create${names.singularPascal}Input!) {
  create${names.singularPascal}(input: $input) {
    id
    title
    body
  }
}

mutation Update${names.singularPascal}($id: ID!, $input: Update${names.singularPascal}Input!) {
  update${names.singularPascal}(id: $id, input: $input) {
    id
    title
    body
  }
}

mutation Delete${names.singularPascal}($id: ID!) {
  delete${names.singularPascal}(id: $id)
}

subscription On${names.singularPascal}Created {
  ${names.singularCamel}Created {
    id
  }
}

subscription On${names.singularPascal}Updated {
  ${names.singularCamel}Updated {
    id
  }
}

subscription On${names.singularPascal}Deleted {
  ${names.singularCamel}Deleted {
    id
  }
}
`;

const webConfigFile = (names: FeatureNames): string =>
  `export const ${names.pluralConstant}_CONFIG = { pageSize: 50 } as const;\n`;

const webListRouteFile = (
  names: FeatureNames
): string => `import { createActiveOrganizationQueryKey } from "@repo/query";
import { Button, FieldError, Input } from "@repo/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { ${names.pluralConstant}_CONFIG } from "./${names.pluralKebab}.config";
import { ConfirmDialog } from "../../components/confirm-dialog";
import {
  useCreate${names.singularPascal}Mutation,
  useDelete${names.singularPascal}Mutation,
  useGet${names.pluralPascal}Query
} from "../../graphql/generated/react-query";
import { useLive${names.pluralPascal} } from "../../hooks/use-live-list";
import { useOrganization } from "../../hooks/use-organization";
import { useTranslation } from "../../hooks/use-translation";
import { queryRuntime } from "../../lib/query-runtime";

queryRuntime.registerOrgScopedOperation("${names.pluralKebab}.web.list", useGet${names.pluralPascal}Query.getKey());

export function ${names.pluralPascal}Route() {
  const { t } = useTranslation();
  const { activeOrganizationId, isLoading: isOrganizationLoading } = useOrganization();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [newTitle, setNewTitle] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const listVariables = useMemo(() => ({ limit: ${names.pluralConstant}_CONFIG.pageSize, offset: 0 }), []);
  const listQueryKey = useMemo(
    () =>
      createActiveOrganizationQueryKey(
        useGet${names.pluralPascal}Query.getKey(listVariables),
        activeOrganizationId
      ),
    [activeOrganizationId, listVariables]
  );

  const subscriptionEnabled = Boolean(activeOrganizationId) && !isOrganizationLoading;

  const listQuery = useGet${names.pluralPascal}Query(listVariables, {
    queryKey: listQueryKey,
    enabled: subscriptionEnabled
  });

  const createMutation = useCreate${names.singularPascal}Mutation();
  const deleteMutation = useDelete${names.singularPascal}Mutation();

  useLive${names.pluralPascal}({ enabled: subscriptionEnabled, invalidateKeys: [listQueryKey] });

  const ${names.pluralCamel} = useMemo(() => listQuery.data?.${names.pluralCamel} ?? [], [listQuery.data]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const title = newTitle.trim();

    if (title.length === 0) {
      return;
    }

    const result = await createMutation.mutateAsync({ input: { title } });
    setNewTitle("");
    void navigate(\`/${names.pluralKebab}/\${result.create${names.singularPascal}.id}\`);
  }

  async function confirmDelete() {
    if (!deletingId) {
      return;
    }

    await deleteMutation.mutateAsync({ id: deletingId });
    setDeletingId(null);
    await queryClient.invalidateQueries({ queryKey: listQueryKey });
  }

  const isLoading = isOrganizationLoading || listQuery.status === "pending";
  const error = listQuery.error ? t("error.generic") : null;

  return (
    <section className="grid gap-[var(--ds-space-200)]">
      <header className="flex items-center justify-between gap-[var(--ds-space-150)]">
        <h1>{t("${names.pluralKebab}.title")}</h1>
      </header>

      <form
        className="flex items-center gap-[var(--ds-space-100)]"
        onSubmit={(event) => void handleCreate(event)}
      >
        <Input
          placeholder={t("${names.pluralKebab}.titleLabel")}
          value={newTitle}
          onChange={(event) => setNewTitle(event.target.value)}
        />
        <Button disabled={createMutation.status === "pending"} type="submit">
          {t("${names.pluralKebab}.create")}
        </Button>
      </form>

      {isLoading ? (
        <p className="text-[color:var(--ds-text-subtle)]">{t("common.loading")}</p>
      ) : null}
      {error ? <FieldError>{error}</FieldError> : null}

      {!isLoading && ${names.pluralCamel}.length === 0 ? (
        <p className="text-[color:var(--ds-text-subtle)]">{t("${names.pluralKebab}.empty")}</p>
      ) : null}

      {!isLoading && ${names.pluralCamel}.length > 0 ? (
        <ul className="flex flex-col gap-[var(--ds-space-100)]">
          {${names.pluralCamel}.map((${names.singularCamel}) => {
            const preview = (${names.singularCamel}.body ?? "").split("\\n")[0] ?? "";

            return (
              <li key={${names.singularCamel}.id}>
                <div className="flex items-center justify-between gap-[var(--ds-space-150)] rounded-[var(--ds-radius-300)] border border-[var(--ds-border)] bg-[var(--ds-surface)] p-[var(--ds-space-150)]">
                  <NavLink
                    className="flex min-w-0 flex-1 flex-col gap-[var(--ds-space-050)]"
                    to={\`/${names.pluralKebab}/\${${names.singularCamel}.id}\`}
                  >
                    <span className="truncate">{${names.singularCamel}.title}</span>
                    {preview ? (
                      <span className="truncate text-[color:var(--ds-text-subtle)] text-[length:var(--ds-font-size-100)]">
                        {preview}
                      </span>
                    ) : null}
                  </NavLink>
                  <Button
                    appearance="subtle"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setDeletingId(${names.singularCamel}.id);
                    }}
                  >
                    {t("button.delete")}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <ConfirmDialog
        cancelLabel={t("button.cancel")}
        confirmLabel={t("button.delete")}
        isConfirming={deleteMutation.status === "pending"}
        isOpen={Boolean(deletingId)}
        message={t("${names.pluralKebab}.deleteConfirmMessage")}
        title={t("${names.pluralKebab}.deleteConfirmTitle")}
        onCancel={() => setDeletingId(null)}
        onConfirm={() => {
          void confirmDelete();
        }}
      />
    </section>
  );
}
`;

const webDetailRouteFile = (
  names: FeatureNames
): string => `import { createActiveOrganizationQueryKey } from "@repo/query";
import { Button, Field, FieldLabel, Input, Textarea } from "@repo/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import {
  useGet${names.singularPascal}Query,
  useUpdate${names.singularPascal}Mutation
} from "../../graphql/generated/react-query";
import { useLive${names.pluralPascal} } from "../../hooks/use-live-list";
import { useOrganization } from "../../hooks/use-organization";
import { useTranslation } from "../../hooks/use-translation";

export function ${names.singularPascal}DetailRoute() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { activeOrganizationId, isLoading: isOrganizationLoading } = useOrganization();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const detailQueryKey = useMemo(
    () =>
      createActiveOrganizationQueryKey(
        useGet${names.singularPascal}Query.getKey({ id: id ?? "" }),
        activeOrganizationId
      ),
    [activeOrganizationId, id]
  );

  const subscriptionEnabled = Boolean(activeOrganizationId) && !isOrganizationLoading;

  const detailQuery = useGet${names.singularPascal}Query(
    { id: id ?? "" },
    {
      queryKey: detailQueryKey,
      enabled: Boolean(id) && subscriptionEnabled
    }
  );

  const ${names.singularCamel} = detailQuery.data?.${names.singularCamel};

  const updateMutation = useUpdate${names.singularPascal}Mutation();

  useEffect(() => {
    if (${names.singularCamel}) {
      setTitle(${names.singularCamel}.title);
      setBody(${names.singularCamel}.body ?? "");
    }
  }, [${names.singularCamel}]);

  useLive${names.pluralPascal}({
    enabled: Boolean(id) && subscriptionEnabled,
    invalidateKeys: [detailQueryKey]
  });

  const isLoading = isOrganizationLoading || detailQuery.status === "pending";

  async function handleSave() {
    if (!${names.singularCamel}) {
      return;
    }

    await updateMutation.mutateAsync({ id: ${names.singularCamel}.id, input: { body, title } });
    await queryClient.invalidateQueries({ queryKey: detailQueryKey });
  }

  if (isLoading) {
    return <p className="text-[color:var(--ds-text-subtle)]">{t("common.loading")}</p>;
  }

  if (!${names.singularCamel}) {
    return <p className="text-[color:var(--ds-text-subtle)]">{t("${names.pluralKebab}.notFound")}</p>;
  }

  return (
    <section className="grid gap-[var(--ds-space-200)]">
      <div className="flex flex-col gap-[var(--ds-space-150)]">
        <Field>
          <FieldLabel htmlFor="${names.singularKebab}-title">
            {t("${names.pluralKebab}.titleLabel")}
          </FieldLabel>
          <Input
            id="${names.singularKebab}-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="${names.singularKebab}-body">
            {t("${names.pluralKebab}.bodyLabel")}
          </FieldLabel>
          <Textarea
            id="${names.singularKebab}-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </Field>
        <div>
          <Button
            disabled={updateMutation.status === "pending"}
            type="button"
            onClick={() => {
              void handleSave();
            }}
          >
            {t("button.save")}
          </Button>
        </div>
      </div>
    </section>
  );
}
`;

const webRouteTestFile = (names: FeatureNames): string => `import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const featureDir = dirname(fileURLToPath(import.meta.url));
const listSource = readFileSync(resolve(featureDir, "${names.pluralKebab}.route.tsx"), "utf8");
const detailSource = readFileSync(
  resolve(featureDir, "${names.singularKebab}-detail.route.tsx"),
  "utf8"
);

describe("${names.pluralPascal}Route contract", () => {
  it("scopes its query keys to the Active Organization", () => {
    for (const source of [listSource, detailSource]) {
      expect(source).toContain('from "@repo/query"');
      expect(source).toContain("createActiveOrganizationQueryKey");
      expect(source).toContain("activeOrganizationId");
    }
    expect(listSource).toContain("queryRuntime.registerOrgScopedOperation");
    expect(listSource).toContain('"${names.pluralKebab}.web.list"');
  });

  it("uses the generated GraphQL hooks rather than hand-written requests", () => {
    expect(listSource).toContain("useGet${names.pluralPascal}Query");
    expect(listSource).toContain("useCreate${names.singularPascal}Mutation");
    expect(listSource).toContain("useDelete${names.singularPascal}Mutation");
    expect(detailSource).toContain("useGet${names.singularPascal}Query");
    expect(detailSource).toContain("useUpdate${names.singularPascal}Mutation");
    for (const source of [listSource, detailSource]) {
      expect(source).toContain('from "../../graphql/generated/react-query"');
      expect(source).not.toContain("fetch(");
    }
  });

  it("builds its UI from @repo/ui primitives and design tokens only", () => {
    for (const source of [listSource, detailSource]) {
      expect(source).toContain('from "@repo/ui"');
      expect(source).not.toMatch(/<button[\\s>]/);
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\\b/);
      expect(source).not.toMatch(/\\b(?:rgb|rgba|hsl|hsla)\\(/);
    }
  });

  it("routes every user-facing string through i18n", () => {
    for (const source of [listSource, detailSource]) {
      expect(source).toContain("useTranslation");
      // Bare JSX text would be caught by react/jsx-no-literals; placeholders and
      // labels are the attributes that rule does not reach.
      expect(source).not.toMatch(/placeholder="[^"]/);
      expect(source).not.toMatch(/htmlFor="[^"]*"\\s*>[A-Za-z]/);
    }
  });
});
`;

const e2eTestFile = (
  names: FeatureNames
): string => `import { expect, test } from "@playwright/test";

import { signIn } from "./helpers/auth";

// Matches the translated label or the raw key, so the spec passes whether or not
// i18n resolved in the run under test.
const NAV = /^(${names.label}|navigation\\.${names.pluralKebab})$/;
const CREATE = /^(New ${names.singularWords}|${names.pluralKebab}\\.create)$/;
const TITLE_PLACEHOLDER = /^(Title|${names.pluralKebab}\\.titleLabel)$/;

test("creates a ${names.singularWords} and lists it", async ({ page }) => {
  const title = \`E2E ${names.singularWords} \${Date.now().toString(36)}\`;

  await signIn(page);
  await page.getByRole("link", { name: NAV }).click();
  await expect(page).toHaveURL(/\\/${names.pluralKebab}$/);

  await page.getByPlaceholder(TITLE_PLACEHOLDER).fill(title);
  await page.getByRole("button", { name: CREATE }).click();

  // create navigates to detail
  await expect(page).toHaveURL(/\\/${names.pluralKebab}\\/.+/);

  await page.getByRole("link", { name: NAV }).click();
  await expect(page).toHaveURL(/\\/${names.pluralKebab}$/);
  await expect(page.getByText(title)).toBeVisible();
});
`;

const changesetFile = (names: FeatureNames): string => `---
"@repo/api": minor
"@repo/web": minor
"@repo/db": minor
"@repo/translation": minor
---

Add the organization-scoped \`${names.pluralKebab}\` feature: Postgres table, GraphQL queries, mutations and subscriptions, and the web list and detail routes.
`;

// navigation.json is not sorted, so this appends rather than re-sorting: a sort
// here would rewrite unrelated lines in every locale.
const appendJsonEntry = (path: string, source: string, key: string, value: string): string => {
  if (source.includes(`${JSON.stringify(key)}:`)) {
    throw new CreateFeatureError(`${path}: already contains ${key}`);
  }
  const close = source.lastIndexOf("\n}");
  if (close === -1) {
    throw new CreateFeatureError(`${path}: not a JSON object`);
  }
  const entry = `,\n  ${JSON.stringify(key)}: ${JSON.stringify(value)}`;
  return `${source.slice(0, close)}${entry}${source.slice(close)}`;
};

const wireWebRouter = (source: string, names: FeatureNames): string => {
  const path = "apps/web/src/router.tsx";
  const activeConst = `is${names.pluralPascal}Active`;

  let next = insertSortedLine(
    path,
    source,
    /^import \{ \w+ \} from "\.\/features\//,
    `import { ${names.singularPascal}DetailRoute } from "./features/${names.pluralKebab}/${names.singularKebab}-detail.route";`
  );
  next = insertSortedLine(
    path,
    next,
    /^import \{ \w+ \} from "\.\/features\//,
    `import { ${names.pluralPascal}Route } from "./features/${names.pluralKebab}/${names.pluralKebab}.route";`
  );

  next = insertObjectEntry(
    path,
    next,
    /^ {2}"\/[\w-]+": "navigation\.[\w.-]+",?$/,
    `  "/${names.pluralKebab}": "navigation.${names.pluralKebab}"`
  );

  next = insertBefore(
    path,
    next,
    "  const currentRouteKey = isBreadcrumbRoute(location.pathname)",
    `  const ${activeConst} =\n    location.pathname === "/${names.pluralKebab}" ||\n      location.pathname.startsWith("/${names.pluralKebab}/");\n`
  );

  // The organizationsVisible spread stays last in the nav list.
  next = insertBefore(
    path,
    next,
    "                ...(organizationsVisible",
    `                  {\n                    href: "/${names.pluralKebab}",\n                    isActive: ${activeConst},\n                    title: t("navigation.${names.pluralKebab}")\n                  },\n`
  );

  return insertBeforeClose(
    path,
    next,
    "    children: [",
    "\n    ]",
    `,\n      {\n        element: <${names.pluralPascal}Route />,\n        path: "${names.pluralKebab}"\n      },\n      {\n        element: <${names.singularPascal}DetailRoute />,\n        path: "${names.pluralKebab}/:id"\n      }`
  );
};
