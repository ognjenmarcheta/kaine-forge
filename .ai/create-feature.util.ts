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
  readonly path: string;

  constructor(path: string, message: string) {
    super(message);
    this.name = "CreateFeatureError";
    this.path = path;
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

const apiTypeFile = (names: FeatureNames): string => `export interface Pagination {
  limit: number;
  offset: number;
}
export interface PaginationInput {
  limit?: number;
  offset?: number;
}
export interface Create${names.singularPascal}Input {
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

const apiUtilFile = (
  names: FeatureNames
): string => `import { ${names.pluralConstant}_CONFIG } from "./${names.pluralKebab}.config";
import type { Pagination, PaginationInput } from "./${names.pluralKebab}.type";

const MIN_TITLE_LENGTH = 1;
const MAX_TITLE_LENGTH = 255;

export function coercePagination(input: PaginationInput): Pagination {
  const rawLimit = input.limit ?? ${names.pluralConstant}_CONFIG.pagination.defaultLimit;
  const rawOffset = input.offset ?? 0;
  const limit = Math.min(
    ${names.pluralConstant}_CONFIG.pagination.maxLimit,
    Math.max(1, Math.floor(rawLimit))
  );
  const offset = Math.max(0, Math.floor(rawOffset));
  return { limit, offset };
}

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

const apiAdapterFile = (
  names: FeatureNames
): string => `import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";
import { db, ${names.pluralCamel}Table, type ${names.singularPascal} } from "@repo/db";
import { and, desc, eq } from "drizzle-orm";

import type { ${names.singularPascal}Patch, Pagination } from "./${names.pluralKebab}.type";

export async function list${names.pluralPascal}ByScope(
  scope: AuthenticatedOrganizationScope,
  pagination: Pagination
): Promise<${names.singularPascal}[]> {
  return db
    .select()
    .from(${names.pluralCamel}Table)
    .where(and(eq(${names.pluralCamel}Table.organizationId, scope.organizationId)))
    .orderBy(desc(${names.pluralCamel}Table.createdAt))
    .limit(pagination.limit)
    .offset(pagination.offset);
}

export async function get${names.singularPascal}ById(
  scope: AuthenticatedOrganizationScope,
  id: string
): Promise<${names.singularPascal} | null> {
  const rows = await db
    .select()
    .from(${names.pluralCamel}Table)
    .where(
      and(
        eq(${names.pluralCamel}Table.id, id),
        eq(${names.pluralCamel}Table.organizationId, scope.organizationId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function create${names.singularPascal}(
  scope: AuthenticatedOrganizationScope,
  input: { title: string; body: string | null }
): Promise<${names.singularPascal}> {
  const rows = await db
    .insert(${names.pluralCamel}Table)
    .values({
      userId: scope.userId,
      organizationId: scope.organizationId,
      title: input.title,
      body: input.body
    })
    .returning();
  const ${names.singularCamel} = rows[0];
  if (!${names.singularCamel}) throw new Error("failed to create ${names.singularWords}");
  return ${names.singularCamel};
}

export async function update${names.singularPascal}(
  scope: AuthenticatedOrganizationScope,
  id: string,
  patch: ${names.singularPascal}Patch
): Promise<${names.singularPascal}> {
  const rows = await db
    .update(${names.pluralCamel}Table)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(${names.pluralCamel}Table.id, id),
        eq(${names.pluralCamel}Table.organizationId, scope.organizationId)
      )
    )
    .returning();
  const ${names.singularCamel} = rows[0];
  if (!${names.singularCamel}) throw new Error("${names.singularWords} not found");
  return ${names.singularCamel};
}

export async function delete${names.singularPascal}(
  scope: AuthenticatedOrganizationScope,
  id: string
): Promise<boolean> {
  const rows = await db
    .delete(${names.pluralCamel}Table)
    .where(
      and(
        eq(${names.pluralCamel}Table.id, id),
        eq(${names.pluralCamel}Table.organizationId, scope.organizationId)
      )
    )
    .returning({ id: ${names.pluralCamel}Table.id });
  return rows.length > 0;
}
`;

const apiWorkflowFile = (
  names: FeatureNames
): string => `import type { AuthenticatedOrganizationScope } from "@repo/auth/scope";

import type { Create${names.singularPascal}Input, Update${names.singularPascal}Input } from "./${names.pluralKebab}.type";
import { ensure${names.singularPascal}Title, parseOptionalBody } from "./${names.pluralKebab}.util";
import type { PubSubEventMap } from "../../pubsub";

type ${names.singularPascal}EventPayload = PubSubEventMap["${names.singularCamel}:created"][0];

export interface ${names.singularPascal}WorkflowAdapter {
  create${names.singularPascal}: (
    scope: AuthenticatedOrganizationScope,
    input: { title: string; body: string | null }
  ) => Promise<${names.singularPascal}EventPayload>;
  delete${names.singularPascal}: (
    scope: AuthenticatedOrganizationScope,
    id: string
  ) => Promise<boolean>;
  publish${names.singularPascal}Event: <TEventName extends keyof PubSubEventMap>(
    eventName: TEventName,
    ...payload: PubSubEventMap[TEventName]
  ) => void;
  update${names.singularPascal}: (
    scope: AuthenticatedOrganizationScope,
    id: string,
    patch: { title?: string; body?: string | null }
  ) => Promise<${names.singularPascal}EventPayload>;
}

export function create${names.singularPascal}Workflow(adapter: ${names.singularPascal}WorkflowAdapter) {
  return {
    async create${names.singularPascal}(
      scope: AuthenticatedOrganizationScope,
      input: Create${names.singularPascal}Input
    ) {
      const ${names.singularCamel} = await adapter.create${names.singularPascal}(scope, {
        title: ensure${names.singularPascal}Title(input.title),
        body: parseOptionalBody(input.body ?? null)
      });
      adapter.publish${names.singularPascal}Event("${names.singularCamel}:created", ${names.singularCamel});
      return ${names.singularCamel};
    },
    async update${names.singularPascal}(
      scope: AuthenticatedOrganizationScope,
      id: string,
      input: Update${names.singularPascal}Input
    ) {
      const patch: { title?: string; body?: string | null } = {};
      if (input.title !== undefined) patch.title = ensure${names.singularPascal}Title(input.title);
      if (input.body !== undefined) patch.body = parseOptionalBody(input.body ?? null);
      const ${names.singularCamel} = await adapter.update${names.singularPascal}(scope, id, patch);
      adapter.publish${names.singularPascal}Event("${names.singularCamel}:updated", ${names.singularCamel});
      return ${names.singularCamel};
    },
    async delete${names.singularPascal}(scope: AuthenticatedOrganizationScope, id: string) {
      const deleted = await adapter.delete${names.singularPascal}(scope, id);
      if (deleted) {
        adapter.publish${names.singularPascal}Event("${names.singularCamel}:deleted", {
          id,
          organizationId: scope.organizationId
        });
      }
      return deleted;
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

const apiRouterFile = (names: FeatureNames): string => `import { pipe } from "graphql-yoga";

import {
  create${names.singularPascal},
  delete${names.singularPascal},
  get${names.singularPascal}ById,
  list${names.pluralPascal}ByScope,
  update${names.singularPascal}
} from "./${names.pluralKebab}.adapter";
import type { Create${names.singularPascal}Input, Update${names.singularPascal}Input } from "./${names.pluralKebab}.type";
import { coercePagination } from "./${names.pluralKebab}.util";
import { create${names.singularPascal}Workflow } from "./${names.pluralKebab}.workflow";
import type { ApiContext } from "../../context";
import { filterByOrganization } from "../../pubsub";

type ResolverContext = ApiContext;
type ${names.pluralPascal}QueryArgs = { limit?: number; offset?: number };
type ${names.singularPascal}ByIdArgs = { id: string };
type Create${names.singularPascal}Args = { input: Create${names.singularPascal}Input };
type Update${names.singularPascal}Args = { id: string; input: Update${names.singularPascal}Input };

function create${names.singularPascal}WorkflowForContext(ctx: ResolverContext) {
  return create${names.singularPascal}Workflow({
    create${names.singularPascal},
    delete${names.singularPascal},
    publish${names.singularPascal}Event: (eventName, ...payload) => {
      ctx.pubsub.publish(eventName, ...payload);
    },
    update${names.singularPascal}
  });
}

export const ${names.pluralCamel}Resolvers = {
  Query: {
    async ${names.pluralCamel}(
      _parent: unknown,
      args: ${names.pluralPascal}QueryArgs,
      ctx: ResolverContext
    ) {
      const scope = ctx.requireOrganizationScope();
      return list${names.pluralPascal}ByScope(scope, coercePagination(args));
    },
    async ${names.singularCamel}(
      _parent: unknown,
      args: ${names.singularPascal}ByIdArgs,
      ctx: ResolverContext
    ) {
      const scope = ctx.requireOrganizationScope();
      return get${names.singularPascal}ById(scope, args.id);
    }
  },
  Mutation: {
    async create${names.singularPascal}(
      _parent: unknown,
      args: Create${names.singularPascal}Args,
      ctx: ResolverContext
    ) {
      const scope = ctx.requireOrganizationScope();
      return create${names.singularPascal}WorkflowForContext(ctx).create${names.singularPascal}(
        scope,
        args.input
      );
    },
    async update${names.singularPascal}(
      _parent: unknown,
      args: Update${names.singularPascal}Args,
      ctx: ResolverContext
    ) {
      const scope = ctx.requireOrganizationScope();
      return create${names.singularPascal}WorkflowForContext(ctx).update${names.singularPascal}(
        scope,
        args.id,
        args.input
      );
    },
    async delete${names.singularPascal}(
      _parent: unknown,
      args: ${names.singularPascal}ByIdArgs,
      ctx: ResolverContext
    ) {
      const scope = ctx.requireOrganizationScope();
      return create${names.singularPascal}WorkflowForContext(ctx).delete${names.singularPascal}(
        scope,
        args.id
      );
    }
  },
  Subscription: {
    ${names.singularCamel}Created: {
      subscribe(_parent: unknown, _args: unknown, ctx: ResolverContext) {
        const { organizationId } = ctx.requireOrganizationScope();
        return pipe(
          ctx.pubsub.subscribe("${names.singularCamel}:created"),
          filterByOrganization(organizationId)
        );
      },
      resolve(payload: unknown) {
        return payload;
      }
    },
    ${names.singularCamel}Updated: {
      subscribe(_parent: unknown, _args: unknown, ctx: ResolverContext) {
        const { organizationId } = ctx.requireOrganizationScope();
        return pipe(
          ctx.pubsub.subscribe("${names.singularCamel}:updated"),
          filterByOrganization(organizationId)
        );
      },
      resolve(payload: unknown) {
        return payload;
      }
    },
    ${names.singularCamel}Deleted: {
      subscribe(_parent: unknown, _args: unknown, ctx: ResolverContext) {
        const { organizationId } = ctx.requireOrganizationScope();
        return pipe(
          ctx.pubsub.subscribe("${names.singularCamel}:deleted"),
          filterByOrganization(organizationId)
        );
      },
      resolve(payload: unknown) {
        return payload;
      }
    }
  }
};
`;

const apiAdapterTestFile = (
  names: FeatureNames
): string => `import { beforeEach, describe, expect, it, vi } from "vitest";

const { chain, mockDb } = vi.hoisted(() => {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    offset: vi.fn(),
    returning: vi.fn(),
    set: vi.fn(),
    values: vi.fn()
  };
  Object.values(chain).forEach((fn) => fn.mockReturnValue(chain));
  chain.returning.mockResolvedValue([]);

  const mockDb = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain)
  };

  return { chain, mockDb };
});

