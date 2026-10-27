// Sweeping tenancy contract: every root field of Query, Mutation, and
// Subscription is read from the API typeDefs, and each one outside the
// public allowlist must take its Authenticated Organization Scope from the
// session and offer no way to supply an organization id. A new field is covered
// without editing this file.
//
// The requests run over real HTTP through createApiServer, the Yoga pipeline,
// the context factory, and the real resolvers, as in
// features/notes/notes.tenancy.test.ts. Only the session lookup is replaced,
// driven by an x-test-session request header. A session without an Active
// Organization builds a context with no scope, so `active organization
// required` can only come from the field's own requireOrganizationScope() call.
//
// No case here reaches data: each one fails on scope before a query runs. The
// database URL points at a closed port so a resolver that regresses to reading
// before its scope check fails loudly and never touches a real database.
// Row-level isolation per feature is proven by the feature tenancy tests.
import { createLogger } from "@repo/logger";
import {
  buildSchema,
  getNamedType,
  isEnumType,
  isInputObjectType,
  isLeafType,
  isNonNullType,
  type GraphQLArgument,
  type GraphQLField,
  type GraphQLInputType,
  type GraphQLObjectType
} from "graphql";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL = "postgresql://tenancy-contract:unused@127.0.0.1:1/unused";
process.env.API_CORS_ORIGINS = "http://localhost:3000";

const SESSION_HEADER = "x-test-session";
const NO_ACTIVE_ORGANIZATION = "no-active-organization";

vi.mock("@repo/auth/server", () => ({
  createServerAuth: () => ({
    getSessionFromHeaders: (headers: Headers | Record<string, string | undefined>) => {
      const session =
        headers instanceof Headers ? headers.get(SESSION_HEADER) : headers[SESSION_HEADER];

      if (session !== NO_ACTIVE_ORGANIZATION) {
        return Promise.resolve(null);
      }

      return Promise.resolve({
        activeOrganizationId: null,
        expiresAt: "2099-01-01T00:00:00.000Z",
        user: {
          email: "tenant@example.test",
          emailVerified: true,
          twoFactorEnabled: false,
          id: "00000000-0000-4000-8000-0000000000a1",
          name: "Tenant User"
        }
      });
    },
    getOrganizationMembershipProof: () => Promise.resolve(null),
    getCurrentOrganizationByScope: () => Promise.resolve(null),
    listInvitationsByScope: () => Promise.resolve([]),
    listOrganizationMembersByScope: () => Promise.resolve([]),
    listOrganizationsByScope: () => Promise.resolve([])
  })
}));

const { createApiServer } = await import("./server");
const { apiTypeDefs } = await import("./schema/features");

// The same typeDefs createSchema serves (schema/builder.ts), built with this
// module's graphql copy: graphql-yoga's schema objects come from another
// module realm, so graphql's type predicates reject them.
const apiSchema = buildSchema(apiTypeDefs.join("\n"));

// Fields that are public by design. Every other root field is organization-scoped.
const PUBLIC_FIELDS = ["Query.health", "Mutation._empty", "Subscription._empty"];
// Fields for any signed-in session. They read the Active Organization only
// when the session has one, and still take no organization id.
const SESSION_FIELDS = ["Query.featureFlags"];
const ORGANIZATION_ID_NAME = /organi[sz]ation|^org(?:id)?$|tenant/i;

type OperationType = "query" | "mutation" | "subscription";

interface RootField {
  coordinate: string;
  field: GraphQLField<unknown, unknown>;
  operation: OperationType;
}

interface GraphqlResponse {
  data?: Record<string, unknown> | null;
  errors?: Array<{ message: string }>;
}

function rootFields(): RootField[] {
  const roots: Array<[OperationType, GraphQLObjectType | null | undefined]> = [
    ["query", apiSchema.getQueryType()],
    ["mutation", apiSchema.getMutationType()],
    ["subscription", apiSchema.getSubscriptionType()]
  ];

  return roots.flatMap(([operation, type]) =>
    type
      ? Object.values(type.getFields()).map((field) => ({
          coordinate: `${type.name}.${field.name}`,
          field,
          operation
        }))
      : []
  );
}

const authenticatedFields = rootFields().filter((root) => !PUBLIC_FIELDS.includes(root.coordinate));
const scopedFields = authenticatedFields.filter(
  (root) => !SESSION_FIELDS.includes(root.coordinate)
);

// A literal for every required input, so the request passes validation and
// reaches the resolver. Optional inputs are left out.
function placeholderValue(type: GraphQLInputType): string {
  const named = getNamedType(type);

  if (isInputObjectType(named)) {
    const fields = Object.values(named.getFields())
      .filter((field) => isNonNullType(field.type))
      .map((field) => `${field.name}: ${placeholderValue(field.type)}`);
    return `{ ${fields.join(", ")} }`;
  }

  if (isEnumType(named)) {
    const first = named.getValues()[0];
    if (!first) throw new Error(`enum ${named.name} has no values`);
    return first.name;
  }

  switch (named.name) {
    case "Boolean":
      return "false";
    case "Float":
    case "Int":
      return "1";
    case "ID":
      return JSON.stringify("00000000-0000-4000-8000-0000000000c1");
    case "String":
      return JSON.stringify("tenancy contract");
    default:
      throw new Error(`no placeholder for input type ${named.name}`);
  }
}

