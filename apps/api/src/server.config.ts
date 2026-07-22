import {
  GraphQLError,
  Kind,
  type DocumentNode,
  type FragmentDefinitionNode,
  type OperationDefinitionNode,
  type SelectionSetNode,
  type ValidationRule
} from "graphql";

type RuntimeEnv = Record<string, string | undefined>;

const DEFAULT_MAX_QUERY_DEPTH = 8;
const DEFAULT_MAX_QUERY_COMPLEXITY = 200;

export interface ApiRuntimeConfig {
  allowIntrospection: boolean;
  allowedCorsOrigins: string[] | undefined;
  exposeErrorDetails: boolean;
  isProduction: boolean;
  maskedErrors: boolean;
  maxQueryComplexity: number;
  maxQueryDepth: number;
}

export function parseCorsOrigins(value: string | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }

  const origins = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return origins.length > 0 ? origins : undefined;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export function resolveApiRuntimeConfig(env: RuntimeEnv): ApiRuntimeConfig {
  const isProduction = env.NODE_ENV === "production";
  const allowedCorsOrigins = parseCorsOrigins(env.API_CORS_ORIGINS);

  // Fail closed: open credentialed CORS (cors: true) is never safe in production.
  if (isProduction && allowedCorsOrigins === undefined) {
    throw new Error(
      "API_CORS_ORIGINS is required in production: set a comma-separated browser origin allowlist (also feeds better-auth trustedOrigins)"
    );
  }

  // Introspection defaults off in production; set API_GRAPHQL_INTROSPECTION=true to re-enable.
  const introspectionOverride = env.API_GRAPHQL_INTROSPECTION?.trim().toLowerCase();
  const allowIntrospection =
    introspectionOverride === "true"
      ? true
      : introspectionOverride === "false"
        ? false
        : !isProduction;

  return {
    allowIntrospection,
    allowedCorsOrigins,
    exposeErrorDetails: !isProduction,
    isProduction,
    maskedErrors: isProduction,
    maxQueryComplexity: parsePositiveInteger(
      env.API_GRAPHQL_MAX_COMPLEXITY,
      DEFAULT_MAX_QUERY_COMPLEXITY
    ),
    maxQueryDepth: parsePositiveInteger(env.API_GRAPHQL_MAX_DEPTH, DEFAULT_MAX_QUERY_DEPTH)
  };
}

export function createDepthValidationRule(maxDepth: number): ValidationRule {
  return (context) => {
    const fragments = new Map<string, FragmentDefinitionNode>();

    for (const definition of context.getDocument().definitions) {
      if (definition.kind === Kind.FRAGMENT_DEFINITION) {
        fragments.set(definition.name.value, definition);
      }
    }

    return {
      OperationDefinition(node) {
        const depth = measureOperationDepth(node, fragments);

        if (depth > maxDepth) {
          context.reportError(
            new GraphQLError(`graphql query exceeds max depth ${String(maxDepth)}`, {
              nodes: [node]
            })
          );
        }
      }
    };
  };
}

export function createNoIntrospectionValidationRule(): ValidationRule {
  return (context) => ({
    Field(node) {
      if (node.name.value === "__schema" || node.name.value === "__type") {
        context.reportError(
          new GraphQLError("GraphQL introspection is disabled", {
            nodes: [node]
          })
        );
      }
    }
  });
}

/** Counts leaf + intermediate field selections (each Field node costs 1). */
export function measureQueryComplexity(document: DocumentNode): number {
  const fragments = new Map<string, FragmentDefinitionNode>();
  const operations: OperationDefinitionNode[] = [];

  for (const definition of document.definitions) {
    if (definition.kind === Kind.FRAGMENT_DEFINITION) {
      fragments.set(definition.name.value, definition);
      continue;
    }

    if (definition.kind === Kind.OPERATION_DEFINITION) {
      operations.push(definition);
    }
  }

  return operations.reduce((total, operation) => {
    return total + measureSelectionSetComplexity(operation.selectionSet, fragments, new Set());
  }, 0);
}