vi.mock("@repo/db", () => ({
  db: mockDb,
  ${names.pluralCamel}Table: {
    id: "id",
    userId: "userId",
    organizationId: "orgId",
    createdAt: "createdAt"
  }
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => args),
  desc: vi.fn((col: unknown) => col),
  eq: vi.fn((a: unknown, b: unknown) => [a, b])
}));

import {
  create${names.singularPascal},
  delete${names.singularPascal},
  get${names.singularPascal}ById,
  list${names.pluralPascal}ByScope,
  update${names.singularPascal}
} from "./${names.pluralKebab}.adapter";

describe("${names.pluralKebab}.adapter", () => {
  const scope = {
    organizationId: "org-1",
    user: {
      email: "u1@example.com",
      emailVerified: false,
      id: "user-1",
      name: "User One"
    },
    userId: "user-1"
  };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(chain).forEach((fn) => fn.mockReturnValue(chain));
    chain.returning.mockResolvedValue([]);
  });

  it("list${names.pluralPascal}ByScope filters by Organization only", async () => {
    await list${names.pluralPascal}ByScope(scope, { limit: 20, offset: 0 });

    expect(mockDb.select).toHaveBeenCalled();
    expect(chain.where).toHaveBeenCalledWith([["orgId", "org-1"]]);
    expect(chain.limit).toHaveBeenCalledWith(20);
    expect(chain.offset).toHaveBeenCalledWith(0);
  });

  it("get${names.singularPascal}ById scopes the lookup to the Organization", async () => {
    await get${names.singularPascal}ById(scope, "${names.singularKebab}-1");

    expect(chain.where).toHaveBeenCalledWith([
      ["id", "${names.singularKebab}-1"],
      ["orgId", "org-1"]
    ]);
    expect(chain.limit).toHaveBeenCalledWith(1);
  });

  it("create${names.singularPascal} stamps the Organization and returns the row", async () => {
    const ${names.singularCamel} = {
      id: "${names.singularKebab}-1",
      title: "Test",
      body: null,
      userId: "user-1",
      organizationId: "org-1",
      createdAt: new Date(),
      updatedAt: new Date()
    };
    chain.returning.mockResolvedValueOnce([${names.singularCamel}]);

    const result = await create${names.singularPascal}(scope, { title: "Test", body: null });

    expect(chain.values).toHaveBeenCalledWith({
      userId: "user-1",
      organizationId: "org-1",
      title: "Test",
      body: null
    });
    expect(result).toEqual(${names.singularCamel});
  });

  it("update${names.singularPascal} scopes the write to the Organization", async () => {
    chain.returning.mockResolvedValueOnce([{ id: "${names.singularKebab}-1" }]);

    await update${names.singularPascal}(scope, "${names.singularKebab}-1", { title: "Edited" });

    expect(chain.where).toHaveBeenCalledWith([
      ["id", "${names.singularKebab}-1"],
      ["orgId", "org-1"]
    ]);
  });

  it("update${names.singularPascal} throws when the row is outside the Organization", async () => {
    chain.returning.mockResolvedValueOnce([]);

    await expect(
      update${names.singularPascal}(scope, "${names.singularKebab}-1", { title: "Edited" })
    ).rejects.toThrowError("${names.singularWords} not found");
  });

  it("delete${names.singularPascal} reports whether a scoped row was removed", async () => {
    chain.returning.mockResolvedValueOnce([{ id: "${names.singularKebab}-1" }]);
    await expect(delete${names.singularPascal}(scope, "${names.singularKebab}-1")).resolves.toBe(true);

    chain.returning.mockResolvedValueOnce([]);
    await expect(delete${names.singularPascal}(scope, "${names.singularKebab}-1")).resolves.toBe(false);
  });
});
`;

const apiWorkflowTestFile = (
  names: FeatureNames
): string => `import { describe, expect, it, vi } from "vitest";