function operationFor(root: RootField): string {
  const args = [
    ...root.field.args
      .filter((arg) => isNonNullType(arg.type))
      .map((arg) => `${arg.name}: ${placeholderValue(arg.type)}`)
  ];
  const argumentList = args.length > 0 ? `(${args.join(", ")})` : "";
  const selection = isLeafType(getNamedType(root.field.type)) ? "" : " { __typename }";
  return `${root.operation} { ${root.field.name}${argumentList}${selection} }`;
}

// Every input-object field reachable from an argument, with its path.
function inputNames(args: readonly GraphQLArgument[]): string[] {
  const names: string[] = [];
  const visited = new Set<string>();
  const visit = (path: string, type: GraphQLInputType) => {
    const named = getNamedType(type);
    if (!isInputObjectType(named) || visited.has(named.name)) return;
    visited.add(named.name);
    for (const field of Object.values(named.getFields())) {
      names.push(`${path}.${field.name}`);
      visit(`${path}.${field.name}`, field.type);
    }
  };

  for (const arg of args) {
    names.push(arg.name);
    visit(arg.name, arg.type);
  }
  return names;
}

let baseUrl: string;
let server: Server;
let wsServer: { close: () => void };

beforeAll(async () => {
  const created = createApiServer({
    logger: createLogger({ name: "tenancy-contract-test", level: "silent" }),
    rateLimitConfig: { enabled: false, max: 1000, windowMs: 60_000, trustProxy: false }
  });
  server = created.server;
  wsServer = created.wsServer;

  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected server to listen on a port");
  }
  baseUrl = `http://127.0.0.1:${String(address.port)}`;
});

afterAll(async () => {
  wsServer.close();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

function parseEventStream(body: string): GraphqlResponse {
  const data = body
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .find((line) => line.length > 0);
  // SAFETY: Yoga writes each `next` event's data line as a serialized GraphQL
  // execution result.
  return data ? (JSON.parse(data) as GraphqlResponse) : {};
}

async function run(
  operation: OperationType,
  query: string,
  session: string | null
): Promise<GraphqlResponse> {
  const response = await fetch(`${baseUrl}/graphql`, {
    method: "POST",
    headers: {
      accept: operation === "subscription" ? "text/event-stream" : "application/json",
      "content-type": "application/json",
      ...(session ? { [SESSION_HEADER]: session } : {})
    },
    body: JSON.stringify({ query }),
    // A subscription that skips its scope check stays open; the timeout turns
    // that into a failure with a message instead of a hung test.
    signal: AbortSignal.timeout(2_000)
  });

  let body: string;
  try {
    body = await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return { errors: [{ message: "stream stayed open without a scope error" }] };
    }
    throw error;
  }

  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    return parseEventStream(body);
  }
  // SAFETY: /graphql answers application/json requests with a GraphQL
  // execution result.
  return JSON.parse(body) as GraphqlResponse;
}

describe("organization-scoped GraphQL field contract", () => {
  it("keeps every public allowlist entry a real root field", () => {
    const coordinates = rootFields().map((root) => root.coordinate);

    expect(coordinates).toEqual(expect.arrayContaining([...PUBLIC_FIELDS, ...SESSION_FIELDS]));
    expect(scopedFields.length).toBeGreaterThan(0);
  });

  it("offers no argument or input field that carries an organization id", () => {
    const offenders = authenticatedFields.flatMap((root) =>
      inputNames(root.field.args)
        .filter((name) => ORGANIZATION_ID_NAME.test(name.split(".").at(-1) ?? ""))
        .map((name) => `${root.coordinate}(${name})`)
    );

    expect(offenders).toEqual([]);
  });

  it("still answers the public health field for a session without an Active Organization", async () => {
    const result = await run("query", "query { health }", NO_ACTIVE_ORGANIZATION);

    expect(result.errors).toBeUndefined();
    expect(result.data?.["health"]).toBe("ok");
  });

  describe.each(authenticatedFields)("$coordinate", (root) => {
    it("requires authentication", async () => {
      const result = await run(root.operation, operationFor(root), null);

      expect(result.errors?.[0]?.message).toBe("authentication required");
    });
  });

  describe.each(scopedFields)("$coordinate", (root) => {
    it("takes the organization from the session's Active Organization", async () => {
      const result = await run(root.operation, operationFor(root), NO_ACTIVE_ORGANIZATION);

      expect(result.errors?.[0]?.message).toBe("active organization required");
    });
  });
});