function measureSelectionSetComplexity(
  selectionSet: SelectionSetNode,
  fragments: Map<string, FragmentDefinitionNode>,
  visitedFragments: Set<string>
): number {
  let cost = 0;

  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      cost += 1;

      if (selection.selectionSet) {
        cost += measureSelectionSetComplexity(selection.selectionSet, fragments, visitedFragments);
      }

      continue;
    }

    if (selection.kind === Kind.INLINE_FRAGMENT) {
      cost += measureSelectionSetComplexity(selection.selectionSet, fragments, visitedFragments);
      continue;
    }

    const fragmentName = selection.name.value;

    if (visitedFragments.has(fragmentName)) {
      continue;
    }

    const fragment = fragments.get(fragmentName);

    if (!fragment) {
      continue;
    }

    const nextVisited = new Set(visitedFragments);
    nextVisited.add(fragmentName);
    cost += measureSelectionSetComplexity(fragment.selectionSet, fragments, nextVisited);
  }

  return cost;
}

export function createComplexityValidationRule(maxComplexity: number): ValidationRule {
  return (context) => {
    const fragments = new Map<string, FragmentDefinitionNode>();

    for (const definition of context.getDocument().definitions) {
      if (definition.kind === Kind.FRAGMENT_DEFINITION) {
        fragments.set(definition.name.value, definition);
      }
    }

    return {
      OperationDefinition(node) {
        const complexity = measureSelectionSetComplexity(node.selectionSet, fragments, new Set());

        if (complexity > maxComplexity) {
          context.reportError(
            new GraphQLError(`graphql query exceeds max complexity ${String(maxComplexity)}`, {
              nodes: [node]
            })
          );
        }
      }
    };
  };
}

export function createGraphQlLimitsPlugin(input: {
  allowIntrospection: boolean;
  maxComplexity: number;
  maxDepth: number;
}) {
  return {
    onValidate({ addValidationRule }: { addValidationRule: (rule: ValidationRule) => void }) {
      addValidationRule(createDepthValidationRule(input.maxDepth));
      addValidationRule(createComplexityValidationRule(input.maxComplexity));

      if (!input.allowIntrospection) {
        addValidationRule(createNoIntrospectionValidationRule());
      }
    }
  };
}

/** @deprecated Prefer createGraphQlLimitsPlugin — kept for call-site clarity in older tests. */
export function createDepthLimitPlugin(maxDepth: number) {
  return createGraphQlLimitsPlugin({
    allowIntrospection: true,
    maxComplexity: DEFAULT_MAX_QUERY_COMPLEXITY,
    maxDepth
  });
}

export function measureQueryDepth(document: DocumentNode): number {
  const fragments = new Map<string, FragmentDefinitionNode>();
  const operations: OperationDefinitionNode[] = [];

  for (const definition of document.definitions) {
    if (definition.kind === Kind.FRAGMENT_DEFINITION) {
      fragments.set(definition.name.value, definition);
      continue;
    }

    if (definition.kind === Kind.OPERATION_DEFINITION) {
      operations.push(definition);
    }
  }

  return operations.reduce((max, operation) => {
    const depth = measureOperationDepth(operation, fragments);
    return Math.max(max, depth);
  }, 0);
}

function measureOperationDepth(
  operation: OperationDefinitionNode,
  fragments: Map<string, FragmentDefinitionNode>
): number {
  return measureSelectionSetDepth(operation.selectionSet, fragments, new Set(), 1);
}

function measureSelectionSetDepth(
  selectionSet: SelectionSetNode,
  fragments: Map<string, FragmentDefinitionNode>,
  visitedFragments: Set<string>,
  depth: number
): number {
  let maxDepth = depth;

  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      if (!selection.selectionSet) {
        maxDepth = Math.max(maxDepth, depth);
        continue;
      }

      maxDepth = Math.max(
        maxDepth,
        measureSelectionSetDepth(selection.selectionSet, fragments, visitedFragments, depth + 1)
      );
      continue;
    }

    if (selection.kind === Kind.INLINE_FRAGMENT) {
      maxDepth = Math.max(
        maxDepth,
        measureSelectionSetDepth(selection.selectionSet, fragments, visitedFragments, depth)
      );
      continue;
    }

    const fragmentName = selection.name.value;

    if (visitedFragments.has(fragmentName)) {
      continue;
    }

    const fragment = fragments.get(fragmentName);

    if (!fragment) {
      continue;
    }

    const nextVisited = new Set(visitedFragments);
    nextVisited.add(fragmentName);

    maxDepth = Math.max(
      maxDepth,
      measureSelectionSetDepth(fragment.selectionSet, fragments, nextVisited, depth)
    );
  }

  return maxDepth;
}