import {
  create${names.singularPascal}Workflow,
  type ${names.singularPascal}WorkflowAdapter
} from "./${names.pluralKebab}.workflow";

const scope = {
  organizationId: "org-1",
  user: {
    email: "user@example.com",
    emailVerified: false,
    id: "user-1",
    name: "User"
  },
  userId: "user-1"
};

const ${names.singularCamel} = {
  id: "${names.singularKebab}-1",
  title: "Title",
  body: "Body",
  organizationId: "org-1",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01")
};

function createAdapter(
  overrides: Partial<${names.singularPascal}WorkflowAdapter> = {}
): ${names.singularPascal}WorkflowAdapter {
  return {
    create${names.singularPascal}: vi.fn(async () => ${names.singularCamel}),
    delete${names.singularPascal}: vi.fn(async () => true),
    publish${names.singularPascal}Event: vi.fn(),
    update${names.singularPascal}: vi.fn(async () => ${names.singularCamel}),
    ...overrides
  };
}

describe("create${names.singularPascal}Workflow", () => {
  it("normalizes input, then publishes ${names.singularCamel}:created", async () => {
    const adapter = createAdapter();

    const result = await create${names.singularPascal}Workflow(adapter).create${names.singularPascal}(scope, {
      title: "  Title  ",
      body: "  Body  "
    });

    expect(adapter.create${names.singularPascal}).toHaveBeenCalledWith(scope, {
      title: "Title",
      body: "Body"
    });
    expect(adapter.publish${names.singularPascal}Event).toHaveBeenCalledWith(
      "${names.singularCamel}:created",
      ${names.singularCamel}
    );
    expect(result).toBe(${names.singularCamel});
  });

  it("rejects a blank title", async () => {
    const adapter = createAdapter();

    await expect(
      create${names.singularPascal}Workflow(adapter).create${names.singularPascal}(scope, { title: "   " })
    ).rejects.toThrowError("${names.singularWords} title is required");
    expect(adapter.publish${names.singularPascal}Event).not.toHaveBeenCalled();
  });

  it("patches only the provided fields, then publishes ${names.singularCamel}:updated", async () => {
    const adapter = createAdapter();

    await create${names.singularPascal}Workflow(adapter).update${names.singularPascal}(
      scope,
      "${names.singularKebab}-1",
      { title: "  New title  " }
    );

    expect(adapter.update${names.singularPascal}).toHaveBeenCalledWith(scope, "${names.singularKebab}-1", {
      title: "New title"
    });
    expect(adapter.publish${names.singularPascal}Event).toHaveBeenCalledWith(
      "${names.singularCamel}:updated",
      ${names.singularCamel}
    );
  });

  it("publishes ${names.singularCamel}:deleted with the Organization when a row was removed", async () => {
    const adapter = createAdapter();

    await expect(
      create${names.singularPascal}Workflow(adapter).delete${names.singularPascal}(scope, "${names.singularKebab}-1")
    ).resolves.toBe(true);
    expect(adapter.publish${names.singularPascal}Event).toHaveBeenCalledWith(
      "${names.singularCamel}:deleted",
      { id: "${names.singularKebab}-1", organizationId: "org-1" }
    );
  });

  it("does not publish when nothing was deleted", async () => {
    const adapter = createAdapter({ delete${names.singularPascal}: vi.fn(async () => false) });

    await expect(
      create${names.singularPascal}Workflow(adapter).delete${names.singularPascal}(scope, "${names.singularKebab}-1")
    ).resolves.toBe(false);
    expect(adapter.publish${names.singularPascal}Event).not.toHaveBeenCalled();
  });
});
`;

const apiRouterTestFile = (
  names: FeatureNames
): string => `import { createPubSub } from "graphql-yoga";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./${names.pluralKebab}.adapter", () => ({
  create${names.singularPascal}: vi.fn(),
  delete${names.singularPascal}: vi.fn(),
  get${names.singularPascal}ById: vi.fn(),
  list${names.pluralPascal}ByScope: vi.fn(),
  update${names.singularPascal}: vi.fn()
}));

