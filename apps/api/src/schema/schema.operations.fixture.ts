import {
  buildSchema,
  getNamedType,
  isEnumType,
  isInputObjectType,
  isLeafType,
  isNonNullType,
  type GraphQLField,
  type GraphQLInputType,
  type GraphQLObjectType
} from "graphql";

export type OperationType = "query" | "mutation" | "subscription";

export interface RootField {
  coordinate: string;
  field: GraphQLField<unknown, unknown>;
  operation: OperationType;
}

/**
 * Every root field of Query, Mutation, and Subscription in the typeDefs
 * createSchema serves (schema/builder.ts). The schema is built with this
 * module's graphql copy: graphql-yoga's schema objects come from another
 * module realm, so graphql's type predicates reject them.
 */
export function rootFields(typeDefs: readonly string[]): RootField[] {
  const schema = buildSchema(typeDefs.join("\n"));
  const roots: Array<[OperationType, GraphQLObjectType | null | undefined]> = [
    ["query", schema.getQueryType()],
    ["mutation", schema.getMutationType()],
    ["subscription", schema.getSubscriptionType()]
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

// A literal for every required input, so the request passes validation and
// reaches the resolver. Optional inputs are left out.
function placeholderValue(type: GraphQLInputType): string {
  const named = getNamedType(type);

  if (isInputObjectType(named)) {
    const all = Object.values(named.getFields());
    // A @oneOf input takes exactly one of its fields, all of them optional.
    const fields = (named.isOneOf ? all.slice(0, 1) : all.filter((f) => isNonNullType(f.type))).map(
      (field) => `${field.name}: ${placeholderValue(field.type)}`
    );
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

/** A document that calls the field with a placeholder for every required argument. */
export function operationFor(root: RootField): string {
  const args = [
    ...root.field.args
      .filter((arg) => isNonNullType(arg.type))
      .map((arg) => `${arg.name}: ${placeholderValue(arg.type)}`)
  ];
  const argumentList = args.length > 0 ? `(${args.join(", ")})` : "";
  const selection = isLeafType(getNamedType(root.field.type)) ? "" : " { __typename }";
  return `${root.operation} { ${root.field.name}${argumentList}${selection} }`;
}