import * as ${names.pluralCamel}Adapter from "./${names.pluralKebab}.adapter";
import { ${names.pluralCamel}Resolvers } from "./${names.pluralKebab}.router";
import type { PubSubEventMap } from "../../pubsub";

describe("${names.pluralKebab}.router", () => {
  const testPubsub = createPubSub<PubSubEventMap>();
  const authenticatedScope = {
    organizationId: "org-1",
    user: {
      email: "u1@example.com",
      id: "user-1",
      name: "User One"
    },
    userId: "user-1"
  };
  const ctx = {
    pubsub: testPubsub,
    requireOrganizationScope: vi.fn(() => authenticatedScope)
  };
  const ${names.singularCamel} = {
    id: "${names.singularKebab}-1",
    title: "Title",
    body: null,
    organizationId: "org-1",
    userId: "user-1",
    createdAt: new Date(),
    updatedAt: new Date()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    ctx.requireOrganizationScope.mockReturnValue(authenticatedScope);
  });

  it("lists ${names.pluralWords} with clamped pagination", async () => {
    vi.mocked(${names.pluralCamel}Adapter.list${names.pluralPascal}ByScope).mockResolvedValue([]);

    await ${names.pluralCamel}Resolvers.Query.${names.pluralCamel}(
      {},
      { limit: 9_999, offset: -12 },
      ctx as never
    );

    expect(ctx.requireOrganizationScope).toHaveBeenCalled();
    expect(${names.pluralCamel}Adapter.list${names.pluralPascal}ByScope).toHaveBeenCalledWith(
      authenticatedScope,
      { limit: 100, offset: 0 }
    );
  });

  it("reads one ${names.singularWords} through the Organization scope", async () => {
    vi.mocked(${names.pluralCamel}Adapter.get${names.singularPascal}ById).mockResolvedValue(${names.singularCamel});

    await ${names.pluralCamel}Resolvers.Query.${names.singularCamel}(
      {},
      { id: "${names.singularKebab}-1" },
      ctx as never
    );

    expect(${names.pluralCamel}Adapter.get${names.singularPascal}ById).toHaveBeenCalledWith(
      authenticatedScope,
      "${names.singularKebab}-1"
    );
  });

  it("creates a ${names.singularWords} from normalized input", async () => {
    vi.mocked(${names.pluralCamel}Adapter.create${names.singularPascal}).mockResolvedValue(${names.singularCamel});

    await ${names.pluralCamel}Resolvers.Mutation.create${names.singularPascal}(
      {},
      { input: { title: "  Title  ", body: "   " } },
      ctx as never
    );

    expect(${names.pluralCamel}Adapter.create${names.singularPascal}).toHaveBeenCalledWith(
      authenticatedScope,
      { title: "Title", body: null }
    );
  });

  it("updates a ${names.singularWords} with a filtered patch", async () => {
    vi.mocked(${names.pluralCamel}Adapter.update${names.singularPascal}).mockResolvedValue(${names.singularCamel});

    await ${names.pluralCamel}Resolvers.Mutation.update${names.singularPascal}(
      {},
      { id: "${names.singularKebab}-1", input: { title: "  Edited  " } },
      ctx as never
    );

    expect(${names.pluralCamel}Adapter.update${names.singularPascal}).toHaveBeenCalledWith(
      authenticatedScope,
      "${names.singularKebab}-1",
      { title: "Edited" }
    );
  });

  it("deletes a ${names.singularWords} through the Organization scope", async () => {
    vi.mocked(${names.pluralCamel}Adapter.delete${names.singularPascal}).mockResolvedValue(true);

    await expect(
      ${names.pluralCamel}Resolvers.Mutation.delete${names.singularPascal}(
        {},
        { id: "${names.singularKebab}-1" },
        ctx as never
      )
    ).resolves.toBe(true);
    expect(${names.pluralCamel}Adapter.delete${names.singularPascal}).toHaveBeenCalledWith(
      authenticatedScope,
      "${names.singularKebab}-1"
    );
  });

  it("requires an Organization scope for every subscription", () => {
    for (const field of [
      ${names.pluralCamel}Resolvers.Subscription.${names.singularCamel}Created,
      ${names.pluralCamel}Resolvers.Subscription.${names.singularCamel}Updated,
      ${names.pluralCamel}Resolvers.Subscription.${names.singularCamel}Deleted
    ]) {
      vi.clearAllMocks();
      ctx.requireOrganizationScope.mockReturnValue(authenticatedScope);
      field.subscribe({}, {}, ctx as never);
      expect(ctx.requireOrganizationScope).toHaveBeenCalled();
    }
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
    [`${apiDir}/${feature}.adapter.ts`, apiAdapterFile(names)],
    [`${apiDir}/${feature}.adapter.test.ts`, apiAdapterTestFile(names)],
    [`${apiDir}/${feature}.workflow.ts`, apiWorkflowFile(names)],
    [`${apiDir}/${feature}.workflow.test.ts`, apiWorkflowTestFile(names)],
    [`${apiDir}/${feature}.schema.ts`, apiSdlFile(names)],
    [`${apiDir}/${feature}.router.ts`, apiRouterFile(names)],
    [`${apiDir}/${feature}.router.test.ts`, apiRouterTestFile(names)],
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
  "apps/api/src/schema/features.ts",
  "apps/api/src/schema/features.test.ts",
  "packages/translation/src/translation.definition.ts",
  "packages/translation/src/translation.config.ts",
  "packages/translation/src/locales/en/navigation.json",
  "packages/translation/src/locales/de/navigation.json",
  "packages/translation/src/locales/sr/navigation.json",
  "apps/web/src/router.tsx"
] as const;

const anchorIndex = (path: string, source: string, anchor: string): number => {
  const index = source.indexOf(anchor);
  if (index === -1) {
    throw new CreateFeatureError(path, `${path}: anchor not found: ${JSON.stringify(anchor)}`);
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
      path,
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
    throw new CreateFeatureError(path, `${path}: no lines match ${String(matcher)}`);
  }
  if (lines.includes(line)) {
    throw new CreateFeatureError(path, `${path}: already contains ${line.trim()}`);
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
    throw new CreateFeatureError(path, `${path}: no object entries match ${String(matcher)}`);
  }

  const existing = indices.map((index) => (lines[index] ?? "").replace(/,\s*$/, ""));
  if (existing.includes(entry)) {
    throw new CreateFeatureError(path, `${path}: already contains ${entry.trim()}`);
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

  return insertBeforeClose(
    path,
    withPayloads,
    "export type PubSubEventMap = {",
    "\n};",
    `\n  "${names.singularCamel}:created": [${names.singularPascal}SubscriptionPayload];` +
      `\n  "${names.singularCamel}:updated": [${names.singularPascal}SubscriptionPayload];` +
      `\n  "${names.singularCamel}:deleted": [${names.singularPascal}DeletedPayload];`
  );
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

const wireApiFeaturesTest = (source: string, names: FeatureNames): string => {
  const path = "apps/api/src/schema/features.test.ts";
  // Without this mock the registry test imports the real adapter, which reaches
  // @repo/db and throws on a missing DATABASE_URL at import time.
  const withMock = insertSortedLine(
    path,
    source,
    /^vi\.mock\("\.\.\/features\//,
    `vi.mock("../features/${names.pluralKebab}/${names.pluralKebab}.adapter", () => ({}));`
  );

  return insertBeforeClose(
    path,
    withMock,
    "expect(apiFeatures.map((feature) => feature.name)).toEqual([",
    "\n    ]);",
    `,\n      "${names.pluralKebab}"`
  );
};

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
  if (path === "apps/web/src/router.tsx") {
    return wireWebRouter(source, names);
  }
  throw new CreateFeatureError(path, `${path}: no wiring rule for this target`);
};

const assertNotRegistered = (files: ReadonlyMap<string, string>, names: FeatureNames): void => {
  const features = files.get("apps/api/src/schema/features.ts");
  if (features?.includes(`name: "${names.pluralKebab}"`)) {
    throw new CreateFeatureError(
      "apps/api/src/schema/features.ts",
      `api feature '${names.pluralKebab}' is already registered`
    );
  }

  const definition = files.get("packages/translation/src/translation.definition.ts");
  if (definition?.includes(`\n  "${names.pluralKebab}"`)) {
    throw new CreateFeatureError(
      "packages/translation/src/translation.definition.ts",
      `translation namespace '${names.pluralKebab}' already exists`
    );
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
      throw new CreateFeatureError(path, `${path}: already exists; choose another feature name`);
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
      throw new CreateFeatureError(path, `${path}: wiring target is missing from the repository`);
    }
    const normalized = source.replace(/\r\n/g, "\n");
    const wired = wireTarget(path, normalized, names);
    const updated = source.includes("\r\n") ? wired.replace(/\n/g, "\r\n") : wired;
    if (updated === source) {
      throw new CreateFeatureError(path, `${path}: wiring made no change`);
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
import { useOrganization } from "../../hooks/use-organization";
import { useSubscription } from "../../hooks/use-subscription";
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

  useSubscription({
    query: "subscription { ${names.singularCamel}Created { id } }",
    enabled: subscriptionEnabled,
    invalidateKeys: [listQueryKey]
  });

  useSubscription({
    query: "subscription { ${names.singularCamel}Updated { id } }",
    enabled: subscriptionEnabled,
    invalidateKeys: [listQueryKey]
  });

  useSubscription({
    query: "subscription { ${names.singularCamel}Deleted { id } }",
    enabled: subscriptionEnabled,
    invalidateKeys: [listQueryKey]
  });

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
import { useOrganization } from "../../hooks/use-organization";
import { useSubscription } from "../../hooks/use-subscription";
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

  useSubscription({
    query: "subscription { ${names.singularCamel}Updated { id } }",
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
    throw new CreateFeatureError(path, `${path}: already contains ${key}`);
  }
  const close = source.lastIndexOf("\n}");
  if (close === -1) {
    throw new CreateFeatureError(path, `${path}: not a JSON object`);
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
